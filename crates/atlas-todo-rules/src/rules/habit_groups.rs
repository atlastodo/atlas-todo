//! Habit groups (`packages/todo-core/src/habitGroups.ts`): a `habit` with `kind: "group"`, whose
//! members carry `parent_id`.
//!
//! Groups never nest, enforced on read: [`flatten_habit_groups`] treats a habit as a member only
//! when its `parent_id` resolves to a live group, so LWW divergence cannot produce a tree. An
//! orphan member renders at the top level.
//!
//! A group has no schedule. Its day is met when every member that owed a check-in that day got
//! one; what a member owes comes from its own periods.

use std::collections::{BTreeMap, HashMap};

use jiff::civil::Date;

use super::habits::{
    evaluate_periods, periods_between, shift_date_key, CheckinState, CheckinStates, Habit,
    HabitKind,
};

/// ~5 years, like the engine's own bound.
const MAX_GROUP_SCAN_DAYS: i64 = 366 * 5;

/// One row of the habits list as drawn.
#[derive(Debug, Clone, PartialEq)]
pub enum HabitListRow<'a> {
    Group {
        group: &'a Habit,
        member_count: usize,
        expanded: bool,
    },
    Habit {
        habit: &'a Habit,
        depth: u8,
    },
}

fn by_sort_order(a: &&Habit, b: &&Habit) -> std::cmp::Ordering {
    a.sort_order
        .total_cmp(&b.sort_order)
        .then(a.created_at.cmp(&b.created_at))
}

pub fn habit_group_members<'a>(habits: &'a [Habit], group_id: &str) -> Vec<&'a Habit> {
    let mut out: Vec<&Habit> = habits
        .iter()
        .filter(|h| h.kind != HabitKind::Group && h.parent_id.as_deref() == Some(group_id))
        .collect();
    out.sort_by(by_sort_order);
    out
}

pub fn flatten_habit_groups<'a>(
    habits: &'a [Habit],
    is_expanded: impl Fn(&str) -> bool,
) -> Vec<HabitListRow<'a>> {
    let by_id: HashMap<&str, &Habit> = habits.iter().map(|h| (h.id.as_str(), h)).collect();
    let mut members: HashMap<&str, Vec<&Habit>> = HashMap::new();
    let mut top: Vec<&Habit> = Vec::new();
    for habit in habits {
        let parent = habit.parent_id.as_deref().and_then(|p| by_id.get(p));
        // One-level and orphan rules: a member is a non-group whose parent is a group in this set.
        match parent {
            Some(p) if habit.kind != HabitKind::Group && p.kind == HabitKind::Group => {
                members.entry(p.id.as_str()).or_default().push(habit)
            }
            _ => top.push(habit),
        }
    }
    top.sort_by(by_sort_order);
    let mut rows = Vec::new();
    for item in top {
        if item.kind != HabitKind::Group {
            rows.push(HabitListRow::Habit {
                habit: item,
                depth: 0,
            });
            continue;
        }
        let mut kids = members.remove(item.id.as_str()).unwrap_or_default();
        kids.sort_by(by_sort_order);
        let expanded = is_expanded(&item.id);
        rows.push(HabitListRow::Group {
            group: item,
            member_count: kids.len(),
            expanded,
        });
        if expanded {
            rows.extend(
                kids.into_iter()
                    .map(|habit| HabitListRow::Habit { habit, depth: 1 }),
            );
        }
    }
    rows
}

/// A member and its recorded days.
#[derive(Debug, Clone, Copy)]
pub struct HabitGroupMember<'a> {
    pub habit: &'a Habit,
    pub states: &'a CheckinStates,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HabitGroupDay {
    pub date: Date,
    pub due: i64,
    pub done: i64,
    pub excluded: bool,
    pub met: bool,
    pub in_progress: bool,
    pub missing: Vec<String>,
}

/// A flexible member (weekly or interval) contributes on the days it acted plus its period's final
/// day if that closed unmet, so a 3x-week habit at 1 of 3 on Tuesday does not fail Tuesday.
pub fn habit_group_days(
    members: &[HabitGroupMember<'_>],
    from: Date,
    to: Date,
    today: Date,
    week_starts_on: i64,
) -> Vec<HabitGroupDay> {
    if to < from {
        return Vec::new();
    }
    let mut due: BTreeMap<Date, i64> = BTreeMap::new();
    let mut got: BTreeMap<Date, i64> = BTreeMap::new();
    let mut absent: BTreeMap<Date, Vec<String>> = BTreeMap::new();
    // Clamped to the window so Monday's check-in does not become Friday's credit.
    let inside = |day: Date| day >= from && day <= to;
    for m in members {
        let habit = m.habit;
        if habit.kind == HabitKind::Group || habit.archived_at.is_some() {
            continue;
        }
        // A member owes nothing before it existed; backfilled check-ins still count.
        let born = habit.created;
        let earliest = m.states.keys().next().map_or(born, |f| (*f).min(born));
        // Clamped to today too: a device clock running ahead could stamp a habit into the future.
        let scan_from = earliest.min(today).max(from);
        if scan_from > to {
            continue;
        }
        let periods = periods_between(habit, scan_from, to, week_starts_on);
        for result in evaluate_periods(m.states, periods, today) {
            if result.target == 0 {
                continue;
            }
            let p = &result.period;
            if p.from == p.to {
                if inside(p.from) {
                    *due.entry(p.from).or_default() += 1;
                    if m.states.get(&p.from) == Some(&CheckinState::Done) {
                        *got.entry(p.from).or_default() += 1;
                    } else {
                        absent.entry(p.from).or_default().push(habit.id.clone());
                    }
                }
                continue;
            }
            for day in &p.scheduled {
                if m.states.get(day) == Some(&CheckinState::Done) && inside(*day) {
                    *due.entry(*day).or_default() += 1;
                    *got.entry(*day).or_default() += 1;
                }
            }
            // A flexible period that ran out unmet is a miss on its deadline day.
            if !result.met && !result.in_progress && inside(p.to) {
                *due.entry(p.to).or_default() += 1;
                absent.entry(p.to).or_default().push(habit.id.clone());
            }
        }
    }
    let mut days = Vec::new();
    let mut day = from;
    while day <= to {
        let owed = due.get(&day).copied().unwrap_or(0);
        let done = got.get(&day).copied().unwrap_or(0);
        days.push(HabitGroupDay {
            date: day,
            due: owed,
            done,
            excluded: owed == 0,
            met: owed > 0 && done >= owed,
            in_progress: day == today,
            missing: absent.remove(&day).unwrap_or_default(),
        });
        let next = shift_date_key(day, 1);
        if next == day {
            break;
        }
        day = next;
    }
    days
}

fn group_history_start(members: &[HabitGroupMember<'_>], today: Date) -> Date {
    let earliest = members
        .iter()
        .filter_map(|m| m.states.keys().next().copied())
        .fold(today, Date::min);
    earliest.max(shift_date_key(today, -MAX_GROUP_SCAN_DAYS))
}

/// Excluded days bridge, and today gets the same grace as a habit's current period.
pub fn habit_group_streak(
    members: &[HabitGroupMember<'_>],
    today: Date,
    week_starts_on: i64,
) -> i64 {
    let from = group_history_start(members, today);
    let mut streak = 0;
    for day in habit_group_days(members, from, today, today, week_starts_on)
        .iter()
        .rev()
    {
        if day.excluded {
            continue;
        }
        if day.met {
            streak += 1;
        } else if !day.in_progress {
            break;
        }
    }
    streak
}

pub fn habit_group_today(
    members: &[HabitGroupMember<'_>],
    today: Date,
    week_starts_on: i64,
) -> Option<HabitGroupDay> {
    habit_group_days(members, today, today, today, week_starts_on)
        .into_iter()
        .next()
}

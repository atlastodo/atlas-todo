//! The habit fixtures in `test-vectors/habit_vectors.json`, which
//! `packages/todo-core/src/habitVectors.test.ts` asserts against the TypeScript rules. A habit's
//! `created` day stands for `created_at` at local noon; here the local zone is UTC.

use jiff::civil::Date;
use jiff::tz::TimeZone;
use serde_json::{json, Map, Value};

use super::habit_groups::{
    habit_group_days, habit_group_streak, habit_group_today, HabitGroupDay, HabitGroupMember,
};
use super::habits::*;
use super::ids::derived_uuid_v2;

fn fixture() -> Value {
    let path = format!(
        "{}/../../test-vectors/habit_vectors.json",
        env!("CARGO_MANIFEST_DIR")
    );
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn day(v: &Value) -> Date {
    parse_date_key(v.as_str().unwrap()).unwrap()
}

fn key(d: Date) -> Value {
    Value::from(date_key(d))
}

fn habit_of(id: &str, raw: &Value) -> Habit {
    let mut fields: Map<String, Value> = raw.as_object().unwrap().clone();
    let created = day(&fields.remove("created").unwrap());
    fields.insert(
        "created_at".into(),
        Value::from(date_key_to_ms(created, &TimeZone::UTC)),
    );
    to_habit(id, &fields, &TimeZone::UTC)
}

fn states_of(v: &Value) -> CheckinStates {
    v.as_object()
        .unwrap()
        .iter()
        .map(|(k, s)| {
            let state = match s.as_str().unwrap() {
                "done" => CheckinState::Done,
                "skip" => CheckinState::Skip,
                other => panic!("state {other}"),
            };
            (parse_date_key(k).unwrap(), state)
        })
        .collect()
}

fn period(r: &PeriodResult) -> Value {
    json!({
        "from": key(r.period.from),
        "to": key(r.period.to),
        "scheduled": r.period.scheduled.iter().copied().map(key).collect::<Vec<_>>(),
        "goal": r.period.goal,
        "done": r.done,
        "skipped": r.skipped,
        "target": r.target,
        "met": r.met,
        "in_progress": r.in_progress,
    })
}

fn group_day(d: &HabitGroupDay) -> Value {
    json!({
        "date": key(d.date),
        "due": d.due,
        "done": d.done,
        "excluded": d.excluded,
        "met": d.met,
        "in_progress": d.in_progress,
        "missing": d.missing,
    })
}

/// A JSON number as the TypeScript test prints it: integers without a fraction.
fn number(n: f64) -> Value {
    if n.fract() == 0.0 && n.abs() < 9e15 {
        Value::from(n as i64)
    } else {
        Value::from(n)
    }
}

fn habit_json(h: &Habit) -> Value {
    json!({
        "id": h.id,
        "name": h.name,
        "kind": match h.kind { HabitKind::Habit => "habit", HabitKind::Group => "group" },
        "parent_id": h.parent_id,
        "goal_kind": h.goal_kind.as_str(),
        "days": h.days,
        "target": h.target,
        "color": h.color,
        "icon": h.icon,
        "notes": h.notes,
        "steps": h.steps,
        "unit": h.unit,
        "reminder_time": h.reminder_time,
        "schedule_history": schedule_history_json(&h.schedule_history),
        "archived_at": h.archived_at,
        "created_at": h.created_at,
        "sort_order": number(h.sort_order),
    })
}

#[test]
fn habit_vectors() {
    let f = fixture();
    for c in f["habits"].as_array().unwrap() {
        let name = c["name"].as_str().unwrap();
        let habit = habit_of("h1", &c["habit"]);
        let states = states_of(&c["checkins"]);
        let today = day(&c["today"]);
        let ws = c["week_starts_on"].as_i64().unwrap();
        let from = day(&c["rate_from"]);
        let rate = completion_rate(&habit, &states, from, today, ws);
        let scheduled: Vec<Value> = (-13..=7)
            .map(|i| shift_date_key(today, i))
            .filter(|d| is_scheduled_on(&habit, *d, ws))
            .map(key)
            .collect();
        let periods: Vec<Value> =
            evaluate_periods(&states, periods_between(&habit, from, today, ws), today)
                .iter()
                .map(period)
                .collect();
        let actual = json!({
            "current_streak": current_streak(&habit, &states, today, ws),
            "best_streak": best_streak(&habit, &states, today, ws),
            "total_checkins": total_checkins(&states),
            "completion_rate": { "periods": rate.periods, "met": rate.met },
            "next_due": next_due(&habit, &states, today, ws).map(key),
            "is_active_today": is_active_today(&habit, &states, today, ws),
            "current_period": current_period(&habit, &states, today, ws).as_ref().map(period),
            "periods": periods,
            "scheduled": scheduled,
        });
        let mut expected = c["expected"].clone();
        let strength = expected
            .as_object_mut()
            .unwrap()
            .remove("strength")
            .unwrap();
        assert_eq!(actual, expected, "habit case {name:?}");
        let got = current_strength(&habit, &states, today, ws);
        assert!(
            (got - strength.as_f64().unwrap()).abs() < 1e-9,
            "strength of {name:?}: {got} vs {strength}"
        );
    }
}

#[test]
fn habit_field_vectors() {
    let f = fixture();
    for c in f["to_habit"].as_array().unwrap() {
        let h = to_habit("h1", c["fields"].as_object().unwrap(), &TimeZone::UTC);
        assert_eq!(habit_json(&h), c["expected"], "to_habit {:?}", c["name"]);
    }
    for c in f["checkins"].as_array().unwrap() {
        let k = to_habit_checkin("c1", c["fields"].as_object().unwrap());
        let got = json!({
            "id": k.id,
            "habit_id": k.habit_id,
            "date": k.date,
            "state": k.state.as_str(),
            "value": number(k.value),
            "note": k.note,
            "created_at": k.created_at,
        });
        assert_eq!(got, c["expected"], "to_habit_checkin {:?}", c["name"]);
    }
}

#[test]
fn habit_schedule_change_vectors() {
    let f = fixture();
    for c in f["schedule_changes"].as_array().unwrap() {
        let habit = habit_of("h1", &c["habit"]);
        let p = &c["patch"];
        let patch = GoalPatch {
            goal_kind: p.get("goal_kind").map(|g| match g.as_str().unwrap() {
                "weekly" => GoalKind::Weekly,
                "interval" => GoalKind::Interval,
                _ => GoalKind::Daily,
            }),
            days: p.get("days").map(|d| {
                d.as_array()
                    .unwrap()
                    .iter()
                    .map(|n| n.as_u64().unwrap() as u8)
                    .collect()
            }),
            target: p.get("target").and_then(Value::as_i64),
        };
        let got = append_schedule_change(&habit, &patch, day(&c["today"]))
            .map_or(Value::Null, |h| schedule_history_json(&h));
        assert_eq!(got, c["expected"], "schedule change {:?}", c["name"]);
    }
}

#[test]
fn habit_group_vectors() {
    let f = fixture();
    for c in f["groups"].as_array().unwrap() {
        let raw = c["members"].as_array().unwrap();
        let habits: Vec<Habit> = raw
            .iter()
            .enumerate()
            .map(|(i, m)| habit_of(&format!("m{i}"), &m["habit"]))
            .collect();
        let states: Vec<CheckinStates> = raw.iter().map(|m| states_of(&m["checkins"])).collect();
        let members: Vec<HabitGroupMember> = habits
            .iter()
            .zip(&states)
            .map(|(habit, states)| HabitGroupMember { habit, states })
            .collect();
        let today = day(&c["today"]);
        let ws = c["week_starts_on"].as_i64().unwrap();
        let from = habits.iter().map(|h| h.created).min().unwrap();
        let got = json!({
            "streak": habit_group_streak(&members, today, ws),
            "today": habit_group_today(&members, today, ws).as_ref().map(group_day),
            "days": habit_group_days(&members, from, today, today, ws)
                .iter()
                .map(group_day)
                .collect::<Vec<_>>(),
        });
        assert_eq!(got, c["expected"], "group {:?}", c["name"]);
    }
}

#[test]
fn derived_id_vectors() {
    let f = fixture();
    for c in f["derived_ids"].as_array().unwrap() {
        assert_eq!(
            derived_uuid_v2(c["namespace"].as_str().unwrap(), c["key"].as_str().unwrap()),
            c["expected"].as_str().unwrap(),
            "derived id {:?}",
            c["key"]
        );
    }
}

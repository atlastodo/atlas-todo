//! Habits and streaks (`packages/todo-core/src/habits.ts`): pure, date-based logic with an
//! injected today.
//!
//! Check-ins are keyed by local calendar date. Every goal kind reduces to periods wanting `target`
//! check-ins: `daily` (one per day, `days` picks weekdays), `weekly` (aligned to `week_starts_on`,
//! so changing it redraws past weeks), `interval` (`target`-day blocks tiled from creation).
//!
//! A short in-progress period neither counts nor breaks a streak. Skipped days shrink the target;
//! a period whose target falls to 0 is dropped and bridged.
//!
//! The TypeScript functions take instants (`todayMs`) and read their local day; these take the day
//! itself ([`date_key_from_ms`] makes one), and the habit carries its creation day in
//! [`Habit::created`], read in the account's time zone by [`to_habit`].

use std::collections::BTreeMap;

use jiff::civil::Date;
use jiff::tz::TimeZone;
use jiff::{Timestamp, ToSpan};
use serde_json::{json, Map, Value};

/// Scan bound (~5 years) so malformed input cannot loop forever; a longer span keeps its recent days.
pub const MAX_SCAN_DAYS: i64 = 366 * 5;

/// `steps` and `schedule_history` sync as one op each; the server caps one value at 64 KiB.
pub const MAX_STEPS: usize = 50;
pub const MAX_SCHEDULE_HISTORY: usize = 200;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GoalKind {
    Daily,
    Weekly,
    Interval,
}

impl GoalKind {
    pub fn as_str(self) -> &'static str {
        match self {
            GoalKind::Daily => "daily",
            GoalKind::Weekly => "weekly",
            GoalKind::Interval => "interval",
        }
    }

    fn of(raw: Option<&Value>) -> Self {
        match raw.and_then(Value::as_str) {
            Some("weekly") => GoalKind::Weekly,
            Some("interval") => GoalKind::Interval,
            _ => GoalKind::Daily,
        }
    }
}

/// A `group` is a routine: a container habit that records nothing itself. Groups never nest.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HabitKind {
    Habit,
    Group,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CheckinState {
    Done,
    Skip,
}

impl CheckinState {
    pub fn as_str(self) -> &'static str {
        match self {
            CheckinState::Done => "done",
            CheckinState::Skip => "skip",
        }
    }
}

/// One schedule version, in force from `from` until the next. Without versions, editing the
/// weekdays would re-judge the past.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HabitSchedule {
    pub from: Date,
    pub goal_kind: GoalKind,
    pub days: Vec<u8>,
    pub target: i64,
}

impl HabitSchedule {
    /// As the `schedule_history` field stores it.
    pub fn to_json(&self) -> Value {
        json!({
            "from": date_key(self.from),
            "goal_kind": self.goal_kind.as_str(),
            "days": self.days,
            "target": self.target,
        })
    }
}

/// The `schedule_history` field's value.
pub fn schedule_history_json(history: &[HabitSchedule]) -> Value {
    Value::Array(history.iter().map(HabitSchedule::to_json).collect())
}

#[derive(Debug, Clone, PartialEq)]
pub struct Habit {
    pub id: String,
    pub name: String,
    pub kind: HabitKind,
    pub parent_id: Option<String>,
    pub goal_kind: GoalKind,
    pub days: Vec<u8>,
    pub target: i64,
    pub color: String,
    pub icon: String,
    pub notes: String,
    pub steps: Vec<String>,
    pub unit: String,
    pub reminder_time: Option<String>,
    pub schedule_history: Vec<HabitSchedule>,
    pub archived_at: Option<i64>,
    pub created_at: i64,
    pub sort_order: f64,
    /// `created_at`'s local day (`dateKeyFromMs(created_at)`), where the schedule starts.
    pub created: Date,
}

#[derive(Debug, Clone, PartialEq)]
pub struct HabitCheckin {
    pub id: String,
    pub habit_id: String,
    pub date: String,
    pub state: CheckinState,
    pub value: f64,
    pub note: String,
    pub created_at: i64,
}

/// Recorded days of one habit.
pub type CheckinStates = BTreeMap<Date, CheckinState>;

pub fn date_key(d: Date) -> String {
    format!("{:04}-{:02}-{:02}", d.year(), d.month(), d.day())
}

/// A `YYYY-MM-DD` key as a date; `None` for anything else.
pub fn parse_date_key(key: &str) -> Option<Date> {
    let b = key.as_bytes();
    let shaped = b.len() == 10
        && b[4] == b'-'
        && b[7] == b'-'
        && b.iter()
            .enumerate()
            .all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit());
    if !shaped {
        return None;
    }
    key.parse().ok()
}

/// The local day of an instant.
pub fn date_key_from_ms(ms: i64, tz: &TimeZone) -> Date {
    Timestamp::from_millisecond(ms)
        .map(|t| t.to_zoned(tz.clone()).date())
        .unwrap_or(Date::constant(1970, 1, 1))
}

/// Local noon of a day, which survives DST shifts.
pub fn date_key_to_ms(d: Date, tz: &TimeZone) -> i64 {
    d.at(12, 0, 0, 0)
        .to_zoned(tz.clone())
        .map(|z| z.timestamp().as_millisecond())
        .unwrap_or(0)
}

pub fn shift_date_key(d: Date, days: i64) -> Date {
    d.checked_add(days.days()).unwrap_or(d)
}

pub fn days_between_keys(a: Date, b: Date) -> i64 {
    a.until(b).map(|s| i64::from(s.get_days())).unwrap_or(0)
}

/// 0 is Sunday.
pub fn weekday_of_key(d: Date) -> u8 {
    d.weekday().to_sunday_zero_offset() as u8
}

pub fn start_of_week_key(d: Date, week_starts_on: i64) -> Date {
    let back = (i64::from(weekday_of_key(d)) - week_starts_on).rem_euclid(7);
    shift_date_key(d, -back)
}

fn weekdays_of(raw: Option<&Value>) -> Vec<u8> {
    raw.and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(Value::as_f64)
                .filter(|n| (0.0..=6.0).contains(n) && n.fract() == 0.0)
                .map(|n| n as u8)
                .collect()
        })
        .unwrap_or_default()
}

fn target_of(raw: Option<&Value>) -> i64 {
    match raw.and_then(Value::as_f64) {
        Some(n) if n >= 1.0 => n.floor() as i64,
        _ => 1,
    }
}

/// Sorted here because the array is one LWW field and a merge can return any order.
fn schedule_history_of(raw: Option<&Value>) -> Vec<HabitSchedule> {
    let Some(entries) = raw.and_then(Value::as_array) else {
        return Vec::new();
    };
    let mut out: Vec<HabitSchedule> = entries
        .iter()
        .filter_map(Value::as_object)
        .filter_map(|e| {
            Some(HabitSchedule {
                from: parse_date_key(e.get("from")?.as_str()?)?,
                goal_kind: GoalKind::of(e.get("goal_kind")),
                days: weekdays_of(e.get("days")),
                target: target_of(e.get("target")),
            })
        })
        .collect();
    out.sort_by_key(|s| s.from);
    let skip = out.len().saturating_sub(MAX_SCHEDULE_HISTORY);
    out.split_off(skip)
}

fn str_of(fields: &Map<String, Value>, k: &str, default: &str) -> String {
    fields
        .get(k)
        .and_then(Value::as_str)
        .unwrap_or(default)
        .to_owned()
}

fn opt_str(fields: &Map<String, Value>, k: &str) -> Option<String> {
    fields.get(k).and_then(Value::as_str).map(str::to_owned)
}

fn num_of(fields: &Map<String, Value>, k: &str) -> Option<f64> {
    fields.get(k).and_then(Value::as_f64)
}

/// A `habit` entity's fields as the app reads them, with `toHabit`'s defaults.
pub fn to_habit(id: &str, fields: &Map<String, Value>, tz: &TimeZone) -> Habit {
    let created_at = num_of(fields, "created_at").map_or(0, |n| n as i64);
    Habit {
        id: id.to_owned(),
        name: str_of(fields, "name", ""),
        kind: if fields.get("kind").and_then(Value::as_str) == Some("group") {
            HabitKind::Group
        } else {
            HabitKind::Habit
        },
        parent_id: opt_str(fields, "parent_id"),
        goal_kind: GoalKind::of(fields.get("goal_kind")),
        days: weekdays_of(fields.get("days")),
        target: target_of(fields.get("target")),
        color: str_of(fields, "color", "#6366f1"),
        icon: str_of(fields, "icon", "hash"),
        notes: str_of(fields, "notes", ""),
        steps: fields
            .get("steps")
            .and_then(Value::as_array)
            .map(|a| {
                a.iter()
                    .filter_map(Value::as_str)
                    .filter(|s| !s.is_empty())
                    .take(MAX_STEPS)
                    .map(str::to_owned)
                    .collect()
            })
            .unwrap_or_default(),
        unit: str_of(fields, "unit", ""),
        reminder_time: opt_str(fields, "reminder_time"),
        schedule_history: schedule_history_of(fields.get("schedule_history")),
        archived_at: num_of(fields, "archived_at").map(|n| n as i64),
        created_at,
        sort_order: num_of(fields, "sort_order").unwrap_or(0.0),
        created: date_key_from_ms(created_at, tz),
    }
}

/// A `habit_checkin` entity's fields as the app reads them.
pub fn to_habit_checkin(id: &str, fields: &Map<String, Value>) -> HabitCheckin {
    HabitCheckin {
        id: id.to_owned(),
        habit_id: str_of(fields, "habit_id", ""),
        date: str_of(fields, "date", ""),
        // Rows from before skip days carry no `state` and were all completions.
        state: if fields.get("state").and_then(Value::as_str) == Some("skip") {
            CheckinState::Skip
        } else {
            CheckinState::Done
        },
        value: num_of(fields, "value").unwrap_or(1.0),
        note: str_of(fields, "note", ""),
        created_at: num_of(fields, "created_at").map_or(0, |n| n as i64),
    }
}

/// Recorded on a later day than the one it is for.
pub fn is_backfilled(checkin: &HabitCheckin, tz: &TimeZone) -> bool {
    checkin.created_at > 0 && date_key(date_key_from_ms(checkin.created_at, tz)) != checkin.date
}

fn scheduled_under(schedule: &HabitSchedule, day: Date) -> bool {
    if schedule.goal_kind != GoalKind::Daily {
        return true;
    }
    schedule.days.is_empty() || schedule.days.contains(&weekday_of_key(day))
}

pub fn is_scheduled_on(habit: &Habit, day: Date, week_starts_on: i64) -> bool {
    scheduled_under(&effective_schedule(habit, day, week_starts_on), day)
}

fn period_length_days(s: &HabitSchedule) -> i64 {
    match s.goal_kind {
        GoalKind::Weekly => 7,
        GoalKind::Interval => s.target.max(1),
        GoalKind::Daily => 1,
    }
}

fn goal_target(s: &HabitSchedule) -> i64 {
    match s.goal_kind {
        GoalKind::Weekly => s.target.max(1),
        _ => 1,
    }
}

/// Required check-ins per day: the `frequency` the strength curve is tuned against.
pub fn goal_frequency(s: &HabitSchedule) -> f64 {
    match s.goal_kind {
        GoalKind::Weekly => goal_target(s) as f64 / 7.0,
        GoalKind::Interval => 1.0 / period_length_days(s) as f64,
        GoalKind::Daily => {
            (if s.days.is_empty() {
                7.0
            } else {
                s.days.len() as f64
            }) / 7.0
        }
    }
}

/// `from` is `None` for the oldest segment so it extends backwards and backfills are judged by
/// plausible rules.
#[derive(Debug, Clone, PartialEq)]
pub struct ScheduleSegment {
    pub schedule: HabitSchedule,
    pub from: Option<Date>,
    pub until: Option<Date>,
}

/// The habit's own fields as a schedule version, from its creation day.
pub fn current_schedule(habit: &Habit) -> HabitSchedule {
    HabitSchedule {
        from: habit.created,
        goal_kind: habit.goal_kind,
        days: habit.days.clone(),
        target: habit.target,
    }
}

/// A version takes effect at the first period start on its grid; `weekly` waits for the next week
/// start to keep weeks aligned.
fn align_forward(day: Date, schedule: &HabitSchedule, week_starts_on: i64) -> Date {
    if schedule.goal_kind != GoalKind::Weekly {
        return day;
    }
    let start = start_of_week_key(day, week_starts_on);
    if start == day {
        day
    } else {
        shift_date_key(start, 7)
    }
}

pub fn schedule_segments(habit: &Habit, week_starts_on: i64) -> Vec<ScheduleSegment> {
    let current = current_schedule(habit);
    let history = &habit.schedule_history;
    if history.is_empty() {
        return vec![ScheduleSegment {
            schedule: current,
            from: None,
            until: None,
        }];
    }
    let mut segments: Vec<ScheduleSegment> = Vec::new();
    for (i, entry) in history.iter().enumerate() {
        // The habit's own fields are the newest version.
        let schedule = if i == history.len() - 1 {
            HabitSchedule {
                from: entry.from,
                ..current.clone()
            }
        } else {
            entry.clone()
        };
        let from = if i == 0 {
            None
        } else {
            Some(align_forward(entry.from, &schedule, week_starts_on))
        };
        // A version aligning no later than its predecessor replaces it (two weekly changes in one week).
        while segments.last().is_some_and(|s| from <= s.from) {
            segments.pop();
        }
        segments.push(ScheduleSegment {
            schedule,
            from,
            until: None,
        });
    }
    for i in 0..segments.len().saturating_sub(1) {
        segments[i].until = segments[i + 1].from;
    }
    segments
}

fn segment_at(segments: &[ScheduleSegment], day: Date) -> &ScheduleSegment {
    segments
        .iter()
        .rev()
        .find(|s| s.from <= Some(day))
        .unwrap_or(&segments[0])
}

/// The one resolver, so the calendar never shades a day differently from how the engine counts it.
pub fn effective_schedule(habit: &Habit, day: Date, week_starts_on: i64) -> HabitSchedule {
    segment_at(&schedule_segments(habit, week_starts_on), day)
        .schedule
        .clone()
}

fn same_schedule(a: &HabitSchedule, b: &HabitSchedule) -> bool {
    if a.goal_kind != b.goal_kind {
        return false;
    }
    // Compared through the derived pair, because `daily` ignores `target`.
    if goal_target(a) != goal_target(b) || period_length_days(a) != period_length_days(b) {
        return false;
    }
    let mut x = a.days.clone();
    let mut y = b.days.clone();
    x.sort_unstable();
    y.sort_unstable();
    x == y
}

/// The schedule fields an edit changes; `None` keeps the habit's.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct GoalPatch {
    pub goal_kind: Option<GoalKind>,
    pub days: Option<Vec<u8>>,
    pub target: Option<i64>,
}

/// The `schedule_history` an edit made on `today` should write, or `None` when no schedule field
/// changes. A second change on the same day replaces that day's entry.
pub fn append_schedule_change(
    habit: &Habit,
    patch: &GoalPatch,
    today: Date,
) -> Option<Vec<HabitSchedule>> {
    let current = current_schedule(habit);
    let proposed = HabitSchedule {
        from: today,
        goal_kind: patch.goal_kind.unwrap_or(current.goal_kind),
        days: patch.days.clone().unwrap_or_else(|| current.days.clone()),
        target: patch.target.unwrap_or(current.target),
    };
    if same_schedule(&proposed, &current) {
        return None;
    }
    let mut history = if habit.schedule_history.is_empty() {
        vec![current]
    } else {
        habit.schedule_history.clone()
    };
    let last = history.len() - 1;
    if history[last].from == proposed.from {
        history[last] = proposed;
    } else {
        history.push(proposed);
    }
    // Flipping to weekly and back on the same day is a no-op, not two versions.
    let n = history.len();
    if n > 1 && same_schedule(&history[n - 1], &history[n - 2]) {
        history.pop();
    }
    let skip = history.len().saturating_sub(MAX_SCHEDULE_HISTORY);
    Some(history.split_off(skip))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HabitPeriod {
    pub from: Date,
    pub to: Date,
    pub scheduled: Vec<Date>,
    /// Check-ins wanted before the skip adjustment. 0 means excluded (cut short by a schedule change).
    pub goal: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PeriodResult {
    pub period: HabitPeriod,
    pub done: i64,
    pub skipped: i64,
    pub target: i64,
    pub met: bool,
    pub in_progress: bool,
}

fn period_start_for(
    habit: &Habit,
    segment: &ScheduleSegment,
    day: Date,
    week_starts_on: i64,
) -> Date {
    let schedule = &segment.schedule;
    match schedule.goal_kind {
        GoalKind::Weekly => start_of_week_key(day, week_starts_on),
        GoalKind::Interval => {
            // A later segment re-anchors at its own start.
            let anchor = segment.from.unwrap_or(habit.created);
            let length = period_length_days(schedule);
            shift_date_key(
                anchor,
                days_between_keys(anchor, day).div_euclid(length) * length,
            )
        }
        GoalKind::Daily => day,
    }
}

/// Periods covering `[from, to]`, oldest first; the first may start before `from` and the last
/// end after `to`. Segmented at schedule changes so the tiling has no gaps.
pub fn periods_between(
    habit: &Habit,
    from: Date,
    to: Date,
    week_starts_on: i64,
) -> Vec<HabitPeriod> {
    if to < from {
        return Vec::new();
    }
    let floor = shift_date_key(to, -MAX_SCAN_DAYS);
    let from = from.max(floor);
    let segments = schedule_segments(habit, week_starts_on);
    let mut periods = Vec::new();
    let mut start = period_start_for(habit, segment_at(&segments, from), from, week_starts_on);
    let mut guard = 0;
    while guard <= MAX_SCAN_DAYS && start <= to {
        let segment = segment_at(&segments, start);
        let grid_end = shift_date_key(start, period_length_days(&segment.schedule) - 1);
        let cut = segment.until.filter(|until| grid_end >= *until);
        let end = cut.map_or(grid_end, |until| shift_date_key(until, -1));
        let mut scheduled = Vec::new();
        let mut day = start;
        while day <= end {
            if scheduled_under(&segment.schedule, day) {
                scheduled.push(day);
            }
            day = shift_date_key(day, 1);
        }
        periods.push(HabitPeriod {
            from: start,
            to: end,
            scheduled,
            // A half-lived period is excluded rather than judged.
            goal: if cut.is_some() {
                0
            } else {
                goal_target(&segment.schedule)
            },
        });
        start = shift_date_key(end, 1);
        guard += 1;
    }
    periods
}

pub fn evaluate_periods(
    states: &CheckinStates,
    periods: Vec<HabitPeriod>,
    today: Date,
) -> Vec<PeriodResult> {
    periods
        .into_iter()
        .map(|period| {
            let (mut done, mut skipped) = (0, 0);
            for day in &period.scheduled {
                match states.get(day) {
                    Some(CheckinState::Done) => done += 1,
                    Some(CheckinState::Skip) => skipped += 1,
                    None => {}
                }
            }
            let target = period
                .goal
                .min(period.scheduled.len() as i64 - skipped)
                .max(0);
            let in_progress = today >= period.from && today <= period.to;
            PeriodResult {
                period,
                done,
                skipped,
                target,
                met: target > 0 && done >= target,
                in_progress,
            }
        })
        .collect()
}

fn history_start(states: &CheckinStates, anchor: Date) -> Date {
    let earliest = states
        .keys()
        .next()
        .copied()
        .map_or(anchor, |first| first.min(anchor));
    earliest.max(shift_date_key(anchor, -MAX_SCAN_DAYS))
}

fn evaluate_history(
    habit: &Habit,
    states: &CheckinStates,
    today: Date,
    week_starts_on: i64,
) -> Vec<PeriodResult> {
    let from = history_start(states, today);
    evaluate_periods(
        states,
        periods_between(habit, from, today, week_starts_on),
        today,
    )
}

/// Excluded periods bridge rather than break, and a short in-progress period is passed over.
pub fn current_streak(
    habit: &Habit,
    states: &CheckinStates,
    today: Date,
    week_starts_on: i64,
) -> i64 {
    let mut streak = 0;
    for result in evaluate_history(habit, states, today, week_starts_on)
        .iter()
        .rev()
    {
        if result.target == 0 {
            continue;
        }
        if result.met {
            streak += 1;
        } else if !result.in_progress {
            break;
        }
    }
    streak
}

pub fn current_period(
    habit: &Habit,
    states: &CheckinStates,
    today: Date,
    week_starts_on: i64,
) -> Option<PeriodResult> {
    let periods = periods_between(habit, today, today, week_starts_on);
    evaluate_periods(states, periods, today).into_iter().next()
}

/// Also true once recorded today, otherwise ticking a habit would make it vanish along with its undo.
pub fn is_active_today(
    habit: &Habit,
    states: &CheckinStates,
    today: Date,
    week_starts_on: i64,
) -> bool {
    if habit.archived_at.is_some() {
        return false;
    }
    if states.contains_key(&today) {
        return true;
    }
    current_period(habit, states, today, week_starts_on).is_some_and(|p| p.target > 0 && !p.met)
}

pub fn best_streak(habit: &Habit, states: &CheckinStates, today: Date, week_starts_on: i64) -> i64 {
    let (mut best, mut run) = (0, 0);
    for result in evaluate_history(habit, states, today, week_starts_on) {
        if result.target == 0 {
            continue;
        }
        if result.met {
            run += 1;
            best = best.max(run);
        } else if !result.in_progress {
            run = 0;
        }
    }
    best
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CompletionRate {
    pub periods: i64,
    pub met: i64,
    pub rate: f64,
}

/// Excluded periods and an unfinished final one are left out, not counted as failures.
pub fn completion_rate(
    habit: &Habit,
    states: &CheckinStates,
    from: Date,
    today: Date,
    week_starts_on: i64,
) -> CompletionRate {
    let periods = periods_between(habit, from, today, week_starts_on);
    let (mut counted, mut met) = (0, 0);
    for result in evaluate_periods(states, periods, today) {
        if result.target == 0 || (result.in_progress && !result.met) {
            continue;
        }
        counted += 1;
        if result.met {
            met += 1;
        }
    }
    CompletionRate {
        periods: counted,
        met,
        rate: if counted == 0 {
            0.0
        } else {
            met as f64 / counted as f64
        },
    }
}

pub fn total_checkins(states: &CheckinStates) -> i64 {
    states
        .values()
        .filter(|s| **s == CheckinState::Done)
        .count() as i64
}

pub fn next_due(
    habit: &Habit,
    states: &CheckinStates,
    today: Date,
    week_starts_on: i64,
) -> Option<Date> {
    let periods = periods_between(habit, today, shift_date_key(today, 366), week_starts_on);
    for result in evaluate_periods(states, periods, today) {
        if result.target == 0 || result.met {
            continue;
        }
        if let Some(day) = result
            .period
            .scheduled
            .iter()
            .find(|d| **d >= today && !states.contains_key(d))
        {
            return Some(*day);
        }
    }
    None
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct StrengthPoint {
    pub date: Date,
    pub score: f64,
}

/// Loop Habit Tracker's strength curve: an exponential moving average that dips on a miss but
/// never resets. `multiplier = 0.5 ** (sqrt(frequency) / 13)` per day, raised to the period length.
/// Skipped, off-schedule and short in-progress periods carry the score forward.
pub fn strength_series(
    habit: &Habit,
    states: &CheckinStates,
    from: Date,
    to: Date,
    week_starts_on: i64,
) -> Vec<StrengthPoint> {
    let periods = periods_between(habit, history_start(states, from), to, week_starts_on);
    let segments = schedule_segments(habit, week_starts_on);
    let mut points = Vec::new();
    let mut score = 0.0_f64;
    for result in evaluate_periods(states, periods, to) {
        let settled = result.target > 0 && !(result.in_progress && !result.met);
        if settled {
            // Resolved per period so history decays at the rate that applied then.
            let schedule = &segment_at(&segments, result.period.from).schedule;
            let span = days_between_keys(result.period.from, result.period.to) + 1;
            let decay = 0.5_f64
                .powf(goal_frequency(schedule).sqrt() / 13.0)
                .powf(span as f64);
            score = score * decay + if result.met { 1.0 - decay } else { 0.0 };
        }
        if result.period.to >= from {
            points.push(StrengthPoint {
                date: result.period.to,
                score,
            });
        }
    }
    points
}

pub fn current_strength(
    habit: &Habit,
    states: &CheckinStates,
    today: Date,
    week_starts_on: i64,
) -> f64 {
    strength_series(habit, states, today, today, week_starts_on)
        .last()
        .map_or(0.0, |p| p.score)
}

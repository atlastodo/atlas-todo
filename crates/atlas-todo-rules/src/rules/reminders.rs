//! Task reminders (`@atlastodo/todo-core`'s `reminders.ts` and the titles of `reminderSchedule.ts`):
//! when a `reminder` entity fires, whether it already has, and which are due. A reminder fires at
//! an absolute time (`at`) or `offset_min_before_due` minutes before its task's due date; day-based
//! offsets on an all-day due (23:59) fire at 09:00 that many days before, in the user's zone.
//! `fired_at` is synced and covers the fire instant it went out for, so a reminder whose instant
//! moved later is unfired again.

use jiff::tz::TimeZone;
use jiff::{Timestamp, ToSpan};
use serde_json::{Map, Value};

use super::task::{ms, Task};

#[derive(Debug, Clone, PartialEq)]
pub struct Reminder {
    pub id: String,
    pub task_id: String,
    pub at: Option<i64>,
    pub offset_min_before_due: Option<i64>,
    pub fired_at: Option<i64>,
    pub created_at: i64,
}

/// Past this a reminder is old news: another device delivered it, or it passed with the app
/// closed. It is stamped fired without a notification.
pub const REMINDER_STALE_AFTER_MS: i64 = 15 * 60_000;

impl Reminder {
    /// `toReminder`: the entity's fields, with nulls for what is missing or not a number.
    pub fn from_fields(id: &str, f: &Map<String, Value>) -> Self {
        let num = |k: &str| f.get(k).and_then(Value::as_f64).map(|v| v as i64);
        Self {
            id: id.to_owned(),
            task_id: f
                .get("task_id")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned(),
            at: num("at"),
            offset_min_before_due: num("offset_min_before_due"),
            fired_at: num("fired_at"),
            created_at: num("created_at").unwrap_or(0),
        }
    }
}

fn zoned(ms_: i64, tz: &TimeZone) -> Option<jiff::Zoned> {
    Timestamp::from_millisecond(ms_)
        .ok()
        .map(|t| t.to_zoned(tz.clone()))
}

/// An all-day due: 23:59 in the user's zone.
pub fn is_all_day(due_at: i64, tz: &TimeZone) -> bool {
    zoned(due_at, tz).is_some_and(|z| z.hour() == 23 && z.minute() == 59)
}

/// 09:00 on the day `days` before `ms_`'s day.
fn morning_of(ms_: i64, days: i64, tz: &TimeZone) -> Option<i64> {
    let day = zoned(ms_, tz)?.date().checked_sub(days.days()).ok()?;
    let z = day.at(9, 0, 0, 0).to_zoned(tz.clone()).ok()?;
    Some(z.timestamp().as_millisecond())
}

pub fn reminder_fire_at(r: &Reminder, task: Option<&Task>, tz: &TimeZone) -> Option<i64> {
    if let Some(at) = r.at {
        return Some(at);
    }
    let offset = r.offset_min_before_due?;
    let due = ms(task?.due_at.as_ref()?);
    if offset % 1440 == 0 && is_all_day(due, tz) {
        return morning_of(due, offset / 1440, tz);
    }
    Some(due - offset * 60_000)
}

/// A stamp from before `fire_at` was for an earlier instant, so it fires again.
pub fn is_reminder_fired(r: &Reminder, fire_at: i64) -> bool {
    r.fired_at.is_some_and(|f| f >= fire_at)
}

/// The reminder's fire instant, when it is still to fire for an open task.
fn pending_fire_at(r: &Reminder, tasks: &[Task], tz: &TimeZone) -> Option<i64> {
    let task = tasks.iter().find(|t| t.id == r.task_id)?;
    if task.is_completed {
        return None;
    }
    let at = reminder_fire_at(r, Some(task), tz)?;
    (!is_reminder_fired(r, at)).then_some(at)
}

/// Reminders of open tasks whose instant has come and that have not fired for it.
pub fn due_reminders<'a>(
    reminders: &'a [Reminder],
    tasks: &[Task],
    now: i64,
    tz: &TimeZone,
) -> Vec<&'a Reminder> {
    reminders
        .iter()
        .filter(|r| pending_fire_at(r, tasks, tz).is_some_and(|at| at <= now))
        .collect()
}

/// The due reminders, split into those to announce and those more than
/// [`REMINDER_STALE_AFTER_MS`] late, which are only stamped fired.
pub fn split_due_reminders<'a>(
    reminders: &'a [Reminder],
    tasks: &[Task],
    now: i64,
    tz: &TimeZone,
) -> (Vec<&'a Reminder>, Vec<&'a Reminder>) {
    let (mut fire, mut stale) = (Vec::new(), Vec::new());
    for r in reminders {
        let Some(at) = pending_fire_at(r, tasks, tz).filter(|at| *at <= now) else {
            continue;
        };
        if now - at > REMINDER_STALE_AFTER_MS {
            stale.push(r);
        } else {
            fire.push(r);
        }
    }
    (fire, stale)
}

/// The soonest fire instant still ahead of `now`, to wake for.
pub fn next_fire_at(
    reminders: &[Reminder],
    tasks: &[Task],
    now: i64,
    tz: &TimeZone,
) -> Option<i64> {
    reminders
        .iter()
        .filter_map(|r| pending_fire_at(r, tasks, tz))
        .filter(|at| *at > now)
        .min()
}

/// The notification's title: the task's, a placeholder for one this device cannot decrypt, or the
/// fallback for an untitled one.
pub fn reminder_title(task: Option<&Task>, locked_title: &str, fallback_title: &str) -> String {
    match task {
        Some(t) if t.locked => locked_title.to_owned(),
        Some(t) if !t.title.is_empty() => t.title.clone(),
        _ => fallback_title.to_owned(),
    }
}

/// The notification's body: the first non-blank line of the notes.
pub fn reminder_body(task: Option<&Task>) -> String {
    match task {
        Some(t) if !t.locked => t
            .notes
            .lines()
            .find(|l| !l.trim().is_empty())
            .map(|l| l.trim().to_owned())
            .unwrap_or_default(),
        _ => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use jiff::civil::date;
    use serde_json::{json, Number};

    const NOW: i64 = 1_700_000_000_000;

    fn task(due: Option<i64>) -> Task {
        let fields: Map<String, Value> =
            serde_json::from_value(json!({ "title": "Task", "notes": "" })).unwrap();
        let mut t = super::super::task::to_task("t1", &fields);
        t.due_at = due.map(Number::from);
        t
    }

    fn rem() -> Reminder {
        Reminder {
            id: "r1".into(),
            task_id: "t1".into(),
            at: None,
            offset_min_before_due: None,
            fired_at: None,
            created_at: 0,
        }
    }

    fn utc() -> TimeZone {
        TimeZone::UTC
    }

    fn instant(y: i16, m: i8, d: i8, h: i8, mi: i8, tz: &TimeZone) -> i64 {
        date(y, m, d)
            .at(h, mi, 0, 0)
            .to_zoned(tz.clone())
            .unwrap()
            .timestamp()
            .as_millisecond()
    }

    #[test]
    fn fire_at_absolute_offset_and_none() {
        let r = Reminder {
            at: Some(NOW),
            ..rem()
        };
        assert_eq!(reminder_fire_at(&r, Some(&task(None)), &utc()), Some(NOW));
        let r = Reminder {
            offset_min_before_due: Some(30),
            ..rem()
        };
        assert_eq!(
            reminder_fire_at(&r, Some(&task(Some(NOW))), &utc()),
            Some(NOW - 30 * 60_000)
        );
        assert_eq!(reminder_fire_at(&r, Some(&task(None)), &utc()), None);
    }

    #[test]
    fn all_day_offsets_fire_at_nine() {
        let friday = instant(2026, 9, 11, 23, 59, &utc());
        let t = task(Some(friday));
        let off = |m| Reminder {
            offset_min_before_due: Some(m),
            ..rem()
        };
        assert_eq!(
            reminder_fire_at(&off(1440), Some(&t), &utc()),
            Some(instant(2026, 9, 10, 9, 0, &utc()))
        );
        assert_eq!(
            reminder_fire_at(&off(7 * 1440), Some(&t), &utc()),
            Some(instant(2026, 9, 4, 9, 0, &utc()))
        );
        assert_eq!(
            reminder_fire_at(&off(10), Some(&t), &utc()),
            Some(friday - 10 * 60_000)
        );
        assert_eq!(
            reminder_fire_at(&off(0), Some(&t), &utc()),
            Some(instant(2026, 9, 11, 9, 0, &utc()))
        );
    }

    #[test]
    fn all_day_anchor_in_the_given_zone_and_across_dst() {
        let ny = TimeZone::get("America/New_York").unwrap();
        let due = instant(2026, 7, 15, 23, 59, &ny);
        let r = Reminder {
            offset_min_before_due: Some(1440),
            ..rem()
        };
        assert_eq!(
            reminder_fire_at(&r, Some(&task(Some(due))), &ny),
            Some(instant(2026, 7, 14, 13, 0, &utc()))
        );
        let tokyo = TimeZone::get("Asia/Tokyo").unwrap();
        assert_eq!(
            reminder_fire_at(&r, Some(&task(Some(due))), &tokyo),
            Some(due - 1440 * 60_000)
        );
        let due = instant(2026, 3, 15, 23, 59, &ny);
        assert_eq!(
            reminder_fire_at(&r, Some(&task(Some(due))), &ny),
            Some(instant(2026, 3, 14, 13, 0, &utc()))
        );
    }

    #[test]
    fn due_reminders_dedupe_on_the_fired_stamp() {
        let t = task(Some(NOW));
        let r = Reminder {
            offset_min_before_due: Some(0),
            ..rem()
        };
        assert_eq!(
            due_reminders(
                std::slice::from_ref(&r),
                std::slice::from_ref(&t),
                NOW,
                &utc()
            )
            .len(),
            1
        );
        assert!(due_reminders(std::slice::from_ref(&r), &[t], NOW - 1, &utc()).is_empty());

        let fired = Reminder {
            at: Some(NOW - 1000),
            fired_at: Some(NOW - 500),
            ..rem()
        };
        assert!(due_reminders(&[fired], &[task(None)], NOW, &utc()).is_empty());
        let moved = Reminder {
            at: Some(NOW - 1000),
            fired_at: Some(NOW - 3_600_000),
            ..rem()
        };
        assert_eq!(due_reminders(&[moved], &[task(None)], NOW, &utc()).len(), 1);
        let late = Reminder {
            at: Some(NOW - 1000),
            fired_at: Some(NOW),
            ..rem()
        };
        assert!(due_reminders(&[late], &[task(None)], NOW, &utc()).is_empty());
    }

    #[test]
    fn completed_and_missing_tasks_never_fire() {
        let mut done = task(None);
        done.is_completed = true;
        let r = Reminder {
            at: Some(NOW - 1),
            ..rem()
        };
        let orphan = Reminder {
            id: "r2".into(),
            task_id: "gone".into(),
            at: Some(NOW - 1),
            ..rem()
        };
        assert!(due_reminders(&[r, orphan], &[done], NOW, &utc()).is_empty());
    }

    #[test]
    fn split_announces_fresh_and_stamps_stale() {
        let fresh = Reminder {
            at: Some(NOW - 60_000),
            ..rem()
        };
        let late = Reminder {
            id: "late".into(),
            at: Some(NOW - REMINDER_STALE_AFTER_MS - 1),
            ..rem()
        };
        let edge = Reminder {
            id: "edge".into(),
            at: Some(NOW - REMINDER_STALE_AFTER_MS),
            ..rem()
        };
        let future = Reminder {
            id: "future".into(),
            at: Some(NOW + 1),
            ..rem()
        };
        let all = [fresh, late, edge, future];
        let (fire, stale) = split_due_reminders(&all, &[task(None)], NOW, &utc());
        let ids = |v: Vec<&Reminder>| v.iter().map(|r| r.id.clone()).collect::<Vec<_>>();
        assert_eq!(ids(fire), ["r1", "edge"]);
        assert_eq!(ids(stale), ["late"]);
        assert_eq!(
            next_fire_at(&all, &[task(None)], NOW, &utc()),
            Some(NOW + 1)
        );
    }

    #[test]
    fn morning_of_in_the_users_zone() {
        let zone = TimeZone::get("Pacific/Auckland").unwrap();
        let due = instant(2031, 4, 14, 23, 59, &zone);
        let now = instant(2031, 4, 14, 9, 5, &zone);
        let r = Reminder {
            offset_min_before_due: Some(0),
            ..rem()
        };
        let (fire, _) =
            split_due_reminders(std::slice::from_ref(&r), &[task(Some(due))], now, &zone);
        assert_eq!(fire.len(), 1);
    }

    #[test]
    fn titles_and_bodies() {
        let mut t = task(None);
        assert_eq!(
            reminder_title(Some(&t), "Encrypted task", "Reminder"),
            "Task"
        );
        t.title.clear();
        assert_eq!(
            reminder_title(Some(&t), "Encrypted task", "Reminder"),
            "Reminder"
        );
        t.locked = true;
        assert_eq!(
            reminder_title(Some(&t), "Encrypted task", "Reminder"),
            "Encrypted task"
        );
        t.notes = "\n  first line \nsecond".into();
        assert_eq!(reminder_body(Some(&t)), "");
        t.locked = false;
        assert_eq!(reminder_body(Some(&t)), "first line");
        t.notes = "  \n ".into();
        assert_eq!(reminder_body(Some(&t)), "");
    }

    #[test]
    fn from_fields_defaults() {
        let f: Map<String, Value> =
            serde_json::from_value(json!({ "task_id": "t1", "at": 5 })).unwrap();
        assert_eq!(
            Reminder::from_fields("r1", &f),
            Reminder {
                at: Some(5),
                ..rem()
            }
        );
    }
}

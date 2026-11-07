//! Countdowns (`@atlastodo/todo-core`'s `countdown.ts`): math on absolute Unix-ms instants, so a
//! countdown is a physical duration, time-zone and DST correct; the presets' targets are wall-clock
//! midnights in the user's zone.

use jiff::civil::{date, Date};
use jiff::tz::TimeZone;
use jiff::{Timestamp, ToSpan};

const MINUTE: i64 = 60_000;
const HOUR: i64 = 60 * MINUTE;
const DAY: i64 = 24 * HOUR;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Countdown {
    pub remaining: i64,
    pub overdue: bool,
    pub days: i64,
    pub hours: i64,
    pub minutes: i64,
    pub seconds: i64,
    /// The two most-significant units, e.g. "3d 4h"; the UI words around it.
    pub magnitude: String,
    /// "3d 4h", "Overdue by 1d 3h" or "Due now".
    pub label: String,
}

pub fn countdown_to(target: i64, now: i64) -> Countdown {
    let remaining = target - now;
    let abs = remaining.abs();
    let (days, hours, minutes, seconds) = (
        abs / DAY,
        abs % DAY / HOUR,
        abs % HOUR / MINUTE,
        abs % MINUTE / 1000,
    );
    let magnitude = if days > 0 {
        format!("{days}d {hours}h")
    } else if hours > 0 {
        format!("{hours}h {minutes}m")
    } else if minutes > 0 {
        format!("{minutes}m {seconds}s")
    } else {
        format!("{seconds}s")
    };
    let overdue = remaining < 0;
    let label = if remaining == 0 {
        "Due now".to_owned()
    } else if overdue {
        format!("Overdue by {magnitude}")
    } else {
        magnitude.clone()
    };
    Countdown {
        remaining,
        overdue,
        days,
        hours,
        minutes,
        seconds,
        magnitude,
        label,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CountdownPreset {
    Weekend,
    MonthEnd,
    YearEnd,
}

/// The presets in the order the screen lists them (`COUNTDOWN_PRESETS`).
pub const COUNTDOWN_PRESETS: [CountdownPreset; 3] = [
    CountdownPreset::Weekend,
    CountdownPreset::MonthEnd,
    CountdownPreset::YearEnd,
];

impl CountdownPreset {
    /// The id stored in the `default_countdowns` preference.
    pub fn id(self) -> &'static str {
        match self {
            Self::Weekend => "weekend",
            Self::MonthEnd => "month_end",
            Self::YearEnd => "year_end",
        }
    }

    pub fn from_id(id: &str) -> Option<Self> {
        COUNTDOWN_PRESETS.into_iter().find(|p| p.id() == id)
    }

    /// The English name (`countdown.preset.*`).
    pub fn label(self) -> &'static str {
        match self {
            Self::Weekend => "The weekend",
            Self::MonthEnd => "End of month",
            Self::YearEnd => "End of year",
        }
    }
}

fn midnight(day: Date, tz: &TimeZone) -> i64 {
    day.at(0, 0, 0, 0)
        .to_zoned(tz.clone())
        .map(|z| z.timestamp().as_millisecond())
        .unwrap_or(0)
}

/// Strictly future: "weekend" is the coming Saturday 00:00 (a week on when today is Saturday),
/// "month_end" 00:00 on the first of next month, "year_end" the next 1 January.
pub fn preset_target(preset: CountdownPreset, now: i64, tz: &TimeZone) -> i64 {
    let today = Timestamp::from_millisecond(now)
        .map(|t| t.to_zoned(tz.clone()).date())
        .unwrap_or_default();
    let day = match preset {
        CountdownPreset::Weekend => {
            let wd = i64::from(today.weekday().to_sunday_zero_offset());
            let ahead = match (6 - wd + 7) % 7 {
                0 => 7,
                n => n,
            };
            today.checked_add(ahead.days()).unwrap_or(today)
        }
        CountdownPreset::MonthEnd => today
            .first_of_month()
            .checked_add(1.month())
            .unwrap_or(today),
        CountdownPreset::YearEnd => date(today.year() + 1, 1, 1),
    };
    midnight(day, tz)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(s: &str) -> i64 {
        s.parse::<Timestamp>().unwrap().as_millisecond()
    }

    fn local(ms: i64, tz: &str) -> jiff::civil::DateTime {
        Timestamp::from_millisecond(ms)
            .unwrap()
            .to_zoned(TimeZone::get(tz).unwrap())
            .datetime()
    }

    #[test]
    fn breaks_a_duration_into_units_and_labels_the_top_two() {
        let c = countdown_to(3 * DAY + 4 * HOUR + 5 * MINUTE + 6000, 0);
        assert!(!c.overdue);
        assert_eq!((c.days, c.hours, c.minutes, c.seconds), (3, 4, 5, 6));
        assert_eq!(c.label, "3d 4h");
        assert_eq!(countdown_to(2 * HOUR + 5 * MINUTE, 0).label, "2h 5m");
        assert_eq!(countdown_to(5 * MINUTE + 12_000, 0).label, "5m 12s");
        assert_eq!(countdown_to(9000, 0).label, "9s");
    }

    #[test]
    fn overdue_and_due_now() {
        let c = countdown_to(0, DAY + 3 * HOUR);
        assert!(c.overdue);
        assert_eq!(c.remaining, -(DAY + 3 * HOUR));
        assert_eq!((c.days, c.hours), (1, 3));
        assert_eq!(c.label, "Overdue by 1d 3h");
        let now = countdown_to(1000, 1000);
        assert!(!now.overdue);
        assert_eq!(now.label, "Due now");
    }

    #[test]
    fn physical_duration_across_spring_forward() {
        let c = countdown_to(
            at("2026-03-09T12:00:00-04:00"),
            at("2026-03-07T12:00:00-05:00"),
        );
        assert_eq!(c.remaining, 47 * HOUR);
        assert_eq!(c.label, "1d 23h");
        assert_eq!(
            countdown_to(at("2026-03-08T17:00:00Z"), at("2026-03-08T15:00:00Z")).label,
            "2h 0m"
        );
    }

    #[test]
    fn preset_targets() {
        let cph = TimeZone::get("Europe/Copenhagen").unwrap();
        let friday = at("2026-06-05T10:00:00+02:00");
        let d = local(
            preset_target(CountdownPreset::Weekend, friday, &cph),
            "Europe/Copenhagen",
        );
        assert_eq!(d, date(2026, 6, 6).at(0, 0, 0, 0));
        let saturday = at("2026-06-06T10:00:00+02:00");
        let d = local(
            preset_target(CountdownPreset::Weekend, saturday, &cph),
            "Europe/Copenhagen",
        );
        assert_eq!(d, date(2026, 6, 13).at(0, 0, 0, 0));
        let d = local(
            preset_target(CountdownPreset::MonthEnd, friday, &cph),
            "Europe/Copenhagen",
        );
        assert_eq!(d, date(2026, 7, 1).at(0, 0, 0, 0));
        let d = local(
            preset_target(CountdownPreset::YearEnd, friday, &cph),
            "Europe/Copenhagen",
        );
        assert_eq!(d, date(2027, 1, 1).at(0, 0, 0, 0));
    }

    #[test]
    fn month_end_across_dst() {
        let ny = TimeZone::get("America/New_York").unwrap();
        let t = preset_target(
            CountdownPreset::MonthEnd,
            at("2026-03-01T12:00:00-05:00"),
            &ny,
        );
        assert_eq!(
            local(t, "America/New_York"),
            date(2026, 4, 1).at(0, 0, 0, 0)
        );
    }

    #[test]
    fn preset_ids_round_trip() {
        for p in COUNTDOWN_PRESETS {
            assert_eq!(CountdownPreset::from_id(p.id()), Some(p));
        }
        assert_eq!(CountdownPreset::from_id("nope"), None);
    }
}

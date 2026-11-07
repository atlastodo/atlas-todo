//! Dates as the web app's `makeFormatters` shows them in its default locale: "8 Oct", "8 Oct, 20:00"
//! (a due time of 23:59 is all day), "October 2026", "8 Oct 2026"; with the synced `time_format`
//! and `date_format` preferences ([`set_prefs`]).

use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};

use jiff::civil::{Date, Weekday};
use jiff::tz::TimeZone;
use jiff::Zoned;

const MONTHS: [&str; 12] = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec",
];
const MONTHS_LONG: [&str; 12] = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

pub fn zoned(ms: i64, tz: &TimeZone) -> Option<Zoned> {
    jiff::Timestamp::from_millisecond(ms)
        .ok()
        .map(|t| t.to_zoned(tz.clone()))
}

/// `isAllDayTask`: due at 23:59 local.
pub fn is_all_day(ms: i64, tz: &TimeZone) -> bool {
    zoned(ms, tz).is_some_and(|z| z.hour() == 23 && z.minute() == 59)
}

pub fn day_month(d: Date) -> String {
    format!("{} {}", d.day(), MONTHS[d.month() as usize - 1])
}

/// The `time_format` preference: a 12-hour clock ("2:30 PM") rather than the default 24-hour one.
static HOUR12: AtomicBool = AtomicBool::new(false);
/// The `date_format` preference: 0 medium ("8 Oct 2026", also `auto`), 1 short ("08/10/2026"),
/// 2 long ("8 October 2026").
static DATE_STYLE: AtomicU8 = AtomicU8::new(0);

/// Apply the synced `time_format` and `date_format` preferences (`auto`, `12h`/`24h`;
/// `auto`, `short`, `medium`, `long`) to every date and time drawn after this.
pub fn set_prefs(time_format: Option<&str>, date_format: Option<&str>) {
    HOUR12.store(time_format == Some("12h"), Ordering::Relaxed);
    let style = match date_format {
        Some("short") => 1,
        Some("long") => 2,
        _ => 0,
    };
    DATE_STYLE.store(style, Ordering::Relaxed);
}

/// "14:30", or "2:30 PM" on a 12-hour clock.
pub fn clock(hour: i8, minute: i8) -> String {
    if HOUR12.load(Ordering::Relaxed) {
        let h = match hour % 12 {
            0 => 12,
            h => h,
        };
        let half = if hour < 12 { "AM" } else { "PM" };
        format!("{h}:{minute:02} {half}")
    } else {
        format!("{hour}:{minute:02}")
    }
}

pub fn time(ms: i64, tz: &TimeZone) -> String {
    zoned(ms, tz).map_or_else(String::new, |z| clock(z.hour(), z.minute()))
}

/// The due chip.
pub fn due(ms: i64, tz: &TimeZone) -> String {
    let Some(z) = zoned(ms, tz) else {
        return String::new();
    };
    if is_all_day(ms, tz) {
        day_month(z.date())
    } else {
        format!("{}, {}", day_month(z.date()), time(ms, tz))
    }
}

/// A full date in the `date_format` style: "8 Oct 2026", "08/10/2026" or "8 October 2026".
pub fn long_date(d: Date) -> String {
    let m = d.month() as usize - 1;
    match DATE_STYLE.load(Ordering::Relaxed) {
        1 => format!("{:02}/{:02}/{}", d.day(), d.month(), d.year()),
        2 => format!("{} {} {}", d.day(), MONTHS_LONG[m], d.year()),
        _ => format!("{} {} {}", d.day(), MONTHS[m], d.year()),
    }
}

pub fn month_year(d: Date) -> String {
    format!("{} {}", MONTHS_LONG[d.month() as usize - 1], d.year())
}

pub fn weekday_short(w: Weekday) -> &'static str {
    match w {
        Weekday::Monday => "Mon",
        Weekday::Tuesday => "Tue",
        Weekday::Wednesday => "Wed",
        Weekday::Thursday => "Thu",
        Weekday::Friday => "Fri",
        Weekday::Saturday => "Sat",
        Weekday::Sunday => "Sun",
    }
}

/// "4h 10m", "25m".
pub fn duration(ms: i64) -> String {
    let min = ms / 60_000;
    let (h, m) = (min / 60, min % 60);
    if h > 0 {
        format!("{h}h {m}m")
    } else {
        format!("{m}m")
    }
}

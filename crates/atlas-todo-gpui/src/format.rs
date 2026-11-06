//! Dates as the web app's `makeFormatters` shows them in its default locale: "8 Oct", "8 Oct, 20:00"
//! (a due time of 23:59 is all day), "October 2026", "8 Oct 2026".

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

pub fn time(ms: i64, tz: &TimeZone) -> String {
    zoned(ms, tz).map_or_else(String::new, |z| format!("{}:{:02}", z.hour(), z.minute()))
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

pub fn long_date(d: Date) -> String {
    format!(
        "{} {} {}",
        d.day(),
        MONTHS[d.month() as usize - 1],
        d.year()
    )
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

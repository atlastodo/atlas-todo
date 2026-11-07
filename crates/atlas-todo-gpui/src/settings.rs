//! Settings: the sections of the app's settings screen (`apps/mobile/src/screens/settings`) that
//! apply to a desktop. Appearance, calendar and time, features and notifications are synced
//! preferences, written like the web app's; the desktop section is this machine's own
//! (`desktop.json` and the autostart entry).

use gpui::{
    div, prelude::*, px, AnyElement, App, ClickEvent, Context, FontWeight, SharedString, Window,
};
use serde_json::{json, Value};

use crate::app::AtlasApp;
use crate::desktop::{self, DesktopSettings};
use crate::format;
use crate::motion;
use crate::sync::Command;
use crate::theme::{Theme, ACCENTS};
use crate::ui::{icon, segmented, ts};

/// A group of rows under an uppercase title, as the app's `Section`.
fn section(glyph: &str, title: &str, rows: Vec<AnyElement>, t: &Theme) -> gpui::Div {
    let mut card = div()
        .flex()
        .flex_col()
        .px(px(16.))
        .rounded(px(16.))
        .border_1()
        .border_color(t.border)
        .bg(if t.dark {
            gpui::rgba(0x18181b99)
        } else {
            gpui::rgba(0xfafafab3)
        });
    let n = rows.len();
    for (i, row) in rows.into_iter().enumerate() {
        card = card.child(
            div()
                .when(i + 1 < n, |d| d.border_b_1().border_color(t.border))
                .child(row),
        );
    }
    div()
        .flex()
        .flex_col()
        .gap(px(8.))
        .mb(px(24.))
        .child(
            div()
                .flex()
                .items_center()
                .gap(px(8.))
                .px(px(4.))
                .child(icon(glyph, 16., t.muted))
                .child(
                    div()
                        .text_size(ts(12.))
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(t.muted)
                        .child(SharedString::from(title.to_uppercase())),
                ),
        )
        .child(card)
}

/// A label (and what it does) with its control on the right, as the app's `Row`.
fn row(label: &str, desc: Option<String>, control: impl IntoElement, t: &Theme) -> AnyElement {
    div()
        .flex()
        .items_center()
        .justify_between()
        .gap(px(24.))
        .py(px(12.))
        .child(
            div()
                .flex_1()
                .min_w_0()
                .flex()
                .flex_col()
                .gap(px(2.))
                .child(
                    div()
                        .text_size(ts(15.))
                        .text_color(t.text)
                        .child(SharedString::from(label.to_owned())),
                )
                .when_some(desc, |d, desc| {
                    d.child(
                        div()
                            .text_size(ts(13.))
                            .text_color(t.muted)
                            .child(SharedString::from(desc)),
                    )
                }),
        )
        .child(div().flex_none().child(control))
        .into_any_element()
}

/// A switch, its knob springing across.
fn switch(
    id: &str,
    on: bool,
    t: &Theme,
    on_click: impl Fn(&ClickEvent, &mut Window, &mut App) + 'static,
) -> AnyElement {
    let knob = motion::spring(
        div()
            .absolute()
            .top(px(2.))
            .size(px(20.))
            .rounded_full()
            .bg(gpui::rgb(0xffffff))
            .shadow_sm(),
        SharedString::from(format!("{id}-knob")),
        motion::SNAPPY,
        if on { 22. } else { 2. },
        |el, x| el.left(px(x)),
    );
    div()
        .id(SharedString::from(id.to_owned()))
        .relative()
        .w(px(44.))
        .h(px(24.))
        .rounded_full()
        .cursor_pointer()
        .bg(if on {
            t.accent
        } else if t.dark {
            gpui::rgb(0x525252)
        } else {
            gpui::rgb(0xd4d4d4)
        })
        .on_click(on_click)
        .child(knob)
        .into_any_element()
}

/// A switch over a synced feature flag (on unless `false`).
fn pref_switch(
    app: &AtlasApp,
    field: &'static str,
    t: &Theme,
    cx: &mut Context<AtlasApp>,
) -> AnyElement {
    let on = app.feature_on(field);
    switch(
        &format!("pref-{field}"),
        on,
        t,
        cx.listener(move |this, _: &ClickEvent, _, cx| this.set_pref(field, json!(!on), cx)),
    )
}

/// A segmented control over a synced preference with string values.
fn pref_segmented(
    field: &'static str,
    options: &[(&'static str, &str)],
    current: &str,
    t: &Theme,
    cx: &mut Context<AtlasApp>,
) -> AnyElement {
    let labels: Vec<&str> = options.iter().map(|(_, l)| *l).collect();
    let values: Vec<&'static str> = options.iter().map(|(v, _)| *v).collect();
    let active = values.iter().position(|v| *v == current).unwrap_or(0);
    let entity = cx.entity();
    segmented(
        format!("seg-{field}"),
        &labels,
        active,
        false,
        t,
        move |i, _, cx| {
            let value = values[i];
            entity.update(cx, |this, cx| this.set_pref(field, json!(value), cx));
        },
    )
    .into_any_element()
}

fn pref_str<'a>(app: &'a AtlasApp, field: &str, default: &'a str) -> &'a str {
    app.pref(field).and_then(Value::as_str).unwrap_or(default)
}

fn appearance(app: &AtlasApp, t: &Theme, cx: &mut Context<AtlasApp>) -> gpui::Div {
    let theme = pref_str(app, "theme", "system");
    let accent = pref_str(app, "accent", "indigo");
    let mut swatches = div().flex().items_center().gap(px(8.));
    for (name, shades) in ACCENTS {
        let picked = accent == name;
        swatches = swatches.child(
            div()
                .id(SharedString::from(format!("accent-{name}")))
                .size(px(32.))
                .rounded_full()
                .border_2()
                .border_color(if picked {
                    if t.dark {
                        gpui::rgb(0xffffff)
                    } else {
                        gpui::rgb(0x171717)
                    }
                } else {
                    gpui::rgba(0x00000000)
                })
                .bg(gpui::rgb(shades[3]))
                .cursor_pointer()
                .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| {
                    this.set_pref("accent", json!(name), cx)
                })),
        );
    }
    section(
        "palette",
        "Appearance",
        vec![
            row(
                "Theme",
                Some("Match the system or force light/dark.".into()),
                pref_segmented(
                    "theme",
                    &[("system", "System"), ("light", "Light"), ("dark", "Dark")],
                    theme,
                    t,
                    cx,
                ),
                t,
            ),
            row(
                "Accent color",
                Some("Used for highlights and primary actions.".into()),
                swatches,
                t,
            ),
        ],
        t,
    )
}

fn calendar_time(app: &AtlasApp, t: &Theme, cx: &mut Context<AtlasApp>) -> gpui::Div {
    let starts_on = app
        .pref("week_starts_on")
        .and_then(Value::as_i64)
        .unwrap_or(0);
    let entity = cx.entity();
    let week = segmented(
        "seg-week_starts_on",
        &["Sun", "Mon"],
        usize::from(starts_on == 1),
        false,
        t,
        move |i, _, cx| {
            entity.update(cx, |this, cx| this.set_pref("week_starts_on", json!(i), cx));
        },
    );
    let time_format = pref_str(app, "time_format", "auto");
    let time_desc = match time_format {
        "12h" => "12h: 12-hour clock with AM/PM (e.g. 2:30 PM).".to_owned(),
        "24h" => "24h: 24-hour clock (e.g. 14:30).".to_owned(),
        _ => format!(
            "Auto: follows the app's clock (currently {}).",
            format::clock(14, 30)
        ),
    };
    let date_format = pref_str(app, "date_format", "auto");
    let sample = format::long_date(jiff::civil::date(2026, 9, 3));
    let date_desc = match date_format {
        "short" => format!("Short: numeric date (e.g. {sample})."),
        "medium" => format!("Medium: abbreviated month (e.g. {sample})."),
        "long" => format!("Long: full month name (e.g. {sample})."),
        _ => format!("Auto: follows the app's format (currently {sample})."),
    };
    section(
        "calendar-clock",
        "Calendar & time",
        vec![
            row(
                "Week starts on",
                Some("First day of the week in the calendar.".into()),
                week,
                t,
            ),
            row(
                "Show week numbers",
                Some("Show ISO week numbers in the calendar grid.".into()),
                pref_switch(app, "show_week_numbers", t, cx),
                t,
            ),
            row(
                "Time format",
                Some(time_desc),
                pref_segmented(
                    "time_format",
                    &[("auto", "Auto"), ("12h", "12h"), ("24h", "24h")],
                    time_format,
                    t,
                    cx,
                ),
                t,
            ),
            row(
                "Date format",
                Some(date_desc),
                pref_segmented(
                    "date_format",
                    &[
                        ("auto", "Auto"),
                        ("short", "Short"),
                        ("medium", "Medium"),
                        ("long", "Long"),
                    ],
                    date_format,
                    t,
                    cx,
                ),
                t,
            ),
        ],
        t,
    )
}

fn features(app: &AtlasApp, t: &Theme, cx: &mut Context<AtlasApp>) -> gpui::Div {
    let toggles = [
        (
            "focus_enabled",
            "Focus timer & time tracking",
            "Pomodoro sessions and per-task tracked time.",
        ),
        (
            "countdowns_enabled",
            "Countdown widgets",
            "Live countdowns to motivational moments (weekend, month/year end).",
        ),
        (
            "habits_enabled",
            "Habits & streaks",
            "Recurring habits with streak tracking and a heatmap.",
        ),
        (
            "stats_enabled",
            "Productivity stats",
            "Completed-over-time charts and completed history.",
        ),
    ];
    let rows = toggles
        .into_iter()
        .map(|(field, label, desc)| {
            row(label, Some(desc.into()), pref_switch(app, field, t, cx), t)
        })
        .collect();
    section("sliders-horizontal", "Features", rows, t)
}

fn notifications(app: &AtlasApp, t: &Theme, cx: &mut Context<AtlasApp>) -> gpui::Div {
    section(
        "bell",
        "Notifications",
        vec![row(
            "Reminders",
            Some("Notifications before a task is due.".into()),
            pref_switch(app, "reminders_enabled", t, cx),
            t,
        )],
        t,
    )
}

fn desktop_section(t: &Theme, cx: &mut Context<AtlasApp>) -> gpui::Div {
    let s = DesktopSettings::load();
    let login = desktop::starts_at_login();
    let close = switch(
        "desktop-close-to-tray",
        s.close_to_tray,
        t,
        cx.listener(|_, _: &ClickEvent, _, cx| {
            DesktopSettings::update(|s| s.close_to_tray = !s.close_to_tray);
            cx.notify();
        }),
    );
    let start = switch(
        "desktop-start-at-login",
        login,
        t,
        cx.listener(move |this, _: &ClickEvent, _, cx| {
            if let Err(e) = desktop::set_start_at_login(!login) {
                this.error = Some(format!("Could not change the autostart entry: {e}"));
            }
            cx.notify();
        }),
    );
    section(
        "monitor",
        "Desktop app",
        vec![
            row(
                "Close to tray",
                Some(
                    "Closing the window keeps Atlas Todo running in the tray, so sync and \
                     reminders continue. Quit from the tray icon or with Ctrl+Q."
                        .into(),
                ),
                close,
                t,
            ),
            row(
                "Start at login",
                Some("Open Atlas Todo in the tray when you sign in to your desktop.".into()),
                start,
                t,
            ),
            row(
                "Text size",
                Some(format!(
                    "{}%. Ctrl+= and Ctrl+- zoom, Ctrl+0 resets.",
                    (crate::ui::zoom() * 100.).round()
                )),
                div(),
                t,
            ),
        ],
        t,
    )
}

fn account(app: &AtlasApp, t: &Theme, cx: &mut Context<AtlasApp>) -> gpui::Div {
    let (server, who) = app.account.clone().unwrap_or_default();
    let sign_out = div()
        .id("settings-sign-out")
        .px(px(14.))
        .py(px(7.))
        .rounded(px(8.))
        .border_1()
        .border_color(t.border)
        .text_size(ts(14.))
        .text_color(gpui::rgb(crate::theme::RED))
        .cursor_pointer()
        .hover(|d| d.bg(t.hover))
        .on_click(cx.listener(|this, _: &ClickEvent, _, cx| {
            this.send(Command::SignOut);
            cx.notify();
        }))
        .child("Sign out");
    let mut rows = Vec::new();
    if !who.is_empty() {
        rows.push(row("Signed in as", Some(who), div(), t));
    }
    if !server.is_empty() {
        rows.push(row("Server", Some(server), div(), t));
    }
    rows.push(row(
        "Sign out",
        Some("End this session on this device.".into()),
        sign_out,
        t,
    ));
    section("user-round", "Account", rows, t)
}

pub fn settings(app: &mut AtlasApp, t: &Theme, cx: &mut Context<AtlasApp>) -> AnyElement {
    let body = div()
        .flex()
        .flex_col()
        .w_full()
        .max_w(px(760.))
        .child(appearance(app, t, cx))
        .child(calendar_time(app, t, cx))
        .child(features(app, t, cx))
        .child(notifications(app, t, cx))
        .child(desktop_section(t, cx))
        .child(account(app, t, cx));
    div()
        .flex()
        .flex_col()
        .size_full()
        .child(app.header(None, "Settings", div().into_any_element(), t))
        .child(
            div()
                .id("settings")
                .flex_1()
                .min_h_0()
                .overflow_y_scroll()
                .px(px(20.))
                .pt(px(8.))
                .pb(px(40.))
                .child(body),
        )
        .into_any_element()
}

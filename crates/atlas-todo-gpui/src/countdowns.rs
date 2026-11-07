//! Countdowns, as the web app's `CountdownScreen`: the presets (the weekend, month end, year end)
//! the user has enabled, in the synced `default_countdowns` preference, each counting down live
//! to its target in the account's zone.

use std::time::Duration;

use atlas_todo_rules::rules::countdown::{
    countdown_to, preset_target, CountdownPreset, COUNTDOWN_PRESETS,
};
use gpui::{div, prelude::*, px, rgb, AnyElement, ClickEvent, Context, FontWeight, SharedString};
use serde_json::Value;

use crate::app::{AtlasApp, Route};
use crate::format;
use crate::theme::Theme;
use crate::ui::{caps, icon, ts};

const PRESETS_FIELD: &str = "default_countdowns";

/// The enabled presets, in the order they were enabled.
fn enabled(app: &AtlasApp) -> Vec<String> {
    app.pref(PRESETS_FIELD)
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

fn toggle(app: &mut AtlasApp, preset: CountdownPreset, cx: &mut Context<AtlasApp>) {
    let mut ids = enabled(app);
    if ids.iter().any(|x| x == preset.id()) {
        ids.retain(|x| x != preset.id());
    } else {
        ids.push(preset.id().to_owned());
    }
    app.set_pref(
        PRESETS_FIELD,
        Value::Array(ids.into_iter().map(Value::from).collect()),
        cx,
    );
}

/// Re-render once a second while the screen is open.
fn keep_ticking(app: &mut AtlasApp, cx: &mut Context<AtlasApp>) {
    if app.countdown_ticking || !crate::motion::enabled() {
        return;
    }
    app.countdown_ticking = true;
    cx.spawn(async move |this, cx| loop {
        cx.background_executor()
            .timer(Duration::from_millis(
                1000 - (crate::now_ms() % 1000) as u64,
            ))
            .await;
        let go = this.update(cx, |this, cx| {
            if this.route != Route::Countdowns {
                this.countdown_ticking = false;
                return false;
            }
            cx.notify();
            true
        });
        if !matches!(go, Ok(true)) {
            break;
        }
    })
    .detach();
}

pub fn screen(app: &mut AtlasApp, t: &Theme, cx: &mut Context<AtlasApp>) -> AnyElement {
    keep_ticking(app, cx);
    let now = crate::now_ms();
    let tz = app.snap.tz.clone();
    let on = enabled(app);
    let mut chips = div()
        .flex()
        .flex_wrap()
        .items_center()
        .gap(px(8.))
        .child(caps("Presets", t).text_color(t.muted));
    for p in COUNTDOWN_PRESETS {
        let picked = on.iter().any(|x| x == p.id());
        chips = chips.child(
            div()
                .id(SharedString::from(format!("countdown-chip-{}", p.id())))
                .px(px(10.))
                .py(px(4.))
                .rounded_full()
                .border_1()
                .cursor_pointer()
                .map(|d| {
                    if picked {
                        d.border_color(t.accent).bg(t.accent)
                    } else {
                        d.border_color(t.border).hover(|s| s.bg(t.hover))
                    }
                })
                .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| toggle(this, p, cx)))
                .child(
                    div()
                        .text_size(ts(12.))
                        .text_color(if picked { t.on_accent } else { t.muted })
                        .child(p.label()),
                ),
        );
    }
    let presets: Vec<CountdownPreset> = COUNTDOWN_PRESETS
        .into_iter()
        .filter(|p| on.iter().any(|x| x == p.id()))
        .collect();
    let body =
        if presets.is_empty() {
            div()
                .pt(px(80.))
                .flex()
                .flex_col()
                .items_center()
                .gap(px(10.))
                .child(icon("calendar-clock", 30., t.muted))
                .child(
                    div()
                        .text_size(ts(16.))
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(t.text_soft)
                        .child("No countdowns yet"),
                )
                .child(div().text_size(ts(14.)).text_color(t.muted).child(
                    "Tap a preset, such as The weekend, to see how much time is left until it.",
                ))
                .into_any_element()
        } else {
            let mut cards = div().flex().flex_col().gap(px(12.));
            for p in presets {
                let target = preset_target(p, now, &tz);
                let c = countdown_to(target, now);
                let subtitle = format::zoned(target, &tz).map_or(String::new(), |z| {
                    format!(
                        "{}, {:02}:{:02}",
                        format::long_date(z.date()),
                        z.hour(),
                        z.minute()
                    )
                });
                let (border, bg, value) = if c.overdue {
                    if t.dark {
                        (rgb(0x7f1d1d), rgb(0x450a0a), rgb(0xf87171))
                    } else {
                        (rgb(0xfca5a5), rgb(0xfef2f2), rgb(0xdc2626))
                    }
                } else {
                    (t.border, t.surface, t.text)
                };
                cards = cards.child(
                    div()
                        .flex()
                        .items_center()
                        .justify_between()
                        .gap(px(16.))
                        .p(px(16.))
                        .rounded(px(8.))
                        .border_1()
                        .border_color(border)
                        .bg(bg)
                        .child(
                            div()
                                .flex_1()
                                .min_w_0()
                                .flex()
                                .flex_col()
                                .gap(px(2.))
                                .child(
                                    div()
                                        .truncate()
                                        .text_size(ts(14.))
                                        .font_weight(FontWeight::MEDIUM)
                                        .text_color(t.text)
                                        .child(p.label()),
                                )
                                .child(
                                    div()
                                        .text_size(ts(12.))
                                        .text_color(t.muted)
                                        .child(SharedString::from(subtitle)),
                                ),
                        )
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .gap(px(12.))
                                .child(
                                    div()
                                        .text_size(ts(18.))
                                        .font_weight(FontWeight::SEMIBOLD)
                                        .text_color(value)
                                        .child(SharedString::from(c.label)),
                                )
                                .child(
                                    div()
                                        .id(SharedString::from(format!("countdown-x-{}", p.id())))
                                        .p(px(4.))
                                        .rounded(px(4.))
                                        .cursor_pointer()
                                        .hover(|s| s.bg(t.hover))
                                        .on_click(cx.listener(
                                            move |this, _: &ClickEvent, _, cx| toggle(this, p, cx),
                                        ))
                                        .child(icon("x", 16., t.muted)),
                                ),
                        ),
                );
            }
            cards.into_any_element()
        };
    div()
        .flex()
        .flex_col()
        .size_full()
        .child(app.header(None, "Countdowns", div().into_any_element(), t))
        .child(
            div()
                .id("countdowns-scroll")
                .flex_1()
                .min_h_0()
                .overflow_y_scroll()
                .child(
                    div()
                        .max_w(px(760.))
                        .flex()
                        .flex_col()
                        .gap(px(24.))
                        .p(px(16.))
                        .px(px(20.))
                        .child(chips)
                        .child(body),
                ),
        )
        .into_any_element()
}

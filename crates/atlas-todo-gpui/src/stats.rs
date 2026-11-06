//! Stats: completions over 7, 30 or 90 days, the completion streak, focused time, and breakdowns by
//! project and habit.

use std::collections::BTreeMap;

use gpui::{
    div, prelude::*, px, relative, rgb, AnyElement, ClickEvent, Context, FontWeight, SharedString,
};
use jiff::ToSpan;

use atlas_todo_rules::rules::task::ms;

use crate::app::AtlasApp;
use crate::format;
use crate::motion;
use crate::theme::{hex, project_color, Theme, EMERALD, FLAME, PROJECT_COLORS};
use crate::ui::ts;
use crate::ui::{caps, icon};

fn card(
    glyph: &str,
    color: gpui::Rgba,
    value: String,
    unit: &str,
    label: String,
    t: &Theme,
) -> gpui::Div {
    div()
        .flex_1()
        .flex()
        .items_start()
        .gap(px(14.))
        .p(px(16.))
        .rounded(px(10.))
        .border_1()
        .border_color(t.border)
        .bg(t.surface)
        .child(div().mt(px(4.)).child(icon(glyph, 24., color)))
        .child(
            div()
                .flex()
                .flex_col()
                .child(
                    div()
                        .flex()
                        .items_end()
                        .gap(px(5.))
                        .child(
                            div()
                                .text_size(ts(26.))
                                .font_weight(FontWeight::BOLD)
                                .child(SharedString::from(value)),
                        )
                        .when(!unit.is_empty(), |d| {
                            d.child(
                                div()
                                    .pb(px(3.))
                                    .text_size(ts(15.))
                                    .text_color(t.muted)
                                    .child(SharedString::from(unit.to_owned())),
                            )
                        }),
                )
                .child(
                    div()
                        .text_size(ts(13.))
                        .text_color(t.muted)
                        .child(SharedString::from(label)),
                ),
        )
}

/// A labelled horizontal bar; it grows in when the range changes.
fn breakdown(
    key: String,
    name: &str,
    n: usize,
    max: usize,
    color: gpui::Rgba,
    t: &Theme,
) -> AnyElement {
    let frac = if max == 0 { 0. } else { n as f32 / max as f32 };
    let bar = div().h_full().rounded(px(6.)).bg(color);
    let bar = motion::enter(bar, SharedString::from(key), 600, move |el, v| {
        el.w(relative(frac * v))
    });
    div()
        .flex()
        .items_center()
        .gap(px(16.))
        .py(px(4.))
        .child(
            div()
                .w(px(120.))
                .flex_none()
                .text_size(ts(15.))
                .text_color(t.text_soft)
                .truncate()
                .child(SharedString::from(name.to_owned())),
        )
        .child(
            div()
                .flex_1()
                .h(px(14.))
                .rounded(px(6.))
                .bg(t.track)
                .child(bar),
        )
        .child(
            div()
                .w(px(32.))
                .flex_none()
                .flex()
                .justify_end()
                .text_size(ts(15.))
                .text_color(t.muted)
                .child(SharedString::from(n.to_string())),
        )
        .into_any_element()
}

pub fn stats(app: &mut AtlasApp, t: &Theme, cx: &mut Context<AtlasApp>) -> AnyElement {
    let snap = app.snap.clone();
    let today = app.today;
    let days = app.stats_days;
    let from = today.checked_sub((days - 1).days()).unwrap_or(today);
    let completed: Vec<_> = snap
        .tasks
        .iter()
        .filter(|x| x.is_completed)
        .filter_map(|x| Some((x, snap.date_of(ms(x.completed_at.as_ref()?)))))
        .collect();
    let mut per_day: BTreeMap<jiff::civil::Date, usize> = BTreeMap::new();
    for (_, d) in &completed {
        *per_day.entry(*d).or_default() += 1;
    }
    let in_range: Vec<_> = completed
        .iter()
        .filter(|(_, d)| *d >= from && *d <= today)
        .collect();
    // Days in a row with a completion, back from today (or yesterday while today has none).
    let mut streak = 0;
    let mut d = if per_day.contains_key(&today) {
        today
    } else {
        today.yesterday().unwrap_or(today)
    };
    while per_day.contains_key(&d) {
        streak += 1;
        d = d.yesterday().unwrap_or(d);
    }
    let focus_ms: i64 = snap.focus.iter().map(|(len, _)| len).sum();

    let mut ranges = div().flex().gap(px(10.));
    for n in [7_i64, 30, 90] {
        let on = n == days;
        ranges = ranges.child(
            div()
                .id(SharedString::from(format!("range-{n}")))
                .px(px(12.))
                .py(px(5.))
                .rounded(px(6.))
                .border_1()
                .text_size(ts(15.))
                .cursor_pointer()
                .when(on, |b| {
                    b.bg(t.accent)
                        .border_color(t.accent)
                        .text_color(t.on_accent)
                })
                .when(!on, |b| b.border_color(t.border).text_color(t.text_soft))
                .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| {
                    this.stats_days = n;
                    cx.notify();
                }))
                .child(SharedString::from(format!("{n} days"))),
        );
    }

    let counts: Vec<usize> = (0..days)
        .map(|i| {
            let d = from.checked_add(i.days()).unwrap_or(from);
            per_day.get(&d).copied().unwrap_or(0)
        })
        .collect();
    let peak = counts.iter().copied().max().unwrap_or(0);
    let chart_h = 230.;
    let mut bars = div()
        .h(px(chart_h))
        .flex()
        .items_end()
        .gap(px(if days > 60 { 1. } else { 3. }));
    for (i, n) in counts.iter().enumerate() {
        let h = if peak == 0 {
            0.
        } else {
            *n as f32 / peak as f32 * chart_h
        };
        let bar = div().w_full().bg(t.accent).rounded_t(px(2.));
        let bar = motion::enter(
            bar,
            SharedString::from(format!("bar-{days}-{i}")),
            500 + (i as u64 * 12).min(400),
            move |el, v| el.h(px((h * v).max(2.))),
        );
        bars = bars.child(div().flex_1().flex().flex_col().justify_end().child(bar));
    }

    let mut by_project: BTreeMap<String, usize> = BTreeMap::new();
    for (task, _) in &in_range {
        *by_project
            .entry(task.project_id.clone().unwrap_or_default())
            .or_default() += 1;
    }
    let mut by_project: Vec<_> = by_project.into_iter().collect();
    by_project.sort_by_key(|p| std::cmp::Reverse(p.1));
    let project_max = by_project.first().map_or(0, |p| p.1);

    let mut habit_counts: Vec<(String, usize, gpui::Rgba)> = snap
        .habits
        .iter()
        .enumerate()
        .map(|(i, h)| {
            let n = snap
                .checkins
                .iter()
                .filter(|c| c.habit_id == h.id && c.done && c.date >= from && c.date <= today)
                .count();
            let color = if h.color.is_empty() {
                rgb(PROJECT_COLORS[i % PROJECT_COLORS.len()])
            } else {
                hex(&h.color, PROJECT_COLORS[0])
            };
            (h.name.clone(), n, color)
        })
        .collect();
    habit_counts.sort_by_key(|h| std::cmp::Reverse(h.1));
    let habit_max = habit_counts.first().map_or(0, |h| h.1);

    let mut col = div()
        .flex()
        .flex_col()
        .gap(px(14.))
        .child(ranges)
        .child(
            div()
                .flex()
                .gap(px(12.))
                .child(card(
                    "circle-check",
                    rgb(EMERALD),
                    in_range.len().to_string(),
                    "",
                    format!("Completed in {days} days"),
                    t,
                ))
                .child(card(
                    "flame",
                    rgb(FLAME),
                    streak.to_string(),
                    "days",
                    "Current streak".into(),
                    t,
                ))
                .child(card(
                    "timer",
                    t.accent_text,
                    format::duration(focus_ms),
                    "",
                    "Focused time".into(),
                    t,
                )),
        )
        .child(div().mt(px(14.)).child(caps("Completed per day", t)))
        .child(
            div()
                .flex()
                .justify_end()
                .text_size(ts(13.))
                .text_color(t.muted)
                .child(SharedString::from(format!("Peak {peak}"))),
        )
        .child(div().border_b_1().border_color(t.border).child(bars))
        .child(
            div()
                .flex()
                .justify_between()
                .text_size(ts(13.))
                .text_color(t.muted)
                .child(SharedString::from(format::day_month(from)))
                .child("Today"),
        )
        .child(div().mt(px(10.)).child(caps("By project", t)));
    let mut projects = div().flex().flex_col();
    for (pid, n) in &by_project {
        let (name, color) = match snap.project(pid) {
            Some(p) => (p.name.clone(), project_color(&p.id, &p.color)),
            None => ("Inbox".to_owned(), t.accent),
        };
        projects = projects.child(breakdown(
            format!("p-{days}-{pid}"),
            &name,
            *n,
            project_max,
            color,
            t,
        ));
    }
    col = col.child(projects);
    if !habit_counts.is_empty() {
        col = col.child(div().mt(px(10.)).child(caps("Habits", t)));
        let mut habits = div().flex().flex_col();
        for (name, n, color) in &habit_counts {
            habits = habits.child(breakdown(
                format!("h-{days}-{name}"),
                name,
                *n,
                habit_max,
                *color,
                t,
            ));
        }
        col = col.child(habits);
    }
    div()
        .flex()
        .flex_col()
        .size_full()
        .child(app.header(None, "Stats", div().into_any_element(), t))
        .child(
            div()
                .id("stats")
                .flex_1()
                .min_h_0()
                .overflow_y_scroll()
                .px(px(16.))
                .pt(px(14.))
                .pb(px(40.))
                .child(col),
        )
        .into_any_element()
}

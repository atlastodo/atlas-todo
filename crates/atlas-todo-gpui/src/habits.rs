//! Habits: a card per habit with today's check, the streak and the last seven days.

use std::rc::Rc;

use gpui::{div, prelude::*, px, rgb, AnyElement, ClickEvent, Context, FontWeight, SharedString};
use jiff::ToSpan;

use crate::app::AtlasApp;
use crate::format;
use crate::model::{daily_streak, Checkin};
use crate::motion;
use crate::sync::Command;
use crate::theme::{hex, Theme, FLAME, PROJECT_COLORS};
use crate::ui::ts;
use crate::ui::{dot, icon, segmented};

pub fn toggle_today(this: &mut AtlasApp, habit: &str, day: jiff::civil::Date) {
    let snap = Rc::make_mut(&mut this.snap);
    let before = snap.checkins.len();
    snap.checkins
        .retain(|c| !(c.habit_id == habit && c.date == day));
    if snap.checkins.len() == before {
        snap.checkins.push(Checkin {
            habit_id: habit.to_owned(),
            date: day,
            done: true,
        });
    }
    this.send(Command::ToggleHabit(habit.to_owned(), day));
}

pub fn habits(app: &mut AtlasApp, t: &Theme, cx: &mut Context<AtlasApp>) -> AnyElement {
    let snap = app.snap.clone();
    let today = app.today;
    let e1 = cx.entity();
    let e2 = cx.entity();
    let tabs = div()
        .flex()
        .flex_col()
        .gap(px(12.))
        .child(segmented(
            "habit-day",
            &["Today", "Yesterday"],
            0,
            true,
            t,
            move |_, _, cx| e1.update(cx, |_, cx| cx.notify()),
        ))
        .child(segmented(
            "habit-filter",
            &["Due", "All"],
            usize::from(!app.habits_due_only),
            true,
            t,
            move |i, _, cx| {
                e2.update(cx, |this, cx| {
                    this.habits_due_only = i == 0;
                    cx.notify();
                })
            },
        ));
    let dashed = |glyph: &'static str, label: &'static str| {
        div()
            .flex_1()
            .h(px(44.))
            .flex()
            .items_center()
            .justify_center()
            .gap(px(10.))
            .rounded(px(10.))
            .border_1()
            .border_dashed()
            .border_color(t.border)
            .text_size(ts(16.))
            .text_color(t.accent_text)
            .child(icon(glyph, 18., t.accent_text))
            .child(label)
    };
    let mut col = div().flex().flex_col().gap(px(8.)).child(tabs).child(
        div()
            .mt(px(8.))
            .flex()
            .gap(px(8.))
            .child(dashed("plus", "Add habit"))
            .child(dashed("folder-plus", "New group")),
    );
    for (i, h) in snap.habits.iter().enumerate() {
        let color = if h.color.is_empty() {
            rgb(PROJECT_COLORS[i % PROJECT_COLORS.len()])
        } else {
            hex(&h.color, PROJECT_COLORS[0])
        };
        let days = snap.checkins_of(&h.id);
        let done_today = days.get(&today).copied() == Some(true);
        let streak = daily_streak(&days, today);
        let hid = h.id.clone();
        let check = div()
            .id(SharedString::from(format!("habit-check-{}", h.id)))
            .size(px(30.))
            .rounded_full()
            .flex()
            .items_center()
            .justify_center()
            .cursor_pointer()
            .when(done_today, |d| d.bg(color))
            .when(!done_today, |d| d.border_2().border_color(color))
            .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| {
                toggle_today(this, &hid, this.today);
                cx.notify();
            }))
            .when(done_today, |d| d.child(icon("check", 16., t.on_accent)));
        // A done check pops: it springs from slightly small to full size.
        let check = motion::spring_from(
            check,
            SharedString::from(format!("habit-pop-{}-{done_today}", h.id)),
            motion::SNAPPY,
            if done_today { 0.6 } else { 1.0 },
            1.0,
            |el, v| el.size(px(30. * v)),
        );
        let mut week = div().flex().gap(px(8.));
        for back in (0..7).rev() {
            let d = today.checked_sub((back as i64).days()).unwrap_or(today);
            let state = days.get(&d).copied();
            let is_today = back == 0;
            let cell = div()
                .size(px(32.))
                .rounded_full()
                .flex()
                .items_center()
                .justify_center()
                .text_size(ts(13.))
                .map(|c| match state {
                    Some(true) => c.bg(color).text_color(t.on_accent),
                    Some(false) => c
                        .border_1()
                        .border_dashed()
                        .border_color(t.faint)
                        .text_color(t.muted),
                    None if is_today => c.border_1().border_color(t.border).text_color(t.muted),
                    None => c.bg(t.cell_off).text_color(t.text_soft),
                })
                .child(SharedString::from(d.day().to_string()));
            week = week.child(
                div()
                    .flex()
                    .flex_col()
                    .items_center()
                    .gap(px(4.))
                    .child(
                        div()
                            .text_size(ts(12.))
                            .text_color(if is_today { t.accent_text } else { t.faint })
                            .when(is_today, |d| d.font_weight(FontWeight::SEMIBOLD))
                            .child(format::weekday_short(d.weekday())),
                    )
                    .child(if is_today {
                        div()
                            .p(px(2.))
                            .rounded_full()
                            .border_2()
                            .border_color(t.accent)
                            .child(cell)
                    } else {
                        div().p(px(4.)).child(cell)
                    }),
            );
        }
        col = col.child(
            div()
                .flex()
                .items_center()
                .gap(px(12.))
                .px(px(12.))
                .py(px(10.))
                .rounded(px(10.))
                .border_1()
                .border_color(t.border)
                .bg(t.surface)
                .child(
                    div()
                        .size(px(32.))
                        .flex()
                        .items_center()
                        .justify_center()
                        .child(check),
                )
                .child(
                    div()
                        .flex_1()
                        .flex()
                        .flex_col()
                        .gap(px(2.))
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .gap(px(10.))
                                .child(icon("hash", 15., color))
                                .child(
                                    div()
                                        .text_size(ts(16.))
                                        .child(SharedString::from(h.name.clone())),
                                ),
                        )
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .gap(px(10.))
                                .text_size(ts(14.))
                                .text_color(t.muted)
                                .child(icon("flame", 14., rgb(FLAME)))
                                .child(SharedString::from(format!(
                                    "{streak} {}",
                                    if streak == 1 { "day" } else { "days" }
                                )))
                                .child(SharedString::from(format!(
                                    "{} of {}",
                                    u8::from(done_today),
                                    h.target
                                ))),
                        ),
                )
                .child(week)
                .child(icon("ellipsis-vertical", 18., t.faint)),
        );
    }
    if snap.habits.is_empty() {
        col = col.child(crate::list::empty("flame", "No habits yet.", t));
    }
    let legend = div()
        .mt(px(4.))
        .flex()
        .gap(px(18.))
        .text_size(ts(13.))
        .text_color(t.muted)
        .child(
            div()
                .flex()
                .items_center()
                .gap(px(6.))
                .child(dot(11., t.accent))
                .child("Done"),
        )
        .child(
            div()
                .flex()
                .items_center()
                .gap(px(6.))
                .child(dot(11., t.cell_off))
                .child("Missed"),
        )
        .child(
            div()
                .flex()
                .items_center()
                .gap(px(6.))
                .child(
                    div()
                        .size(px(11.))
                        .rounded_full()
                        .border_1()
                        .border_dashed()
                        .border_color(t.faint),
                )
                .child("Skipped"),
        )
        .child(
            div()
                .flex()
                .items_center()
                .gap(px(6.))
                .child(
                    div()
                        .size(px(11.))
                        .rounded_full()
                        .border_1()
                        .border_color(t.border),
                )
                .child("Not done yet"),
        )
        .child(
            div()
                .flex()
                .items_center()
                .gap(px(6.))
                .child(
                    div()
                        .size(px(11.))
                        .rounded_full()
                        .border_2()
                        .border_color(t.accent),
                )
                .child("Today"),
        );
    div()
        .flex()
        .flex_col()
        .size_full()
        .child(app.header(None, "Habits", div().into_any_element(), t))
        .child(
            div()
                .id("habits")
                .flex_1()
                .min_h_0()
                .overflow_y_scroll()
                .px(px(16.))
                .pt(px(14.))
                .pb(px(40.))
                .child(col.child(legend)),
        )
        .into_any_element()
}

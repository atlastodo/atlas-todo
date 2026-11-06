//! Calendar: a month grid (weeks from Sunday, ISO week numbers) or a week of columns, and the agenda.

use gpui::{div, prelude::*, px, AnyElement, ClickEvent, Context, FontWeight, SharedString};
use jiff::civil::{Date, Weekday};
use jiff::ToSpan;

use atlas_todo_rules::rules::task::{ms, Task};

use crate::app::AtlasApp;
use crate::format;
use crate::motion;
use crate::theme::Theme;
use crate::ui::ts;
use crate::ui::{icon, segmented};

fn start_of_week(d: Date) -> Date {
    let back = d.weekday().to_sunday_zero_offset() as i64;
    d.checked_sub(back.days()).unwrap_or(d)
}

fn chip_for(task: &Task, t: &Theme, cx: &mut Context<AtlasApp>) -> AnyElement {
    let id = task.id.clone();
    let overdue = task
        .due_at
        .as_ref()
        .is_some_and(|d| ms(d) < crate::now_ms());
    let red = gpui::rgb(crate::theme::RED);
    div()
        .id(SharedString::from(format!("cal-{}", task.id)))
        .px(px(6.))
        .py(px(2.))
        .rounded(px(4.))
        .bg(if overdue {
            if t.dark {
                t.chip
            } else {
                gpui::rgb(0xfef2f2)
            }
        } else {
            t.accent_soft
        })
        .text_color(if overdue { red } else { t.accent_text })
        .text_size(ts(13.))
        .truncate()
        .cursor_pointer()
        .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| {
            this.open_task = Some(id.clone());
            cx.notify();
        }))
        .child(SharedString::from(task.title.clone()))
        .into_any_element()
}

pub fn calendar(app: &mut AtlasApp, t: &Theme, cx: &mut Context<AtlasApp>) -> AnyElement {
    let snap = app.snap.clone();
    let today = app.today;
    let month = app.month;
    let week_mode = app.calendar_week;
    let on_day = |d: Date| -> Vec<&Task> {
        let mut v: Vec<&Task> =
            snap.open_roots(|t| t.due_at.as_ref().is_some_and(|x| snap.date_of(ms(x)) == d));
        v.sort_by_key(|t| t.due_at.as_ref().map(ms));
        v
    };

    let entity = cx.entity();
    let switch = segmented(
        "cal-mode",
        &["Month", "Week"],
        usize::from(week_mode),
        false,
        t,
        move |i, _, cx| {
            entity.update(cx, |this, cx| {
                this.calendar_week = i == 1;
                cx.notify();
            })
        },
    );
    let step = |this: &mut AtlasApp, dir: i64| {
        if this.calendar_week {
            this.month = this
                .month
                .checked_add((dir * 7).days())
                .unwrap_or(this.month);
        } else {
            this.month = this
                .month
                .checked_add(dir.months())
                .unwrap_or(this.month)
                .first_of_month();
        }
    };
    let nav = div()
        .flex()
        .items_center()
        .justify_between()
        .px(px(16.))
        .pt(px(18.))
        .pb(px(8.))
        .child(
            div()
                .flex()
                .items_center()
                .gap(px(14.))
                .child(
                    div()
                        .id("cal-prev")
                        .cursor_pointer()
                        .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| {
                            step(this, -1);
                            cx.notify();
                        }))
                        .child(icon("chevron-left", 20., t.text_soft)),
                )
                .child(
                    div()
                        .id("cal-next")
                        .cursor_pointer()
                        .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| {
                            step(this, 1);
                            cx.notify();
                        }))
                        .child(icon("chevron-right", 20., t.text_soft)),
                )
                .child(
                    div()
                        .text_size(ts(17.))
                        .text_color(t.text)
                        .child(SharedString::from(format::month_year(month))),
                ),
        )
        .child(switch);

    let days = [
        Weekday::Sunday,
        Weekday::Monday,
        Weekday::Tuesday,
        Weekday::Wednesday,
        Weekday::Thursday,
        Weekday::Friday,
        Weekday::Saturday,
    ];
    let head = div().flex().pl(px(26.)).children(days.iter().map(|d| {
        div()
            .flex_1()
            .flex()
            .justify_center()
            .py(px(6.))
            .text_size(ts(13.))
            .text_color(t.faint)
            .child(format::weekday_short(*d))
    }));

    let first = start_of_week(if week_mode {
        month
    } else {
        month.first_of_month()
    });
    let weeks = if week_mode {
        1
    } else {
        let last = month.last_of_month();
        ((last - first).get_days() as usize / 7) + 1
    };
    let mut grid = div().flex().flex_col().border_1().border_color(t.border);
    for w in 0..weeks {
        let week_start = first.checked_add(((w * 7) as i64).days()).unwrap_or(first);
        let iso = week_start
            .checked_add(1.day())
            .unwrap_or(week_start)
            .iso_week_date()
            .week();
        let mut row = div()
            .flex()
            .min_h(px(if week_mode { 420. } else { 70. }))
            .border_t_1()
            .border_color(t.border)
            .child(
                div()
                    .w(px(26.))
                    .flex_none()
                    .flex()
                    .items_center()
                    .justify_center()
                    .text_size(ts(11.))
                    .text_color(t.faint)
                    .child(SharedString::from(iso.to_string())),
            );
        for i in 0..7 {
            let d = week_start
                .checked_add((i as i64).days())
                .unwrap_or(week_start);
            let inside = week_mode || d.month() == month.month();
            let tasks = on_day(d);
            let max = if week_mode { 12 } else { 3 };
            let more = tasks.len().saturating_sub(max);
            let is_today = d == today;
            let mut cell = div()
                .flex_1()
                .min_w_0()
                .border_l_1()
                .border_color(t.border)
                .p(px(4.))
                .flex()
                .flex_col()
                .gap(px(3.))
                .when(!inside, |c| c.bg(if t.dark { t.surface } else { t.hover }))
                .child(
                    div().flex().justify_end().child(
                        div()
                            .size(px(24.))
                            .rounded_full()
                            .flex()
                            .items_center()
                            .justify_center()
                            .text_size(ts(13.))
                            .when(is_today, |n| {
                                n.bg(t.accent)
                                    .text_color(t.on_accent)
                                    .font_weight(FontWeight::SEMIBOLD)
                            })
                            .when(!is_today, |n| {
                                n.text_color(if inside { t.text_soft } else { t.faint })
                            })
                            .child(SharedString::from(d.day().to_string())),
                    ),
                );
            for task in tasks.iter().take(max) {
                cell = cell.child(chip_for(task, t, cx));
            }
            if more > 0 {
                cell = cell.child(
                    div()
                        .pl(px(6.))
                        .text_size(ts(12.))
                        .text_color(t.faint)
                        .child(SharedString::from(format!("+{more}"))),
                );
            }
            row = row.child(cell);
        }
        grid = grid.child(row);
    }

    let mut agenda: Vec<&Task> = snap.open_roots(|t| {
        t.due_at
            .as_ref()
            .is_some_and(|x| snap.date_of(ms(x)) >= today)
    });
    agenda.sort_by_key(|t| t.due_at.as_ref().map(ms));
    let agenda_rows = agenda.iter().take(30).map(|task| {
        let due = task.due_at.as_ref().map(ms).unwrap_or(0);
        div()
            .flex()
            .items_center()
            .gap(px(16.))
            .py(px(6.))
            .child(
                div()
                    .w(px(80.))
                    .flex_none()
                    .text_size(ts(13.))
                    .text_color(if due < crate::now_ms() {
                        gpui::rgb(crate::theme::RED)
                    } else {
                        t.muted
                    })
                    .child(SharedString::from(format::due(due, &snap.tz))),
            )
            .child(
                div()
                    .text_size(ts(16.))
                    .text_color(t.text)
                    .child(SharedString::from(task.title.clone())),
            )
    });
    let key = SharedString::from(format!("cal-{}-{}", month, week_mode));
    let body = motion::enter(
        div().flex().flex_col().child(head).child(grid),
        key,
        260,
        |el, v| el.opacity(v).ml(px((1. - v) * 18.)),
    );
    div()
        .flex()
        .flex_col()
        .size_full()
        .child(app.header(None, "Calendar", div().into_any_element(), t))
        .child(
            div()
                .id("calendar")
                .flex_1()
                .min_h_0()
                .overflow_y_scroll()
                .px(px(16.))
                .pb(px(40.))
                .child(nav)
                .child(body)
                .child(
                    div()
                        .pt(px(28.))
                        .pb(px(8.))
                        .text_size(ts(16.))
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(t.text_soft)
                        .child("Agenda"),
                )
                .children(agenda_rows),
        )
        .into_any_element()
}

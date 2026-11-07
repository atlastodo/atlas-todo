//! The task dialog (`TaskDetail` on desktop): title, notes, subtasks and activity on the left, the
//! properties on the right. Priority changes are written back; the other fields are shown.

use std::rc::Rc;

use gpui::{
    div, prelude::*, px, relative, AnyElement, ClickEvent, Context, FontWeight, SharedString,
};

use atlas_todo_rules::rules::task::ms;

use crate::app::AtlasApp;
use crate::format;
use crate::motion;
use crate::sync::Command;
use crate::theme::{hex, priority_color, project_color, Theme};
use crate::ui::ts;
use crate::ui::{caps, check_circle, dot, icon};

fn prop_label(glyph: &str, text: &str, t: &Theme) -> gpui::Div {
    div()
        .flex()
        .items_center()
        .gap(px(10.))
        .mt(px(18.))
        .mb(px(8.))
        .text_size(ts(14.))
        .text_color(t.muted)
        .child(icon(glyph, 17., t.muted))
        .child(SharedString::from(text.to_owned()))
}

fn field(t: &Theme) -> gpui::Div {
    div()
        .flex_none()
        .h(px(40.))
        .px(px(14.))
        .flex()
        .items_center()
        .rounded(px(8.))
        .border_1()
        .border_color(t.border)
        .text_size(ts(15.))
        .text_color(t.text)
}

fn pill(text: &str, on: bool, t: &Theme) -> gpui::Div {
    div()
        .px(px(10.))
        .py(px(6.))
        .rounded(px(8.))
        .border_1()
        .text_size(ts(14.))
        .when(on, |d| {
            d.bg(t.accent_soft)
                .border_color(t.accent)
                .text_color(t.accent_text)
        })
        .when(!on, |d| d.border_color(t.border).text_color(t.text_soft))
        .child(SharedString::from(text.to_owned()))
}

pub fn task_detail(
    app: &mut AtlasApp,
    id: &str,
    t: &Theme,
    cx: &mut Context<AtlasApp>,
) -> Option<AnyElement> {
    let snap = app.snap.clone();
    let task = snap.task(id)?.clone();
    let subs = snap.subtasks(&task.id);
    let done = subs.iter().filter(|s| s.is_completed).count();
    let pct = if subs.is_empty() {
        0.
    } else {
        done as f32 / subs.len() as f32
    };
    let (project, section) = snap.place(&task);
    let project_name = project.clone().unwrap_or_else(|| "Inbox".into());
    let project_dot = task
        .project_id
        .as_deref()
        .and_then(|p| snap.project(p))
        .map_or(t.accent, |p| project_color(&p.id, &p.color));

    let header = div()
        .h(px(60.))
        .px(px(24.))
        .flex()
        .items_center()
        .justify_between()
        .border_b_1()
        .border_color(t.divider)
        .child(
            div()
                .flex()
                .items_center()
                .gap(px(8.))
                .px(px(12.))
                .py(px(6.))
                .rounded_full()
                .bg(t.chip)
                .text_size(ts(14.))
                .font_weight(FontWeight::SEMIBOLD)
                .child(dot(8., project_dot))
                .child(SharedString::from(project_name.clone()))
                .child(icon("chevron-down", 14., t.muted)),
        )
        .child(
            div()
                .flex()
                .items_center()
                .gap(px(20.))
                .child(
                    div()
                        .id("detail-delete")
                        .cursor_pointer()
                        .on_click(cx.listener({
                            let id = task.id.clone();
                            move |this, _: &ClickEvent, _, cx| {
                                this.send(Command::DeleteTask(id.clone()));
                                this.open_task = None;
                                cx.notify();
                            }
                        }))
                        .child(icon("trash", 19., t.muted)),
                )
                .child(
                    div()
                        .id("detail-close")
                        .cursor_pointer()
                        .on_click(cx.listener(|this, _: &ClickEvent, _, cx| {
                            this.open_task = None;
                            cx.notify();
                        }))
                        .child(icon("x", 20., t.text_soft)),
                ),
        );

    let tid = task.id.clone();
    let mut left = div()
        .flex_1()
        .min_w_0()
        .flex()
        .flex_col()
        .gap(px(10.))
        .child(
            div()
                .flex()
                .items_center()
                .gap(px(14.))
                .child(
                    div()
                        .id("detail-check")
                        .cursor_pointer()
                        .on_click(
                            cx.listener(move |this, _: &ClickEvent, _, cx| this.toggle(&tid, cx)),
                        )
                        .child(check_circle(22., task.is_completed, t.circle, t)),
                )
                .child(
                    div()
                        .text_size(ts(24.))
                        .font_weight(FontWeight::BOLD)
                        .child(SharedString::from(task.title.clone())),
                ),
        )
        .child(
            div()
                .mt(px(16.))
                .text_size(ts(13.))
                .text_color(t.muted)
                .child("Notes"),
        )
        .child(
            div()
                .min_h(px(90.))
                .p(px(14.))
                .rounded(px(10.))
                .border_1()
                .border_color(t.border)
                .text_size(ts(15.))
                .text_color(if task.notes.is_empty() {
                    t.faint
                } else {
                    t.text
                })
                .child(SharedString::from(if task.notes.is_empty() {
                    "Add notes...".to_owned()
                } else {
                    task.notes.clone()
                })),
        );

    let bar = div().h_full().rounded_full().bg(t.accent);
    let bar = motion::spring(
        bar,
        SharedString::from(format!("progress-{}", task.id)),
        motion::SMOOTH,
        pct,
        |el, v| el.w(relative(v.clamp(0., 1.))),
    );
    let mut subtasks = div()
        .mt(px(12.))
        .p(px(16.))
        .rounded(px(12.))
        .border_1()
        .border_color(t.border)
        .bg(if t.dark { t.bg } else { t.hover })
        .flex()
        .flex_col()
        .gap(px(4.))
        .child(
            div()
                .flex()
                .items_center()
                .justify_between()
                .child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(10.))
                        .child(icon("list-checks", 17., t.text_soft))
                        .child(
                            div()
                                .text_size(ts(15.))
                                .font_weight(FontWeight::SEMIBOLD)
                                .child("Subtasks"),
                        )
                        .child(
                            div()
                                .text_size(ts(13.))
                                .text_color(t.faint)
                                .child(SharedString::from(format!("{done}/{}", subs.len()))),
                        ),
                )
                .child(
                    div()
                        .text_size(ts(14.))
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(t.accent_text)
                        .child(SharedString::from(format!(
                            "{}%",
                            (pct * 100.).round() as i64
                        ))),
                ),
        )
        .child(
            div()
                .my(px(8.))
                .h(px(6.))
                .rounded_full()
                .bg(t.track)
                .child(bar),
        );
    for s in &subs {
        let sid = s.id.clone();
        subtasks = subtasks.child(
            div()
                .id(SharedString::from(format!("dsub-{}", s.id)))
                .flex()
                .items_center()
                .gap(px(14.))
                .py(px(8.))
                .cursor_pointer()
                .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| this.toggle(&sid, cx)))
                .child(check_circle(18., s.is_completed, t.circle, t))
                .child(
                    div()
                        .text_size(ts(15.))
                        .text_color(if s.is_completed { t.faint } else { t.text })
                        .when(s.is_completed, |d| d.line_through())
                        .child(SharedString::from(s.title.clone())),
                ),
        );
    }
    subtasks = subtasks.child(
        div()
            .mt(px(6.))
            .pt(px(14.))
            .border_t_1()
            .border_color(t.border)
            .flex()
            .items_center()
            .gap(px(12.))
            .pl(px(14.))
            .text_size(ts(16.))
            .text_color(t.faint)
            .child(icon("plus", 16., t.faint))
            .child("Add a subtask"),
    );
    left = left.child(subtasks).child(
        div()
            .mt(px(18.))
            .flex()
            .items_center()
            .justify_between()
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(10.))
                    .text_size(ts(14.))
                    .text_color(t.muted)
                    .child(icon("paperclip", 17., t.muted))
                    .child("Attachments"),
            )
            .child(icon("plus", 18., t.accent_text)),
    );
    left = left.child(
        div()
            .mt(px(18.))
            .flex()
            .items_center()
            .gap(px(10.))
            .text_size(ts(14.))
            .text_color(t.muted)
            .child(icon("message-square", 17., t.muted))
            .child("Activity"),
    );
    for c in snap.comments_of(&task.id) {
        let who = if c.author_id == snap.user_id {
            "You"
        } else {
            "Someone"
        };
        left = left.child(
            div()
                .flex()
                .flex_col()
                .gap(px(2.))
                .child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(10.))
                        .child(div().text_size(ts(15.)).child(who))
                        .child(div().text_size(ts(13.)).text_color(t.faint).child(
                            SharedString::from(format!(
                                "{}, {}",
                                format::long_date(snap.date_of(c.created_at)),
                                format::time(c.created_at, &snap.tz)
                            )),
                        )),
                )
                .child(
                    div()
                        .text_size(ts(15.))
                        .text_color(t.text_soft)
                        .child(SharedString::from(c.body.clone())),
                ),
        );
    }

    let due = task.due_at.as_ref().map(ms);
    let all_day = due.is_some_and(|d| format::is_all_day(d, &snap.tz));
    let mut priorities = div().flex().gap(px(8.));
    for (p, label) in [(1u8, "P1"), (2, "P2"), (3, "P3"), (4, "None")] {
        let on = task.priority == p;
        let tid = task.id.clone();
        priorities = priorities.child(
            div()
                .id(SharedString::from(format!("prio-{p}")))
                .flex_1()
                .h(px(40.))
                .flex()
                .items_center()
                .justify_center()
                .gap(px(6.))
                .rounded(px(8.))
                .border_1()
                .cursor_pointer()
                .text_size(ts(15.))
                .when(on, |d| {
                    d.bg(t.accent_soft)
                        .border_color(t.accent)
                        .text_color(t.accent_text)
                })
                .when(!on, |d| d.border_color(t.border).text_color(t.muted))
                .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| {
                    let snap = Rc::make_mut(&mut this.snap);
                    if let Some(t) = snap.tasks.iter_mut().find(|t| t.id == tid) {
                        t.priority = p;
                    }
                    this.send(Command::SetPriority(tid.clone(), p));
                    cx.notify();
                }))
                .when_some(priority_color(p), |d, c| d.child(icon("flag", 16., c)))
                .child(label),
        );
    }
    let mut labels = div().flex().flex_wrap().gap(px(6.));
    for l in task.label_ids.iter().filter_map(|l| snap.label(l)) {
        labels = labels.child(
            div()
                .flex()
                .items_center()
                .gap(px(6.))
                .px(px(8.))
                .py(px(3.))
                .rounded(px(4.))
                .bg(t.chip)
                .text_size(ts(14.))
                .child(dot(8., hex(&l.color, 0x6366f1)))
                .child(SharedString::from(l.name.clone()))
                .child(icon("x", 12., t.muted)),
        );
    }
    let repeat = task.recurrence.clone().unwrap_or_default();
    let right = div()
        .w(px(300.))
        .flex_none()
        .pl(px(24.))
        .border_l_1()
        .border_color(t.divider)
        .flex()
        .flex_col()
        .child(caps("Properties", t))
        .child(prop_label("folder-input", "Project", t))
        .child(
            field(t)
                .justify_between()
                .child(SharedString::from(match section {
                    Some(s) => format!("{project_name} / {s}"),
                    None => project_name.clone(),
                }))
                .child(icon("chevron-right", 16., t.muted)),
        )
        .child(prop_label("calendar", "Due date", t))
        .child(
            div()
                .flex()
                .gap(px(8.))
                .child(field(t).flex_1().child(SharedString::from(
                    due.map_or("No date".to_owned(), |d| format::long_date(snap.date_of(d))),
                )))
                .when(due.is_some() && !all_day, |d| {
                    d.child(
                        field(t)
                            .gap(px(8.))
                            .child(icon("clock", 16., t.muted))
                            .child(SharedString::from(format::time(due.unwrap_or(0), &snap.tz))),
                    )
                }),
        )
        .when(due.is_some(), |d| {
            d.child(
                div()
                    .mt(px(8.))
                    .flex()
                    .gap(px(8.))
                    .child(pill("End of day", all_day, t))
                    .child(pill("Clear", false, t)),
            )
        })
        .child(prop_label("calendar-clock", "Start date", t))
        .child(field(t).child(SharedString::from(
            task.start_at.as_ref().map_or("No date".to_owned(), |s| {
                format::long_date(snap.date_of(ms(s)))
            }),
        )))
        .child(prop_label("flag", "Priority", t))
        .child(priorities)
        .child(prop_label("tag", "Labels", t))
        .child(labels)
        .child(
            field(t)
                .mt(px(8.))
                .text_color(t.faint)
                .child("Add or create a label..."),
        )
        .child(prop_label("repeat", "Repeat", t))
        .child(
            div()
                .flex()
                .flex_wrap()
                .gap(px(8.))
                .child(pill("Does not repeat", repeat.is_empty(), t))
                .child(pill(
                    "Daily",
                    repeat.contains("DAILY") || repeat == "every day",
                    t,
                ))
                .child(pill(
                    "Weekly",
                    repeat.contains("WEEKLY")
                        || repeat.starts_with("every ")
                            && repeat.ends_with("day")
                            && repeat != "every day",
                    t,
                ))
                .child(pill("Monthly", repeat.contains("MONTHLY"), t))
                .child(pill("Yearly", repeat.contains("YEARLY"), t)),
        );

    let dialog = div()
        .id("detail")
        .w(relative(0.82))
        .max_w(px(1000.))
        .h(relative(0.88))
        .flex()
        .flex_col()
        .rounded(px(16.))
        .bg(t.surface)
        .border_1()
        .border_color(t.border)
        .shadow_2xl()
        .overflow_hidden()
        .on_click(|_, _, cx| cx.stop_propagation())
        .child(header)
        .child(
            div()
                .id("detail-body")
                .flex_1()
                .min_h_0()
                .overflow_y_scroll()
                .flex()
                .gap(px(24.))
                .px(px(28.))
                .py(px(24.))
                .child(left)
                .child(right),
        );
    let dialog = motion::enter(
        dialog,
        SharedString::from(format!("detail-in-{id}")),
        320,
        |el, v| el.opacity(v).mt(px((1. - v) * 24.)),
    );
    let overlay = div()
        .id("detail-overlay")
        .absolute()
        .inset_0()
        .flex()
        .items_center()
        .justify_center()
        .bg(t.overlay)
        .on_click(cx.listener(|this, _: &ClickEvent, _, cx| {
            this.open_task = None;
            cx.notify();
        }))
        .child(dialog);
    Some(motion::enter(
        overlay,
        SharedString::from(format!("detail-fade-{id}")),
        200,
        |el, v| el.opacity(v),
    ))
}

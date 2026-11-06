//! A project's board: a column per section, a card per task (`BoardScreen`, `BoardCard`).

use gpui::{div, prelude::*, px, AnyElement, ClickEvent, Context, FontWeight, SharedString};

use atlas_todo_rules::rules::task::{ms, Task};

use crate::app::{AddTarget, AtlasApp};
use crate::format;
use crate::list::{add_row, project_header};
use crate::theme::{hex, priority_color, Theme};
use crate::ui::ts;
use crate::ui::{check_circle, chip, dot, header_icons, icon};

const COLUMN: f32 = 308.;

fn card(app: &AtlasApp, task: &Task, t: &Theme, cx: &mut Context<AtlasApp>) -> AnyElement {
    let snap = &app.snap;
    let subs: Vec<&Task> = snap.subtasks(&task.id);
    let done = subs.iter().filter(|s| s.is_completed).count();
    let id = task.id.clone();
    let open_id = task.id.clone();
    let mut meta = div().flex().flex_wrap().items_center().gap(px(6.));
    if let Some(c) = priority_color(task.priority) {
        meta = meta.child(icon("flag", 15., c));
    }
    if let Some(d) = task.due_at.as_ref() {
        let overdue = ms(d) < crate::now_ms() && !task.is_completed;
        let red = gpui::rgb(crate::theme::RED);
        meta = meta.child(
            chip(t)
                .when(overdue, |c| {
                    c.bg(if t.dark { t.chip } else { gpui::rgb(0xfef2f2) })
                        .text_color(red)
                })
                .child(icon("calendar", 13., if overdue { red } else { t.muted }))
                .child(SharedString::from(format::due(ms(d), &snap.tz))),
        );
    }
    for l in task.label_ids.iter().filter_map(|l| snap.label(l)) {
        meta = meta.child(
            chip(t)
                .child(dot(8., hex(&l.color, 0x6366f1)))
                .child(SharedString::from(l.name.clone())),
        );
    }
    if task.recurrence.is_some() {
        meta = meta.child(icon("repeat", 15., t.muted));
    }
    let has_meta = task.due_at.is_some()
        || priority_color(task.priority).is_some()
        || !task.label_ids.is_empty()
        || task.recurrence.is_some();
    let mut body = div().flex().flex_col().p(px(12.)).gap(px(0.)).child(
        div()
            .flex()
            .items_start()
            .gap(px(10.))
            .px(px(2.))
            .child(
                div()
                    .id(SharedString::from(format!("bcheck-{}", task.id)))
                    .mt(px(3.))
                    .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| {
                        cx.stop_propagation();
                        this.toggle(&id, cx);
                    }))
                    .child(check_circle(18., task.is_completed, t.circle, t)),
            )
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .flex()
                    .flex_col()
                    .gap(px(2.))
                    .child(
                        div()
                            .text_size(ts(16.))
                            .text_color(t.text)
                            .child(SharedString::from(task.title.clone())),
                    )
                    .when(!task.notes.is_empty(), |d| {
                        d.child(
                            div()
                                .text_size(ts(14.))
                                .text_color(t.faint)
                                .truncate()
                                .child(SharedString::from(task.notes.replace('\n', " "))),
                        )
                    }),
            ),
    );
    if has_meta || !subs.is_empty() {
        body = body.child(
            div()
                .mt(px(8.))
                .pt(px(8.))
                .border_t_1()
                .border_color(t.divider)
                .flex()
                .flex_col()
                .gap(px(6.))
                .when(has_meta, |d| d.child(meta))
                .when(!subs.is_empty(), |d| {
                    d.child(
                        div().flex().child(
                            chip(t)
                                .child(icon("check", 13., t.muted))
                                .child(SharedString::from(format!("{done}/{}", subs.len())))
                                .child(icon("chevron-down", 13., t.muted)),
                        ),
                    )
                    .children(subs.iter().map(|s| {
                        let sid = s.id.clone();
                        div()
                            .id(SharedString::from(format!("bsub-{}", s.id)))
                            .flex()
                            .items_center()
                            .gap(px(10.))
                            .py(px(4.))
                            .pl(px(2.))
                            .text_size(ts(14.))
                            .text_color(t.text_soft)
                            .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| {
                                cx.stop_propagation();
                                this.toggle(&sid, cx);
                            }))
                            .child(check_circle(15., s.is_completed, t.circle, t))
                            .child(SharedString::from(s.title.clone()))
                            .into_any_element()
                    }))
                }),
        );
    }
    div()
        .id(SharedString::from(format!("card-{}", task.id)))
        .rounded(px(10.))
        .border_1()
        .border_color(t.border)
        .bg(t.surface)
        .shadow_xs()
        .cursor_pointer()
        .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| {
            this.open_task = Some(open_id.clone());
            cx.notify();
        }))
        .child(body)
        .into_any_element()
}

pub fn project_board(
    app: &mut AtlasApp,
    project_id: &str,
    t: &Theme,
    cx: &mut Context<AtlasApp>,
) -> AnyElement {
    let header = project_header(app, project_id, true, t, cx);
    let snap = app.snap.clone();
    let mut columns: Vec<(Option<String>, String)> = Vec::new();
    let loose =
        snap.open_roots(|x| x.project_id.as_deref() == Some(project_id) && x.section_id.is_none());
    if !loose.is_empty() {
        columns.push((None, "No section".into()));
    }
    for s in snap.sections_of(project_id) {
        columns.push((Some(s.id.clone()), s.name.clone()));
    }
    let mut row = div()
        .flex()
        .items_start()
        .gap(px(28.))
        .px(px(22.))
        .pt(px(18.))
        .pb(px(40.));
    for (section, name) in columns {
        let tasks = snap
            .open_roots(|x| x.project_id.as_deref() == Some(project_id) && x.section_id == section);
        let cards: Vec<AnyElement> = tasks.iter().map(|x| card(app, x, t, cx)).collect();
        let add = add_row(
            app,
            AddTarget {
                key: format!("board-{}", section.clone().unwrap_or_default()),
                project_id: Some(project_id.to_owned()),
                section_id: section.clone(),
            },
            "Add task",
            false,
            t,
            cx,
        );
        row = row.child(
            div()
                .w(px(COLUMN))
                .flex_none()
                .flex()
                .flex_col()
                .child(
                    div()
                        .flex()
                        .items_center()
                        .justify_between()
                        .px(px(4.))
                        .h(px(44.))
                        .child(
                            div()
                                .text_size(ts(15.5))
                                .font_weight(FontWeight::BOLD)
                                .text_color(t.text_soft)
                                .child(SharedString::from(format!(
                                    "{} ({})",
                                    name.to_uppercase(),
                                    tasks.len()
                                ))),
                        )
                        .child(header_icons(&["pencil", "ellipsis-vertical"], t)),
                )
                .child(
                    div()
                        .mt(px(14.))
                        .flex()
                        .flex_col()
                        .gap(px(8.))
                        .children(cards),
                )
                .child(
                    div()
                        .mt(px(32.))
                        .border_t_1()
                        .border_dashed()
                        .border_color(t.border)
                        .child(add),
                ),
        );
    }
    div()
        .flex()
        .flex_col()
        .size_full()
        .child(header)
        .child(
            div()
                .id("board")
                .flex_1()
                .min_h_0()
                .overflow_scroll()
                .child(row),
        )
        .into_any_element()
}

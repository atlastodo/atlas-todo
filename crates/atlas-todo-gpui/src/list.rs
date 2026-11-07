//! Task lists: a project's list view, Upcoming, Today, the simple lists and the Projects page.

use gpui::{
    div, prelude::*, px, AnyElement, ClickEvent, Context, FontWeight, SharedString, Window,
};
use jiff::ToSpan;

use atlas_todo_rules::rules::task::{ms, Task};

use crate::app::{AddTarget, AtlasApp, Route};
use crate::format;
use crate::motion;
use crate::theme::{priority_color, project_color, Theme};
use crate::ui::ts;
use crate::ui::{check_circle, chevron, chip, dot, icon, segmented};

/// The widest a list runs, centred in the content area (`LIST_MAX_WIDTH`).
pub const LIST_MAX_WIDTH: f32 = 860.;
pub const TITLE: f32 = 16.;
pub const SMALL: f32 = 14.;

pub fn list_column() -> gpui::Div {
    div()
        .w_full()
        .max_w(px(LIST_MAX_WIDTH))
        .mx_auto()
        .flex()
        .flex_col()
}

pub fn scroll_body(id: &'static str) -> gpui::Stateful<gpui::Div> {
    div()
        .id(id)
        .flex_1()
        .min_h_0()
        .overflow_y_scroll()
        .px(px(24.))
        .pb(px(40.))
}

pub struct RowOpts {
    /// Show the project / section under the title (lists across projects).
    pub show_place: bool,
    pub show_labels: bool,
    pub depth: usize,
}

/// One task row, as `TaskRow`: circle, title (notes and place under it), markers and the due date.
pub fn task_row(
    app: &AtlasApp,
    task: &Task,
    opts: &RowOpts,
    t: &Theme,
    cx: &mut Context<AtlasApp>,
) -> AnyElement {
    let snap = &app.snap;
    let subs = snap.subtasks(&task.id);
    let done_subs = subs.iter().filter(|s| s.is_completed).count();
    let id = task.id.clone();
    let open_id = task.id.clone();
    let ring = t.circle;
    let mut markers = div().flex().items_center().gap(px(10.));
    if !subs.is_empty() {
        markers = markers.child(
            div()
                .flex()
                .items_center()
                .gap(px(3.))
                .text_size(ts(SMALL))
                .text_color(t.faint)
                .child(icon("circle-check", 15., t.faint))
                .child(SharedString::from(format!("{done_subs}/{}", subs.len()))),
        );
    }
    if snap.reminders.contains(&task.id) {
        markers = markers.child(icon("bell", 18., t.faint));
    }
    if task.recurrence.is_some() {
        markers = markers.child(icon("repeat", 18., t.faint));
    }
    let flag = div()
        .w(px(18.))
        .flex_none()
        .when_some(priority_color(task.priority), |d, c| {
            d.child(icon("flag", 18., c))
        });
    let due = task.due_at.as_ref().map(|d| format::due(ms(d), &snap.tz));
    let overdue = task
        .due_at
        .as_ref()
        .is_some_and(|d| ms(d) < crate::now_ms() && !task.is_completed);
    let (project, section) = snap.place(task);
    let mut body = div()
        .flex_1()
        .min_w_0()
        .flex()
        .flex_col()
        .gap(px(2.))
        .child(
            div()
                .text_size(ts(TITLE))
                .text_color(if task.is_completed { t.faint } else { t.text })
                .when(task.is_completed, |d| d.line_through())
                .truncate()
                .child(SharedString::from(task.title.clone())),
        );
    if !task.notes.is_empty() {
        body = body.child(
            div()
                .text_size(ts(SMALL))
                .text_color(t.faint)
                .truncate()
                .child(SharedString::from(task.notes.replace('\n', " "))),
        );
    }
    if opts.show_place {
        let place = match (project, section) {
            (Some(p), Some(s)) => Some((p, Some(s))),
            (Some(p), None) => Some((p, None)),
            (None, _) => Some(("Inbox".to_owned(), None)),
        };
        if let Some((p, s)) = place {
            body = body.child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(6.))
                    .text_size(ts(SMALL))
                    .text_color(t.faint)
                    .child(SharedString::from(p))
                    .when_some(s, |d, s| {
                        d.child(icon("chevron-right", 12., t.faint))
                            .child(SharedString::from(s))
                    }),
            );
        }
    }
    if opts.show_labels && !task.label_ids.is_empty() {
        let mut labels = div().flex().gap(px(6.)).mt(px(2.));
        for l in task.label_ids.iter().filter_map(|l| snap.label(l)) {
            labels = labels.child(
                chip(t)
                    .child(dot(8., crate::theme::hex(&l.color, 0x6366f1)))
                    .child(SharedString::from(l.name.clone())),
            );
        }
        body = body.child(labels);
    }
    let tall = body_lines(task, opts) > 1;
    let has_subs = !subs.is_empty();
    let folded = app.folded.contains(&task.id);
    let fold_id = task.id.clone();
    let row = div()
        .id(SharedString::from(format!("row-{}", task.id)))
        .flex()
        .items_center()
        .gap(px(12.))
        .pl(px(16. + opts.depth as f32 * 20.))
        .pr(px(36.))
        .py(px(if tall { 12. } else { 11. }))
        .min_h(px(45.))
        .border_b_1()
        .border_color(t.divider)
        .cursor_pointer()
        .hover(|s| s.bg(t.hover))
        .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| {
            this.open_task = Some(open_id.clone());
            cx.notify();
        }))
        .child(
            div()
                .id(SharedString::from(format!("check-{}", task.id)))
                .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| {
                    cx.stop_propagation();
                    this.toggle(&id, cx);
                }))
                .child(motion::spring_from(
                    check_circle(20., task.is_completed, ring, t),
                    SharedString::from(format!("pop-{}-{}", task.id, task.is_completed)),
                    motion::SNAPPY,
                    if task.is_completed { 0.55 } else { 1. },
                    1.,
                    |el, v| el.size(px(20. * v)),
                )),
        )
        .child(body)
        .child(markers)
        .child(flag)
        .child(
            div()
                .w(px(92.))
                .flex_none()
                .flex()
                .justify_end()
                .text_size(ts(SMALL))
                .text_color(if overdue {
                    gpui::rgb(crate::theme::RED)
                } else {
                    t.muted
                })
                .when_some(due, |d, s| d.child(SharedString::from(s))),
        )
        .child(
            div()
                .id(SharedString::from(format!("fold-{}", task.id)))
                .w(px(24.))
                .flex_none()
                .when(has_subs, |d| {
                    d.child(chevron(
                        SharedString::from(format!("chev-fold-{}", task.id)),
                        !folded,
                        18.,
                        t.muted,
                    ))
                    .on_click(cx.listener(
                        move |this, _: &ClickEvent, _, cx| {
                            cx.stop_propagation();
                            if !this.folded.remove(&fold_id) {
                                this.folded.insert(fold_id.clone());
                            }
                            cx.notify();
                        },
                    ))
                }),
        );
    // A project's top-level rows can be dragged to reorder, or into another section.
    let row = if matches!(app.route, Route::Project(_)) && task.parent_id.is_none() {
        crate::organize::draggable(row, app, &task.id, false, t)
    } else {
        row
    };
    if task.is_completed && snap.linger.contains(&task.id) {
        // Just checked off: the row dims away, then leaves the list.
        return motion::enter(
            row,
            SharedString::from(format!("done-{}", task.id)),
            crate::app::LINGER.as_millis() as u64,
            |el, v| el.opacity(1. - 0.8 * v),
        );
    }
    row.into_any_element()
}

fn body_lines(task: &Task, opts: &RowOpts) -> usize {
    1 + usize::from(!task.notes.is_empty())
        + usize::from(opts.show_place)
        + usize::from(opts.show_labels && !task.label_ids.is_empty())
}

/// A row and, unless folded, its open subtasks under a guide line.
pub fn task_tree(
    app: &AtlasApp,
    task: &Task,
    opts: &RowOpts,
    t: &Theme,
    cx: &mut Context<AtlasApp>,
) -> Vec<AnyElement> {
    let mut out = vec![task_row(app, task, opts, t, cx)];
    if app.folded.contains(&task.id) {
        return out;
    }
    let subs: Vec<Task> = app
        .snap
        .subtasks(&task.id)
        .into_iter()
        .filter(|s| app.snap.listed(s))
        .cloned()
        .collect();
    if subs.is_empty() {
        return out;
    }
    let child_opts = RowOpts {
        show_place: opts.show_place,
        show_labels: false,
        depth: 0,
    };
    let rows: Vec<AnyElement> = subs
        .iter()
        .map(|s| task_row(app, s, &child_opts, t, cx))
        .collect();
    out.push(
        div()
            .ml(px(26.))
            .border_l_1()
            .border_color(t.border)
            .flex()
            .flex_col()
            .children(rows)
            .into_any_element(),
    );
    out
}

/// "+ Add task", or the quick-add field once it is open.
pub fn add_row(
    app: &AtlasApp,
    target: AddTarget,
    label: &str,
    big: bool,
    t: &Theme,
    cx: &mut Context<AtlasApp>,
) -> AnyElement {
    let open = app.adding.as_ref().is_some_and(|a| a.key == target.key);
    let key = target.key.clone();
    let row = div()
        .id(SharedString::from(format!("add-{key}")))
        .flex()
        .items_center()
        .gap(px(14.))
        .pl(px(if big { 18. } else { 24. }))
        .py(px(14.))
        .text_size(ts(17.))
        .text_color(t.faint)
        .child(icon("plus", 18., t.faint));
    if open {
        row.child(div().flex_1().text_color(t.text).child(app.input.clone()))
            .into_any_element()
    } else {
        row.cursor_pointer()
            .on_click(cx.listener(move |this, _: &ClickEvent, window, cx| {
                this.start_add(target.clone(), window, cx)
            }))
            .child(SharedString::from(label.to_owned()))
            .into_any_element()
    }
}

fn section_header(
    app: &AtlasApp,
    key: &str,
    title: &str,
    count: usize,
    tools: bool,
    t: &Theme,
    cx: &mut Context<AtlasApp>,
) -> AnyElement {
    let collapsed = app.collapsed.contains(key);
    let k = key.to_owned();
    div()
        .id(SharedString::from(format!("sec-{key}")))
        .flex()
        .items_center()
        .justify_between()
        .pl(px(14.))
        .pr(px(36.))
        .py(px(8.))
        .cursor_pointer()
        .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| {
            if !this.collapsed.remove(&k) {
                this.collapsed.insert(k.clone());
            }
            cx.notify();
        }))
        .child(
            div()
                .flex()
                .items_center()
                .gap(px(10.))
                .child(chevron(
                    SharedString::from(format!("chev-{key}")),
                    !collapsed,
                    16.,
                    t.muted,
                ))
                .child(crate::organize::section_title(
                    app,
                    tools.then_some(key),
                    div()
                        .text_size(ts(SMALL))
                        .text_color(t.muted)
                        .child(SharedString::from(title.to_uppercase()))
                        .into_any_element(),
                    t,
                ))
                .child(
                    div()
                        .text_size(ts(SMALL))
                        .text_color(t.faint)
                        .child(SharedString::from(count.to_string())),
                ),
        )
        .when(tools, |d| {
            d.child(crate::organize::section_tools(app, key, t, cx))
        })
        .into_any_element()
}

/// The List / Board switch and the project's header tools.
pub fn project_header(
    app: &AtlasApp,
    project_id: &str,
    board: bool,
    t: &Theme,
    cx: &mut Context<AtlasApp>,
) -> AnyElement {
    let Some(p) = app.snap.project(project_id) else {
        return div().into_any_element();
    };
    let pid = project_id.to_owned();
    let entity = cx.entity();
    let switch = segmented(
        SharedString::from(format!("view-{pid}")),
        &["List", "Board"],
        usize::from(board),
        false,
        t,
        move |i, _, cx| {
            entity.update(cx, |this, cx| {
                this.set_board(&pid, i == 1);
                cx.notify();
            })
        },
    );
    let mut tools = div().flex().items_center().gap(px(22.));
    tools = tools.child(crate::organize::project_tools(app, project_id, t, cx));
    if !board {
        tools = tools
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(6.))
                    .text_size(ts(16.))
                    .text_color(t.text_soft)
                    .child(icon("list-checks", 18., t.muted))
                    .child("Select"),
            )
            .child(icon("list-filter", 18., t.muted));
    }
    app.header(
        Some(("hash", project_color(&p.id, &p.color))),
        &p.name,
        tools.child(switch).into_any_element(),
        t,
    )
    .into_any_element()
}

pub fn project_list(
    app: &mut AtlasApp,
    project_id: &str,
    t: &Theme,
    _window: &mut Window,
    cx: &mut Context<AtlasApp>,
) -> AnyElement {
    let header = project_header(app, project_id, false, t, cx);
    let snap = app.snap.clone();
    let opts = RowOpts {
        show_place: false,
        show_labels: false,
        depth: 0,
    };
    let mut col = list_column().pt(px(14.));
    let loose: Vec<&Task> =
        snap.open_roots(|t| t.project_id.as_deref() == Some(project_id) && t.section_id.is_none());
    let sections = snap.sections_of(project_id);
    if !loose.is_empty() || sections.is_empty() {
        let mut block = div().flex().flex_col();
        let ids: Vec<String> = loose.iter().map(|x| x.id.clone()).collect();
        let marker = app.drop_marker(&None, &ids);
        for task in &loose {
            block = block.child(marked_tree(app, task, &opts, &marker, t, cx));
        }
        col = col.child(
            crate::organize::drop_zone(block, None, ids, cx).child(add_row(
                app,
                AddTarget {
                    key: format!("{project_id}-none"),
                    project_id: Some(project_id.to_owned()),
                    section_id: None,
                },
                "Add task",
                false,
                t,
                cx,
            )),
        );
    }
    for s in sections {
        let tasks: Vec<&Task> = snap.open_roots(|t| t.section_id.as_deref() == Some(&s.id));
        let total = tasks.len()
            + tasks
                .iter()
                .map(|p| {
                    snap.subtasks(&p.id)
                        .iter()
                        .filter(|c| !c.is_completed)
                        .count()
                })
                .sum::<usize>();
        let ids: Vec<String> = tasks.iter().map(|x| x.id.clone()).collect();
        let marker = app.drop_marker(&Some(s.id.clone()), &ids);
        let mut block = div()
            .flex()
            .flex_col()
            .child(section_header(app, &s.id, &s.name, total, true, t, cx));
        if matches!(marker, Some(crate::organize::Marker::Empty)) {
            block = block.child(div().mx(px(8.)).h(px(3.)).rounded_full().bg(t.accent));
        }
        if !app.collapsed.contains(&s.id) {
            for task in &tasks {
                block = block.child(marked_tree(app, task, &opts, &marker, t, cx));
            }
            block = block.child(add_row(
                app,
                AddTarget {
                    key: s.id.clone(),
                    project_id: Some(project_id.to_owned()),
                    section_id: Some(s.id.clone()),
                },
                "Add task",
                false,
                t,
                cx,
            ));
        }
        col = col
            .child(crate::organize::drop_zone(
                block,
                Some(s.id.clone()),
                ids,
                cx,
            ))
            .child(div().h(px(28.)));
    }
    col = col.child(crate::organize::add_section(app, project_id, t, cx));
    div()
        .flex()
        .flex_col()
        .size_full()
        .child(header)
        .child(scroll_body("project-list").child(col))
        .into_any_element()
}

/// A row and its subtasks, with the drop line when a dragged row would land next to it.
fn marked_tree(
    app: &AtlasApp,
    task: &Task,
    opts: &RowOpts,
    marker: &Option<crate::organize::Marker>,
    t: &Theme,
    cx: &mut Context<AtlasApp>,
) -> AnyElement {
    let tree = div()
        .flex()
        .flex_col()
        .children(task_tree(app, task, opts, t, cx))
        .into_any_element();
    crate::organize::with_marker(tree, &task.id, marker, 0., t)
}

fn toolbar(t: &Theme) -> gpui::Div {
    div()
        .flex()
        .justify_end()
        .items_center()
        .gap(px(26.))
        .pr(px(26.))
        .py(px(8.))
        .child(
            div()
                .flex()
                .items_center()
                .gap(px(8.))
                .text_size(ts(16.))
                .text_color(t.text_soft)
                .child(icon("list-checks", 18., t.muted))
                .child("Select"),
        )
        .child(icon("list-filter", 18., t.muted))
}

/// Upcoming: tasks due after today, grouped Tomorrow, This week, Later.
pub fn upcoming(
    app: &mut AtlasApp,
    t: &Theme,
    _window: &mut Window,
    cx: &mut Context<AtlasApp>,
) -> AnyElement {
    let snap = app.snap.clone();
    let today = app.today;
    let tomorrow = today.tomorrow().unwrap_or(today);
    let week_end = today.checked_add(7.days()).unwrap_or(today);
    let mut groups: Vec<(&str, Vec<&Task>)> = vec![
        ("Tomorrow", vec![]),
        ("This week", vec![]),
        ("Later", vec![]),
    ];
    let mut due: Vec<&Task> = snap.open_roots(|t| {
        t.due_at
            .as_ref()
            .is_some_and(|d| snap.date_of(ms(d)) > today)
    });
    due.sort_by_key(|t| t.due_at.as_ref().map(ms));
    for task in due {
        let d = snap.date_of(task.due_at.as_ref().map(ms).unwrap_or(0));
        let g = if d == tomorrow {
            0
        } else if d <= week_end {
            1
        } else {
            2
        };
        groups[g].1.push(task);
    }
    let opts = RowOpts {
        show_place: true,
        show_labels: true,
        depth: 0,
    };
    let mut col = list_column().child(toolbar(t)).child(add_row(
        app,
        AddTarget {
            key: "upcoming".into(),
            project_id: None,
            section_id: None,
        },
        "Add a task...",
        true,
        t,
        cx,
    ));
    for (title, tasks) in groups {
        if tasks.is_empty() {
            continue;
        }
        let key = format!("upcoming-{title}");
        let total = tasks.len();
        col = col.child(div().h(px(18.))).child(group_header(
            app,
            &key,
            &format!("{} ({})", title.to_uppercase(), total),
            t,
            cx,
        ));
        if !app.collapsed.contains(&key) {
            for task in tasks {
                col = col.children(task_tree(app, task, &opts, t, cx));
            }
        }
    }
    div()
        .flex()
        .flex_col()
        .size_full()
        .child(app.header(
            None,
            "Upcoming",
            icon("search", 22., t.muted).into_any_element(),
            t,
        ))
        .child(scroll_body("upcoming").child(col))
        .into_any_element()
}

fn group_header(
    app: &AtlasApp,
    key: &str,
    label: &str,
    t: &Theme,
    cx: &mut Context<AtlasApp>,
) -> AnyElement {
    let collapsed = app.collapsed.contains(key);
    let k = key.to_owned();
    div()
        .id(SharedString::from(format!("grp-{key}")))
        .flex()
        .items_center()
        .gap(px(10.))
        .pl(px(16.))
        .py(px(8.))
        .cursor_pointer()
        .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| {
            if !this.collapsed.remove(&k) {
                this.collapsed.insert(k.clone());
            }
            cx.notify();
        }))
        .child(chevron(
            SharedString::from(format!("chev-{key}")),
            !collapsed,
            16.,
            t.muted,
        ))
        .child(
            div()
                .text_size(ts(SMALL))
                .text_color(t.muted)
                .child(SharedString::from(label.to_owned())),
        )
        .into_any_element()
}

/// Today: overdue, then due today.
pub fn today(
    app: &mut AtlasApp,
    t: &Theme,
    _window: &mut Window,
    cx: &mut Context<AtlasApp>,
) -> AnyElement {
    let snap = app.snap.clone();
    let today = app.today;
    let mut overdue: Vec<&Task> = snap.open_roots(|t| {
        t.due_at
            .as_ref()
            .is_some_and(|d| snap.date_of(ms(d)) < today)
    });
    let mut due: Vec<&Task> = snap.open_roots(|t| {
        t.due_at
            .as_ref()
            .is_some_and(|d| snap.date_of(ms(d)) == today)
    });
    overdue.sort_by_key(|t| t.due_at.as_ref().map(ms));
    due.sort_by_key(|t| t.due_at.as_ref().map(ms));
    let opts = RowOpts {
        show_place: true,
        show_labels: true,
        depth: 0,
    };
    let mut col = list_column().child(toolbar(t)).child(add_row(
        app,
        AddTarget {
            key: "today".into(),
            project_id: None,
            section_id: None,
        },
        "Add a task...",
        true,
        t,
        cx,
    ));
    for (key, title, tasks) in [
        ("today-overdue", "Overdue", overdue),
        ("today-today", "Today", due),
    ] {
        if tasks.is_empty() {
            continue;
        }
        col = col.child(div().h(px(18.))).child(group_header(
            app,
            key,
            &format!("{} ({})", title.to_uppercase(), tasks.len()),
            t,
            cx,
        ));
        if !app.collapsed.contains(key) {
            for task in tasks {
                col = col.children(task_tree(app, task, &opts, t, cx));
            }
        }
    }
    div()
        .flex()
        .flex_col()
        .size_full()
        .child(app.header(
            None,
            "Today",
            icon("search", 22., t.muted).into_any_element(),
            t,
        ))
        .child(scroll_body("today").child(col))
        .into_any_element()
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Simple {
    Inbox,
    Assigned,
    All,
    Completed,
}

pub fn simple(
    app: &mut AtlasApp,
    title: &str,
    which: Simple,
    t: &Theme,
    _window: &mut Window,
    cx: &mut Context<AtlasApp>,
) -> AnyElement {
    let snap = app.snap.clone();
    let me = snap.user_id.clone();
    let mut tasks: Vec<&Task> = match which {
        Simple::Inbox => snap.open_roots(|t| t.project_id.is_none()),
        Simple::Assigned => snap.open_roots(|t| t.assignee_id.as_deref() == Some(me.as_str())),
        Simple::All => snap.open_roots(|_| true),
        Simple::Completed => snap.tasks.iter().filter(|t| t.is_completed).collect(),
    };
    if which == Simple::Completed {
        tasks.sort_by_key(|t| std::cmp::Reverse(t.completed_at.as_ref().map(ms)));
        tasks.truncate(200);
    }
    let opts = RowOpts {
        show_place: which != Simple::Inbox,
        show_labels: true,
        depth: 0,
    };
    let mut col = list_column().child(toolbar(t));
    if which != Simple::Completed {
        col = col.child(add_row(
            app,
            AddTarget {
                key: title.to_owned(),
                project_id: None,
                section_id: None,
            },
            "Add a task...",
            true,
            t,
            cx,
        ));
    }
    if tasks.is_empty() {
        col = col.child(empty("inbox", "No tasks here — enjoy the calm.", t));
    }
    for task in tasks {
        col = col.children(task_tree(app, task, &opts, t, cx));
    }
    div()
        .flex()
        .flex_col()
        .size_full()
        .child(app.header(
            None,
            title,
            icon("search", 22., t.muted).into_any_element(),
            t,
        ))
        .child(scroll_body("simple").child(col))
        .into_any_element()
}

pub fn empty(glyph: &str, text: &str, t: &Theme) -> AnyElement {
    div()
        .pt(px(100.))
        .flex()
        .flex_col()
        .items_center()
        .gap(px(12.))
        .child(icon(glyph, 30., t.muted))
        .child(
            div()
                .text_size(ts(15.))
                .text_color(t.muted)
                .child(SharedString::from(text.to_owned())),
        )
        .into_any_element()
}

pub fn placeholder(app: &AtlasApp, title: &str, glyph: &str, text: &str, t: &Theme) -> AnyElement {
    div()
        .flex()
        .flex_col()
        .size_full()
        .child(app.header(None, title, div().into_any_element(), t))
        .child(empty(glyph, text, t))
        .into_any_element()
}

pub fn projects(app: &mut AtlasApp, t: &Theme, cx: &mut Context<AtlasApp>) -> AnyElement {
    let snap = app.snap.clone();
    let mut col = list_column().pt(px(14.));
    for p in &snap.projects {
        let open = snap
            .tasks
            .iter()
            .filter(|x| x.project_id.as_deref() == Some(&p.id) && !x.is_completed)
            .count();
        let id = p.id.clone();
        col = col.child(
            div()
                .id(SharedString::from(format!("proj-{}", p.id)))
                .flex()
                .items_center()
                .gap(px(12.))
                .px(px(16.))
                .h(px(48.))
                .border_b_1()
                .border_color(t.divider)
                .cursor_pointer()
                .hover(|s| s.bg(t.hover))
                .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| {
                    this.go(Route::Project(id.clone()), cx)
                }))
                .child(icon("hash", 20., project_color(&p.id, &p.color)))
                .child(
                    div()
                        .flex_1()
                        .text_size(ts(TITLE))
                        .child(SharedString::from(p.name.clone())),
                )
                .child(
                    div()
                        .text_size(ts(SMALL))
                        .text_color(t.faint)
                        .child(SharedString::from(open.to_string())),
                ),
        );
    }
    div()
        .flex()
        .flex_col()
        .size_full()
        .child(
            app.header(
                None,
                "Projects",
                div()
                    .id("new-project")
                    .flex()
                    .items_center()
                    .gap(px(6.))
                    .px(px(10.))
                    .py(px(6.))
                    .rounded(px(6.))
                    .cursor_pointer()
                    .on_click(cx.listener(|this, _: &ClickEvent, window, cx| {
                        this.open_project_sheet(None, window, cx)
                    }))
                    .bg(t.accent)
                    .text_color(t.on_accent)
                    .text_size(ts(15.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .child(icon("plus", 16., t.on_accent))
                    .child("New project")
                    .into_any_element(),
                t,
            ),
        )
        .child(scroll_body("projects").child(col))
        .into_any_element()
}

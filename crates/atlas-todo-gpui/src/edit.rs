//! Editing a task from the dialog and the context menu: field writes shown at once (the next
//! snapshot confirms them), the due date presets and times, duplicate, delete, and the "Move to"
//! list of projects and sections.

use std::rc::Rc;

use gpui::{
    div, prelude::*, px, AnyElement, ClickEvent, Context, FontWeight, SharedString, Window,
};
use jiff::civil::Date;
use jiff::tz::TimeZone;
use jiff::ToSpan;
use serde_json::Value;

use atlas_todo_rules::client::Label;
use atlas_todo_rules::rules::task::{num, CreateTaskInput, Task};

use crate::app::AtlasApp;
use crate::model::Snapshot;
use crate::sync::Command;
use crate::theme::{project_color, Theme};
use crate::ui::{icon, ts};

/// The colours a new label rotates through (`PROJECT_COLORS` in todo-core's `projectStyle.ts`).
const LABEL_COLORS: [&str; 12] = [
    "#6366f1", "#3b82f6", "#06b6d4", "#10b981", "#84cc16", "#f59e0b", "#f97316", "#ef4444",
    "#ec4899", "#8b5cf6", "#14b8a6", "#a855f7",
];

fn opt_str(v: &Value) -> Option<String> {
    v.as_str().filter(|s| !s.is_empty()).map(str::to_owned)
}

/// One field of `patch` on the snapshot's copy of the task.
fn apply_local(task: &mut Task, field: &str, v: &Value) {
    let number = || v.as_f64().map(|n| num(n as i64));
    match field {
        "title" => task.title = v.as_str().unwrap_or_default().to_owned(),
        "notes" => task.notes = v.as_str().unwrap_or_default().to_owned(),
        "priority" => task.priority = v.as_u64().unwrap_or(4) as u8,
        "due_at" => task.due_at = number(),
        "start_at" => task.start_at = number(),
        "project_id" => task.project_id = opt_str(v),
        "section_id" => task.section_id = opt_str(v),
        "recurrence" => task.recurrence = opt_str(v),
        "label_ids" => {
            task.label_ids = v
                .as_array()
                .map(|a| a.iter().filter_map(opt_str).collect())
                .unwrap_or_default()
        }
        _ => {}
    }
}

/// Write `patch` to a task: shown here at once, sent to the worker (the shared `update_task`).
pub fn write(app: &mut AtlasApp, id: &str, patch: Vec<(&str, Value)>, cx: &mut Context<AtlasApp>) {
    let snap = Rc::make_mut(&mut app.snap);
    if let Some(t) = snap.tasks.iter_mut().find(|t| t.id == id) {
        for (f, v) in &patch {
            apply_local(t, f, v);
        }
    }
    let patch = patch.into_iter().map(|(f, v)| (f.to_owned(), v)).collect();
    app.update_task(id, patch, cx);
}

/// A day at a local time, as unix ms.
pub fn at(d: Date, hour: i8, minute: i8, tz: &TimeZone) -> Option<i64> {
    d.at(hour, minute, 0, 0)
        .to_zoned(tz.clone())
        .ok()
        .map(|z| z.timestamp().as_millisecond())
}

/// All day: 23:59 local (`endOfDay`).
pub fn end_of_day(d: Date, tz: &TimeZone) -> Option<i64> {
    at(d, 23, 59, tz)
}

/// A picked day keeps the time already set, else is all day (`mergeDueDate`).
pub fn merge_date(existing: Option<i64>, d: Date, tz: &TimeZone) -> Option<i64> {
    match existing.and_then(|e| crate::format::zoned(e, tz)) {
        Some(z) => at(d, z.hour(), z.minute(), tz),
        None => end_of_day(d, tz),
    }
}

/// "9:30", "09:30", "930", "9" as hour and minute.
pub fn parse_time(s: &str) -> Option<(i8, i8)> {
    let s = s.trim();
    let (h, m) = match s.split_once([':', '.']) {
        Some((h, m)) => (h.parse().ok()?, m.parse().ok()?),
        None if s.len() > 2 => {
            let (h, m) = s.split_at(s.len() - 2);
            (h.parse().ok()?, m.parse().ok()?)
        }
        None => (s.parse().ok()?, 0),
    };
    ((0..24).contains(&h) && (0..60).contains(&m)).then_some((h, m))
}

/// The presets of the context menu and the date popover (`quickScheduleOptions`).
pub fn quick_days(today: Date) -> [(&'static str, Date); 4] {
    let weekday = today.weekday().to_sunday_zero_offset() as i64;
    let to_weekend = if weekday == 6 || weekday == 0 {
        0
    } else {
        6 - weekday
    };
    let plus = |n: i64| today.checked_add(n.days()).unwrap_or(today);
    [
        ("Today", today),
        ("Tomorrow", plus(1)),
        ("This weekend", plus(to_weekend)),
        ("Next week", plus(7)),
    ]
}

/// A copy of the task, open, titled "… (copy)" (`duplicateTask`).
pub fn duplicate(app: &mut AtlasApp, id: &str, cx: &mut Context<AtlasApp>) {
    let Some(t) = app.snap.task(id).cloned() else {
        return;
    };
    app.send(Command::CreateTask(CreateTaskInput {
        title: format!("{} (copy)", t.title),
        notes: Some(t.notes),
        priority: Some(t.priority),
        project_id: t.project_id,
        section_id: t.section_id,
        parent_id: t.parent_id,
        start_at: t.start_at,
        due_at: t.due_at,
        recurrence: t.recurrence,
        assignee_id: t.assignee_id,
        estimate_min: t.estimate_min,
        label_ids: Some(t.label_ids),
        sort_order: None,
    }));
    cx.notify();
}

/// To the trash, gone from the lists at once.
pub fn delete(app: &mut AtlasApp, id: &str, cx: &mut Context<AtlasApp>) {
    Rc::make_mut(&mut app.snap).tasks.retain(|t| t.id != id);
    app.send(Command::DeleteTask(id.to_owned()));
    if app.open_task.as_deref() == Some(id) {
        app.open_task = None;
    }
    cx.notify();
}

/// Add a new label (`createLabel`: the next colour in turn, owned by the user) to a task. The task
/// names it until the worker has made it: the shared `update_task` resolves label names.
pub fn create_label(app: &mut AtlasApp, task_id: &str, name: &str, cx: &mut Context<AtlasApp>) {
    let Some(task) = app.snap.task(task_id) else {
        return;
    };
    let mut ids = task.label_ids.clone();
    let color = LABEL_COLORS[app.snap.labels.len() % LABEL_COLORS.len()];
    let owner = app.snap.user_id.clone();
    let mut fields = vec![
        ("name".to_owned(), Value::from(name)),
        ("color".to_owned(), Value::from(color)),
    ];
    if !owner.is_empty() {
        fields.push(("owner_id".to_owned(), Value::from(owner.clone())));
    }
    app.send(Command::CreateEntity {
        kind: "label".into(),
        fields,
    });
    Rc::make_mut(&mut app.snap).labels.push(Label {
        id: name.to_owned(),
        owner_id: owner,
        name: name.to_owned(),
        color: color.to_owned(),
    });
    ids.push(name.to_owned());
    write(app, task_id, vec![("label_ids", Value::from(ids))], cx);
}

/// Where a task can go: the Inbox, each project, and its sections under it.
pub struct Place {
    pub project_id: Option<String>,
    pub section_id: Option<String>,
    pub name: String,
    pub color: gpui::Rgba,
    pub depth: u8,
}

pub fn places(snap: &Snapshot, t: &Theme) -> Vec<Place> {
    let mut out = vec![Place {
        project_id: None,
        section_id: None,
        name: "Inbox".into(),
        color: t.muted,
        depth: 0,
    }];
    for p in &snap.projects {
        let color = project_color(&p.id, &p.color);
        out.push(Place {
            project_id: Some(p.id.clone()),
            section_id: None,
            name: p.name.clone(),
            color,
            depth: 0,
        });
        for s in snap.sections_of(&p.id) {
            out.push(Place {
                project_id: Some(p.id.clone()),
                section_id: Some(s.id.clone()),
                name: s.name.clone(),
                color,
                depth: 1,
            });
        }
    }
    out
}

/// The "Move to" list for a task; picking a place moves it there and runs `done`.
pub fn move_list(
    app: &AtlasApp,
    task_id: &str,
    t: &Theme,
    cx: &mut Context<AtlasApp>,
    done: impl Fn(&mut AtlasApp, &mut Window, &mut Context<AtlasApp>) + Clone + 'static,
) -> AnyElement {
    let Some(task) = app.snap.task(task_id) else {
        return div().into_any_element();
    };
    let (cur_p, cur_s) = (task.project_id.clone(), task.section_id.clone());
    let mut list = div().flex().flex_col().gap(px(1.));
    for (i, p) in places(&app.snap, t).into_iter().enumerate() {
        let on = p.project_id == cur_p && p.section_id == cur_s;
        let id = task_id.to_owned();
        let done = done.clone();
        let (pid, sid) = (p.project_id.clone(), p.section_id.clone());
        list = list.child(
            div()
                .id(SharedString::from(format!("move-{i}")))
                .h(px(32.))
                .pl(px(10. + p.depth as f32 * 22.))
                .pr(px(10.))
                .flex()
                .items_center()
                .gap(px(10.))
                .rounded(px(6.))
                .cursor_pointer()
                .text_size(ts(14.))
                .when(on, |d| d.bg(t.accent_soft).text_color(t.accent_text))
                .when(!on, |d| d.text_color(t.text_soft).hover(|s| s.bg(t.hover)))
                .when(p.depth == 0 && p.project_id.is_some(), |d| {
                    d.font_weight(FontWeight::MEDIUM)
                })
                .on_click(cx.listener(move |this, _: &ClickEvent, window, cx| {
                    write(
                        this,
                        &id,
                        vec![
                            ("project_id", pid.clone().map_or(Value::Null, Value::from)),
                            ("section_id", sid.clone().map_or(Value::Null, Value::from)),
                        ],
                        cx,
                    );
                    done(this, window, cx);
                }))
                .child(match (&p.project_id, p.depth) {
                    (None, _) => icon("inbox", 15., p.color).into_any_element(),
                    (_, 0) => icon("hash", 15., p.color).into_any_element(),
                    _ => icon("chevron-right", 13., t.faint).into_any_element(),
                })
                .child(div().flex_1().truncate().child(SharedString::from(p.name)))
                .when(on, |d| d.child(icon("check", 14., t.accent_text))),
        );
    }
    list.into_any_element()
}

/// The floating panel of a popover or menu: surface, border, shadow.
pub fn panel(t: &Theme) -> gpui::Div {
    div()
        .p(px(6.))
        .rounded(px(10.))
        .border_1()
        .border_color(t.border)
        .bg(t.surface)
        .shadow_lg()
        .text_color(t.text)
}

//! The task dialog (`TaskDetail` on desktop): title, notes, subtasks and activity on the left, the
//! properties on the right. Every field writes back: the title and notes when left (or on Enter in
//! the title), the dates from a month popover, the project from a list of projects and sections,
//! labels, priority and repeat at once.

use std::rc::Rc;
use std::time::{Duration, Instant};

use gpui::{
    anchored, deferred, div, prelude::*, px, relative, AnyElement, ClickEvent, Context, Entity,
    FocusHandle, Focusable, FontWeight, MouseDownEvent, SharedString, Subscription, Window,
};
use jiff::civil::Date;
use jiff::ToSpan;
use serde_json::Value;

use atlas_todo_rules::rules::recurrence::{parse_rule, rule_to_string, Freq, RecurMode, Rule};
use atlas_todo_rules::rules::task::{ms, CreateTaskInput, Task};

use crate::app::AtlasApp;
use crate::edit;
use crate::format;
use crate::input::{Cancel, Submit, TextInput};
use crate::motion;
use crate::sync::Command;
use crate::textarea::TextArea;
use crate::theme::{hex, priority_color, project_color, Theme};
use crate::ui::ts;
use crate::ui::{caps, check_circle, dot, icon};

/// A popover of the dialog.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Popover {
    Due,
    Start,
    Project,
}

/// The open task's fields being edited, and its popovers.
pub struct Editor {
    pub task_id: String,
    /// The dialog's own focus: clicking anywhere in it leaves (and so saves) a field.
    focus: FocusHandle,
    title: Entity<TextInput>,
    notes: Entity<TextArea>,
    subtask: Entity<TextInput>,
    label_query: Entity<TextInput>,
    due_time: Entity<TextInput>,
    pub popover: Option<Popover>,
    /// A popover a click outside just closed: the click on its own field must not reopen it.
    just_closed: Option<(Popover, Instant)>,
    /// The month a date popover shows.
    pub month: Date,
    _subs: Vec<Subscription>,
}

/// The time field's text: a set time, or empty for all day.
fn time_text(task: &Task, tz: &jiff::tz::TimeZone) -> String {
    match task.due_ms() {
        Some(d) if !format::is_all_day(d, tz) => format::time(d, tz),
        _ => String::new(),
    }
}

fn ensure_editor(app: &mut AtlasApp, task: &Task, window: &mut Window, cx: &mut Context<AtlasApp>) {
    if app.editor.as_ref().is_some_and(|e| e.task_id == task.id) {
        return;
    }
    if app.editor.is_some() {
        commit(app, cx);
    }
    let tz = app.snap.tz.clone();
    let title = cx.new(|cx| {
        let mut i = TextInput::new("Task title", cx);
        i.set_text(&task.title, cx);
        i
    });
    let notes = cx.new(|cx| {
        let mut i = TextArea::new("Add notes...", cx);
        i.set_text(&task.notes, cx);
        i
    });
    let subtask = cx.new(|cx| TextInput::new("Add a subtask", cx));
    let label_query = cx.new(|cx| TextInput::new("Add or create a label...", cx));
    let due_time = cx.new(|cx| {
        let mut i = TextInput::new("Add time", cx);
        i.set_text(&time_text(task, &tz), cx);
        i
    });
    let title_focus = title.read(cx).focus_handle(cx);
    let notes_focus = notes.read(cx).focus_handle(cx);
    let time_focus = due_time.read(cx).focus_handle(cx);
    let subs = vec![
        cx.subscribe_in(&title, window, |this, _, _: &Submit, window, cx| {
            save_title(this, cx);
            focus_dialog(this, window, cx);
        }),
        cx.subscribe_in(&title, window, |this, _, _: &Cancel, window, cx| {
            // Escape puts the title back as it was.
            let id = ed_id(this);
            if let (Some(ed), Some(task)) = (this.editor.as_ref(), this.snap.task(&id)) {
                let (input, text) = (ed.title.clone(), task.title.clone());
                input.update(cx, |i, cx| i.set_text(&text, cx));
            }
            focus_dialog(this, window, cx);
        }),
        cx.on_blur(&title_focus, window, |this, _, cx| save_title(this, cx)),
        cx.on_blur(&notes_focus, window, |this, _, cx| save_notes(this, cx)),
        cx.subscribe_in(&due_time, window, |this, _, _: &Submit, window, cx| {
            save_time(this, cx);
            focus_dialog(this, window, cx);
        }),
        cx.on_blur(&time_focus, window, |this, _, cx| save_time(this, cx)),
        cx.subscribe(&subtask, |this, input, ev: &Submit, cx| {
            add_subtask(this, &ev.0, cx);
            input.update(cx, |i, cx| i.clear(cx));
        }),
        cx.subscribe(&label_query, |this, input, ev: &Submit, cx| {
            submit_label(this, &ev.0, cx);
            input.update(cx, |i, cx| i.clear(cx));
        }),
        cx.observe(&label_query, |_, _, cx| cx.notify()),
    ];
    let month = task
        .due_ms()
        .map_or(app.today, |d| app.snap.date_of(d))
        .first_of_month();
    #[allow(unused_mut)]
    let mut popover = None;
    // The screenshot mode can show a popover open (`ATLAS_GPUI_SHOT_POPOVER=due|start|project`),
    // or the context menu of the task (`menu`, `move`).
    #[cfg(feature = "screenshots")]
    match std::env::var("ATLAS_GPUI_SHOT_POPOVER").as_deref() {
        Ok("due") => popover = Some(Popover::Due),
        Ok("start") => popover = Some(Popover::Start),
        Ok("project") => popover = Some(Popover::Project),
        Ok(m @ ("menu" | "move")) => {
            app.menu = Some(crate::context_menu::Menu {
                task_id: task.id.clone(),
                pos: gpui::point(px(620.), px(260.)),
                moving: m == "move",
            });
        }
        _ => {}
    }
    app.editor = Some(Editor {
        task_id: task.id.clone(),
        focus: cx.focus_handle(),
        title,
        notes,
        subtask,
        label_query,
        due_time,
        popover,
        just_closed: None,
        month,
        _subs: subs,
    });
}

fn ed_id(app: &AtlasApp) -> String {
    app.editor
        .as_ref()
        .map(|e| e.task_id.clone())
        .unwrap_or_default()
}

fn focus_dialog(app: &mut AtlasApp, window: &mut Window, cx: &mut Context<AtlasApp>) {
    if let Some(ed) = &app.editor {
        window.focus(&ed.focus, cx);
    }
}

fn save_title(app: &mut AtlasApp, cx: &mut Context<AtlasApp>) {
    let Some(ed) = &app.editor else { return };
    let (id, input) = (ed.task_id.clone(), ed.title.clone());
    let Some(task) = app.snap.task(&id) else {
        return;
    };
    let text = input.read(cx).text().trim().to_owned();
    if text.is_empty() {
        // A task keeps a title.
        let old = task.title.clone();
        input.update(cx, |i, cx| i.set_text(&old, cx));
    } else if text != task.title {
        edit::write(app, &id, vec![("title", Value::from(text))], cx);
    }
}

fn save_notes(app: &mut AtlasApp, cx: &mut Context<AtlasApp>) {
    let Some(ed) = &app.editor else { return };
    let id = ed.task_id.clone();
    let text = ed.notes.read(cx).text().trim_end().to_owned();
    if app.snap.task(&id).is_some_and(|t| t.notes != text) {
        edit::write(app, &id, vec![("notes", Value::from(text))], cx);
    }
}

/// The time field: a time sets the due time (today when there is no date), empty is all day.
fn save_time(app: &mut AtlasApp, cx: &mut Context<AtlasApp>) {
    let Some(ed) = &app.editor else { return };
    let (id, input) = (ed.task_id.clone(), ed.due_time.clone());
    let Some(task) = app.snap.task(&id) else {
        return;
    };
    let tz = app.snap.tz.clone();
    let text = input.read(cx).text().trim().to_owned();
    if text == time_text(task, &tz) {
        return;
    }
    let day = task.due_ms().map_or(app.today, |d| app.snap.date_of(d));
    let next = if text.is_empty() {
        task.due_ms().and(edit::end_of_day(day, &tz))
    } else {
        edit::parse_time(&text).and_then(|(h, m)| edit::at(day, h, m, &tz))
    };
    match next {
        Some(at) => {
            edit::write(app, &id, vec![("due_at", Value::from(at))], cx);
            if let Some(task) = app.snap.task(&id) {
                let shown = time_text(task, &tz);
                input.update(cx, |i, cx| i.set_text(&shown, cx));
            }
        }
        None => {
            let shown = time_text(task, &tz);
            input.update(cx, |i, cx| i.set_text(&shown, cx));
        }
    }
}

fn add_subtask(app: &mut AtlasApp, text: &str, cx: &mut Context<AtlasApp>) {
    let title = text.trim();
    let Some(parent) = app.snap.task(&ed_id(app)).cloned() else {
        return;
    };
    if title.is_empty() {
        return;
    }
    app.send(Command::CreateTask(CreateTaskInput {
        title: title.to_owned(),
        parent_id: Some(parent.id),
        project_id: parent.project_id,
        section_id: parent.section_id,
        ..Default::default()
    }));
    cx.notify();
}

/// Enter in the label field adds the first match, else creates the label (`LabelPicker`).
fn submit_label(app: &mut AtlasApp, text: &str, cx: &mut Context<AtlasApp>) {
    let id = ed_id(app);
    let Some(task) = app.snap.task(&id) else {
        return;
    };
    let q = text.trim().to_lowercase();
    if let Some(first) = available_labels(app, task, &q).first() {
        let mut ids = task.label_ids.clone();
        ids.push(first.0.clone());
        edit::write(app, &id, vec![("label_ids", Value::from(ids))], cx);
    } else if !q.is_empty() && !app.snap.labels.iter().any(|l| l.name.to_lowercase() == q) {
        edit::create_label(app, &id, text.trim(), cx);
    }
}

/// Labels not on the task whose names hold `q`, by name: `(id, name, color)`.
fn available_labels(app: &AtlasApp, task: &Task, q: &str) -> Vec<(String, String, String)> {
    let mut v: Vec<(String, String, String)> = app
        .snap
        .labels
        .iter()
        .filter(|l| !task.label_ids.contains(&l.id) && l.name.to_lowercase().contains(q))
        .map(|l| (l.id.clone(), l.name.clone(), l.color.clone()))
        .collect();
    v.sort_by_key(|l| l.1.to_lowercase());
    v
}

/// Save what is being typed (closing the dialog, or opening another task).
pub fn commit(app: &mut AtlasApp, cx: &mut Context<AtlasApp>) {
    save_title(app, cx);
    save_notes(app, cx);
    save_time(app, cx);
}

/// Close the dialog, saving its fields.
pub fn close(app: &mut AtlasApp, cx: &mut Context<AtlasApp>) {
    commit(app, cx);
    app.editor = None;
    app.open_task = None;
    cx.notify();
}

/// Open or close a popover from its field.
fn toggle_popover(app: &mut AtlasApp, which: Popover, cx: &mut Context<AtlasApp>) {
    let Some(ed) = app.editor.as_mut() else {
        return;
    };
    let just = ed
        .just_closed
        .take()
        .is_some_and(|(p, at)| p == which && at.elapsed() < Duration::from_millis(400));
    ed.popover = if ed.popover == Some(which) || just {
        None
    } else {
        Some(which)
    };
    cx.notify();
}

fn close_popover(app: &mut AtlasApp, cx: &mut Context<AtlasApp>) {
    if let Some(ed) = app.editor.as_mut() {
        if let Some(p) = ed.popover.take() {
            ed.just_closed = Some((p, Instant::now()));
        }
    }
    cx.notify();
}

/// Keep a field showing the task's value while it is not being edited (another device's edit).
fn sync_input(input: &Entity<TextInput>, value: &str, window: &Window, cx: &mut Context<AtlasApp>) {
    let i = input.read(cx);
    if !i.focus_handle(cx).is_focused(window) && i.text() != value {
        let value = value.to_owned();
        input.update(cx, |i, cx| i.set_text(&value, cx));
    }
}

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
        .when(!on, |d| {
            d.border_color(t.border)
                .text_color(t.text_soft)
                .hover(|s| s.bg(t.hover))
        })
        .child(SharedString::from(text.to_owned()))
}

/// A pill that does something.
fn action_pill(
    key: impl Into<SharedString>,
    text: &str,
    on: bool,
    t: &Theme,
    cx: &mut Context<AtlasApp>,
    run: impl Fn(&mut AtlasApp, &mut Context<AtlasApp>) + 'static,
) -> AnyElement {
    pill(text, on, t)
        .id(key.into())
        .cursor_pointer()
        .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| run(this, cx)))
        .into_any_element()
}

/// A popover beside the field before it, kept on screen, sliding in.
fn popover_at(key: &str, body: AnyElement, t: &Theme, cx: &mut Context<AtlasApp>) -> AnyElement {
    let panel = edit::panel(t)
        .id(SharedString::from(format!("pop-{key}")))
        .occlude()
        .on_mouse_down_out(cx.listener(|this, _: &MouseDownEvent, _, cx| close_popover(this, cx)))
        .child(body);
    let panel = motion::enter(
        panel,
        SharedString::from(format!("pop-in-{key}")),
        180,
        |el, v| el.opacity(v).mr(px(12. + (1. - v) * -10.)),
    );
    // Placed after its 40px field: it opens to the left of the properties, level with the field.
    div()
        .relative()
        .h(px(0.))
        .child(
            div().absolute().top(px(-40.)).left(px(-12.)).child(
                deferred(
                    anchored()
                        .anchor(gpui::Anchor::TopRight)
                        .snap_to_window_with_margin(px(8.))
                        .child(panel),
                )
                .with_priority(1),
            ),
        )
        .into_any_element()
}

/// The month popover of a date field (`due_at` or `start_at`): presets, then the month.
fn date_popover(
    app: &AtlasApp,
    task: &Task,
    which: Popover,
    t: &Theme,
    cx: &mut Context<AtlasApp>,
) -> AnyElement {
    let field: &'static str = if which == Popover::Due {
        "due_at"
    } else {
        "start_at"
    };
    let current = if which == Popover::Due {
        task.due_ms()
    } else {
        task.start_at.as_ref().map(ms)
    };
    let picked = current.map(|c| app.snap.date_of(c));
    let tz = app.snap.tz.clone();
    let month = app.editor.as_ref().map_or(app.today, |e| e.month);
    let set = move |id: String, day: Option<Date>, tz: jiff::tz::TimeZone| {
        move |this: &mut AtlasApp, cx: &mut Context<AtlasApp>| {
            let value = match day {
                Some(d) => {
                    let existing = this.snap.task(&id).and_then(|t| {
                        if field == "due_at" {
                            t.due_ms()
                        } else {
                            t.start_at.as_ref().map(ms)
                        }
                    });
                    edit::merge_date(existing, d, &tz).map_or(Value::Null, Value::from)
                }
                None => Value::Null,
            };
            edit::write(this, &id, vec![(field, value)], cx);
            if let Some(ed) = this.editor.as_mut() {
                ed.popover = None;
            }
        }
    };

    let mut presets = div().flex().flex_wrap().gap(px(6.)).p(px(6.));
    for (label, day) in edit::quick_days(app.today) {
        presets = presets.child(action_pill(
            format!("preset-{label}"),
            label,
            picked == Some(day),
            t,
            cx,
            set(task.id.clone(), Some(day), tz.clone()),
        ));
    }
    presets = presets.child(action_pill(
        "preset-none",
        "No date",
        picked.is_none(),
        t,
        cx,
        set(task.id.clone(), None, tz.clone()),
    ));

    let step = |dir: i64| {
        move |this: &mut AtlasApp, _: &ClickEvent, _: &mut Window, cx: &mut Context<AtlasApp>| {
            if let Some(ed) = this.editor.as_mut() {
                ed.month = ed
                    .month
                    .checked_add(dir.months())
                    .unwrap_or(ed.month)
                    .first_of_month();
            }
            cx.notify();
        }
    };
    let nav = div()
        .flex()
        .items_center()
        .justify_between()
        .px(px(8.))
        .py(px(6.))
        .child(
            div()
                .text_size(ts(15.))
                .font_weight(FontWeight::SEMIBOLD)
                .child(SharedString::from(format::month_year(month))),
        )
        .child(
            div()
                .flex()
                .gap(px(12.))
                .child(
                    div()
                        .id("pop-prev")
                        .cursor_pointer()
                        .on_click(cx.listener(step(-1)))
                        .child(icon("chevron-left", 18., t.text_soft)),
                )
                .child(
                    div()
                        .id("pop-next")
                        .cursor_pointer()
                        .on_click(cx.listener(step(1)))
                        .child(icon("chevron-right", 18., t.text_soft)),
                ),
        );

    // Weeks start on the `week_starts_on` preference (0 = Sunday, as the web app's default).
    let start = app
        .pref("week_starts_on")
        .and_then(Value::as_i64)
        .unwrap_or(0)
        .rem_euclid(7);
    let back = (month.weekday().to_sunday_zero_offset() as i64 - start).rem_euclid(7);
    let first = month.checked_sub(back.days()).unwrap_or(month);
    let mut head = div().flex();
    for i in 0..7 {
        let wd = first.checked_add(i.days()).unwrap_or(first).weekday();
        head = head.child(
            div()
                .w(px(38.))
                .flex()
                .justify_center()
                .text_size(ts(12.))
                .text_color(t.faint)
                .child(&format::weekday_short(wd)[..2]),
        );
    }
    let mut grid = div().flex().flex_col().px(px(4.)).pb(px(4.)).child(head);
    let weeks = (back + i64::from(month.days_in_month()) + 6) / 7;
    for w in 0..weeks {
        let mut row = div().flex();
        for i in 0..7 {
            let day = first.checked_add((w * 7 + i).days()).unwrap_or(first);
            let on = picked == Some(day);
            let inside = day.month() == month.month();
            let today = day == app.today;
            let run = set(task.id.clone(), Some(day), tz.clone());
            row = row.child(
                div()
                    .id(SharedString::from(format!("pop-day-{day}")))
                    .size(px(38.))
                    .flex()
                    .items_center()
                    .justify_center()
                    .rounded_full()
                    .cursor_pointer()
                    .text_size(ts(14.))
                    .when(on, |d| d.bg(t.accent).text_color(t.on_accent))
                    .when(!on, |d| {
                        d.hover(|s| s.bg(t.hover)).text_color(if today {
                            t.accent_text
                        } else if inside {
                            t.text
                        } else {
                            t.faint
                        })
                    })
                    .when(today, |d| d.font_weight(FontWeight::BOLD))
                    .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| run(this, cx)))
                    .child(SharedString::from(day.day().to_string())),
            );
        }
        grid = grid.child(row);
    }
    let body = div()
        .w(px(282.))
        .flex()
        .flex_col()
        .child(presets)
        .child(div().mx(px(6.)).h(px(1.)).bg(t.divider))
        .child(nav)
        .child(grid)
        .into_any_element();
    popover_at(field, body, t, cx)
}

/// A small square button ("-", "+").
fn stepper(
    key: &str,
    text: &str,
    t: &Theme,
    cx: &mut Context<AtlasApp>,
    run: impl Fn(&mut AtlasApp, &mut Context<AtlasApp>) + 'static,
) -> gpui::Stateful<gpui::Div> {
    div()
        .id(SharedString::from(format!("repeat-step-{key}")))
        .size(px(30.))
        .flex()
        .items_center()
        .justify_center()
        .rounded(px(6.))
        .border_1()
        .border_color(t.border)
        .cursor_pointer()
        .text_color(t.text_soft)
        .hover(|s| s.bg(t.hover))
        .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| run(this, cx)))
        .child(SharedString::from(text.to_owned()))
}

/// The Repeat pills, and for a rule the interval and (weekly) its days (`RecurrenceEditor`).
fn repeat_editor(task: &Task, t: &Theme, cx: &mut Context<AtlasApp>) -> gpui::Div {
    let rule = task.recurrence.as_deref().and_then(parse_rule);
    let freq = rule.as_ref().map(|r| r.freq);
    let emit = |id: String, next: Option<Rule>| {
        move |this: &mut AtlasApp, cx: &mut Context<AtlasApp>| {
            let v = next
                .as_ref()
                .map_or(Value::Null, |r| Value::from(rule_to_string(r)));
            edit::write(this, &id, vec![("recurrence", v)], cx);
        }
    };
    let mut pills = div().flex().flex_wrap().gap(px(8.));
    let choices = [
        ("Does not repeat", None),
        ("Daily", Some(Freq::Daily)),
        ("Weekly", Some(Freq::Weekly)),
        ("Monthly", Some(Freq::Monthly)),
        ("Yearly", Some(Freq::Yearly)),
    ];
    for (label, f) in choices {
        let next = f.map(|f| Rule {
            freq: f,
            interval: rule.as_ref().map_or(1, |r| r.interval),
            byday: match (&rule, f) {
                (Some(r), Freq::Weekly) => r.byday.clone(),
                _ => Vec::new(),
            },
            bymonthday: match (&rule, f) {
                (Some(r), Freq::Monthly) => r.bymonthday,
                _ => None,
            },
            mode: rule.as_ref().map_or(RecurMode::OnSchedule, |r| r.mode),
            at: None,
        });
        pills = pills.child(action_pill(
            format!("repeat-{label}"),
            label,
            freq == f,
            t,
            cx,
            emit(task.id.clone(), next),
        ));
    }
    let mut col = div().flex().flex_col().gap(px(10.)).child(pills);
    if let Some(r) = rule {
        let bump = |d: i64| {
            let mut n = r.clone();
            n.interval = (n.interval + d).clamp(1, 1000);
            emit(task.id.clone(), Some(n))
        };
        col = col.child(
            div()
                .flex()
                .items_center()
                .gap(px(8.))
                .text_size(ts(14.))
                .child(div().text_color(t.muted).child("every"))
                .child(stepper("minus", "-", t, cx, bump(-1)))
                .child(
                    div()
                        .min_w(px(20.))
                        .flex()
                        .justify_center()
                        .child(SharedString::from(r.interval.to_string())),
                )
                .child(stepper("plus", "+", t, cx, bump(1))),
        );
        if r.freq == Freq::Weekly {
            let mut days = div().flex().flex_wrap().gap(px(4.));
            for (i, label) in ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
                .into_iter()
                .enumerate()
            {
                let d = i as i64;
                let on = r.byday.contains(&d);
                let mut n = r.clone();
                if on {
                    n.byday.retain(|x| *x != d);
                } else {
                    n.byday.push(d);
                    n.byday.sort_unstable();
                }
                days = days.child(action_pill(
                    format!("repeat-day-{i}"),
                    label,
                    on,
                    t,
                    cx,
                    emit(task.id.clone(), Some(n)),
                ));
            }
            col = col.child(days);
        }
    }
    col
}

pub fn task_detail(
    app: &mut AtlasApp,
    id: &str,
    t: &Theme,
    window: &mut Window,
    cx: &mut Context<AtlasApp>,
) -> Option<AnyElement> {
    let snap = app.snap.clone();
    let task = snap.task(id)?.clone();
    ensure_editor(app, &task, window, cx);
    let (title_in, notes_in, subtask_in, label_in, time_in, dialog_focus, popover) = {
        let ed = app.editor.as_ref()?;
        (
            ed.title.clone(),
            ed.notes.clone(),
            ed.subtask.clone(),
            ed.label_query.clone(),
            ed.due_time.clone(),
            ed.focus.clone(),
            ed.popover,
        )
    };
    sync_input(&title_in, &task.title, window, cx);
    sync_input(&time_in, &time_text(&task, &snap.tz), window, cx);
    {
        let n = notes_in.read(cx);
        if !n.focus_handle(cx).is_focused(window) && n.text() != task.notes {
            let notes = task.notes.clone();
            notes_in.update(cx, |i, cx| i.set_text(&notes, cx));
        }
    }

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
                        .id("detail-duplicate")
                        .cursor_pointer()
                        .on_click(cx.listener({
                            let id = task.id.clone();
                            move |this, _: &ClickEvent, _, cx| edit::duplicate(this, &id, cx)
                        }))
                        .child(icon("copy-plus", 19., t.muted)),
                )
                .child(
                    div()
                        .id("detail-delete")
                        .cursor_pointer()
                        .on_click(cx.listener({
                            let id = task.id.clone();
                            move |this, _: &ClickEvent, _, cx| {
                                this.editor = None;
                                edit::delete(this, &id, cx);
                            }
                        }))
                        .child(icon("trash", 19., t.muted)),
                )
                .child(
                    div()
                        .id("detail-close")
                        .cursor_pointer()
                        .on_click(cx.listener(|this, _: &ClickEvent, _, cx| close(this, cx)))
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
                        .flex_1()
                        .min_w_0()
                        .text_size(ts(24.))
                        .font_weight(FontWeight::BOLD)
                        .child(title_in),
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
                .id("detail-notes")
                .min_h(px(90.))
                .p(px(14.))
                .rounded(px(10.))
                .border_1()
                .border_color(t.border)
                .text_size(ts(15.))
                .text_color(t.text)
                .cursor_text()
                .on_click(cx.listener({
                    let notes = notes_in.clone();
                    move |_, _: &ClickEvent, window, cx| {
                        let h = notes.read(cx).focus_handle(cx);
                        if !h.is_focused(window) {
                            window.focus(&h, cx);
                        }
                    }
                }))
                .child(notes_in),
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
        let open = s.id.clone();
        let row = div()
            .id(SharedString::from(format!("dsub-{}", s.id)))
            .flex()
            .items_center()
            .gap(px(14.))
            .py(px(8.))
            .cursor_pointer()
            .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| {
                // The subtask opens in the dialog, as on the web.
                commit(this, cx);
                this.open_task = Some(open.clone());
                cx.notify();
            }))
            .child(
                div()
                    .id(SharedString::from(format!("dsub-check-{}", s.id)))
                    .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| {
                        cx.stop_propagation();
                        this.toggle(&sid, cx)
                    }))
                    .child(check_circle(18., s.is_completed, t.circle, t)),
            )
            .child(
                div()
                    .text_size(ts(15.))
                    .text_color(if s.is_completed { t.faint } else { t.text })
                    .when(s.is_completed, |d| d.line_through())
                    .child(SharedString::from(s.title.clone())),
            );
        // A subtask added here a moment ago slides in.
        subtasks = subtasks.child(motion::enter(
            row,
            SharedString::from(format!("dsub-in-{}", s.id)),
            220,
            |el, v| el.opacity(v),
        ));
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
            .text_color(t.text)
            .child(icon("plus", 16., t.faint))
            .child(div().flex_1().child(subtask_in)),
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
                .when(!on, |d| {
                    d.border_color(t.border)
                        .text_color(t.muted)
                        .hover(|s| s.bg(t.hover))
                })
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

    // Labels: the task's, removable; then a filter that adds one or creates it.
    let mut labels = div().flex().flex_wrap().gap(px(6.));
    for l in task.label_ids.iter().filter_map(|l| snap.label(l)) {
        let (tid, lid) = (task.id.clone(), l.id.clone());
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
                .child(
                    div()
                        .id(SharedString::from(format!("label-x-{}", l.id)))
                        .cursor_pointer()
                        .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| {
                            let Some(task) = this.snap.task(&tid) else {
                                return;
                            };
                            let ids: Vec<String> = task
                                .label_ids
                                .iter()
                                .filter(|x| **x != lid)
                                .cloned()
                                .collect();
                            edit::write(this, &tid, vec![("label_ids", Value::from(ids))], cx);
                        }))
                        .child(icon("x", 12., t.muted)),
                ),
        );
    }
    let query = label_in.read(cx).text().trim().to_owned();
    let q = query.to_lowercase();
    let available = available_labels(app, &task, &q);
    let exact = snap.labels.iter().any(|l| l.name.to_lowercase() == q);
    let mut suggestions = div().flex().flex_wrap().gap(px(6.)).mt(px(8.));
    for (lid, name, color) in available.iter().take(12) {
        let (tid, lid) = (task.id.clone(), lid.clone());
        let input = label_in.clone();
        suggestions = suggestions.child(
            div()
                .id(SharedString::from(format!("label-add-{lid}")))
                .flex()
                .items_center()
                .gap(px(6.))
                .px(px(8.))
                .py(px(3.))
                .rounded(px(4.))
                .border_1()
                .border_color(t.border)
                .cursor_pointer()
                .text_size(ts(14.))
                .text_color(t.text_soft)
                .hover(|s| s.bg(t.hover))
                .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| {
                    let Some(task) = this.snap.task(&tid) else {
                        return;
                    };
                    let mut ids = task.label_ids.clone();
                    ids.push(lid.clone());
                    edit::write(this, &tid, vec![("label_ids", Value::from(ids))], cx);
                    input.update(cx, |i, cx| i.clear(cx));
                }))
                .child(icon("tag", 12., hex(color, 0x6366f1)))
                .child(SharedString::from(name.clone())),
        );
    }
    if !q.is_empty() && !exact {
        let (tid, name) = (task.id.clone(), query.clone());
        let input = label_in.clone();
        suggestions = suggestions.child(
            div()
                .id("label-create")
                .flex()
                .items_center()
                .gap(px(6.))
                .px(px(8.))
                .py(px(3.))
                .rounded(px(4.))
                .border_1()
                .border_dashed()
                .border_color(t.faint)
                .cursor_pointer()
                .text_size(ts(14.))
                .text_color(t.text_soft)
                .hover(|s| s.bg(t.hover))
                .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| {
                    edit::create_label(this, &tid, &name, cx);
                    input.update(cx, |i, cx| i.clear(cx));
                }))
                .child(icon("plus", 12., t.muted))
                .child(SharedString::from(format!("Create \"{query}\""))),
        );
    }

    let start = task.start_at.as_ref().map(ms);
    let open_pop = |which: Popover| {
        move |this: &mut AtlasApp, _: &ClickEvent, _: &mut Window, cx: &mut Context<AtlasApp>| {
            toggle_popover(this, which, cx)
        }
    };
    let tz = snap.tz.clone();
    let (eod_id, clear_id, start_clear_id) = (task.id.clone(), task.id.clone(), task.id.clone());
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
                .id("detail-project")
                .justify_between()
                .cursor_pointer()
                .hover(|s| s.bg(t.hover))
                .when(popover == Some(Popover::Project), |d| {
                    d.border_color(t.accent)
                })
                .on_click(cx.listener(open_pop(Popover::Project)))
                .child(div().truncate().child(SharedString::from(match section {
                    Some(s) => format!("{project_name} / {s}"),
                    None => project_name.clone(),
                })))
                .child(icon("chevron-right", 16., t.muted)),
        )
        .when(popover == Some(Popover::Project), |d| {
            let list = div()
                .id("detail-move-list")
                .w(px(276.))
                .max_h(px(360.))
                .overflow_y_scroll()
                .child(edit::move_list(app, &task.id, t, cx, |this, _, cx| {
                    if let Some(ed) = this.editor.as_mut() {
                        ed.popover = None;
                    }
                    cx.notify();
                }))
                .into_any_element();
            d.child(popover_at("project", list, t, cx))
        })
        .child(prop_label("calendar", "Due date", t))
        .child(
            div()
                .flex()
                .gap(px(8.))
                .child(
                    field(t)
                        .id("detail-due")
                        .flex_1()
                        .cursor_pointer()
                        .hover(|s| s.bg(t.hover))
                        .when(popover == Some(Popover::Due), |d| d.border_color(t.accent))
                        .on_click(cx.listener(open_pop(Popover::Due)))
                        .text_color(if due.is_some() { t.text } else { t.faint })
                        .child(SharedString::from(due.map_or("No date".to_owned(), |d| {
                            format::long_date(snap.date_of(d))
                        }))),
                )
                .when(due.is_some(), |d| {
                    d.child(
                        field(t)
                            .w(px(104.))
                            .gap(px(8.))
                            .child(icon("clock", 16., t.muted))
                            .child(div().flex_1().child(time_in)),
                    )
                }),
        )
        .when(popover == Some(Popover::Due), |d| {
            d.child(date_popover(app, &task, Popover::Due, t, cx))
        })
        .when(due.is_some(), |d| {
            let tz = tz.clone();
            d.child(
                div()
                    .mt(px(8.))
                    .flex()
                    .gap(px(8.))
                    .child(action_pill(
                        "due-eod",
                        "End of day",
                        all_day,
                        t,
                        cx,
                        move |this, cx| {
                            let Some(d) = this.snap.task(&eod_id).and_then(Task::due_ms) else {
                                return;
                            };
                            let day = this.snap.date_of(d);
                            if let Some(at) = edit::end_of_day(day, &tz) {
                                edit::write(this, &eod_id, vec![("due_at", Value::from(at))], cx);
                            }
                        },
                    ))
                    .child(action_pill(
                        "due-clear",
                        "Clear",
                        false,
                        t,
                        cx,
                        move |this, cx| {
                            edit::write(this, &clear_id, vec![("due_at", Value::Null)], cx)
                        },
                    )),
            )
        })
        .child(prop_label("calendar-clock", "Start date", t))
        .child(
            div()
                .flex()
                .gap(px(8.))
                .child(
                    field(t)
                        .id("detail-start")
                        .flex_1()
                        .cursor_pointer()
                        .hover(|s| s.bg(t.hover))
                        .when(popover == Some(Popover::Start), |d| {
                            d.border_color(t.accent)
                        })
                        .on_click(cx.listener(open_pop(Popover::Start)))
                        .text_color(if start.is_some() { t.text } else { t.faint })
                        .child(SharedString::from(
                            start.map_or("No date".to_owned(), |s| {
                                format::long_date(snap.date_of(s))
                            }),
                        )),
                )
                .when(start.is_some(), |d| {
                    d.child(action_pill(
                        "start-clear",
                        "Clear",
                        false,
                        t,
                        cx,
                        move |this, cx| {
                            edit::write(this, &start_clear_id, vec![("start_at", Value::Null)], cx)
                        },
                    ))
                }),
        )
        .when(popover == Some(Popover::Start), |d| {
            d.child(date_popover(app, &task, Popover::Start, t, cx))
        })
        .child(prop_label("flag", "Priority", t))
        .child(priorities)
        .child(prop_label("tag", "Labels", t))
        .child(labels)
        .child(field(t).mt(px(8.)).child(label_in))
        .child(suggestions)
        .child(prop_label("repeat", "Repeat", t))
        .child(repeat_editor(&task, t, cx));

    let dialog = div()
        .id("detail")
        .track_focus(&dialog_focus)
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
        // Clicking anywhere leaves the field being typed in (saving it); a field takes the focus
        // back on its own mouse down.
        .capture_any_mouse_down(
            cx.listener(|this, _: &MouseDownEvent, window, cx| focus_dialog(this, window, cx)),
        )
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
        .on_click(cx.listener(|this, _: &ClickEvent, _, cx| close(this, cx)))
        .child(dialog);
    Some(motion::enter(
        overlay,
        SharedString::from(format!("detail-fade-{id}")),
        200,
        |el, v| el.opacity(v),
    ))
}

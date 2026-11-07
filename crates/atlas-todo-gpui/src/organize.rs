//! Organising a project: moving tasks by drag and drop (board cards, list rows), sections (add,
//! rename, archive, delete), and projects (create, edit, favorite, archive, delete). The writes are
//! the mobile app's: `BoardScreen`'s card moves and fractional ranks, `useSections`, `useProjects`
//! and the `favorites` preference.

use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

use gpui::{
    div, prelude::*, px, AnyElement, Bounds, ClickEvent, Context, DragMoveEvent, Entity,
    FontWeight, Pixels, Point, SharedString, Window,
};
use serde_json::Value;

use atlas_todo_rules::client::Project;
use atlas_todo_rules::rules::task::ms;

use crate::app::{AtlasApp, Route};
use crate::input::{Cancel, Submit, TextInput};
use crate::model::{Section, Snapshot};
use crate::motion;
use crate::rank::{column_move_writes, MoveWrite};
use crate::sync::Command;
use crate::theme::{project_color, Theme, PROJECT_COLORS};
use crate::ui::{check_circle, icon, segmented, ts};

/// What a task drag carries.
#[derive(Clone)]
pub struct TaskDrag {
    pub id: String,
}

/// Where a dragged task would land: a section of the open project, before the `index`-th of the
/// tasks shown there (the dragged one left out).
#[derive(Clone, Debug, PartialEq)]
pub struct DropSlot {
    pub section: Option<String>,
    pub index: usize,
}

/// Where the insertion line is drawn.
pub enum Marker {
    Before(String),
    After(String),
    /// Into an empty column or section.
    Empty,
}

pub enum SectionEdit {
    /// A new section in this project.
    Add(String),
    Rename(String),
}

pub struct MenuAt {
    pub section: String,
    pub pos: Point<Pixels>,
}

/// The project sheet: a new project (`id: None`) or one being edited.
pub struct ProjectSheet {
    pub id: Option<String>,
    pub color: String,
    pub board: bool,
}

pub struct Org {
    pub slot: Option<DropSlot>,
    pub dragging: Option<String>,
    /// Where each draggable task was last drawn, for the drop slot under the pointer.
    pub bounds: Rc<RefCell<HashMap<String, Bounds<Pixels>>>>,
    pub section_input: Entity<TextInput>,
    pub edit: Option<SectionEdit>,
    pub menu: Option<MenuAt>,
    pub sheet: Option<ProjectSheet>,
    pub name_input: Entity<TextInput>,
}

impl Org {
    pub fn new(cx: &mut Context<AtlasApp>) -> Self {
        let section_input = cx.new(|cx| TextInput::new("Section name", cx));
        cx.subscribe(&section_input, |this: &mut AtlasApp, _, ev: &Submit, cx| {
            this.commit_section(ev.0.clone(), cx)
        })
        .detach();
        cx.subscribe(&section_input, |this: &mut AtlasApp, _, _: &Cancel, cx| {
            this.org.edit = None;
            cx.notify();
        })
        .detach();
        let name_input = cx.new(|cx| TextInput::new("Project name", cx));
        cx.subscribe(&name_input, |this: &mut AtlasApp, _, _: &Submit, cx| {
            this.save_sheet(cx)
        })
        .detach();
        cx.subscribe(&name_input, |this: &mut AtlasApp, _, _: &Cancel, cx| {
            this.org.sheet = None;
            cx.notify();
        })
        .detach();
        Self {
            slot: None,
            dragging: None,
            bounds: Rc::default(),
            section_input,
            edit: None,
            menu: None,
            sheet: None,
            name_input,
        }
    }
}

/// A JSON number for a rank: whole ranks as integers, as the web app writes them.
fn rank_value(r: f64) -> Value {
    if r.fract() == 0. && r.abs() < 9e15 {
        Value::from(r as i64)
    } else {
        Value::from(r)
    }
}

fn descendants(snap: &Snapshot, id: &str) -> Vec<(String, Option<String>)> {
    let mut out = Vec::new();
    let mut stack = vec![id.to_owned()];
    let mut seen = std::collections::HashSet::from([id.to_owned()]);
    while let Some(p) = stack.pop() {
        for c in snap
            .tasks
            .iter()
            .filter(|t| t.parent_id.as_deref() == Some(p.as_str()))
        {
            if seen.insert(c.id.clone()) {
                out.push((c.id.clone(), c.section_id.clone()));
                stack.push(c.id.clone());
            }
        }
    }
    out
}

impl AtlasApp {
    /// Forget a drag that ended outside any drop target.
    pub fn settle_drag(&mut self, cx: &Context<Self>) {
        if !cx.has_active_drag() {
            self.org.slot = None;
            self.org.dragging = None;
        }
    }

    /// Where the insertion line goes in a column or section showing `ids` (in order).
    pub fn drop_marker(&self, section: &Option<String>, ids: &[String]) -> Option<Marker> {
        let slot = self.org.slot.as_ref().filter(|s| &s.section == section)?;
        let dragged = self.org.dragging.as_deref()?;
        let others: Vec<&String> = ids.iter().filter(|i| *i != dragged).collect();
        // Back where it was: no line.
        if let Some(at) = ids.iter().position(|i| i == dragged) {
            if at == slot.index {
                return None;
            }
        }
        if others.is_empty() {
            return Some(Marker::Empty);
        }
        Some(match others.get(slot.index) {
            Some(id) => Marker::Before((*id).clone()),
            None => Marker::After(others[others.len() - 1].clone()),
        })
    }

    /// Drop the dragged task into `section` of its project, at the slot under the pointer (else at
    /// the end), as `BoardScreen`'s `moveCard`: one rank write, its subtree following it across
    /// sections. Shown at once, written in one go.
    pub fn drop_task(&mut self, id: &str, section: Option<String>, cx: &mut Context<Self>) {
        let index = match self.org.slot.take() {
            Some(s) if s.section == section => s.index,
            _ => usize::MAX,
        };
        self.org.dragging = None;
        let snap = self.snap.clone();
        let Some(task) = snap.task(id) else {
            cx.notify();
            return;
        };
        let column: Vec<&atlas_todo_rules::rules::task::Task> = snap.open_roots(|x| {
            x.project_id == task.project_id && x.section_id == section && x.id != task.id
        });
        if task.section_id == section {
            let shown: Vec<&str> = snap
                .open_roots(|x| x.project_id == task.project_id && x.section_id == section)
                .iter()
                .map(|x| x.id.as_str())
                .collect();
            let at = shown.iter().position(|x| *x == id);
            if at == Some(index.min(column.len())) {
                cx.notify();
                return;
            }
        }
        let ranks: Vec<(String, f64)> = column
            .iter()
            .map(|x| (x.id.clone(), x.sort_order.as_f64().unwrap_or(0.)))
            .collect();
        let writes = column_move_writes(
            &ranks,
            id,
            task.section_id.as_deref(),
            section.as_deref(),
            index,
            &descendants(&snap, id),
        );
        self.apply_moves(writes, cx);
    }

    fn apply_moves(&mut self, writes: Vec<MoveWrite>, cx: &mut Context<Self>) {
        let snap = Rc::make_mut(&mut self.snap);
        for w in &writes {
            if let Some(t) = snap.tasks.iter_mut().find(|t| t.id == w.id) {
                t.section_id = w.section_id.clone();
                if let Some(r) = w.sort_order {
                    if let Some(n) = serde_json::Number::from_f64(r) {
                        t.sort_order = n;
                    }
                }
            }
        }
        snap.tasks.sort_by(|a, b| {
            let (x, y) = (
                a.sort_order.as_f64().unwrap_or(0.0),
                b.sort_order.as_f64().unwrap_or(0.0),
            );
            x.total_cmp(&y)
                .then(ms(&a.created_at).cmp(&ms(&b.created_at)))
        });
        let patches = writes
            .into_iter()
            .map(|w| {
                let mut patch = vec![(
                    "section_id".to_owned(),
                    w.section_id.map_or(Value::Null, Value::from),
                )];
                if let Some(r) = w.sort_order {
                    patch.push(("sort_order".to_owned(), rank_value(r)));
                }
                (w.id, patch)
            })
            .collect();
        self.send(Command::UpdateTasks(patches));
        cx.notify();
    }

    // Sections (`useSections`).

    pub fn start_section_edit(
        &mut self,
        edit: SectionEdit,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let text = match &edit {
            SectionEdit::Rename(id) => self
                .snap
                .section(id)
                .map(|s| s.name.clone())
                .unwrap_or_default(),
            SectionEdit::Add(_) => String::new(),
        };
        self.org.edit = Some(edit);
        self.org.menu = None;
        self.org
            .section_input
            .update(cx, |i, cx| i.set_text(&text, cx));
        let handle = gpui::Focusable::focus_handle(self.org.section_input.read(cx), cx);
        window.focus(&handle, cx);
        cx.notify();
    }

    fn commit_section(&mut self, text: String, cx: &mut Context<Self>) {
        let name = text.trim().to_owned();
        match self.org.edit.take() {
            Some(SectionEdit::Add(project)) if !name.is_empty() => {
                let id = uuid::Uuid::new_v4().to_string();
                let sort = crate::now_ms() as f64;
                Rc::make_mut(&mut self.snap).sections.push(Section {
                    id: id.clone(),
                    project_id: project.clone(),
                    name: name.clone(),
                    sort_order: sort,
                });
                self.send(Command::SetFields {
                    kind: "section".into(),
                    id,
                    fields: vec![
                        ("project_id".into(), Value::from(project.clone())),
                        ("name".into(), Value::from(name)),
                        ("sort_order".into(), Value::from(crate::now_ms())),
                    ],
                });
                // Keep the field open for the next one, as the board's "Add section" does.
                self.org.edit = Some(SectionEdit::Add(project));
                self.org.section_input.update(cx, |i, cx| i.clear(cx));
            }
            Some(SectionEdit::Rename(id)) if !name.is_empty() => {
                let snap = Rc::make_mut(&mut self.snap);
                if let Some(s) = snap.sections.iter_mut().find(|s| s.id == id) {
                    if s.name != name {
                        s.name = name.clone();
                        self.send(Command::SetFields {
                            kind: "section".into(),
                            id,
                            fields: vec![("name".into(), Value::from(name))],
                        });
                    }
                }
            }
            _ => {}
        }
        cx.notify();
    }

    /// Archive (`archived_at`) or trash (`deleted_at`) a section; its tasks hide with it.
    fn retire_section(&mut self, id: &str, field: &str, cx: &mut Context<Self>) {
        Rc::make_mut(&mut self.snap).sections.retain(|s| s.id != id);
        self.org.menu = None;
        self.send(Command::SetFields {
            kind: "section".into(),
            id: id.to_owned(),
            fields: vec![(field.to_owned(), Value::from(crate::now_ms()))],
        });
        cx.notify();
    }

    // Projects (`useProjects`, the `favorites` preference).

    pub fn is_favorite(&self, project: &str) -> bool {
        self.pref("favorites")
            .and_then(|f| f.get(format!("project:{project}")))
            .and_then(Value::as_bool)
            .unwrap_or(false)
    }

    pub fn toggle_favorite(&mut self, project: &str, cx: &mut Context<Self>) {
        let mut favs = self
            .pref("favorites")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        let on = self.is_favorite(project);
        favs.insert(format!("project:{project}"), Value::Bool(!on));
        self.set_pref("favorites", Value::Object(favs), cx);
    }

    pub fn open_project_sheet(
        &mut self,
        id: Option<String>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let (name, color, board) = match id.as_deref().and_then(|i| self.snap.project(i)) {
            Some(p) => (
                p.name.clone(),
                if p.color.is_empty() {
                    hex_of(project_color(&p.id, ""))
                } else {
                    p.color.clone()
                },
                p.default_view == "board",
            ),
            // `defaultColorForIndex`: the colour rotates with the number of projects.
            None => (
                String::new(),
                hex_of(gpui::rgb(
                    PROJECT_COLORS[self.snap.projects.len() % PROJECT_COLORS.len()],
                )),
                false,
            ),
        };
        self.org.sheet = Some(ProjectSheet { id, color, board });
        self.org
            .name_input
            .update(cx, |i, cx| i.set_text(&name, cx));
        let handle = gpui::Focusable::focus_handle(self.org.name_input.read(cx), cx);
        window.focus(&handle, cx);
        cx.notify();
    }

    fn save_sheet(&mut self, cx: &mut Context<Self>) {
        let Some(sheet) = self.org.sheet.take() else {
            return;
        };
        let name = self.org.name_input.read(cx).text().trim().to_owned();
        if name.is_empty() {
            self.org.sheet = Some(sheet);
            return;
        }
        let view = if sheet.board { "board" } else { "list" };
        match sheet.id {
            None => {
                let id = uuid::Uuid::new_v4().to_string();
                let now = crate::now_ms();
                let snap = Rc::make_mut(&mut self.snap);
                snap.projects.push(Project {
                    id: id.clone(),
                    owner_id: snap.user_id.clone(),
                    name: name.clone(),
                    color: sheet.color.clone(),
                    icon: "hash".into(),
                    sort_order: serde_json::Number::from(now),
                    is_favorite: false,
                    parent_id: None,
                    kind: "project".into(),
                    default_view: view.into(),
                    archived_at: None,
                    deleted_at: None,
                });
                self.send(Command::SetFields {
                    kind: "project".into(),
                    id: id.clone(),
                    fields: vec![
                        ("default_view".into(), Value::from(view)),
                        ("name".into(), Value::from(name)),
                        ("color".into(), Value::from(sheet.color)),
                        ("icon".into(), Value::from("hash")),
                        ("kind".into(), Value::from("project")),
                        ("parent_id".into(), Value::Null),
                        ("sort_order".into(), Value::from(now)),
                    ],
                });
                self.go(Route::Project(id), cx);
            }
            Some(id) => {
                let snap = Rc::make_mut(&mut self.snap);
                let Some(p) = snap.projects.iter_mut().find(|p| p.id == id) else {
                    return;
                };
                let mut fields = Vec::new();
                if p.name != name {
                    p.name = name.clone();
                    fields.push(("name".to_owned(), Value::from(name)));
                }
                if p.color != sheet.color {
                    p.color = sheet.color.clone();
                    fields.push(("color".to_owned(), Value::from(sheet.color)));
                }
                if p.default_view != view {
                    p.default_view = view.into();
                    fields.push(("default_view".to_owned(), Value::from(view)));
                }
                self.set_board(&id, sheet.board);
                if !fields.is_empty() {
                    self.send(Command::SetFields {
                        kind: "project".into(),
                        id,
                        fields,
                    });
                }
            }
        }
        cx.notify();
    }

    /// Archive (`archived_at`) or trash (`deleted_at`) a project; its sections and tasks hide with
    /// it.
    fn retire_project(&mut self, id: &str, field: &str, cx: &mut Context<Self>) {
        Rc::make_mut(&mut self.snap).projects.retain(|p| p.id != id);
        self.org.sheet = None;
        self.send(Command::SetFields {
            kind: "project".into(),
            id: id.to_owned(),
            fields: vec![(field.to_owned(), Value::from(crate::now_ms()))],
        });
        if self.route == Route::Project(id.to_owned()) {
            self.go(Route::Projects, cx);
        }
        cx.notify();
    }
}

fn hex_of(c: gpui::Rgba) -> String {
    let v = |f: f32| (f * 255.).round() as u8;
    format!("#{:02x}{:02x}{:02x}", v(c.r), v(c.g), v(c.b))
}

// Drag and drop.

/// Make a task row or card draggable; it remembers where it was drawn while a drag is on.
pub fn draggable(
    el: gpui::Stateful<gpui::Div>,
    app: &AtlasApp,
    task_id: &str,
    board: bool,
    t: &Theme,
) -> gpui::Stateful<gpui::Div> {
    let bounds = app.org.bounds.clone();
    let id = task_id.to_owned();
    let snap = app.snap.clone();
    let theme = *t;
    let dragged = app.org.dragging.as_deref() == Some(task_id);
    el.on_drag_move(move |ev: &DragMoveEvent<TaskDrag>, _, _| {
        bounds.borrow_mut().insert(id.clone(), ev.bounds);
    })
    .on_drag(
        TaskDrag {
            id: task_id.to_owned(),
        },
        move |drag, _offset, _, cx| {
            let (snap, id) = (snap.clone(), drag.id.clone());
            cx.new(|_| Ghost {
                snap,
                id,
                theme,
                board,
            })
        },
    )
    // The card it came from stays as a faint placeholder while its ghost travels.
    .when(dragged, |d| d.opacity(0.35))
}

/// A column or section that takes dropped tasks: it follows the pointer to the slot between the
/// tasks `ids` (in order) and moves the task there on drop.
pub fn drop_zone(
    el: gpui::Div,
    section: Option<String>,
    ids: Vec<String>,
    cx: &mut Context<AtlasApp>,
) -> gpui::Div {
    let target = section.clone();
    el.on_drag_move(
        cx.listener(move |this, ev: &DragMoveEvent<TaskDrag>, _, cx| {
            let id = ev.drag(cx).id.clone();
            if this.org.dragging.as_ref() != Some(&id) {
                this.org.dragging = Some(id.clone());
                cx.notify();
            }
            if !ev.bounds.contains(&ev.event.position) {
                return;
            }
            let y = ev.event.position.y;
            let index = {
                let b = this.org.bounds.borrow();
                ids.iter()
                    .filter(|i| **i != id)
                    .filter(|i| b.get(*i).is_some_and(|r| r.center().y < y))
                    .count()
            };
            let slot = Some(DropSlot {
                section: target.clone(),
                index,
            });
            if this.org.slot != slot {
                this.org.slot = slot;
                cx.notify();
            }
        }),
    )
    .on_drop(
        cx.listener(move |this, d: &TaskDrag, _, cx| this.drop_task(&d.id, section.clone(), cx)),
    )
}

/// Wrap a card or row with the insertion line above or below it when the drop slot is there.
pub fn with_marker(
    el: AnyElement,
    id: &str,
    marker: &Option<Marker>,
    gap: f32,
    t: &Theme,
) -> AnyElement {
    let (before, after) = match marker {
        Some(Marker::Before(m)) => (m == id, false),
        Some(Marker::After(m)) => (false, m == id),
        _ => (false, false),
    };
    if !before && !after {
        return el;
    }
    let line = div()
        .absolute()
        .left(px(-2.))
        .right(px(-2.))
        .h(px(3.))
        .rounded_full()
        .bg(t.accent)
        .map(|d| {
            let off = px(-(gap / 2. + 1.5));
            if before {
                d.top(off)
            } else {
                d.bottom(off)
            }
        });
    let line = motion::enter(
        line,
        SharedString::from(format!("drop-line-{id}-{before}")),
        160,
        |el, v| el.opacity(v),
    );
    div().relative().child(el).child(line).into_any_element()
}

/// The empty column's drop area, shown while a card hovers over it.
pub fn empty_drop(t: &Theme) -> AnyElement {
    motion::enter(
        div()
            .h(px(64.))
            .rounded(px(10.))
            .border_2()
            .border_dashed()
            .border_color(t.accent)
            .bg(t.accent_soft),
        "empty-drop",
        180,
        |el, v| el.opacity(v),
    )
}

/// The dragged task under the pointer: the card lifted off the board (or the row off the list),
/// rising and spreading a little as it is picked up.
struct Ghost {
    snap: Rc<Snapshot>,
    id: String,
    theme: Theme,
    board: bool,
}

impl Render for Ghost {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        let t = &self.theme;
        let face: AnyElement = match self.snap.task(&self.id) {
            Some(task) if self.board => crate::board::card_face(&self.snap, task, t, None)
                .w_full()
                .into_any_element(),
            Some(task) => div()
                .flex()
                .items_center()
                .gap(px(12.))
                .px(px(16.))
                .py(px(11.))
                .child(check_circle(20., false, t.circle, t))
                .child(
                    div()
                        .flex_1()
                        .truncate()
                        .text_size(ts(16.))
                        .child(SharedString::from(task.title.clone())),
                )
                .into_any_element(),
            None => div().into_any_element(),
        };
        let width = if self.board {
            crate::board::COLUMN
        } else {
            520.
        };
        let card = div()
            .font_family(crate::FONT)
            .text_color(t.text)
            .rounded(px(10.))
            .border_1()
            .border_color(t.border)
            .bg(t.surface)
            .shadow_xl()
            .opacity(0.96)
            .child(face);
        motion::spring_from(
            card,
            SharedString::from(format!("ghost-{}", self.id)),
            motion::SNAPPY,
            0.,
            1.,
            move |el, v| el.w(px(width + 10. * v)).ml(px(-5. * v)).mt(px(-6. * v)),
        )
    }
}

// Sections.

/// An icon button.
fn tool(
    id: impl Into<SharedString>,
    glyph: &str,
    size: f32,
    t: &Theme,
    on: impl Fn(&mut AtlasApp, &ClickEvent, &mut Window, &mut Context<AtlasApp>) + 'static,
    cx: &mut Context<AtlasApp>,
) -> AnyElement {
    div()
        .id(id.into())
        .p(px(4.))
        .rounded(px(6.))
        .cursor_pointer()
        .hover(|d| d.bg(t.chip))
        .on_click(cx.listener(move |this, ev: &ClickEvent, window, cx| {
            cx.stop_propagation();
            on(this, ev, window, cx)
        }))
        .child(icon(glyph, size, t.faint))
        .into_any_element()
}

/// A section's pencil (rename) and menu (archive, delete).
pub fn section_tools(
    app: &AtlasApp,
    section: &str,
    t: &Theme,
    cx: &mut Context<AtlasApp>,
) -> AnyElement {
    let _ = app;
    let (a, b) = (section.to_owned(), section.to_owned());
    div()
        .flex()
        .items_center()
        .gap(px(10.))
        .child(tool(
            format!("sec-rename-{section}"),
            "pencil",
            16.,
            t,
            move |this, _, window, cx| {
                this.start_section_edit(SectionEdit::Rename(a.clone()), window, cx)
            },
            cx,
        ))
        .child(tool(
            format!("sec-menu-{section}"),
            "ellipsis-vertical",
            16.,
            t,
            move |this, ev, _, cx| {
                this.org.menu = Some(MenuAt {
                    section: b.clone(),
                    pos: ev.position(),
                });
                cx.notify();
            },
            cx,
        ))
        .into_any_element()
}

/// The section's name, or the rename field while it is being renamed.
pub fn section_title(
    app: &AtlasApp,
    section: Option<&str>,
    label: AnyElement,
    t: &Theme,
) -> AnyElement {
    let renaming = matches!(
        (&app.org.edit, section),
        (Some(SectionEdit::Rename(e)), Some(s)) if e == s
    );
    if !renaming {
        return label;
    }
    name_field(app.org.section_input.clone(), 200., t)
}

fn name_field(input: Entity<TextInput>, width: f32, t: &Theme) -> AnyElement {
    div()
        .id("name-field")
        .w(px(width))
        .px(px(10.))
        .py(px(6.))
        .rounded(px(8.))
        .border_1()
        .border_color(t.accent)
        .bg(t.surface)
        .text_size(ts(15.))
        .text_color(t.text)
        .on_click(|_, _, cx| cx.stop_propagation())
        .child(input)
        .into_any_element()
}

/// "Add section", or its name field once open.
pub fn add_section(
    app: &AtlasApp,
    project: &str,
    t: &Theme,
    cx: &mut Context<AtlasApp>,
) -> AnyElement {
    let open = matches!(&app.org.edit, Some(SectionEdit::Add(p)) if p == project);
    if open {
        return div()
            .pl(px(14.))
            .py(px(8.))
            .child(name_field(app.org.section_input.clone(), 280., t))
            .into_any_element();
    }
    let p = project.to_owned();
    div()
        .id(SharedString::from(format!("add-section-{project}")))
        .flex()
        .items_center()
        .gap(px(8.))
        .pl(px(14.))
        .py(px(10.))
        .rounded(px(8.))
        .text_size(ts(16.))
        .text_color(t.faint)
        .cursor_pointer()
        .hover(|d| d.text_color(t.text_soft))
        .on_click(cx.listener(move |this, _: &ClickEvent, window, cx| {
            this.start_section_edit(SectionEdit::Add(p.clone()), window, cx)
        }))
        .child(icon("plus", 16., t.faint))
        .child("Add section")
        .into_any_element()
}

// Projects.

/// The project header's star (favorite) and sliders (the project sheet).
pub fn project_tools(
    app: &AtlasApp,
    project: &str,
    t: &Theme,
    cx: &mut Context<AtlasApp>,
) -> AnyElement {
    let fav = app.is_favorite(project);
    let (a, b) = (project.to_owned(), project.to_owned());
    let star = div()
        .id(SharedString::from(format!("fav-{project}")))
        .cursor_pointer()
        .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| this.toggle_favorite(&a, cx)))
        .child(motion::spring_from(
            div()
                .size(px(20.))
                .flex()
                .items_center()
                .justify_center()
                .child(icon(
                    if fav { "star-fill" } else { "star" },
                    20.,
                    if fav { gpui::rgb(AMBER) } else { t.muted },
                )),
            SharedString::from(format!("fav-pop-{project}-{fav}")),
            motion::SNAPPY,
            if fav { 0.6 } else { 1. },
            1.,
            |el, v| el.opacity(v.clamp(0., 1.)),
        ));
    div()
        .flex()
        .items_center()
        .gap(px(22.))
        .child(star)
        .child(
            div()
                .id(SharedString::from(format!("edit-{project}")))
                .cursor_pointer()
                .on_click(cx.listener(move |this, _: &ClickEvent, window, cx| {
                    this.open_project_sheet(Some(b.clone()), window, cx)
                }))
                .child(icon("sliders-horizontal", 20., t.muted)),
        )
        .child(icon("user-plus", 20., t.muted))
        .child(icon("activity", 20., t.muted))
        .into_any_element()
}

pub const AMBER: u32 = 0xf59e0b;

// Overlays: the section menu and the project sheet.

fn menu_item(
    id: &str,
    glyph: &str,
    label: &str,
    danger: bool,
    t: &Theme,
    on: impl Fn(&mut AtlasApp, &mut Window, &mut Context<AtlasApp>) + 'static,
    cx: &mut Context<AtlasApp>,
) -> AnyElement {
    let color = if danger {
        gpui::rgb(crate::theme::RED)
    } else {
        t.text_soft
    };
    div()
        .id(SharedString::from(id.to_owned()))
        .flex()
        .items_center()
        .gap(px(10.))
        .px(px(10.))
        .py(px(7.))
        .rounded(px(6.))
        .cursor_pointer()
        .hover(|d| d.bg(t.hover))
        .text_size(ts(14.))
        .text_color(color)
        .on_click(cx.listener(move |this, _: &ClickEvent, window, cx| {
            this.org.menu = None;
            on(this, window, cx);
            cx.notify();
        }))
        .child(icon(glyph, 16., color))
        .child(SharedString::from(label.to_owned()))
        .into_any_element()
}

pub fn overlays(app: &AtlasApp, t: &Theme, cx: &mut Context<AtlasApp>) -> Vec<AnyElement> {
    let mut out = Vec::new();
    if let Some(m) = &app.org.menu {
        let (a, b, c) = (m.section.clone(), m.section.clone(), m.section.clone());
        let menu = div()
            .id("section-menu")
            .absolute()
            .left(m.pos.x - px(170.))
            .top(m.pos.y + px(12.))
            .w(px(180.))
            .p(px(4.))
            .rounded(px(10.))
            .border_1()
            .border_color(t.border)
            .bg(t.surface)
            .shadow_lg()
            .flex()
            .flex_col()
            .on_click(|_, _, cx| cx.stop_propagation())
            .child(menu_item(
                "menu-rename",
                "pencil",
                "Rename",
                false,
                t,
                move |this, window, cx| {
                    this.start_section_edit(SectionEdit::Rename(a.clone()), window, cx)
                },
                cx,
            ))
            .child(menu_item(
                "menu-archive",
                "archive",
                "Archive",
                false,
                t,
                move |this, _, cx| this.retire_section(&b, "archived_at", cx),
                cx,
            ))
            .child(menu_item(
                "menu-delete",
                "trash",
                "Delete",
                true,
                t,
                move |this, _, cx| this.retire_section(&c, "deleted_at", cx),
                cx,
            ));
        let menu = motion::enter(menu, "section-menu-in", 140, |el, v| {
            el.opacity(v).mt(px((1. - v) * -6.))
        });
        out.push(
            div()
                .id("menu-backdrop")
                .absolute()
                .inset_0()
                .on_click(cx.listener(|this, _: &ClickEvent, _, cx| {
                    this.org.menu = None;
                    cx.notify();
                }))
                .child(menu)
                .into_any_element(),
        );
    }
    if let Some(sheet) = project_sheet(app, t, cx) {
        out.push(sheet);
    }
    out
}

fn button(id: &str, label: &str, primary: bool, t: &Theme) -> gpui::Stateful<gpui::Div> {
    div()
        .id(SharedString::from(id.to_owned()))
        .px(px(14.))
        .py(px(8.))
        .rounded(px(8.))
        .cursor_pointer()
        .text_size(ts(15.))
        .font_weight(FontWeight::SEMIBOLD)
        .map(|d| {
            if primary {
                d.bg(t.accent).text_color(t.on_accent)
            } else {
                d.border_1()
                    .border_color(t.border)
                    .text_color(t.text_soft)
                    .hover(|s| s.bg(t.hover))
            }
        })
        .child(SharedString::from(label.to_owned()))
}

fn label(text: &str, t: &Theme) -> gpui::Div {
    div()
        .mt(px(18.))
        .mb(px(8.))
        .text_size(ts(13.))
        .font_weight(FontWeight::SEMIBOLD)
        .text_color(t.muted)
        .child(SharedString::from(text.to_owned()))
}

fn project_sheet(app: &AtlasApp, t: &Theme, cx: &mut Context<AtlasApp>) -> Option<AnyElement> {
    let sheet = app.org.sheet.as_ref()?;
    let editing = sheet.id.clone();
    let mut swatches = div().flex().flex_wrap().gap(px(10.));
    for c in PROJECT_COLORS {
        let hex = hex_of(gpui::rgb(c));
        let on = sheet.color.eq_ignore_ascii_case(&hex);
        swatches = swatches.child(
            div()
                .id(SharedString::from(format!("swatch-{hex}")))
                .size(px(30.))
                .rounded_full()
                .flex()
                .items_center()
                .justify_center()
                .cursor_pointer()
                .border_2()
                .border_color(if on { gpui::rgb(c) } else { gpui::rgba(0) })
                .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| {
                    if let Some(s) = this.org.sheet.as_mut() {
                        s.color = hex.clone();
                    }
                    cx.notify();
                }))
                .child(
                    div()
                        .size(px(22.))
                        .rounded_full()
                        .bg(gpui::rgb(c))
                        .flex()
                        .items_center()
                        .justify_center()
                        .when(on, |d| d.child(icon("check", 14., gpui::rgb(0xffffff)))),
                ),
        );
    }
    let entity = cx.entity();
    let view = segmented(
        "sheet-view",
        &["List", "Board"],
        usize::from(sheet.board),
        true,
        t,
        move |i, _, cx| {
            entity.update(cx, |this, cx| {
                if let Some(s) = this.org.sheet.as_mut() {
                    s.board = i == 1;
                }
                cx.notify();
            })
        },
    );
    let mut footer = div().mt(px(26.)).flex().items_center().gap(px(10.));
    if let Some(id) = editing.clone() {
        let id2 = id.clone();
        footer = footer
            .child(
                button("sheet-archive", "Archive", false, t).on_click(cx.listener(
                    move |this, _: &ClickEvent, _, cx| this.retire_project(&id, "archived_at", cx),
                )),
            )
            .child(
                button("sheet-delete", "Delete", false, t)
                    .text_color(gpui::rgb(crate::theme::RED))
                    .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| {
                        this.retire_project(&id2, "deleted_at", cx)
                    })),
            );
    }
    footer = footer
        .child(div().flex_1())
        .child(
            button("sheet-cancel", "Cancel", false, t).on_click(cx.listener(
                |this, _: &ClickEvent, _, cx| {
                    this.org.sheet = None;
                    cx.notify();
                },
            )),
        )
        .child(
            button(
                "sheet-save",
                if editing.is_some() { "Save" } else { "Create" },
                true,
                t,
            )
            .on_click(cx.listener(|this, _: &ClickEvent, _, cx| this.save_sheet(cx))),
        );
    let color = crate::theme::hex(&sheet.color, PROJECT_COLORS[0]);
    let dialog = div()
        .id("project-sheet")
        .w(px(480.))
        .p(px(24.))
        .rounded(px(16.))
        .bg(t.surface)
        .border_1()
        .border_color(t.border)
        .shadow_2xl()
        .flex()
        .flex_col()
        .on_click(|_, _, cx| cx.stop_propagation())
        .child(
            div()
                .flex()
                .items_center()
                .gap(px(10.))
                .child(icon("hash", 22., color))
                .child(
                    div()
                        .text_size(ts(20.))
                        .font_weight(FontWeight::BOLD)
                        .text_color(t.text)
                        .child(if editing.is_some() {
                            "Edit project"
                        } else {
                            "New project"
                        }),
                ),
        )
        .child(label("Name", t))
        .child(
            div()
                .px(px(12.))
                .py(px(9.))
                .rounded(px(8.))
                .border_1()
                .border_color(t.border)
                .text_size(ts(15.))
                .text_color(t.text)
                .child(app.org.name_input.clone()),
        )
        .child(label("Color", t))
        .child(swatches)
        .child(label("Default view", t))
        .child(view)
        .child(footer);
    let key = editing.clone().unwrap_or_else(|| "new".into());
    let dialog = motion::enter(
        dialog,
        SharedString::from(format!("sheet-in-{key}")),
        260,
        |el, v| el.opacity(v).mt(px((1. - v) * 20.)),
    );
    let overlay = div()
        .id("sheet-overlay")
        .absolute()
        .inset_0()
        .flex()
        .items_center()
        .justify_center()
        .bg(t.overlay)
        .on_click(cx.listener(|this, _: &ClickEvent, _, cx| {
            this.org.sheet = None;
            cx.notify();
        }))
        .child(dialog);
    Some(motion::enter(
        overlay,
        SharedString::from(format!("sheet-fade-{key}")),
        180,
        |el, v| el.opacity(v),
    ))
}

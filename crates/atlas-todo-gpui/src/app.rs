//! The window: the sidebar and the screen it picks, over the latest snapshot of the account.

use std::collections::{HashMap, HashSet};
use std::rc::Rc;
use std::sync::mpsc::Sender;

use gpui::{
    div, prelude::*, px, rgb, AnyElement, ClickEvent, Context, Entity, FontWeight, SharedString,
    Window,
};
use jiff::civil::Date;

use gpui::Focusable;

use crate::input::TextInput;
use crate::model::{Snapshot, SyncState};
use crate::sync::{Command, Update};
use crate::theme::{project_color, Theme};
use crate::ui::icon;
use crate::ui::ts;
use crate::{board, calendar, detail, habits, list, stats};

/// How long a completed row stays before it leaves the list.
pub const LINGER: std::time::Duration = std::time::Duration::from_millis(900);

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Route {
    Today,
    Upcoming,
    Inbox,
    Assigned,
    All,
    Completed,
    Projects,
    Calendar,
    Filters,
    Notifications,
    Focus,
    Habits,
    Stats,
    Countdowns,
    Project(String),
}

/// The session ended: the window goes back to the sign-in screen, saying this (empty after a
/// sign-out).
pub struct SignedOut(pub String);

impl gpui::EventEmitter<SignedOut> for AtlasApp {}

/// Navigation waiting for the first sync.
pub type Pending = Box<dyn FnOnce(&mut AtlasApp)>;

/// Where a quick add lands.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AddTarget {
    pub key: String,
    pub project_id: Option<String>,
    pub section_id: Option<String>,
}

pub struct AtlasApp {
    pub snap: Rc<Snapshot>,
    /// `Some(dark)` forces a theme; `None` follows the system.
    pub force_dark: Option<bool>,
    pub route: Route,
    pub open_task: Option<String>,
    pub collapsed: HashSet<String>,
    /// Parents whose subtasks are folded in the list.
    pub folded: HashSet<String>,
    pub month: Date,
    pub stats_days: i64,
    pub calendar_week: bool,
    pub habits_due_only: bool,
    pub adding: Option<AddTarget>,
    pub input: Entity<TextInput>,
    pub error: Option<String>,
    pub today: Date,
    tx: Option<Sender<Command>>,
    /// Tasks completed here a moment ago, still listed while their rows fade.
    pub linger: HashSet<String>,
    /// `--view` / `--task`, applied once the first snapshot has the projects and tasks they name.
    pub pending: Option<Pending>,
    /// Draft view modes picked by the user per project, over the project's default.
    view_picked: HashMap<String, bool>,
    /// The open task's editable fields and popovers.
    pub editor: Option<crate::detail::Editor>,
    /// A task's right-click menu.
    pub menu: Option<crate::context_menu::Menu>,
}

impl AtlasApp {
    pub fn new(
        snap: Snapshot,
        tx: Option<Sender<Command>>,
        updates: Option<async_channel::Receiver<Update>>,
        now_ms: i64,
        cx: &mut Context<Self>,
    ) -> Self {
        let today = snap.date_of(now_ms);
        let input = cx.new(|cx| TextInput::new("Add a task...", cx));
        cx.subscribe(
            &input,
            |this: &mut Self, _, ev: &crate::input::Submit, cx| this.submit_add(ev.0.clone(), cx),
        )
        .detach();
        if let Some(rx) = updates {
            cx.spawn(async move |this, cx| {
                while let Ok(update) = rx.recv().await {
                    let alive = this.update(cx, |this, cx| {
                        match update {
                            Update::Snapshot(s) => {
                                this.today = s.date_of(crate::now_ms());
                                let mut s = *s;
                                s.linger = this.linger.clone();
                                let synced = s.sync == SyncState::Live;
                                this.snap = Rc::new(s);
                                if synced {
                                    if let Some(apply) = this.pending.take() {
                                        apply(this);
                                    }
                                }
                                this.error = None;
                            }
                            Update::Error(e) => this.error = Some(e),
                            Update::SignedOut(why) => cx.emit(SignedOut(why)),
                        }
                        cx.notify();
                    });
                    if alive.is_err() {
                        break;
                    }
                }
            })
            .detach();
        }
        Self {
            snap: Rc::new(snap),
            force_dark: None,
            route: Route::Today,
            open_task: None,
            collapsed: HashSet::new(),
            folded: HashSet::new(),
            month: today.first_of_month(),
            stats_days: 30,
            calendar_week: false,
            habits_due_only: true,
            adding: None,
            input,
            error: None,
            today,
            tx,
            linger: HashSet::new(),
            pending: None,
            view_picked: HashMap::new(),
            editor: None,
            menu: None,
        }
    }

    pub fn theme(&self, window: &Window) -> Theme {
        // `--dark`/`--light`, else the synced `theme` preference, else the system's.
        let system = || {
            matches!(
                window.appearance(),
                gpui::WindowAppearance::Dark | gpui::WindowAppearance::VibrantDark
            )
        };
        let dark =
            self.force_dark
                .unwrap_or_else(|| match self.pref("theme").and_then(|v| v.as_str()) {
                    Some("dark") => true,
                    Some("light") => false,
                    _ => system(),
                });
        if dark {
            Theme::dark()
        } else {
            Theme::light()
        }
    }

    pub fn is_board(&self, project: &str) -> bool {
        self.view_picked.get(project).copied().unwrap_or_else(|| {
            self.snap
                .project(project)
                .is_some_and(|p| p.default_view == "board")
        })
    }

    pub fn set_board(&mut self, project: &str, board: bool) {
        self.view_picked.insert(project.to_owned(), board);
    }

    pub fn send(&mut self, cmd: Command) {
        if let Some(tx) = &self.tx {
            let _ = tx.send(cmd);
        }
    }

    /// Complete or reopen, shown at once and confirmed by the next snapshot. A completed row stays
    /// listed for a moment, checked and fading, before it leaves the list.
    pub fn toggle(&mut self, id: &str, cx: &mut Context<Self>) {
        let snap = Rc::make_mut(&mut self.snap);
        let mut completed = false;
        if let Some(t) = snap.tasks.iter_mut().find(|t| t.id == id) {
            t.is_completed = !t.is_completed;
            completed = t.is_completed;
        }
        if completed {
            self.linger.insert(id.to_owned());
            snap.linger.insert(id.to_owned());
            let id = id.to_owned();
            cx.spawn(async move |this, cx| {
                cx.background_executor().timer(LINGER).await;
                let _ = this.update(cx, |this, cx| {
                    this.linger.remove(&id);
                    Rc::make_mut(&mut this.snap).linger.remove(&id);
                    cx.notify();
                });
            })
            .detach();
        } else {
            self.linger.remove(id);
            snap.linger.remove(id);
        }
        self.send(Command::Toggle(id.to_owned()));
        cx.notify();
    }

    /// Change a task's fields; the next snapshot shows the result.
    #[allow(dead_code)] // the editing screens' write path
    pub fn update_task(
        &mut self,
        id: &str,
        patch: Vec<(String, serde_json::Value)>,
        cx: &mut Context<Self>,
    ) {
        self.send(Command::UpdateTask(id.to_owned(), patch));
        cx.notify();
    }

    /// A synced preference (`theme`, `week_starts_on`, `favorites`, …).
    pub fn pref(&self, field: &str) -> Option<&serde_json::Value> {
        self.snap.prefs.get(field)
    }

    /// Set a synced preference, at once here and on the server.
    #[allow(dead_code)] // the settings and favorites write path
    pub fn set_pref(&mut self, field: &str, value: serde_json::Value, cx: &mut Context<Self>) {
        Rc::make_mut(&mut self.snap)
            .prefs
            .insert(field.to_owned(), value.clone());
        self.send(Command::SetFields {
            kind: "preference".into(),
            id: crate::model::PREFERENCES_ID.into(),
            fields: vec![(field.to_owned(), value)],
        });
        cx.notify();
    }

    pub fn start_add(&mut self, target: AddTarget, window: &mut Window, cx: &mut Context<Self>) {
        self.adding = Some(target);
        self.input.update(cx, |i, cx| i.clear(cx));
        let handle = self.input.read(cx).focus_handle(cx);
        window.focus(&handle, cx);
        cx.notify();
    }

    fn submit_add(&mut self, text: String, cx: &mut Context<Self>) {
        let Some(target) = self.adding.clone() else {
            return;
        };
        if text.trim().is_empty() {
            self.adding = None;
        } else {
            self.send(Command::QuickAdd {
                text,
                project_id: target.project_id,
                section_id: target.section_id,
            });
            self.input.update(cx, |i, cx| i.clear(cx));
        }
        cx.notify();
    }

    pub fn go(&mut self, route: Route, cx: &mut Context<Self>) {
        self.route = route;
        self.adding = None;
        cx.notify();
    }

    /// A sidebar entry: `(id, label, icon)`, its icon's colour when not the default, and its route.
    fn nav_item(
        &self,
        (id, label, glyph): (&str, &str, &str),
        glyph_color: Option<gpui::Rgba>,
        route: Route,
        t: &Theme,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let on = self.route == route;
        let r = route.clone();
        div()
            .id(SharedString::from(format!("nav-{id}")))
            .mx(px(8.))
            .h(px(40.))
            .px(px(12.))
            .flex()
            .items_center()
            .gap(px(14.))
            .rounded(px(8.))
            .cursor_pointer()
            .when(on, |d| d.bg(t.selected))
            .when(!on, |d| d.hover(|s| s.bg(t.hover)))
            .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| this.go(r.clone(), cx)))
            .child(icon(
                glyph,
                20.,
                if on {
                    t.selected_text
                } else {
                    glyph_color.unwrap_or(t.muted)
                },
            ))
            .child(
                div()
                    .text_size(ts(16.))
                    .text_color(if on { t.selected_text } else { t.text_soft })
                    .when(on, |d| d.font_weight(FontWeight::SEMIBOLD))
                    .child(SharedString::from(label.to_owned())),
            )
            .into_any_element()
    }

    fn sidebar(&self, t: &Theme, cx: &mut Context<Self>) -> impl IntoElement {
        let live = self.snap.sync == SyncState::Live;
        let divider = || div().my(px(8.)).h(px(1.)).bg(t.border);
        let mut col = div()
            .id("sidebar")
            .w(px(288.))
            .h_full()
            .flex_none()
            .flex()
            .flex_col()
            .bg(t.sidebar)
            .border_r_1()
            .border_color(t.border)
            .overflow_y_scroll()
            .child(
                div()
                    .h(px(60.))
                    .px(px(16.))
                    .flex()
                    .items_center()
                    .justify_between()
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(8.))
                            .child(icon("globe", 18., t.accent_text))
                            .child(
                                div()
                                    .text_size(ts(18.))
                                    .font_weight(FontWeight::BOLD)
                                    .text_color(t.text)
                                    .child("Atlas Todo"),
                            ),
                    )
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(14.))
                            .child(
                                div()
                                    .flex()
                                    .items_center()
                                    .gap(px(6.))
                                    .child(crate::ui::dot(
                                        7.,
                                        if live { rgb(0x22c55e) } else { rgb(0xa3a3a3) },
                                    ))
                                    .child(div().text_size(ts(12.)).text_color(t.faint).child(
                                        match self.snap.sync {
                                            SyncState::Live => "Live",
                                            SyncState::Connecting => "Connecting",
                                            SyncState::Offline => "Offline",
                                        },
                                    )),
                            )
                            .child(icon("panel-left-close", 18., t.muted)),
                    ),
            )
            .child(div().h(px(2.)));
        let top = [
            ("today", "Today", "sun", Route::Today),
            ("upcoming", "Upcoming", "calendar-clock", Route::Upcoming),
            ("inbox", "Inbox", "inbox", Route::Inbox),
            ("assigned", "Assigned to me", "user-round", Route::Assigned),
            ("all", "All tasks", "list-todo", Route::All),
        ];
        for (id, label, glyph, route) in top {
            col = col.child(self.nav_item((id, label, glyph), None, route, t, cx));
        }
        col = col.child(divider());
        let views = [
            ("projects", "Projects", "hash", Route::Projects),
            ("calendar", "Calendar", "calendar-days", Route::Calendar),
            ("filters", "Filters", "list-filter", Route::Filters),
            (
                "notifications",
                "Notifications",
                "bell",
                Route::Notifications,
            ),
            ("focus", "Focus", "timer", Route::Focus),
            ("habits", "Habits", "flame", Route::Habits),
            ("stats", "Stats", "chart-column", Route::Stats),
            ("countdowns", "Countdowns", "clock", Route::Countdowns),
        ];
        for (id, label, glyph, route) in views {
            col = col.child(self.nav_item((id, label, glyph), None, route, t, cx));
        }
        col = col.child(divider());
        for p in self.snap.projects.iter().filter(|p| p.parent_id.is_none()) {
            let color = project_color(&p.id, &p.color);
            col = col.child(self.nav_item(
                (&p.id, &p.name, "hash"),
                Some(color),
                Route::Project(p.id.clone()),
                t,
                cx,
            ));
        }
        col.child(divider())
            .child(self.nav_item(
                ("completed", "Completed", "circle-check-big"),
                None,
                Route::Completed,
                t,
                cx,
            ))
            .child(
                div()
                    .id("nav-sign-out")
                    .mx(px(8.))
                    .h(px(40.))
                    .px(px(12.))
                    .flex()
                    .items_center()
                    .gap(px(14.))
                    .rounded(px(8.))
                    .cursor_pointer()
                    .hover(|d| d.bg(t.hover))
                    .on_click(cx.listener(|this, _: &ClickEvent, _, cx| {
                        this.send(Command::SignOut);
                        cx.notify();
                    }))
                    .child(icon("log-out", 20., t.muted))
                    .child(
                        div()
                            .text_size(ts(16.))
                            .text_color(t.text_soft)
                            .child("Sign out"),
                    ),
            )
    }

    /// The title row over a screen.
    pub fn header(
        &self,
        glyph: Option<(&str, gpui::Rgba)>,
        title: &str,
        right: AnyElement,
        t: &Theme,
    ) -> gpui::Div {
        div()
            .h(px(64.))
            .px(px(20.))
            .flex_none()
            .flex()
            .items_center()
            .justify_between()
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(10.))
                    .when_some(glyph, |d, (g, c)| d.child(icon(g, 22., c)))
                    .child(
                        div()
                            .text_size(ts(23.))
                            .font_weight(FontWeight::BOLD)
                            .text_color(t.text)
                            .child(SharedString::from(title.to_owned())),
                    ),
            )
            .child(right)
    }

    fn screen(&mut self, t: &Theme, window: &mut Window, cx: &mut Context<Self>) -> AnyElement {
        match self.route.clone() {
            Route::Project(id) => {
                if self.is_board(&id) {
                    board::project_board(self, &id, t, cx)
                } else {
                    list::project_list(self, &id, t, window, cx)
                }
            }
            Route::Upcoming => list::upcoming(self, t, window, cx),
            Route::Today => list::today(self, t, window, cx),
            Route::Inbox => list::simple(self, "Inbox", list::Simple::Inbox, t, window, cx),
            Route::Assigned => list::simple(
                self,
                "Assigned to me",
                list::Simple::Assigned,
                t,
                window,
                cx,
            ),
            Route::All => list::simple(self, "All tasks", list::Simple::All, t, window, cx),
            Route::Completed => {
                list::simple(self, "Completed", list::Simple::Completed, t, window, cx)
            }
            Route::Projects => list::projects(self, t, cx),
            Route::Calendar => calendar::calendar(self, t, cx),
            Route::Habits => habits::habits(self, t, cx),
            Route::Stats => stats::stats(self, t, cx),
            Route::Filters => list::placeholder(
                self,
                "Filters",
                "list-filter",
                "Saved filters are not in the GPUI app yet.",
                t,
            ),
            Route::Notifications => list::placeholder(
                self,
                "Notifications",
                "bell",
                "Notifications are not in the GPUI app yet.",
                t,
            ),
            Route::Focus => list::placeholder(
                self,
                "Focus",
                "timer",
                "The focus timer is not in the GPUI app yet.",
                t,
            ),
            Route::Countdowns => list::placeholder(
                self,
                "Countdowns",
                "clock",
                "Countdowns are not in the GPUI app yet.",
                t,
            ),
        }
    }
}

impl Render for AtlasApp {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let t = self.theme(window);
        let screen = self.screen(&t, window, cx);
        // Each screen (and a project's list and board) fades in, rising a little.
        let key = match &self.route {
            Route::Project(id) => format!("screen-{id}-{}", self.is_board(id)),
            other => format!("screen-{other:?}"),
        };
        let screen = crate::motion::enter(
            div().size_full().flex().flex_col().child(screen),
            SharedString::from(key),
            240,
            |el, v| el.opacity(v).mt(px((1. - v) * 10.)),
        );
        let modal = self
            .open_task
            .clone()
            .and_then(|id| detail::task_detail(self, &id, &t, window, cx));
        let menu = crate::context_menu::render(self, &t, cx);
        div()
            .size_full()
            .relative()
            .flex()
            .bg(t.bg)
            .font_family(crate::FONT)
            .text_color(t.text)
            .child(self.sidebar(&t, cx))
            .child(
                div()
                    .flex_1()
                    .h_full()
                    .min_w_0()
                    .flex()
                    .flex_col()
                    .child(screen),
            )
            .when_some(self.error.clone(), |d, e| {
                d.child(
                    div()
                        .absolute()
                        .bottom(px(16.))
                        .right(px(16.))
                        .max_w(px(420.))
                        .px(px(14.))
                        .py(px(10.))
                        .rounded(px(8.))
                        .bg(rgb(0x171717))
                        .text_color(rgb(0xfafafa))
                        .text_size(ts(13.))
                        .child(SharedString::from(e)),
                )
            })
            .when_some(modal, |d, m| d.child(m))
            .when_some(menu, |d, m| d.child(m))
    }
}

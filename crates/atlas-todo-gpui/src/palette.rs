//! The command palette (`CommandPalette.tsx`, Ctrl+K) and task search (`/`, the headers' search
//! icon). The palette ranks the views, projects, habits and a few actions with the web app's fuzzy
//! matcher (`fuzzy.ts`); when no command matches but task text does, it lists those tasks instead,
//! as the web's does. Search lists only tasks (`taskSearch.ts`), open ones unless completed are
//! asked for, each with its place and due date. Arrows move, Enter runs, Escape closes.

use gpui::{
    div, prelude::*, px, AnyElement, ClickEvent, Context, FontWeight, ScrollHandle, SharedString,
    Window,
};

use atlas_todo_rules::rules::task::{ms, Task};

use crate::app::{AtlasApp, Route};
use crate::format;
use crate::motion;
use crate::sync::Command;
use crate::theme::Theme;
use crate::ui::{check_circle, icon, ts};

/// Which list the overlay shows.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Mode {
    /// Commands, falling through to tasks.
    Commands,
    /// Tasks only.
    Search,
}

pub struct Palette {
    pub mode: Mode,
    /// The highlighted row.
    pub selected: usize,
    pub scroll: ScrollHandle,
}

/// An overlay to open at start (the screenshots' `--palette`, `--search`, … flags).
#[derive(Clone, Debug)]
pub enum StartOverlay {
    Palette(String),
    Search(String),
    QuickAdd(String),
    Shortcuts,
}

/// `TASK_SEARCH_LIMIT`, in the palette; search shows more.
const PALETTE_TASKS: usize = 20;
const SEARCH_TASKS: usize = 50;

/// `scoreMatch` of `fuzzy.ts`: `query`'s characters in order in `text`, contiguous and early runs
/// scoring higher; `None` when they are not all there.
pub fn score_match(text: &str, query: &str) -> Option<f64> {
    if query.is_empty() {
        return Some(0.);
    }
    let text: Vec<char> = text.to_lowercase().chars().collect();
    let mut ti = 0;
    let mut score = 0.;
    let mut streak = 0.;
    let mut first: Option<usize> = None;
    for ch in query.to_lowercase().chars() {
        let idx = (ti..text.len()).find(|&i| text[i] == ch)?;
        first.get_or_insert(idx);
        if idx == ti {
            streak += 1.;
            score += 2. + streak;
        } else {
            streak = 0.;
            score += 1.;
        }
        ti = idx + 1;
    }
    Some(score - first.unwrap_or(0) as f64 * 0.1)
}

/// What a command does.
#[derive(Clone, Debug, PartialEq)]
pub enum Action {
    Go(Route),
    QuickAdd,
    Search,
    Shortcuts,
    Theme(&'static str),
    SignOut,
    Quit,
}

#[derive(Clone, Debug)]
pub struct Cmd {
    pub label: String,
    pub keywords: String,
    pub hint: Option<&'static str>,
    pub action: Action,
}

/// The palette's commands (`useCommands.ts`): the views, then one per project and habit, then the
/// actions this app has.
pub fn commands(app: &AtlasApp) -> Vec<Cmd> {
    let view = |label: &str, route: Route| Cmd {
        label: label.to_owned(),
        keywords: "go to view".into(),
        hint: Some("Commands"),
        action: Action::Go(route),
    };
    let mut out = vec![
        view("Today", Route::Today),
        view("Upcoming", Route::Upcoming),
        view("Inbox", Route::Inbox),
        view("Assigned to me", Route::Assigned),
        view("All tasks", Route::All),
        view("Projects", Route::Projects),
        view("Calendar", Route::Calendar),
        view("Filters", Route::Filters),
        view("Notifications", Route::Notifications),
        view("Focus", Route::Focus),
        view("Habits", Route::Habits),
        view("Stats", Route::Stats),
        view("Countdowns", Route::Countdowns),
        view("Completed", Route::Completed),
    ];
    for p in &app.snap.projects {
        out.push(Cmd {
            label: format!("Open board: {}", p.name),
            keywords: format!("{} project board", p.name),
            hint: None,
            action: Action::Go(Route::Project(p.id.clone())),
        });
    }
    for h in &app.snap.habits {
        out.push(Cmd {
            label: format!("Open habit: {}", h.name),
            keywords: format!("{} habit streak", h.name),
            hint: None,
            action: Action::Go(Route::Habits),
        });
    }
    let action = |label: &str, keywords: &str, action: Action| Cmd {
        label: label.to_owned(),
        keywords: keywords.to_owned(),
        hint: Some("Actions"),
        action,
    };
    let dark = app.theme_dark;
    out.extend([
        action("Add a task", "new create quick add", Action::QuickAdd),
        action("Search tasks", "find", Action::Search),
        action("Keyboard shortcuts", "help hotkeys keys", Action::Shortcuts),
        if dark {
            action(
                "Use the light theme",
                "appearance theme light mode",
                Action::Theme("light"),
            )
        } else {
            action(
                "Use the dark theme",
                "appearance theme dark mode",
                Action::Theme("dark"),
            )
        },
        action("Sign out", "log out account", Action::SignOut),
        action("Quit", "exit close", Action::Quit),
    ]);
    out
}

/// `filterActions`: the commands matching `query`, best first (a keyword-only match a little
/// lower); all of them, in order, for a blank query.
pub fn filter_commands(query: &str, items: Vec<Cmd>) -> Vec<Cmd> {
    let q = query.trim();
    if q.is_empty() {
        return items;
    }
    let mut scored: Vec<(f64, usize, Cmd)> = items
        .into_iter()
        .enumerate()
        .filter_map(|(i, c)| {
            let label = score_match(&c.label, q);
            let kw = score_match(&c.keywords, q).map(|s| s - 1.);
            let best = match (label, kw) {
                (Some(l), Some(k)) => Some(l.max(k)),
                (l, k) => l.or(k),
            };
            best.map(|s| (s, i, c))
        })
        .collect();
    scored.sort_by(|a, b| b.0.total_cmp(&a.0).then(a.1.cmp(&b.1)));
    scored.into_iter().map(|(_, _, c)| c).collect()
}

/// `searchTasks`: a case-insensitive substring of the title or notes, title hits first.
pub fn search_tasks<'a>(tasks: &'a [Task], query: &str, limit: usize) -> Vec<&'a Task> {
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return Vec::new();
    }
    let mut scored: Vec<(f64, usize, &Task)> = tasks
        .iter()
        .enumerate()
        .filter_map(|(i, t)| {
            if t.title.to_lowercase().contains(&q) {
                Some((score_match(&t.title, &q).unwrap_or(0.) + 2., i, t))
            } else if t.notes.to_lowercase().contains(&q) {
                Some((score_match(&t.notes, &q).unwrap_or(0.), i, t))
            } else {
                None
            }
        })
        .collect();
    scored.sort_by(|a, b| b.0.total_cmp(&a.0).then(a.1.cmp(&b.1)));
    scored.into_iter().take(limit).map(|(_, _, t)| t).collect()
}

/// A row of the overlay's list.
pub enum Row {
    Cmd(Cmd),
    Task(Box<Task>),
}

/// The rows for the current query.
pub fn rows(app: &AtlasApp, mode: Mode, query: &str) -> Vec<Row> {
    let snap = &app.snap;
    match mode {
        Mode::Search => {
            let tasks: Vec<Task> = snap
                .tasks
                .iter()
                .filter(|t| app.search_completed || !t.is_completed)
                .cloned()
                .collect();
            search_tasks(&tasks, query, SEARCH_TASKS)
                .into_iter()
                .map(|t| Row::Task(Box::new(t.clone())))
                .collect()
        }
        Mode::Commands => {
            let cmds = filter_commands(query, commands(app));
            if !cmds.is_empty() {
                return cmds.into_iter().map(Row::Cmd).collect();
            }
            search_tasks(&snap.tasks, query, PALETTE_TASKS)
                .into_iter()
                .map(|t| Row::Task(Box::new(t.clone())))
                .collect()
        }
    }
}

/// "Project · due", or Inbox (`useTaskSearch`'s context), with the section in search.
fn context(app: &AtlasApp, task: &Task, section: bool) -> String {
    let (project, sec) = app.snap.place(task);
    let mut place = project.unwrap_or_else(|| "Inbox".into());
    if let (true, Some(s)) = (section, sec) {
        place = format!("{place} / {s}");
    }
    match task.due_at.as_ref() {
        Some(d) => format!("{place} · {}", format::due(ms(d), &app.snap.tz)),
        None => place,
    }
}

impl AtlasApp {
    /// Subscribe to the palette's and the add field's events (once, with the window).
    pub fn wire(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        use crate::input::{Cancel, Changed, Submit};
        let palette = self.palette_input.clone();
        cx.subscribe_in(&palette, window, |this, _, _: &Changed, _, cx| {
            if let Some(p) = &mut this.palette {
                p.selected = 0;
                p.scroll.scroll_to_item(0);
            }
            cx.notify();
        })
        .detach();
        cx.subscribe_in(&palette, window, |this, _, _: &Submit, window, cx| {
            this.palette_submit(window, cx)
        })
        .detach();
        cx.subscribe_in(&palette, window, |this, _, _: &Cancel, window, cx| {
            this.close_palette(cx);
            window.focus(&this.focus, cx);
        })
        .detach();
        let add = self.input.clone();
        cx.subscribe_in(&add, window, |this, _, _: &Changed, _, cx| {
            this.quick_add_changed(cx)
        })
        .detach();
        // After `submit_add` (subscribed first) has cleared the field.
        cx.subscribe_in(&add, window, |this, _, _: &Submit, _, cx| {
            this.quick_add_changed(cx)
        })
        .detach();
        cx.subscribe_in(&add, window, |this, _, _: &Cancel, window, cx| {
            this.adding = None;
            window.focus(&this.focus, cx);
            cx.notify();
        })
        .detach();
    }

    /// Give the focus back to the root when nothing has it, or a field it had is gone, so the
    /// shortcuts keep working.
    pub fn keep_focus(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let focused = |e: &gpui::Entity<crate::input::TextInput>, cx: &Context<Self>| {
            gpui::Focusable::focus_handle(e.read(cx), cx).is_focused(window)
        };
        let gone = (self.adding.is_none() && focused(&self.input, cx))
            || (self.palette.is_none() && focused(&self.palette_input, cx));
        if gone || window.focused(cx).is_none() {
            window.focus(&self.focus, cx);
        }
    }

    pub fn open_start_overlay(
        &mut self,
        o: StartOverlay,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        match o {
            StartOverlay::Palette(q) => {
                self.open_palette(Mode::Commands, window, cx);
                self.palette_input.update(cx, |i, cx| i.set_text(&q, cx));
            }
            StartOverlay::Search(q) => {
                self.open_palette(Mode::Search, window, cx);
                self.palette_input.update(cx, |i, cx| i.set_text(&q, cx));
            }
            StartOverlay::QuickAdd(text) => {
                if self.focus_quick_add(window, cx) {
                    self.input.update(cx, |i, cx| i.set_text(&text, cx));
                    self.quick_add_changed(cx);
                }
            }
            StartOverlay::Shortcuts => self.help_open = true,
        }
    }

    /// Open the palette or search, with an empty field.
    pub fn open_palette(&mut self, mode: Mode, window: &mut Window, cx: &mut Context<Self>) {
        self.help_open = false;
        self.adding = None;
        self.palette = Some(Palette {
            mode,
            selected: 0,
            scroll: ScrollHandle::new(),
        });
        self.palette_input.update(cx, |i, cx| {
            i.clear(cx);
            i.set_placeholder(
                match mode {
                    Mode::Commands => "Type a command or search tasks...",
                    Mode::Search => "Search tasks...",
                },
                cx,
            );
        });
        let handle = gpui::Focusable::focus_handle(self.palette_input.read(cx), cx);
        window.focus(&handle, cx);
        cx.notify();
    }

    pub fn close_palette(&mut self, cx: &mut Context<Self>) {
        self.palette = None;
        cx.notify();
    }

    /// Arrow keys: move the highlight, keeping it in view.
    pub fn palette_move(&mut self, by: isize, cx: &mut Context<Self>) {
        let Some(p) = &self.palette else { return };
        let query = self.palette_input.read(cx).text().to_owned();
        let n = rows(self, p.mode, &query).len();
        if let Some(p) = &mut self.palette {
            if n > 0 {
                p.selected = (p.selected as isize + by).rem_euclid(n as isize) as usize;
                p.scroll.scroll_to_item(p.selected);
            }
        }
        cx.notify();
    }

    /// Enter: run the highlighted row.
    pub fn palette_submit(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(p) = &self.palette else { return };
        let query = self.palette_input.read(cx).text().to_owned();
        let selected = p.selected;
        if let Some(row) = rows(self, p.mode, &query).into_iter().nth(selected) {
            self.run_row(row, window, cx);
        }
    }

    fn run_row(&mut self, row: Row, window: &mut Window, cx: &mut Context<Self>) {
        self.palette = None;
        match row {
            Row::Task(task) => self.open_task = Some(task.id),
            Row::Cmd(cmd) => match cmd.action {
                Action::Go(route) => self.go(route, cx),
                Action::QuickAdd => {
                    if !self.focus_quick_add(window, cx) {
                        self.go(Route::Inbox, cx);
                        self.focus_quick_add(window, cx);
                    }
                }
                Action::Search => self.open_palette(Mode::Search, window, cx),
                Action::Shortcuts => self.help_open = true,
                Action::Theme(theme) => self.set_pref("theme", theme.into(), cx),
                Action::SignOut => self.send(Command::SignOut),
                Action::Quit => cx.quit(),
            },
        }
        cx.notify();
    }
}

/// The headers' search icon: opens search.
pub fn search_button(t: &Theme, cx: &mut Context<AtlasApp>) -> AnyElement {
    div()
        .id("header-search")
        .p(px(4.))
        .rounded(px(6.))
        .cursor_pointer()
        .hover(|s| s.bg(t.hover))
        .on_click(cx.listener(|this, _: &ClickEvent, window, cx| {
            this.open_palette(Mode::Search, window, cx)
        }))
        .child(icon("search", 22., t.muted))
        .into_any_element()
}

/// The overlay, when open.
pub fn overlay(app: &AtlasApp, t: &Theme, cx: &mut Context<AtlasApp>) -> Option<AnyElement> {
    let p = app.palette.as_ref()?;
    let mode = p.mode;
    let query = app.palette_input.read(cx).text().to_owned();
    let rows = rows(app, mode, &query);
    let selected = p.selected.min(rows.len().saturating_sub(1));
    let showing_tasks = rows.first().is_some_and(|r| matches!(r, Row::Task(_)));

    let field = div()
        .flex()
        .items_center()
        .gap(px(10.))
        .px(px(14.))
        .py(px(12.))
        .border_b_1()
        .border_color(t.divider)
        .text_size(ts(15.))
        .child(icon("search", 16., t.muted))
        .child(div().flex_1().child(app.palette_input.clone()))
        .when(mode == Mode::Search, |d| {
            let on = app.search_completed;
            d.child(
                div()
                    .id("search-completed")
                    .flex()
                    .flex_none()
                    .items_center()
                    .gap(px(6.))
                    .px(px(8.))
                    .py(px(3.))
                    .rounded(px(6.))
                    .cursor_pointer()
                    .text_size(ts(12.))
                    .when(on, |d| d.bg(t.accent_soft).text_color(t.selected_text))
                    .when(!on, |d| d.text_color(t.muted).hover(|s| s.bg(t.hover)))
                    .on_click(cx.listener(|this, _: &ClickEvent, _, cx| {
                        this.search_completed = !this.search_completed;
                        if let Some(p) = &mut this.palette {
                            p.selected = 0;
                        }
                        cx.notify();
                    }))
                    .child(icon(
                        "circle-check-big",
                        13.,
                        if on { t.selected_text } else { t.muted },
                    ))
                    .child("Completed"),
            )
        });

    let mut list = div()
        .id("palette-list")
        .flex()
        .flex_col()
        .max_h(px(440.))
        .overflow_y_scroll()
        .track_scroll(&p.scroll);
    for (i, row) in rows.iter().enumerate() {
        let active = i == selected;
        let base = div()
            .id(SharedString::from(format!("palette-row-{i}")))
            .flex()
            .items_center()
            .gap(px(10.))
            .px(px(14.))
            .py(px(10.))
            .cursor_pointer()
            .text_size(ts(14.))
            .when(active, |d| d.bg(t.accent_soft))
            .when(!active, |d| d.hover(|s| s.bg(t.hover)))
            .on_click(cx.listener(move |this, _: &ClickEvent, window, cx| {
                let Some(p) = &this.palette else { return };
                let query = this.palette_input.read(cx).text().to_owned();
                if let Some(row) = self::rows(this, p.mode, &query).into_iter().nth(i) {
                    this.run_row(row, window, cx);
                }
            }));
        let label_color = if active { t.selected_text } else { t.text_soft };
        let el = match row {
            Row::Cmd(c) => base
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .truncate()
                        .text_color(label_color)
                        .child(SharedString::from(c.label.clone())),
                )
                .when_some(c.hint, |d, h| {
                    d.child(div().text_size(ts(12.)).text_color(t.muted).child(h))
                }),
            Row::Task(task) => {
                let search = mode == Mode::Search;
                let notes_hit = search
                    && !task
                        .title
                        .to_lowercase()
                        .contains(&query.trim().to_lowercase())
                    && !task.notes.is_empty();
                base.when(search, |d| {
                    d.child(check_circle(16., task.is_completed, t.circle, t))
                })
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .flex()
                        .flex_col()
                        .child(
                            div()
                                .truncate()
                                .text_color(if task.is_completed {
                                    t.faint
                                } else {
                                    label_color
                                })
                                .when(task.is_completed, |d| d.line_through())
                                .child(SharedString::from(task.title.clone())),
                        )
                        .when(notes_hit, |d| {
                            d.child(
                                div()
                                    .truncate()
                                    .text_size(ts(12.))
                                    .text_color(t.faint)
                                    .child(SharedString::from(task.notes.replace('\n', " "))),
                            )
                        }),
                )
                .child(
                    div()
                        .flex_none()
                        .text_size(ts(12.))
                        .text_color(t.muted)
                        .child(SharedString::from(context(app, task, search))),
                )
            }
        };
        list = list.child(el);
    }

    let empty = if rows.is_empty() {
        let text = match mode {
            Mode::Commands => "No matching commands or tasks",
            Mode::Search if query.trim().is_empty() => {
                "Type to search your tasks' titles and notes"
            }
            Mode::Search => "No matching tasks",
        };
        Some(
            div()
                .px(px(14.))
                .py(px(24.))
                .flex()
                .justify_center()
                .text_size(ts(14.))
                .text_color(t.muted)
                .child(text),
        )
    } else {
        None
    };

    let panel = div()
        .id("palette")
        .key_context("Palette")
        .on_action(cx.listener(|this, _: &crate::shortcuts::Up, _, cx| this.palette_move(-1, cx)))
        .on_action(cx.listener(|this, _: &crate::shortcuts::Down, _, cx| this.palette_move(1, cx)))
        .w_full()
        .max_w(px(640.))
        .flex()
        .flex_col()
        .rounded(px(12.))
        .border_1()
        .border_color(t.border)
        .bg(t.surface)
        .shadow_2xl()
        .overflow_hidden()
        .on_click(|_, _, cx| cx.stop_propagation())
        .child(field)
        .when(showing_tasks && mode == Mode::Commands, |d| {
            d.child(
                div()
                    .px(px(14.))
                    .pt(px(12.))
                    .pb(px(4.))
                    .text_size(ts(12.))
                    .font_weight(FontWeight::MEDIUM)
                    .text_color(t.muted)
                    .child("TASKS"),
            )
        })
        .child(list)
        .children(empty);
    let panel = motion::enter(
        panel,
        SharedString::from(format!("palette-in-{mode:?}")),
        220,
        |el, v| el.opacity(v).mt(px((1. - v) * -12.)),
    );
    let backdrop = div()
        .id("palette-backdrop")
        .absolute()
        .inset_0()
        .occlude()
        .flex()
        .flex_col()
        .items_center()
        .pt(gpui::relative(0.12))
        .px(px(12.))
        .bg(t.overlay)
        .on_click(cx.listener(|this, _: &ClickEvent, _, cx| this.close_palette(cx)))
        .child(panel);
    Some(motion::enter(
        backdrop,
        SharedString::from(format!("palette-fade-{mode:?}")),
        160,
        |el, v| el.opacity(v),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scores_like_fuzzy_ts() {
        assert_eq!(score_match("Today", ""), Some(0.));
        assert!(score_match("Today", "tdy").is_some());
        assert!(score_match("Today", "yt").is_none());
        // Contiguous beats scattered; earlier beats later.
        assert!(score_match("Inbox", "inb") > score_match("Ignore ben", "inb"));
    }

    #[test]
    fn keyword_matches_rank_below_label_matches() {
        let cmd = |label: &str, kw: &str| Cmd {
            label: label.into(),
            keywords: kw.into(),
            hint: None,
            action: Action::Quit,
        };
        let out = filter_commands(
            "cal",
            vec![cmd("Today", "calendar day"), cmd("Calendar", "go to view")],
        );
        assert_eq!(out[0].label, "Calendar");
        assert_eq!(out.len(), 2);
    }
}

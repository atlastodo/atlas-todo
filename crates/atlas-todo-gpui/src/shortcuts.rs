//! The keyboard shortcuts (`hotkeys.ts`, `useHotkeys.web.ts`) and their help (`ShortcutsHelp.tsx`).
//!
//! The single keys are bound in the `AtlasApp && !TextInput` context, so they are inert while a text
//! field has focus; Ctrl+K and Escape work there too. While a dialog or overlay is open only Escape
//! (which closes it) and Ctrl+Q act, as the web app ignores its hotkeys under a modal. Ctrl+Q quits
//! (`isQuitShortcut` in `apps/electron/src/shortcuts.ts`).

use gpui::{
    actions, div, prelude::*, px, AnyElement, App, ClickEvent, Context, FontWeight, KeyBinding,
    SharedString, Window,
};

use crate::app::{AddTarget, AtlasApp, Route};
use crate::motion;
use crate::palette::Mode;
use crate::theme::Theme;
use crate::ui::{icon, ts};

actions!(
    atlas,
    [QuickAdd, Search, Palette, Help, Close, Quit, Up, Down]
);

/// The app's bindings; `Quit` is handled app-wide, so it works on any screen.
pub fn bind_keys(cx: &mut App) {
    let keys = Some("AtlasApp && !TextInput");
    let app = Some("AtlasApp");
    cx.bind_keys([
        KeyBinding::new("a", QuickAdd, keys),
        KeyBinding::new("q", QuickAdd, keys),
        KeyBinding::new("/", Search, keys),
        KeyBinding::new("?", Help, keys),
        KeyBinding::new("ctrl-k", Palette, app),
        KeyBinding::new("escape", Close, app),
        KeyBinding::new("up", Up, Some("Palette")),
        KeyBinding::new("down", Down, Some("Palette")),
        KeyBinding::new("ctrl-p", Up, Some("Palette")),
        KeyBinding::new("ctrl-n", Down, Some("Palette")),
        KeyBinding::new("ctrl-q", Quit, None),
    ]);
    cx.on_action(|_: &Quit, cx| cx.quit());
}

/// The help's rows: `(group, [(keys, what)])`, the web's table less what this app does not have.
/// A group of the help: its title and `(keys, what)` rows.
type HelpGroup = (
    &'static str,
    &'static [(&'static [&'static str], &'static str)],
);

const HELP: &[HelpGroup] = &[
    (
        "Global & Search",
        &[
            (&["Ctrl", "K"], "Command palette"),
            (&["/"], "Search tasks"),
            (&["?"], "Keyboard shortcuts help"),
            (&["Ctrl", "Q"], "Quit"),
        ],
    ),
    (
        "Task Actions",
        &[
            (&["A", "Q"], "Focus quick-add"),
            (&["Esc"], "Close dialog / cancel"),
        ],
    ),
    (
        "Command Palette",
        &[
            (&["↑", "↓"], "Move the highlight"),
            (&["Enter"], "Run, or open the task"),
        ],
    ),
];

impl AtlasApp {
    /// A dialog or overlay is on top: the single-key shortcuts do nothing.
    pub fn modal_open(&self) -> bool {
        self.help_open || self.palette.is_some() || self.open_task.is_some()
    }

    /// The current screen's quick-add field (its first, on a project), if it has one.
    fn quick_add_target(&self) -> Option<AddTarget> {
        let target = |key: &str, project: Option<&str>, section: Option<&str>| AddTarget {
            key: key.to_owned(),
            project_id: project.map(str::to_owned),
            section_id: section.map(str::to_owned),
        };
        Some(match &self.route {
            Route::Today => target("today", None, None),
            Route::Upcoming => target("upcoming", None, None),
            Route::Inbox => target("Inbox", None, None),
            Route::Assigned => target("Assigned to me", None, None),
            Route::All => target("All tasks", None, None),
            Route::Project(pid) => {
                let snap = &self.snap;
                let loose = !snap
                    .open_roots(|t| t.project_id.as_deref() == Some(pid) && t.section_id.is_none())
                    .is_empty();
                let first = snap.sections_of(pid).first().map(|s| s.id.clone());
                if self.is_board(pid) {
                    match (loose, first) {
                        (true, _) => target("board-", Some(pid), None),
                        (false, Some(s)) => target(&format!("board-{s}"), Some(pid), Some(&s)),
                        (false, None) => return None,
                    }
                } else {
                    match first {
                        Some(s) if !loose && !self.collapsed.contains(&s) => {
                            target(&s, Some(pid), Some(&s))
                        }
                        Some(_) if !loose => return None,
                        _ => target(&format!("{pid}-none"), Some(pid), None),
                    }
                }
            }
            _ => return None,
        })
    }

    /// Open the current screen's quick-add field; `false` when it has none.
    pub fn focus_quick_add(&mut self, window: &mut Window, cx: &mut Context<Self>) -> bool {
        match self.quick_add_target() {
            Some(target) => {
                self.start_add(target, window, cx);
                self.quick_add_changed(cx);
                true
            }
            None => false,
        }
    }

    /// Escape: the topmost of help, palette, task dialog and quick add closes.
    pub fn close_top(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.help_open {
            self.help_open = false;
        } else if self.palette.is_some() {
            self.palette = None;
        } else if self.open_task.is_some() {
            self.open_task = None;
        } else if self.adding.is_some() {
            self.adding = None;
        }
        window.focus(&self.focus, cx);
        cx.notify();
    }
}

/// The shortcuts' handlers, on the window's root.
pub fn handlers(root: gpui::Div, cx: &mut Context<AtlasApp>) -> gpui::Div {
    root.on_action(cx.listener(|this, _: &QuickAdd, window, cx| {
        if !this.modal_open() {
            this.focus_quick_add(window, cx);
        }
    }))
    .on_action(cx.listener(|this, _: &Search, window, cx| {
        if !this.modal_open() {
            this.open_palette(Mode::Search, window, cx);
        }
    }))
    .on_action(cx.listener(|this, _: &Palette, window, cx| {
        if this
            .palette
            .as_ref()
            .is_some_and(|p| p.mode == Mode::Commands)
        {
            this.close_palette(cx);
            window.focus(&this.focus, cx);
        } else if !this.help_open && this.open_task.is_none() {
            this.open_palette(Mode::Commands, window, cx);
        }
    }))
    .on_action(cx.listener(|this, _: &Help, _, cx| {
        if !this.modal_open() {
            this.help_open = true;
            cx.notify();
        }
    }))
    .on_action(cx.listener(|this, _: &Close, window, cx| this.close_top(window, cx)))
}

fn keycap(label: &str, t: &Theme) -> AnyElement {
    div()
        .min_w(px(28.))
        .px(px(8.))
        .py(px(3.))
        .flex()
        .justify_center()
        .rounded(px(6.))
        .border_1()
        .border_color(if t.dark {
            gpui::rgb(0x404040)
        } else {
            gpui::rgb(0xd4d4d4)
        })
        .bg(if t.dark {
            gpui::rgb(0x262626)
        } else {
            gpui::rgb(0xf5f5f5)
        })
        .shadow_sm()
        .text_size(ts(if label.chars().count() == 1 { 14. } else { 12. }))
        .font_weight(FontWeight::SEMIBOLD)
        .text_color(t.text_soft)
        .child(SharedString::from(label.to_owned()))
        .into_any_element()
}

/// The `?` overlay: the shortcuts by group, closed by Escape, its X or a click beside it.
pub fn help(app: &AtlasApp, t: &Theme, cx: &mut Context<AtlasApp>) -> Option<AnyElement> {
    if !app.help_open {
        return None;
    }
    let mut body = div()
        .flex()
        .flex_col()
        .gap(px(20.))
        .px(px(20.))
        .pt(px(16.))
        .pb(px(24.));
    for (group, rows) in HELP {
        let mut card = div()
            .flex()
            .flex_col()
            .p(px(16.))
            .rounded(px(12.))
            .border_1()
            .border_color(t.border)
            .bg(t.bg)
            .child(
                div()
                    .mb(px(8.))
                    .text_size(ts(12.))
                    .font_weight(FontWeight::BOLD)
                    .text_color(t.accent_text)
                    .child(SharedString::from(group.to_uppercase())),
            );
        for (i, (keys, what)) in rows.iter().enumerate() {
            card = card.child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .py(px(9.))
                    .when(i + 1 < rows.len(), |d| {
                        d.border_b_1().border_color(t.divider)
                    })
                    .child(
                        div()
                            .text_size(ts(14.))
                            .text_color(t.text_soft)
                            .child(SharedString::from(*what)),
                    )
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(4.))
                            .children(keys.iter().map(|k| keycap(k, t))),
                    ),
            );
        }
        body = body.child(card);
    }
    let panel = div()
        .id("shortcuts")
        .w_full()
        .max_w(px(560.))
        .max_h(gpui::relative(0.84))
        .flex()
        .flex_col()
        .rounded(px(16.))
        .border_1()
        .border_color(t.border)
        .bg(t.surface)
        .shadow_2xl()
        .overflow_hidden()
        .on_click(|_, _, cx| cx.stop_propagation())
        .child(
            div()
                .flex()
                .items_center()
                .justify_between()
                .px(px(20.))
                .py(px(14.))
                .border_b_1()
                .border_color(t.divider)
                .child(
                    div()
                        .text_size(ts(17.))
                        .font_weight(FontWeight::SEMIBOLD)
                        .child("Keyboard Shortcuts"),
                )
                .child(
                    div()
                        .id("shortcuts-close")
                        .cursor_pointer()
                        .on_click(cx.listener(|this, _: &ClickEvent, _, cx| {
                            this.help_open = false;
                            cx.notify();
                        }))
                        .child(icon("x", 18., t.muted)),
                ),
        )
        .child(
            div()
                .id("shortcuts-body")
                .flex_1()
                .min_h_0()
                .overflow_y_scroll()
                .child(body),
        );
    let panel = motion::enter(panel, "shortcuts-in", 260, |el, v| {
        el.opacity(v).mt(px((1. - v) * 20.))
    });
    let backdrop = div()
        .id("shortcuts-backdrop")
        .absolute()
        .inset_0()
        .occlude()
        .flex()
        .items_center()
        .justify_center()
        .px(px(12.))
        .bg(t.overlay)
        .on_click(cx.listener(|this, _: &ClickEvent, _, cx| {
            this.help_open = false;
            cx.notify();
        }))
        .child(panel);
    Some(motion::enter(backdrop, "shortcuts-fade", 180, |el, v| {
        el.opacity(v)
    }))
}

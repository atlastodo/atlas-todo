//! `atlas-todo-gpui`: an experimental native desktop app for Atlas Todo on GPUI, Zed's
//! GPU-accelerated UI framework. It signs in with an email and password (or an API token), syncs
//! end-to-end encrypted through `atlas-client`, and applies the todo rules from `atlas-todo-rules`,
//! like the `atlas-todo` CLI.
//!
//! ```text
//! atlas-todo-gpui [--server URL --token TOKEN] [--dark|--light] [--view VIEW] [--task TITLE]
//! atlas-todo-gpui --screenshot out.png ...   (with the `screenshots` feature: render offscreen)
//! ```
//!
//! VIEW is `today`, `upcoming`, `inbox`, `calendar`, `habits`, `stats`, … or `project:NAME` /
//! `board:NAME`. The server and token also come from `ATLAS_SERVER` / `ATLAS_TOKEN`. Without a
//! token the window signs in with a password; the session (its refresh token and keys) is kept in
//! the system's secret store, and the server and email in `$XDG_CONFIG_HOME/atlas-todo-gpui`.

mod app;
mod board;
mod calendar;
mod countdowns;
mod desktop;
mod detail;
mod focus;
mod format;
mod habits;
mod input;
mod list;
mod model;
mod motion;
mod notify;
mod remind;
mod secrets;
mod stats;
mod sync;
mod theme;
mod tour;
mod ui;

use std::borrow::Cow;
use std::path::PathBuf;

use gpui::{
    div, prelude::*, px, size, App, AssetSource, Bounds, ClickEvent, Context, Entity, Focusable,
    FontWeight, SharedString, TitlebarOptions, Window, WindowBounds, WindowOptions,
};

use crate::app::{AtlasApp, Route};
use crate::input::TextInput;
use crate::model::{Snapshot, SyncState};
use crate::sync::Account;
use crate::theme::Theme;
use crate::ui::ts;

/// Noto Sans, the web app's font as Chromium resolves it on Linux, as static weights
/// (`assets/fonts`, made by `scripts/fonts.py`).
pub const FONT: &str = "Atlas Sans";

/// The Wayland app id (and X11 class): what desktops match the `.desktop` entry and icon by.
pub const APP_ID: &str = "dev.atlastodo.gpui";

/// Register the bundled font with GPUI's text system.
fn load_fonts(cx: &mut App) {
    let fonts = Assets::iter()
        .filter(|p| p.starts_with("fonts/") && p.ends_with(".ttf"))
        .filter_map(|p| Assets::get(&p).map(|f| f.data))
        .collect();
    if let Err(e) = cx.text_system().add_fonts(fonts) {
        eprintln!("could not load the bundled fonts: {e}");
    }
}

pub fn now_ms() -> i64 {
    atlas_client::store::now_ms() as i64
}

#[derive(rust_embed::RustEmbed)]
#[folder = "assets"]
struct Assets;

impl AssetSource for Assets {
    fn load(&self, path: &str) -> gpui::Result<Option<Cow<'static, [u8]>>> {
        Ok(Self::get(path).map(|f| f.data))
    }

    fn list(&self, path: &str) -> gpui::Result<Vec<SharedString>> {
        Ok(Self::iter()
            .filter(|p| p.starts_with(path))
            .map(SharedString::from)
            .collect())
    }
}

#[derive(Default, Clone)]
struct Args {
    server: Option<String>,
    token: Option<String>,
    dark: Option<bool>,
    view: Option<String>,
    task: Option<String>,
    screenshot: Option<PathBuf>,
}

fn parse_args() -> Args {
    let mut a = Args::default();
    let mut it = std::env::args().skip(1);
    while let Some(arg) = it.next() {
        match arg.as_str() {
            "--server" => a.server = it.next(),
            "--token" => a.token = it.next(),
            "--dark" => a.dark = Some(true),
            "--light" => a.dark = Some(false),
            "--view" => a.view = it.next(),
            "--task" => a.task = it.next(),
            "--screenshot" => a.screenshot = it.next().map(PathBuf::from),
            "-h" | "--help" => {
                println!(
                    "atlas-todo-gpui [--server URL --token TOKEN] [--dark|--light] [--view VIEW] [--task TITLE] [--screenshot OUT.png]"
                );
                std::process::exit(0);
            }
            other => {
                eprintln!("unknown argument: {other}");
                std::process::exit(2);
            }
        }
    }
    a.server = a.server.or_else(|| std::env::var("ATLAS_SERVER").ok());
    a.token = a.token.or_else(|| std::env::var("ATLAS_TOKEN").ok());
    a
}

/// `$XDG_CONFIG_HOME/atlas-todo-gpui`.
pub fn config_dir() -> Option<PathBuf> {
    let base = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))?;
    Some(base.join("atlas-todo-gpui"))
}

/// A token account from the token sign-in of an earlier build (`account.json`).
fn saved_token_account() -> Option<Account> {
    let text = std::fs::read_to_string(config_dir()?.join("account.json")).ok()?;
    let v: serde_json::Value = serde_json::from_str(&text).ok()?;
    Some(Account::Token {
        server: v.get("server")?.as_str()?.to_owned(),
        token: v.get("token")?.as_str()?.to_owned(),
    })
}

/// The server and email of the last sign-in, to fill the form with (nothing secret).
fn last_sign_in() -> (String, String) {
    let v: serde_json::Value = config_dir()
        .and_then(|d| std::fs::read_to_string(d.join("sign-in.json")).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default();
    let get = |k: &str| v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_owned();
    (get("server"), get("email"))
}

fn remember_sign_in(server: &str, email: &str) {
    if let Some(dir) = config_dir() {
        let _ = std::fs::create_dir_all(&dir);
        let body = serde_json::json!({ "server": server, "email": email }).to_string();
        let _ = std::fs::write(dir.join("sign-in.json"), body);
    }
}

/// `--view` as a route, against the loaded projects.
fn route_for(view: &str, snap: &Snapshot) -> Option<(Route, Option<bool>)> {
    let project = |name: &str| {
        snap.projects
            .iter()
            .find(|p| p.name.eq_ignore_ascii_case(name))
            .map(|p| Route::Project(p.id.clone()))
    };
    if let Some(name) = view.strip_prefix("project:") {
        return project(name).map(|r| (r, Some(false)));
    }
    if let Some(name) = view.strip_prefix("board:") {
        return project(name).map(|r| (r, Some(true)));
    }
    let r = match view {
        "today" => Route::Today,
        "upcoming" => Route::Upcoming,
        "inbox" => Route::Inbox,
        "assigned" => Route::Assigned,
        "all" => Route::All,
        "completed" => Route::Completed,
        "projects" => Route::Projects,
        "calendar" => Route::Calendar,
        "filters" => Route::Filters,
        "notifications" => Route::Notifications,
        "focus" => Route::Focus,
        "habits" => Route::Habits,
        "stats" => Route::Stats,
        "countdowns" => Route::Countdowns,
        _ => return None,
    };
    Some((r, None))
}

/// Apply `--view`, `--task` and `--dark` to a fresh app; the first two wait for the first sync when
/// nothing is loaded yet.
fn configure(app: &mut AtlasApp, args: &Args) {
    app.force_dark = args.dark;
    if app.snap.sync != SyncState::Live && (args.view.is_some() || args.task.is_some()) {
        let args = args.clone();
        app.pending = Some(Box::new(move |app| navigate(app, &args)));
    } else {
        navigate(app, args);
    }
}

fn navigate(app: &mut AtlasApp, args: &Args) {
    if let Some(view) = &args.view {
        match route_for(view, &app.snap) {
            Some((route, board)) => {
                if let (Route::Project(id), Some(b)) = (&route, board) {
                    app.set_board(id, b);
                }
                app.route = route;
            }
            None => eprintln!("unknown view: {view}"),
        }
    }
    if let Some(title) = &args.task {
        app.open_task = app
            .snap
            .tasks
            .iter()
            .find(|t| t.title == *title)
            .map(|t| t.id.clone());
    }
}

/// The window's root: the sign-in screen, then the app, and back on sign-out.
struct Root {
    view: gpui::AnyView,
}

impl Render for Root {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        self.view.clone()
    }
}

impl Root {
    fn show_app(&mut self, account: Account, args: &Args, cx: &mut Context<Self>) {
        let app = start(account, args, cx);
        cx.subscribe(&app, |root: &mut Root, _, ev: &app::SignedOut, cx| {
            let message = (!ev.0.is_empty()).then(|| ev.0.clone());
            root.show_sign_in(message, cx);
        })
        .detach();
        self.view = app.into();
        cx.notify();
    }

    fn show_sign_in(&mut self, error: Option<String>, cx: &mut Context<Self>) {
        let root = cx.weak_entity();
        self.view = cx.new(|cx| SignIn::new(root, error, cx)).into();
        cx.notify();
    }
}

/// Email and password, as the app signs in. The password goes no further than the sign-in
/// (which sends only what it derives); the session it opens is kept in the secret store.
struct SignIn {
    root: gpui::WeakEntity<Root>,
    server: Entity<TextInput>,
    email: Entity<TextInput>,
    password: Entity<TextInput>,
    error: Option<String>,
    focused: bool,
    /// The field to focus at the next render.
    focus_next: Option<usize>,
}

impl SignIn {
    fn new(root: gpui::WeakEntity<Root>, error: Option<String>, cx: &mut Context<Self>) -> Self {
        let (last_server, last_email) = last_sign_in();
        let with = |placeholder: &str, value: String, cx: &mut Context<Self>| {
            cx.new(|cx| {
                let mut i = TextInput::new(placeholder, cx);
                i.set_text(&value, cx);
                i
            })
        };
        let server = with("https://app.atlastodo.dev", last_server, cx);
        let email = with("you@example.com", last_email, cx);
        let password = cx.new(|cx| {
            let mut i = TextInput::new("Password", cx);
            i.masked = true;
            i
        });
        // Enter moves on to the next field, and signs in from the password.
        cx.subscribe(&server, |this: &mut Self, _, _: &input::Submit, cx| {
            this.focus_next = Some(1);
            cx.notify();
        })
        .detach();
        cx.subscribe(&email, |this: &mut Self, _, _: &input::Submit, cx| {
            this.focus_next = Some(2);
            cx.notify();
        })
        .detach();
        cx.subscribe(&password, |this: &mut Self, _, _: &input::Submit, cx| {
            this.sign_in(cx);
        })
        .detach();
        Self {
            root,
            server,
            email,
            password,
            error,
            focused: false,
            focus_next: None,
        }
    }

    fn sign_in(&mut self, cx: &mut Context<Self>) {
        let read = |e: &Entity<TextInput>, cx: &Context<Self>| e.read(cx).text().to_owned();
        let server = read(&self.server, cx).trim().to_owned();
        let email = read(&self.email, cx).trim().to_owned();
        let password = read(&self.password, cx);
        if server.is_empty() || email.is_empty() || password.is_empty() {
            self.error = Some("Enter your server, email and password.".into());
            cx.notify();
            return;
        }
        remember_sign_in(&server, &email);
        let account = Account::Login {
            server,
            email,
            password,
        };
        let root = self.root.clone();
        cx.defer(move |cx| {
            let _ = root.update(cx, |r, cx| r.show_app(account, &Args::default(), cx));
        });
    }
}

impl Render for SignIn {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        // The first empty field takes the focus; Enter moves it on.
        let fields = [&self.server, &self.email, &self.password];
        if !self.focused {
            self.focused = true;
            let first = fields
                .iter()
                .position(|f| f.read(cx).text().is_empty())
                .unwrap_or(2);
            self.focus_next = Some(first);
        }
        if let Some(i) = self.focus_next.take() {
            let handle = fields[i].read(cx).focus_handle(cx);
            window.focus(&handle, cx);
        }
        let t = if matches!(
            window.appearance(),
            gpui::WindowAppearance::Dark | gpui::WindowAppearance::VibrantDark
        ) {
            Theme::dark()
        } else {
            Theme::light()
        };
        let field = |label: &'static str, input: Entity<TextInput>| {
            div()
                .flex()
                .flex_col()
                .gap(px(6.))
                .child(div().text_size(ts(13.)).text_color(t.muted).child(label))
                .child(
                    div()
                        .h(px(40.))
                        .px(px(12.))
                        .flex()
                        .items_center()
                        .rounded(px(8.))
                        .border_1()
                        .border_color(t.border)
                        .text_size(ts(15.))
                        .child(input),
                )
        };
        div()
            .size_full()
            .flex()
            .items_center()
            .justify_center()
            .bg(t.bg)
            .font_family(FONT)
            .text_color(t.text)
            .child(motion::enter(
                div()
                    .w(px(420.))
                    .flex()
                    .flex_col()
                    .gap(px(16.))
                    .p(px(28.))
                    .rounded(px(16.))
                    .border_1()
                    .border_color(t.border)
                    .bg(t.surface)
                    .shadow_lg()
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(10.))
                            .child(ui::icon("globe", 22., t.accent_text))
                            .child(
                                div()
                                    .text_size(ts(22.))
                                    .font_weight(FontWeight::BOLD)
                                    .child("Atlas Todo"),
                            ),
                    )
                    .child(
                        div()
                            .text_size(ts(14.))
                            .text_color(t.muted)
                            .child("Sign in with your Atlas account."),
                    )
                    .child(field("Server", self.server.clone()))
                    .child(field("Email", self.email.clone()))
                    .child(field("Password", self.password.clone()))
                    .when_some(self.error.clone(), |d, e| {
                        d.child(
                            div()
                                .text_size(ts(13.))
                                .text_color(gpui::rgb(theme::RED))
                                .child(SharedString::from(e)),
                        )
                    })
                    .child(
                        div()
                            .id("sign-in")
                            .h(px(40.))
                            .flex()
                            .items_center()
                            .justify_center()
                            .rounded(px(8.))
                            .bg(t.accent)
                            .text_color(t.on_accent)
                            .font_weight(FontWeight::SEMIBOLD)
                            .cursor_pointer()
                            .on_click(cx.listener(|this, _: &ClickEvent, _, cx| this.sign_in(cx)))
                            .child("Sign in"),
                    ),
                "signin",
                300,
                |el, v| el.opacity(v).mt(px((1. - v) * 16.)),
            ))
    }
}

/// The app over a live account: the sync worker, and the view.
fn start(account: Account, args: &Args, cx: &mut App) -> Entity<AtlasApp> {
    let (utx, urx) = async_channel::unbounded();
    let tx = sync::spawn(account, utx);
    let snap = Snapshot::empty(
        atlas_client::zoned::resolve_time_zone(None),
        SyncState::Connecting,
    );
    cx.new(|cx| {
        let mut app = AtlasApp::new(snap, Some(tx), Some(urx), now_ms(), cx);
        configure(&mut app, args);
        if std::env::var_os("ATLAS_GPUI_TOUR").is_some() {
            tour::start(cx);
        }
        app
    })
}

/// How this run signs in: `--token`/`ATLAS_TOKEN`, else the session in the secret store, else an
/// earlier build's token, else the sign-in screen (`None`).
fn initial_account(args: &Args) -> Option<Account> {
    if let (Some(server), Some(token)) = (args.server.clone(), args.token.clone()) {
        return Some(Account::Token { server, token });
    }
    secrets::load()
        .map(Account::Saved)
        .or_else(saved_token_account)
}

fn main() {
    let args = parse_args();

    if let Some(out) = args.screenshot.clone() {
        let Some(account) = initial_account(&args) else {
            eprintln!("--screenshot needs --server and --token");
            std::process::exit(2);
        };
        if let Err(e) = screenshot(&account, &args, &out) {
            eprintln!("screenshot failed: {e}");
            std::process::exit(1);
        }
        return;
    }

    desktop::install_entry();
    gpui_platform::application()
        .with_assets(Assets)
        .run(move |cx: &mut App| {
            load_fonts(cx);
            input::bind_keys(cx);
            let account = initial_account(&args);
            let root = cx.new(|cx: &mut Context<Root>| {
                let mut root = Root {
                    view: cx.new(|_| Blank).into(),
                };
                match account {
                    Some(account) => root.show_app(account, &args, cx),
                    None => root.show_sign_in(None, cx),
                }
                root
            });
            open_window(root.clone(), cx);
            // With a tray, closing the window leaves the app (and its sync) in the tray, which
            // opens it again or quits; without one, closing quits.
            match desktop::spawn_tray() {
                Some(events) => {
                    cx.spawn(async move |cx| {
                        while let Ok(event) = events.recv().await {
                            let root = root.clone();
                            cx.update(|cx| match event {
                                desktop::TrayEvent::Open => {
                                    if let Some(window) = cx.windows().into_iter().next() {
                                        let _ = window
                                            .update(cx, |_, window, _| window.activate_window());
                                    } else {
                                        open_window(root, cx);
                                    }
                                }
                                desktop::TrayEvent::Quit => cx.quit(),
                            });
                        }
                    })
                    .detach();
                }
                None => cx.on_window_closed(|cx, _| cx.quit()).detach(),
            }
            cx.activate(true);
        });
}

/// Nothing, while the window's first view is made.
struct Blank;

impl Render for Blank {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        div()
    }
}

/// The window, around the root view (kept between windows when the app lives in the tray).
fn open_window(root: Entity<Root>, cx: &mut App) {
    let bounds = Bounds::centered(None, size(px(1280.), px(800.)), cx);
    let opts = WindowOptions {
        window_bounds: Some(WindowBounds::Windowed(bounds)),
        titlebar: Some(TitlebarOptions {
            title: Some("Atlas Todo".into()),
            ..Default::default()
        }),
        app_id: Some(APP_ID.into()),
        ..Default::default()
    };
    if let Err(e) = cx.open_window(opts, |_, _| root) {
        eprintln!("could not open the window: {e}");
    }
}

#[cfg(feature = "screenshots")]
fn screenshot(account: &Account, args: &Args, out: &std::path::Path) -> Result<(), String> {
    use std::sync::Arc;
    motion::disable();
    let snap = sync::load_once(account)?;
    let text_system = Arc::new(gpui_wgpu::CosmicTextSystem::new(FONT));
    let mut cx = gpui::HeadlessAppContext::with_platform(text_system, Arc::new(Assets), || {
        gpui_platform::current_headless_renderer()
    });
    cx.update(|cx| {
        load_fonts(cx);
        input::bind_keys(cx);
    });
    let window = cx
        .open_window(size(px(1280.), px(800.)), |_, cx| {
            cx.new(|cx| {
                let mut app = AtlasApp::new(snap, None, None, now_ms(), cx);
                configure(&mut app, args);
                app
            })
        })
        .map_err(|e| e.to_string())?;
    cx.run_until_parked();
    let _ = cx.update_window(window.into(), |_, window, _| window.refresh());
    cx.run_until_parked();
    let image = cx
        .capture_screenshot(window.into())
        .map_err(|e| e.to_string())?;
    image.save(out).map_err(|e| e.to_string())?;
    println!("saved {}", out.display());
    Ok(())
}

#[cfg(not(feature = "screenshots"))]
fn screenshot(_: &Account, _: &Args, _: &std::path::Path) -> Result<(), String> {
    Err("built without the `screenshots` feature".into())
}

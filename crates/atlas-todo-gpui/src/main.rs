//! `atlas-todo-gpui`: an experimental native desktop app for Atlas Todo on GPUI, Zed's
//! GPU-accelerated UI framework. It signs in with an API token (Settings → API tokens in the app),
//! syncs end-to-end encrypted through `atlas-client`, and applies the todo rules from
//! `atlas-todo-rules`, like the `atlas-todo` CLI.
//!
//! ```text
//! atlas-todo-gpui [--server URL --token TOKEN] [--dark|--light] [--view VIEW] [--task TITLE]
//! atlas-todo-gpui --screenshot out.png ...   (with the `screenshots` feature: render offscreen)
//! ```
//!
//! VIEW is `today`, `upcoming`, `inbox`, `calendar`, `habits`, `stats`, … or `project:NAME` /
//! `board:NAME`. The server and token also come from `ATLAS_SERVER` / `ATLAS_TOKEN`, or from the
//! sign-in screen, which keeps them in `$XDG_CONFIG_HOME/atlas-todo-gpui/account.json` (mode 0600).

mod app;
mod board;
mod calendar;
mod detail;
mod format;
mod habits;
mod input;
mod list;
mod model;
mod motion;
mod stats;
mod sync;
mod theme;
mod tour;
mod ui;

use std::borrow::Cow;
use std::path::PathBuf;

use gpui::{
    div, prelude::*, px, size, App, AssetSource, Bounds, ClickEvent, Context, Entity, FontWeight,
    SharedString, TitlebarOptions, Window, WindowBounds, WindowOptions,
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

fn config_path() -> Option<PathBuf> {
    let base = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))?;
    Some(base.join("atlas-todo-gpui/account.json"))
}

fn saved_account() -> Option<Account> {
    let text = std::fs::read_to_string(config_path()?).ok()?;
    let v: serde_json::Value = serde_json::from_str(&text).ok()?;
    Some(Account {
        server: v.get("server")?.as_str()?.to_owned(),
        token: v.get("token")?.as_str()?.to_owned(),
    })
}

fn save_account(a: &Account) -> std::io::Result<()> {
    let path = config_path().ok_or_else(|| std::io::Error::other("no config directory"))?;
    std::fs::create_dir_all(path.parent().expect("the path has a parent"))?;
    let body = serde_json::json!({ "server": a.server, "token": a.token }).to_string();
    #[cfg(unix)]
    {
        use std::io::Write;
        use std::os::unix::fs::OpenOptionsExt;
        let mut f = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(&path)?;
        f.write_all(body.as_bytes())
    }
    #[cfg(not(unix))]
    std::fs::write(&path, body)
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

/// The window's root: the sign-in screen, then the app.
struct Root {
    view: gpui::AnyView,
}

impl Render for Root {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        self.view.clone()
    }
}

/// Where the window starts until the account is known.
struct SignIn {
    root: gpui::WeakEntity<Root>,
    server: Entity<TextInput>,
    token: Entity<TextInput>,
    error: Option<String>,
}

impl SignIn {
    fn new(root: gpui::WeakEntity<Root>, cx: &mut Context<Self>) -> Self {
        Self {
            root,
            server: cx.new(|cx| TextInput::new("https://app.atlastodo.dev", cx)),
            token: cx.new(|cx| TextInput::new("atlas_pat_…", cx)),
            error: None,
        }
    }

    fn connect(&mut self, _: &mut Window, cx: &mut Context<Self>) {
        let read = |e: &Entity<TextInput>, cx: &Context<Self>| e.read(cx).text().trim().to_owned();
        let account = Account {
            server: read(&self.server, cx),
            token: read(&self.token, cx),
        };
        if account.server.is_empty() || account.token.is_empty() {
            self.error = Some("Enter your server and an API token.".into());
            cx.notify();
            return;
        }
        if let Err(e) = save_account(&account) {
            self.error = Some(format!("Could not save the account: {e}"));
            cx.notify();
            return;
        }
        let root = self.root.clone();
        cx.defer(move |cx| {
            let view = start(account, &Args::default(), cx);
            let _ = root.update(cx, |r, cx| {
                r.view = view;
                cx.notify();
            });
        });
    }
}

impl Render for SignIn {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
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
                    .child(div().text_size(ts(14.)).text_color(t.muted).child(
                        "Sign in with an API token: in the app, Settings → API tokens → Create token.",
                    ))
                    .child(field("Server", self.server.clone()))
                    .child(field("API token", self.token.clone()))
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
                            .id("connect")
                            .h(px(40.))
                            .flex()
                            .items_center()
                            .justify_center()
                            .rounded(px(8.))
                            .bg(t.accent)
                            .text_color(t.on_accent)
                            .font_weight(FontWeight::SEMIBOLD)
                            .cursor_pointer()
                            .on_click(cx.listener(|this, _: &ClickEvent, window, cx| {
                                this.connect(window, cx)
                            }))
                            .child("Connect"),
                    ),
                "signin",
                300,
                |el, v| el.opacity(v).mt(px((1. - v) * 16.)),
            ))
    }
}

/// The app over a live account: the sync worker, and the window's root view.
fn start(account: Account, args: &Args, cx: &mut App) -> gpui::AnyView {
    let (utx, urx) = async_channel::unbounded();
    let tx = sync::spawn(account, utx);
    let snap = Snapshot::empty(
        atlas_client::zoned::resolve_time_zone(None),
        SyncState::Connecting,
    );
    let view = cx.new(|cx| {
        let mut app = AtlasApp::new(snap, Some(tx), Some(urx), now_ms(), cx);
        configure(&mut app, args);
        if std::env::var_os("ATLAS_GPUI_TOUR").is_some() {
            tour::start(cx);
        }
        app
    });
    view.into()
}

fn main() {
    let args = parse_args();
    let account = match (args.server.clone(), args.token.clone()) {
        (Some(server), Some(token)) => Some(Account { server, token }),
        _ => saved_account(),
    };

    if let Some(out) = args.screenshot.clone() {
        let Some(account) = account else {
            eprintln!("--screenshot needs --server and --token");
            std::process::exit(2);
        };
        if let Err(e) = screenshot(&account, &args, &out) {
            eprintln!("screenshot failed: {e}");
            std::process::exit(1);
        }
        return;
    }

    gpui_platform::application()
        .with_assets(Assets)
        .run(move |cx: &mut App| {
            load_fonts(cx);
            input::bind_keys(cx);
            cx.on_window_closed(|cx, _| cx.quit()).detach();
            let bounds = Bounds::centered(None, size(px(1280.), px(800.)), cx);
            let opts = WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(bounds)),
                titlebar: Some(TitlebarOptions {
                    title: Some("Atlas Todo".into()),
                    ..Default::default()
                }),
                app_id: Some("dev.atlastodo.gpui".into()),
                ..Default::default()
            };
            cx.open_window(opts, |_, cx| {
                cx.new(|cx: &mut Context<Root>| {
                    let view = match account {
                        Some(account) => start(account, &args, cx),
                        None => {
                            let root = cx.weak_entity();
                            cx.new(|cx| SignIn::new(root, cx)).into()
                        }
                    };
                    Root { view }
                })
            })
            .expect("the window opens");
            cx.activate(true);
        });
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

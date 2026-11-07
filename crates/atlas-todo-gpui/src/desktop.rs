//! The app's place in the desktop: a `.desktop` entry and icon for its app id (what panels, docks
//! and launchers show for the window on Wayland), and a tray icon (StatusNotifierItem) that opens
//! the window and quits, like the Electron app's.

use std::path::PathBuf;

use crate::APP_ID;

/// The app's icon, the mobile app's.
const ICON: &[u8] = include_bytes!("../../../apps/mobile/assets/icon.png");
/// The Electron app's tray icon.
const TRAY_ICON: &[u8] = include_bytes!("../../../apps/electron/assets/tray@2x.png");

fn data_home() -> Option<PathBuf> {
    std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/share")))
}

fn write_if_changed(path: &PathBuf, bytes: &[u8]) -> std::io::Result<()> {
    if std::fs::read(path).ok().as_deref() == Some(bytes) {
        return Ok(());
    }
    std::fs::create_dir_all(path.parent().expect("a parent"))?;
    std::fs::write(path, bytes)
}

/// Install (or refresh) `~/.local/share/applications/<app id>.desktop` and the icon it names, so
/// the window shows the Atlas icon instead of a placeholder. Its `Exec` is this binary.
pub fn install_entry() {
    let Some(data) = data_home() else {
        return;
    };
    let exe = std::env::current_exe()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|_| "atlas-todo-gpui".into());
    let entry = format!(
        "[Desktop Entry]\nType=Application\nName=Atlas Todo (GPUI)\nComment=Atlas Todo, the native GPUI desktop experiment\nExec={exe}\nIcon={APP_ID}\nTerminal=false\nCategories=Office;ProjectManagement;\nStartupWMClass={APP_ID}\n"
    );
    let icon = image::load_from_memory(ICON).ok().and_then(|img| {
        let mut png = Vec::new();
        img.resize(512, 512, image::imageops::FilterType::Lanczos3)
            .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
            .ok()?;
        Some(png)
    });
    let result = (|| -> std::io::Result<()> {
        write_if_changed(
            &data.join(format!("applications/{APP_ID}.desktop")),
            entry.as_bytes(),
        )?;
        if let Some(png) = icon {
            write_if_changed(
                &data.join(format!("icons/hicolor/512x512/apps/{APP_ID}.png")),
                &png,
            )?;
        }
        Ok(())
    })();
    if let Err(e) = result {
        eprintln!("could not install the desktop entry: {e}");
    }
}

/// What the tray asks of the app.
pub enum TrayEvent {
    Open,
    Quit,
}

struct AtlasTray {
    tx: async_channel::Sender<TrayEvent>,
    icon: Vec<ksni::Icon>,
}

impl ksni::Tray for AtlasTray {
    fn id(&self) -> String {
        APP_ID.into()
    }

    fn title(&self) -> String {
        "Atlas Todo".into()
    }

    fn icon_pixmap(&self) -> Vec<ksni::Icon> {
        self.icon.clone()
    }

    fn activate(&mut self, _x: i32, _y: i32) {
        let _ = self.tx.send_blocking(TrayEvent::Open);
    }

    fn menu(&self) -> Vec<ksni::MenuItem<Self>> {
        use ksni::menu::{MenuItem, StandardItem};
        vec![
            StandardItem {
                label: "Open Atlas Todo".into(),
                activate: Box::new(|t: &mut Self| {
                    let _ = t.tx.send_blocking(TrayEvent::Open);
                }),
                ..Default::default()
            }
            .into(),
            MenuItem::Separator,
            StandardItem {
                label: "Quit".into(),
                activate: Box::new(|t: &mut Self| {
                    let _ = t.tx.send_blocking(TrayEvent::Quit);
                }),
                ..Default::default()
            }
            .into(),
        ]
    }
}

/// The tray icon as StatusNotifierItem wants it: ARGB32, big-endian.
fn tray_pixmap() -> Vec<ksni::Icon> {
    let Ok(img) = image::load_from_memory(TRAY_ICON) else {
        return Vec::new();
    };
    let rgba = img.to_rgba8();
    let (width, height) = rgba.dimensions();
    let mut data = Vec::with_capacity((width * height * 4) as usize);
    for p in rgba.pixels() {
        let [r, g, b, a] = p.0;
        data.extend_from_slice(&[a, r, g, b]);
    }
    vec![ksni::Icon {
        width: width as i32,
        height: height as i32,
        data,
    }]
}

/// Show the tray icon; `None` when the session has no tray host (StatusNotifierWatcher).
pub fn spawn_tray() -> Option<async_channel::Receiver<TrayEvent>> {
    use ksni::blocking::TrayMethods;
    let (tx, rx) = async_channel::unbounded();
    match (AtlasTray {
        tx,
        icon: tray_pixmap(),
    })
    .spawn()
    {
        Ok(handle) => {
            // Lives as long as the app.
            std::mem::forget(handle);
            Some(rx)
        }
        Err(e) => {
            eprintln!("no tray icon: {e}");
            None
        }
    }
}

/// The desktop-only settings (not synced): `$XDG_CONFIG_HOME/atlas-todo-gpui/desktop.json`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DesktopSettings {
    /// Closing the window keeps the app in the tray (when there is one), as the Electron app's
    /// default.
    pub close_to_tray: bool,
    /// The text zoom.
    pub zoom: f32,
}

impl Default for DesktopSettings {
    fn default() -> Self {
        Self {
            close_to_tray: true,
            zoom: 1.0,
        }
    }
}

fn settings_path() -> Option<PathBuf> {
    crate::config_dir().map(|d| d.join("desktop.json"))
}

impl DesktopSettings {
    pub fn load() -> Self {
        let v: serde_json::Value = settings_path()
            .and_then(|p| std::fs::read_to_string(p).ok())
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or_default();
        let d = Self::default();
        Self {
            close_to_tray: v
                .get("close_to_tray")
                .and_then(|x| x.as_bool())
                .unwrap_or(d.close_to_tray),
            zoom: v
                .get("zoom")
                .and_then(|x| x.as_f64())
                .map_or(d.zoom, |z| z as f32),
        }
    }

    fn save(&self) {
        let Some(path) = settings_path() else {
            return;
        };
        let body = serde_json::json!({ "close_to_tray": self.close_to_tray, "zoom": self.zoom });
        if let Err(e) = write_if_changed(&path, body.to_string().as_bytes()) {
            eprintln!("could not save the desktop settings: {e}");
        }
    }

    /// Change and save.
    pub fn update(f: impl FnOnce(&mut Self)) -> Self {
        let mut s = Self::load();
        f(&mut s);
        s.save();
        s
    }
}

fn autostart_path() -> Option<PathBuf> {
    let base = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))?;
    Some(base.join(format!("autostart/{APP_ID}.desktop")))
}

/// Whether the app starts at login (an XDG autostart entry).
pub fn starts_at_login() -> bool {
    autostart_path().is_some_and(|p| p.exists())
}

/// Start at login (an entry in `~/.config/autostart` that runs this binary into the tray), or not.
pub fn set_start_at_login(on: bool) -> std::io::Result<()> {
    let Some(path) = autostart_path() else {
        return Ok(());
    };
    if !on {
        return match std::fs::remove_file(&path) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e),
            _ => Ok(()),
        };
    }
    let exe = std::env::current_exe()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|_| "atlas-todo-gpui".into());
    let entry = format!(
        "[Desktop Entry]\nType=Application\nName=Atlas Todo (GPUI)\nExec={exe} --hidden\nIcon={APP_ID}\nTerminal=false\nX-GNOME-Autostart-enabled=true\n"
    );
    write_if_changed(&path, entry.as_bytes())
}

/// Where the running instance listens: `$XDG_RUNTIME_DIR/atlas-todo-gpui.sock`.
fn socket_path() -> Option<PathBuf> {
    std::env::var_os("XDG_RUNTIME_DIR")
        .map(|d| PathBuf::from(d).join("atlas-todo-gpui.sock"))
        .or_else(|| crate::config_dir().map(|d| d.join("instance.sock")))
}

/// One instance per user, as the Electron app's single-instance lock: when one runs already, ask
/// it to show its window and return `None` (this run exits). Otherwise listen for later launches,
/// each of which sends one event.
pub fn single_instance() -> Option<async_channel::Receiver<()>> {
    use std::io::{BufRead, Write};
    use std::os::unix::net::{UnixListener, UnixStream};
    let (tx, rx) = async_channel::unbounded();
    let Some(path) = socket_path() else {
        return Some(rx);
    };
    if let Ok(mut s) = UnixStream::connect(&path) {
        if s.write_all(b"show\n").is_ok() {
            return None;
        }
    }
    // Nothing answers: a socket left by a run that crashed.
    let _ = std::fs::remove_file(&path);
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let listener = match UnixListener::bind(&path) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("no single-instance socket: {e}");
            return Some(rx);
        }
    };
    let spawned = std::thread::Builder::new()
        .name("atlas-instance".into())
        .spawn(move || {
            for stream in listener.incoming().flatten() {
                let mut line = String::new();
                let _ = std::io::BufReader::new(stream).read_line(&mut line);
                if line.trim() == "show" && tx.send_blocking(()).is_err() {
                    break;
                }
            }
        });
    if let Err(e) = spawned {
        eprintln!("no single-instance listener: {e}");
    }
    Some(rx)
}

/// Remove the instance socket (at quit), so the next launch does not try it first.
pub fn release_instance() {
    if let Some(path) = socket_path() {
        let _ = std::fs::remove_file(path);
    }
}

/// The window's last frame (`window.json`): size and position, and whether it was maximized.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct WindowState {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub maximized: bool,
}

pub const MIN_WIDTH: f32 = 720.;
pub const MIN_HEIGHT: f32 = 480.;

fn window_path() -> Option<PathBuf> {
    crate::config_dir().map(|d| d.join("window.json"))
}

impl WindowState {
    pub fn load() -> Option<Self> {
        let v: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(window_path()?).ok()?).ok()?;
        let f = |k: &str| v.get(k).and_then(|x| x.as_f64()).map(|x| x as f32);
        Some(Self {
            x: f("x").unwrap_or(0.),
            y: f("y").unwrap_or(0.),
            width: f("width")?.max(MIN_WIDTH),
            height: f("height")?.max(MIN_HEIGHT),
            maximized: v.get("maximized").and_then(|x| x.as_bool()) == Some(true),
        })
    }

    pub fn save(&self) {
        let Some(path) = window_path() else {
            return;
        };
        let body = serde_json::json!({
            "x": self.x, "y": self.y, "width": self.width, "height": self.height,
            "maximized": self.maximized,
        });
        if let Err(e) = write_if_changed(&path, body.to_string().as_bytes()) {
            eprintln!("could not save the window state: {e}");
        }
    }

    /// Onto the displays there are now (`(x, y, width, height)` each): kept where it is when its
    /// middle is on one, else centered on the first; never larger than the display it lands on.
    pub fn clamp(mut self, displays: &[(f32, f32, f32, f32)]) -> Self {
        let (mx, my) = (self.x + self.width / 2., self.y + self.height / 2.);
        let on = displays
            .iter()
            .find(|(x, y, w, h)| mx >= *x && mx < x + w && my >= *y && my < y + h);
        match (on, displays.first()) {
            (Some(&(x, y, w, h)), _) => {
                self.width = self.width.min(w);
                self.height = self.height.min(h);
                self.x = self.x.clamp(x, x + w - self.width);
                self.y = self.y.clamp(y, y + h - self.height);
            }
            (None, Some(&(x, y, w, h))) => {
                self.width = self.width.min(w);
                self.height = self.height.min(h);
                self.x = x + (w - self.width) / 2.;
                self.y = y + (h - self.height) / 2.;
            }
            (None, None) => {}
        }
        self
    }
}

#[cfg(test)]
mod tests {
    use super::WindowState;

    fn state(x: f32, y: f32, width: f32, height: f32) -> WindowState {
        WindowState {
            x,
            y,
            width,
            height,
            maximized: false,
        }
    }

    #[test]
    fn a_frame_on_a_display_stays() {
        let s = state(100., 50., 1280., 800.);
        assert_eq!(s.clamp(&[(0., 0., 1920., 1080.)]), s);
    }

    #[test]
    fn a_frame_off_every_display_is_centered_on_the_first() {
        let s = state(4000., 50., 1280., 800.).clamp(&[(0., 0., 1920., 1080.)]);
        assert_eq!((s.x, s.y), (320., 140.));
    }

    #[test]
    fn a_frame_larger_than_its_display_shrinks_onto_it() {
        let s = state(-10., -10., 3000., 2000.).clamp(&[(0., 0., 1920., 1080.)]);
        assert_eq!(s, state(0., 0., 1920., 1080.));
    }
}

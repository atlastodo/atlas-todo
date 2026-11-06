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

//! Desktop notifications (freedesktop, over D-Bus through notify-rust's pure-Rust zbus backend):
//! the reminders and the focus timer's phase ends. Best-effort: a session without a notification
//! daemon shows nothing and nothing breaks. Clicking one brings the window forward.

use gpui::{App, AsyncApp};

/// Clicks on our notifications, for the window to come forward.
pub struct Clicks(async_channel::Sender<()>);

impl gpui::Global for Clicks {}

/// Listen for clicks (once per app).
pub fn listen(cx: &mut App) {
    if cx.has_global::<Clicks>() {
        return;
    }
    let (tx, rx) = async_channel::unbounded::<()>();
    cx.set_global(Clicks(tx));
    cx.spawn(async move |cx: &mut AsyncApp| {
        while rx.recv().await.is_ok() {
            cx.update(|cx| {
                if let Some(window) = cx.windows().into_iter().next() {
                    let _ = window.update(cx, |_, window, _| window.activate_window());
                }
            });
        }
    })
    .detach();
}

/// Show a notification now. Its thread waits for a click (or the notification to close).
pub fn show(title: &str, body: &str, cx: &App) {
    let clicks = cx.try_global::<Clicks>().map(|c| c.0.clone());
    let (title, body) = (title.to_owned(), body.to_owned());
    let spawned = std::thread::Builder::new()
        .name("atlas-notify".into())
        .spawn(move || {
            let mut n = notify_rust::Notification::new();
            n.appname("Atlas Todo")
                .summary(&title)
                .icon(crate::APP_ID)
                .hint(notify_rust::Hint::DesktopEntry(crate::APP_ID.into()))
                .action("default", "Open");
            if !body.is_empty() {
                n.body(&body);
            }
            match n.show() {
                Ok(handle) => handle.wait_for_action(|action| {
                    if action == "default" {
                        if let Some(tx) = &clicks {
                            let _ = tx.send_blocking(());
                        }
                    }
                }),
                Err(e) => eprintln!("could not show a notification: {e}"),
            }
        });
    if let Err(e) = spawned {
        eprintln!("could not show a notification: {e}");
    }
}

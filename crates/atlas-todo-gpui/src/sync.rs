//! The account on a worker thread: `TodoClient` signs in with an API token, pulls and decrypts, and
//! every few seconds syncs again. The UI sends [`Command`]s and gets a fresh [`Snapshot`] back after
//! each change, so the window never blocks on the network or the crypto.

use std::sync::mpsc::{Receiver, RecvTimeoutError, Sender};
use std::time::Duration;

use atlas_client::session::{ConnectOptions, LoginOptions, ResumeOptions, Session};
use atlas_client::store::now_ms;
use atlas_client::zoned::resolve_time_zone;
use atlas_todo_rules::client::TodoClient;
use jiff::civil::Date;
use serde_json::Value;

use crate::model::{Snapshot, SyncState};

/// How often the worker pulls when nothing happens.
const POLL: Duration = Duration::from_secs(5);

#[derive(Debug, Clone)]
pub enum Command {
    /// Complete an open task, reopen a completed one.
    Toggle(String),
    /// One line of quick add, into a project and section when given.
    QuickAdd {
        text: String,
        project_id: Option<String>,
        section_id: Option<String>,
    },
    SetPriority(String, u8),
    /// Mark a habit done on a day, or clear the day when it is.
    ToggleHabit(String, Date),
    /// End the session (on the server for a password sign-in) and forget it.
    SignOut,
}

/// How the window signs in.
#[derive(Clone)]
pub enum Account {
    /// An API token (`--token`, `ATLAS_TOKEN`).
    Token { server: String, token: String },
    /// Email and password, from the sign-in screen.
    Login {
        server: String,
        email: String,
        password: String,
    },
    /// A password session kept in the secret store.
    Saved(atlas_client::session::SessionCredentials),
}

pub enum Update {
    Snapshot(Box<Snapshot>),
    Error(String),
    /// The session ended or never started (a wrong password, a revoked session, sign-out): back to
    /// the sign-in screen, with this to say (empty after a sign-out).
    SignedOut(String),
}

pub fn spawn(account: Account, updates: async_channel::Sender<Update>) -> Sender<Command> {
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::Builder::new()
        .name("atlas-sync".into())
        .spawn(move || run(account, rx, updates))
        .expect("the sync thread starts");
    tx
}

/// Sign in and pull once, for the screenshot mode.
#[cfg(feature = "screenshots")]
pub fn load_once(account: &Account) -> Result<Snapshot, String> {
    let client = connect(account).map_err(|e| e.to_string())?;
    Ok(snapshot(&client, SyncState::Live))
}

/// This installation in the account's sessions: "Atlas Todo desktop (GPUI) on <host>".
fn device_name() -> String {
    let host = std::fs::read_to_string("/proc/sys/kernel/hostname")
        .or_else(|_| std::fs::read_to_string("/etc/hostname"))
        .map(|h| h.trim().to_owned())
        .unwrap_or_default();
    if host.is_empty() {
        "Atlas Todo desktop (GPUI)".into()
    } else {
        format!("Atlas Todo desktop (GPUI) on {host}")
    }
}

/// A random id of this installation, made once: signing in again replaces its older session.
fn install_key() -> Option<String> {
    let path = crate::config_dir()?.join("install-key");
    if let Ok(k) = std::fs::read_to_string(&path) {
        if !k.trim().is_empty() {
            return Some(k.trim().to_owned());
        }
    }
    let key = uuid::Uuid::new_v4().to_string();
    std::fs::create_dir_all(path.parent()?).ok()?;
    std::fs::write(&path, &key).ok()?;
    Some(key)
}

fn connect(account: &Account) -> atlas_client::Result<TodoClient> {
    match account {
        Account::Token { server, token } => {
            let mut opts = ConnectOptions::new(server, token);
            opts.state_dir = state_dir();
            TodoClient::connect(opts)
        }
        Account::Login {
            server,
            email,
            password,
        } => {
            atlas_todo_rules::register_todo_app();
            let mut opts = LoginOptions::new(server, email, password);
            opts.state_dir = state_dir();
            opts.device_name = Some(device_name());
            opts.install_key = install_key();
            Ok(TodoClient::from_session(Session::login(opts)?, None))
        }
        Account::Saved(credentials) => {
            atlas_todo_rules::register_todo_app();
            let mut opts = ResumeOptions::new(credentials.clone());
            opts.state_dir = state_dir();
            Ok(TodoClient::from_session(Session::resume(opts)?, None))
        }
    }
}

/// Why signing in failed, in words for the sign-in screen.
fn sign_in_error(e: &atlas_client::Error, account: &Account) -> String {
    match e {
        atlas_client::Error::Api { status: 401, .. } => match account {
            Account::Login { .. } => "Wrong email or password.".into(),
            _ => "You were signed out. Sign in again.".into(),
        },
        atlas_client::Error::Network(_) => format!("Could not reach the server: {e}"),
        other => other.to_string(),
    }
}

/// Keep a password session's newest credentials (its refresh token rotates).
fn keep_credentials(client: &TodoClient, last: &mut Option<String>) {
    let Some(c) = client.session().credentials() else {
        return;
    };
    if last.as_deref() == Some(c.refresh_token.as_str()) {
        return;
    }
    match crate::secrets::save(&c) {
        Ok(()) => *last = Some(c.refresh_token),
        Err(e) => eprintln!("could not keep the session in the secret store: {e}"),
    }
}

/// The synced account is cached between runs, like the CLI's.
fn state_dir() -> Option<std::path::PathBuf> {
    let base = std::env::var_os("XDG_STATE_HOME")
        .map(std::path::PathBuf::from)
        .or_else(|| {
            std::env::var_os("HOME").map(|h| std::path::PathBuf::from(h).join(".local/state"))
        })?;
    Some(base.join("atlas-todo-gpui"))
}

fn snapshot(client: &TodoClient, sync: SyncState) -> Snapshot {
    Snapshot::build(
        &client.session().store,
        client.projects(),
        client.labels(),
        client.user_id(),
        client.time_zone().clone(),
        sync,
    )
}

fn run(account: Account, rx: Receiver<Command>, updates: async_channel::Sender<Update>) {
    let mut client = loop {
        match connect(&account) {
            Ok(c) => break c,
            Err(e) => {
                // A password sign-in that fails, or a kept session the server refuses, goes back
                // to the sign-in screen; a kept session offline and a token are retried.
                let network = matches!(e, atlas_client::Error::Network(_));
                let fatal = match &account {
                    Account::Login { .. } => true,
                    Account::Saved(_) => !network,
                    Account::Token { .. } => false,
                };
                if fatal {
                    if matches!(e, atlas_client::Error::Api { status: 401, .. }) {
                        crate::secrets::clear();
                    }
                    let _ = updates.send_blocking(Update::SignedOut(sign_in_error(&e, &account)));
                    return;
                }
                let _ = updates.send_blocking(Update::Error(sign_in_error(&e, &account)));
                let empty = Snapshot::empty(resolve_time_zone(None), SyncState::Offline);
                let _ = updates.send_blocking(Update::Snapshot(Box::new(empty)));
                std::thread::sleep(POLL * 3);
            }
        }
    };
    let mut kept = None;
    keep_credentials(&client, &mut kept);
    let _ = updates.send_blocking(Update::Snapshot(Box::new(snapshot(
        &client,
        SyncState::Live,
    ))));
    let mut state = SyncState::Live;
    loop {
        let changed = match rx.recv_timeout(POLL) {
            Ok(Command::SignOut) => {
                let _ = client.session().logout();
                crate::secrets::clear();
                let _ = updates.send_blocking(Update::SignedOut(String::new()));
                return;
            }
            Ok(cmd) => {
                if let Err(e) = apply(&mut client, cmd) {
                    let _ = updates.send_blocking(Update::Error(e));
                }
                true
            }
            Err(RecvTimeoutError::Timeout) => {
                let before = client.cursor();
                let now = match client.session_mut().sync_now() {
                    Ok(_) => SyncState::Live,
                    Err(_) => SyncState::Offline,
                };
                let moved = client.cursor() != before || now != state;
                state = now;
                moved
            }
            Err(RecvTimeoutError::Disconnected) => return,
        };
        keep_credentials(&client, &mut kept);
        if changed {
            let _ = client.session().save_state();
            let snap = snapshot(&client, state);
            if updates
                .send_blocking(Update::Snapshot(Box::new(snap)))
                .is_err()
            {
                return;
            }
        }
    }
}

fn apply(client: &mut TodoClient, cmd: Command) -> Result<(), String> {
    let err = |e: atlas_client::error::Error| e.to_string();
    match cmd {
        Command::Toggle(id) => {
            let open = client.task(&id).is_some_and(|t| !t.task.is_completed);
            if open {
                client.complete_task(&id).map_err(err)?;
            } else {
                client.reopen_task(&id).map_err(err)?;
            }
        }
        Command::QuickAdd {
            text,
            project_id,
            section_id,
        } => {
            let made = client.quick_add(&text).map_err(err)?;
            let mut patch = Vec::new();
            if made.task.project_id.is_none() {
                if let Some(p) = project_id {
                    patch.push(("project_id".to_owned(), Value::from(p)));
                }
            }
            if let Some(s) = section_id {
                patch.push(("section_id".to_owned(), Value::from(s)));
            }
            if !patch.is_empty() {
                client.update_task(&made.task.id, patch).map_err(err)?;
            }
        }
        Command::SetPriority(id, p) => {
            client
                .update_task(&id, vec![("priority".to_owned(), Value::from(p))])
                .map_err(err)?;
        }
        Command::SignOut => {}
        Command::ToggleHabit(habit, date) => {
            let key = date.to_string();
            let store = &mut client.session_mut().store;
            let existing: Vec<String> = store
                .list("habit_checkin")
                .into_iter()
                .filter(|e| {
                    e.fields.get("habit_id").and_then(Value::as_str) == Some(habit.as_str())
                        && e.fields.get("date").and_then(Value::as_str) == Some(key.as_str())
                        && e.fields.get("deleted_at").is_none_or(Value::is_null)
                })
                .map(|e| e.id)
                .collect();
            // As useHabitCheckins: a done day clears; an empty one gets a fresh row.
            if existing.is_empty() {
                let id = store.new_entity_id();
                store.set("habit_checkin", &id, "habit_id", Value::from(habit));
                store.set("habit_checkin", &id, "date", Value::from(key));
                store.set("habit_checkin", &id, "state", Value::from("done"));
                store.set("habit_checkin", &id, "value", Value::from(1));
                store.set("habit_checkin", &id, "created_at", Value::from(now_ms()));
            } else {
                for id in existing {
                    store.remove("habit_checkin", &id);
                }
            }
            client.push().map_err(err)?;
        }
    }
    Ok(())
}

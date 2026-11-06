//! The account on a worker thread: `TodoClient` signs in with an API token, pulls and decrypts, and
//! every few seconds syncs again. The UI sends [`Command`]s and gets a fresh [`Snapshot`] back after
//! each change, so the window never blocks on the network or the crypto.

use std::sync::mpsc::{Receiver, RecvTimeoutError, Sender};
use std::time::Duration;

use atlas_client::session::ConnectOptions;
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
}

#[derive(Debug, Clone)]
pub struct Account {
    pub server: String,
    pub token: String,
}

pub enum Update {
    Snapshot(Box<Snapshot>),
    Error(String),
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
    let client = connect(account)?;
    Ok(snapshot(&client, SyncState::Live))
}

fn connect(account: &Account) -> Result<TodoClient, String> {
    let mut opts = ConnectOptions::new(&account.server, &account.token);
    opts.state_dir = state_dir();
    TodoClient::connect(opts).map_err(|e| e.to_string())
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
                let _ = updates.send_blocking(Update::Error(e));
                let empty = Snapshot::empty(resolve_time_zone(None), SyncState::Offline);
                let _ = updates.send_blocking(Update::Snapshot(Box::new(empty)));
                std::thread::sleep(POLL * 3);
            }
        }
    };
    let _ = updates.send_blocking(Update::Snapshot(Box::new(snapshot(
        &client,
        SyncState::Live,
    ))));
    let mut state = SyncState::Live;
    loop {
        let changed = match rx.recv_timeout(POLL) {
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

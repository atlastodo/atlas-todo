//! Reminder notifications while the app runs, as the web app's `useReminderScheduler` delivers
//! them: each reminder of an open task fires once when its instant comes (`reminderFireAt`, in the
//! account's zone) and is stamped `fired_at`, which syncs, so no other device repeats it. One more
//! than 15 minutes late (another device announced it, or it passed with the app closed) is only
//! stamped. Off with the `reminders_enabled` preference. Instead of the web's 30-second interval
//! the app wakes at the next fire instant (at least once a minute, to see synced changes).

use std::collections::HashMap;
use std::time::Duration;

use atlas_todo_rules::rules::reminders::{
    next_fire_at, reminder_body, reminder_fire_at, reminder_title, split_due_reminders,
};
use gpui::Context;
use serde_json::Value;

use crate::app::AtlasApp;
use crate::model::SyncState;
use crate::sync::Command;

/// The longest the scheduler sleeps between looks.
const MAX_SLEEP_MS: i64 = 60_000;

#[derive(Default)]
pub struct Scheduler {
    /// Reminders announced or stamped here, with the instant they went out for, until the stamp
    /// comes back in a snapshot.
    handled: HashMap<String, i64>,
    /// The first sync came in: before it, the reminders read are a stale cache.
    synced: bool,
    /// Bumped by each look, so only the latest wake-up looks again.
    generation: u64,
}

/// Look for due reminders, announce them, and sleep until the next one. Called after every
/// snapshot and by its own wake-ups.
pub fn run(app: &mut AtlasApp, cx: &mut Context<AtlasApp>) {
    if !app.is_live() {
        return;
    }
    let snap = app.snap.clone();
    if snap.sync == SyncState::Live && !snap.user_id.is_empty() {
        app.reminders.synced = true;
    }
    app.reminders.generation += 1;
    if !app.reminders.synced || app.pref("reminders_enabled") == Some(&Value::Bool(false)) {
        return;
    }
    crate::notify::listen(cx);
    let now = crate::now_ms();
    let (fire, stale) = split_due_reminders(&snap.reminder_list, &snap.tasks, now, &snap.tz);
    for (r, announce) in fire
        .into_iter()
        .map(|r| (r, true))
        .chain(stale.into_iter().map(|r| (r, false)))
    {
        let task = snap.task(&r.task_id);
        let Some(at) = reminder_fire_at(r, task, &snap.tz) else {
            continue;
        };
        if app.reminders.handled.get(&r.id) == Some(&at) {
            continue;
        }
        app.reminders.handled.insert(r.id.clone(), at);
        if announce {
            let title = reminder_title(task, "Encrypted task", "Reminder");
            crate::notify::show(&title, &reminder_body(task), cx);
        }
        app.send(Command::SetFields {
            kind: "reminder".into(),
            id: r.id.clone(),
            fields: vec![("fired_at".into(), Value::from(now))],
        });
    }
    let sleep = next_fire_at(&snap.reminder_list, &snap.tasks, now, &snap.tz)
        .map_or(MAX_SLEEP_MS, |at| (at - now).clamp(250, MAX_SLEEP_MS));
    let generation = app.reminders.generation;
    cx.spawn(async move |this, cx| {
        cx.background_executor()
            .timer(Duration::from_millis(sleep as u64))
            .await;
        let _ = this.update(cx, |this, cx| {
            if this.reminders.generation == generation {
                run(this, cx);
            }
        });
    })
    .detach();
}

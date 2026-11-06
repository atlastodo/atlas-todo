//! What the UI draws: a plain snapshot of the decrypted account, rebuilt after every sync. Tasks go
//! through `atlas-todo-rules` (the same rules as `@atlastodo/todo-core`); the kinds the rules crate
//! has no model for yet (sections, habits, focus sessions, reminders, comments) are read here from
//! the fields the mobile app writes.

use std::collections::{BTreeMap, HashSet};

use atlas_client::store::Store;
use atlas_todo_rules::client::{Label, Project};
use atlas_todo_rules::rules::task::{all_tasks, ms, Task};
use jiff::civil::Date;
use jiff::tz::TimeZone;
use serde_json::{Map, Value};

#[derive(Debug, Clone)]
pub struct Section {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub sort_order: f64,
}

#[derive(Debug, Clone)]
pub struct Habit {
    pub id: String,
    pub name: String,
    pub color: String,
    pub target: i64,
    pub sort_order: f64,
    pub created_at: i64,
}

#[derive(Debug, Clone)]
pub struct Checkin {
    pub habit_id: String,
    pub date: Date,
    pub done: bool,
}

#[derive(Debug, Clone)]
pub struct Comment {
    pub task_id: String,
    pub body: String,
    pub author_id: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyncState {
    Connecting,
    Live,
    Offline,
}

/// The account as the UI sees it.
#[derive(Clone)]
pub struct Snapshot {
    pub user_id: String,
    pub tz: TimeZone,
    pub projects: Vec<Project>,
    pub sections: Vec<Section>,
    /// Neither trashed nor archived; open and completed.
    pub tasks: Vec<Task>,
    pub labels: Vec<Label>,
    /// Tasks with a reminder still to fire (the rows' bell).
    pub reminders: HashSet<String>,
    pub habits: Vec<Habit>,
    pub checkins: Vec<Checkin>,
    /// Focus session lengths in ms, with when each ended.
    pub focus: Vec<(i64, i64)>,
    pub comments: Vec<Comment>,
    pub sync: SyncState,
    /// Just completed here: still listed for a moment while the row fades out.
    pub linger: HashSet<String>,
}

fn f64_field(f: &Map<String, Value>, k: &str) -> f64 {
    f.get(k).and_then(Value::as_f64).unwrap_or(0.0)
}

fn i64_field(f: &Map<String, Value>, k: &str) -> Option<i64> {
    f.get(k).and_then(Value::as_f64).map(|v| v as i64)
}

fn str_field(f: &Map<String, Value>, k: &str) -> String {
    f.get(k).and_then(Value::as_str).unwrap_or("").to_owned()
}

fn trashed(f: &Map<String, Value>) -> bool {
    f.get("deleted_at").is_some_and(|v| !v.is_null())
        || f.get("archived_at").is_some_and(|v| !v.is_null())
}

impl Snapshot {
    pub fn empty(tz: TimeZone, sync: SyncState) -> Self {
        Self {
            user_id: String::new(),
            tz,
            projects: Vec::new(),
            sections: Vec::new(),
            tasks: Vec::new(),
            labels: Vec::new(),
            reminders: HashSet::new(),
            habits: Vec::new(),
            checkins: Vec::new(),
            focus: Vec::new(),
            comments: Vec::new(),
            sync,
            linger: HashSet::new(),
        }
    }

    pub fn build(
        store: &Store,
        projects: Vec<Project>,
        labels: Vec<Label>,
        user_id: &str,
        tz: TimeZone,
        sync: SyncState,
    ) -> Self {
        let mut sections: Vec<Section> = store
            .list("section")
            .into_iter()
            .filter(|e| !trashed(&e.fields))
            .map(|e| Section {
                project_id: str_field(&e.fields, "project_id"),
                name: str_field(&e.fields, "name"),
                sort_order: f64_field(&e.fields, "sort_order"),
                id: e.id,
            })
            .collect();
        sections.sort_by(|a, b| a.sort_order.total_cmp(&b.sort_order));

        let mut tasks: Vec<Task> = all_tasks(store)
            .into_iter()
            .filter(|t| t.deleted_at.is_none() && t.archived_at.is_none())
            .collect();
        tasks.sort_by(|a, b| {
            let (x, y) = (
                a.sort_order.as_f64().unwrap_or(0.0),
                b.sort_order.as_f64().unwrap_or(0.0),
            );
            x.total_cmp(&y)
                .then(ms(&a.created_at).cmp(&ms(&b.created_at)))
        });

        let reminders = store
            .list("reminder")
            .into_iter()
            .filter(|e| !trashed(&e.fields) && e.fields.get("fired_at").is_none_or(Value::is_null))
            .map(|e| str_field(&e.fields, "task_id"))
            .collect();

        let mut habits: Vec<Habit> = store
            .list("habit")
            .into_iter()
            .filter(|e| !trashed(&e.fields) && str_field(&e.fields, "kind") != "group")
            .map(|e| Habit {
                name: str_field(&e.fields, "name"),
                color: str_field(&e.fields, "color"),
                target: i64_field(&e.fields, "target").unwrap_or(1).max(1),
                sort_order: f64_field(&e.fields, "sort_order"),
                created_at: i64_field(&e.fields, "created_at").unwrap_or(0),
                id: e.id,
            })
            .collect();
        habits.sort_by(|a, b| {
            a.sort_order
                .total_cmp(&b.sort_order)
                .then(a.created_at.cmp(&b.created_at))
        });

        let checkins = store
            .list("habit_checkin")
            .into_iter()
            .filter(|e| !trashed(&e.fields))
            .filter_map(|e| {
                Some(Checkin {
                    habit_id: str_field(&e.fields, "habit_id"),
                    date: str_field(&e.fields, "date").parse().ok()?,
                    done: str_field(&e.fields, "state") != "skip",
                })
            })
            .collect();

        let focus = store
            .list("focus_session")
            .into_iter()
            .filter(|e| !trashed(&e.fields))
            .map(|e| {
                (
                    i64_field(&e.fields, "duration_ms").unwrap_or(0),
                    i64_field(&e.fields, "ended_at").unwrap_or(0),
                )
            })
            .collect();

        let mut comments: Vec<Comment> = store
            .list("comment")
            .into_iter()
            .filter(|e| !trashed(&e.fields))
            .map(|e| Comment {
                task_id: str_field(&e.fields, "task_id"),
                body: str_field(&e.fields, "body"),
                author_id: str_field(&e.fields, "author_id"),
                created_at: i64_field(&e.fields, "created_at").unwrap_or(0),
            })
            .collect();
        comments.sort_by_key(|c| c.created_at);

        Self {
            user_id: user_id.to_owned(),
            tz,
            projects: projects
                .into_iter()
                .filter(|p| p.kind == "project")
                .collect(),
            sections,
            tasks,
            labels,
            reminders,
            habits,
            checkins,
            focus,
            comments,
            sync,
            linger: HashSet::new(),
        }
    }

    pub fn project(&self, id: &str) -> Option<&Project> {
        self.projects.iter().find(|p| p.id == id)
    }

    pub fn section(&self, id: &str) -> Option<&Section> {
        self.sections.iter().find(|s| s.id == id)
    }

    pub fn task(&self, id: &str) -> Option<&Task> {
        self.tasks.iter().find(|t| t.id == id)
    }

    pub fn label(&self, id: &str) -> Option<&Label> {
        self.labels.iter().find(|l| l.id == id)
    }

    pub fn sections_of(&self, project_id: &str) -> Vec<&Section> {
        self.sections
            .iter()
            .filter(|s| s.project_id == project_id)
            .collect()
    }

    /// Open, or completed a moment ago here.
    pub fn listed(&self, t: &Task) -> bool {
        !t.is_completed || self.linger.contains(&t.id)
    }

    /// Open top-level tasks matching `keep`, in order.
    pub fn open_roots(&self, keep: impl Fn(&Task) -> bool) -> Vec<&Task> {
        self.tasks
            .iter()
            .filter(|t| self.listed(t) && t.parent_id.is_none() && keep(t))
            .collect()
    }

    pub fn subtasks(&self, parent: &str) -> Vec<&Task> {
        self.tasks
            .iter()
            .filter(|t| t.parent_id.as_deref() == Some(parent))
            .collect()
    }

    pub fn comments_of(&self, task: &str) -> Vec<&Comment> {
        self.comments.iter().filter(|c| c.task_id == task).collect()
    }

    /// "Website relaunch / Design", or the project alone, or "Inbox".
    pub fn place(&self, task: &Task) -> (Option<String>, Option<String>) {
        let project = task
            .project_id
            .as_deref()
            .and_then(|p| self.project(p))
            .map(|p| p.name.clone());
        let section = task
            .section_id
            .as_deref()
            .and_then(|s| self.section(s))
            .map(|s| s.name.clone());
        (project, section)
    }

    pub fn date_of(&self, ms_: i64) -> Date {
        jiff::Timestamp::from_millisecond(ms_)
            .map(|t| t.to_zoned(self.tz.clone()).date())
            .unwrap_or_default()
    }

    /// Check-ins per habit, by day.
    pub fn checkins_of(&self, habit: &str) -> BTreeMap<Date, bool> {
        self.checkins
            .iter()
            .filter(|c| c.habit_id == habit)
            .map(|c| (c.date, c.done))
            .collect()
    }
}

/// The current daily streak: done days back from today (or yesterday while today is still open),
/// skips bridged. Daily goals only; weekly and interval goals would need `habits.ts`'s periods.
pub fn daily_streak(days: &BTreeMap<Date, bool>, today: Date) -> i64 {
    let mut day = today;
    if days.get(&day).is_none() {
        day = day.yesterday().unwrap_or(day);
    }
    let mut n = 0;
    loop {
        match days.get(&day) {
            Some(true) => n += 1,
            Some(false) => {}
            None => break,
        }
        match day.yesterday() {
            Ok(d) => day = d,
            Err(_) => break,
        }
    }
    n
}

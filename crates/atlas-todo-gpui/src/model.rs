//! What the UI draws: a plain snapshot of the decrypted account, rebuilt after every sync. Tasks go
//! through `atlas-todo-rules` (the same rules as `@atlastodo/todo-core`); the kinds the rules crate
//! has no model for yet (sections, habits, focus sessions, reminders, comments) are read here from
//! the fields the mobile app writes.

use std::collections::HashSet;

use atlas_client::store::Store;
use atlas_todo_rules::client::{Label, Project};
use atlas_todo_rules::rules::habits::{
    parse_date_key, to_habit, to_habit_checkin, CheckinState, CheckinStates, Habit, HabitKind,
};
use atlas_todo_rules::rules::reminders::Reminder;
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

/// One recorded day of a habit (a `habit_checkin` row).
#[derive(Debug, Clone)]
pub struct Checkin {
    pub habit_id: String,
    pub date: Date,
    pub state: CheckinState,
    /// When it was recorded: a day recorded later is a backfill.
    pub created_at: i64,
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
    /// Every live `reminder` entity, for the notification scheduler.
    pub reminder_list: Vec<Reminder>,
    /// Live habits (not groups), neither trashed nor archived nor in an archived or trashed group,
    /// by `sort_order`.
    pub habits: Vec<Habit>,
    /// Live habit groups (routines), by `sort_order`.
    pub habit_groups: Vec<Habit>,
    /// Every `habit` row, trashed and archived ones too: a new habit's default colour is picked
    /// by this count, as `useHabits` does.
    pub habit_rows: usize,
    pub checkins: Vec<Checkin>,
    /// Focus session lengths in ms, with when each ended.
    pub focus: Vec<(i64, i64)>,
    pub comments: Vec<Comment>,
    pub sync: SyncState,
    /// Just completed here: still listed for a moment while the row fades out.
    pub linger: HashSet<String>,
    /// The synced preferences (`preference` entity [`PREFERENCES_ID`]): theme, accent,
    /// week_starts_on, time_format, favorites, list_prefs, feature toggles, …
    pub prefs: Map<String, Value>,
    /// Folders: projects that hold projects instead of tasks (the sidebar's tree).
    pub folders: Vec<Project>,
}

/// The one `preference` entity's id (`PREFERENCES_ID` in `packages/todo-core/src/ids.ts`).
pub const PREFERENCES_ID: &str = "00000000-0000-4000-8000-000000000001";

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
            reminder_list: Vec::new(),
            habits: Vec::new(),
            habit_groups: Vec::new(),
            habit_rows: 0,
            checkins: Vec::new(),
            focus: Vec::new(),
            comments: Vec::new(),
            sync,
            linger: HashSet::new(),
            prefs: Map::new(),
            folders: Vec::new(),
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

        // The read cascade: a section or project archived or in the trash hides its tasks.
        let gone = |kind: &str| -> HashSet<String> {
            store
                .list(kind)
                .into_iter()
                .filter(|e| trashed(&e.fields))
                .map(|e| e.id)
                .collect()
        };
        let (gone_sections, gone_projects) = (gone("section"), gone("project"));
        let mut tasks: Vec<Task> = all_tasks(store)
            .into_iter()
            .filter(|t| t.deleted_at.is_none() && t.archived_at.is_none())
            .filter(|t| {
                !t.section_id
                    .as_ref()
                    .is_some_and(|s| gone_sections.contains(s))
                    && !t
                        .project_id
                        .as_ref()
                        .is_some_and(|p| gone_projects.contains(p))
            })
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
        let reminder_list = store
            .list("reminder")
            .into_iter()
            .filter(|e| !trashed(&e.fields))
            .map(|e| Reminder::from_fields(&e.id, &e.fields))
            .collect();

        let habit_entities = store.list("habit");
        let habit_rows = habit_entities.len();
        let hidden = hidden_habits(&habit_entities);
        let mut all_habits: Vec<Habit> = habit_entities
            .iter()
            .filter(|e| !trashed(&e.fields) && !hidden.contains(&e.id))
            .map(|e| to_habit(&e.id, &e.fields, &tz))
            .collect();
        all_habits.sort_by(|a, b| {
            a.sort_order
                .total_cmp(&b.sort_order)
                .then(a.created_at.cmp(&b.created_at))
        });
        let (habit_groups, habits): (Vec<Habit>, Vec<Habit>) = all_habits
            .into_iter()
            .partition(|h| h.kind == HabitKind::Group);

        let checkins = store
            .list("habit_checkin")
            .into_iter()
            .filter_map(|e| {
                let c = to_habit_checkin(&e.id, &e.fields);
                if c.habit_id.is_empty() {
                    return None;
                }
                Some(Checkin {
                    date: parse_date_key(&c.date)?,
                    habit_id: c.habit_id,
                    state: c.state,
                    created_at: c.created_at,
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

        let folders = projects
            .iter()
            .filter(|p| p.kind == "folder")
            .cloned()
            .collect();
        Self {
            folders,
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
            reminder_list,
            habits,
            habit_groups,
            habit_rows,
            checkins,
            focus,
            comments,
            sync,
            linger: HashSet::new(),
            prefs: store.get("preference", PREFERENCES_ID).unwrap_or_default(),
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

    /// A habit's recorded days. Duplicate rows for a day (from before derived ids) resolve as
    /// `useHabitCheckins` does: a completion wins.
    pub fn states_of(&self, habit: &str) -> CheckinStates {
        let mut out = CheckinStates::new();
        for c in self.checkins.iter().filter(|c| c.habit_id == habit) {
            let seen = out.get(&c.date).copied();
            out.insert(
                c.date,
                if seen == Some(CheckinState::Done) {
                    CheckinState::Done
                } else {
                    c.state
                },
            );
        }
        out
    }

    /// Whether the day's check-in was recorded on a later day.
    pub fn backfilled(&self, habit: &str, day: Date) -> bool {
        self.checkins.iter().any(|c| {
            c.habit_id == habit
                && c.date == day
                && c.state == CheckinState::Done
                && c.created_at > 0
                && self.date_of(c.created_at) != day
        })
    }

    /// The `week_starts_on` preference (0 is Sunday).
    pub fn week_starts_on(&self) -> i64 {
        self.prefs
            .get("week_starts_on")
            .and_then(Value::as_i64)
            .unwrap_or(0)
    }
}

/// Habits hidden by an archived or trashed ancestor (`hiddenHabitIds`): a group's members leave
/// the list with it, and come back when it is restored.
fn hidden_habits(rows: &[atlas_client::store::ResolvedEntity]) -> HashSet<String> {
    let by_id: std::collections::HashMap<&str, &Map<String, Value>> =
        rows.iter().map(|e| (e.id.as_str(), &e.fields)).collect();
    let mut hidden = HashSet::new();
    for e in rows {
        let mut seen = HashSet::new();
        let mut cursor = e.fields.get("parent_id").and_then(Value::as_str);
        while let Some(id) = cursor {
            if !seen.insert(id) {
                break;
            }
            let Some(fields) = by_id.get(id) else { break };
            if trashed(fields) {
                hidden.insert(e.id.clone());
                break;
            }
            cursor = fields.get("parent_id").and_then(Value::as_str);
        }
    }
    hidden
}

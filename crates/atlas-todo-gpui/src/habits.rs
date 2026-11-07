//! Habits (`HabitsScreen`): a card per habit with the shown day's check, the streak, the current
//! period and the last seven days; habit groups (routines) as boxes around their members; the
//! Today/Yesterday and Due/All switches; the add/edit sheet and each card's menu. Streaks, periods
//! and schedules are `atlas-todo-rules`' habit rules, the same as `@atlastodo/todo-core`'s.

use std::collections::HashMap;
use std::rc::Rc;

use gpui::{
    anchored, deferred, div, prelude::*, px, rgb, AnyElement, ClickEvent, Context, Entity,
    Focusable, FontWeight, Pixels, Point, SharedString, Subscription, Window,
};
use serde_json::Value;

use atlas_todo_rules::rules::habit_groups::{
    flatten_habit_groups, habit_group_streak, habit_group_today, HabitGroupMember, HabitListRow,
};
use atlas_todo_rules::rules::habits::{
    append_schedule_change, current_period, current_streak, is_active_today, is_scheduled_on,
    schedule_history_json, shift_date_key, CheckinState, CheckinStates, GoalKind, GoalPatch, Habit,
    HabitKind,
};

use crate::app::AtlasApp;
use crate::format;
use crate::input::{Cancel, Submit, TextInput};
use crate::model::Checkin;
use crate::motion;
use crate::sync::{next_habit_state, Command};
use crate::theme::{hex, Theme, FLAME, PROJECT_COLORS, RED};
use crate::ui::ts;
use crate::ui::{dot, icon, segmented};

const MAX_WEEKLY: i64 = 7;
const MAX_INTERVAL: i64 = 365;

/// A card's open menu.
pub struct Menu {
    pub habit: String,
    pub pos: Point<Pixels>,
}

/// The add/edit sheet (`AddHabitSheet`, and the detail screen's goal editor).
pub struct Sheet {
    /// The habit or group being edited; `None` adds one.
    pub editing: Option<String>,
    pub kind: HabitKind,
    pub parent_id: Option<String>,
    pub goal_kind: GoalKind,
    pub days: Vec<u8>,
    pub target: i64,
    pub color: String,
    pub input: Entity<TextInput>,
    /// Tells the sheets apart, so each one animates in.
    seq: u64,
    _subs: Vec<Subscription>,
}

/// The Habits screen's own state.
#[derive(Default)]
pub struct HabitsUi {
    /// Recording yesterday rather than today. Momentary, not a preference: a backfill is a visit.
    pub yesterday: bool,
    pub menu: Option<Menu>,
    pub sheet: Option<Sheet>,
    seq: u64,
}

fn color_of(h: &Habit) -> gpui::Rgba {
    hex(&h.color, PROJECT_COLORS[0])
}

fn color_hex(c: u32) -> String {
    format!("#{c:06x}")
}

/// Advance a day (clear -> done -> skip -> clear), shown at once and written by the worker.
pub fn toggle_today(this: &mut AtlasApp, habit: &str, day: jiff::civil::Date) {
    let snap = Rc::make_mut(&mut this.snap);
    let current = snap.states_of(habit).get(&day).copied();
    snap.checkins
        .retain(|c| !(c.habit_id == habit && c.date == day));
    if let Some(state) = next_habit_state(current) {
        snap.checkins.push(Checkin {
            habit_id: habit.to_owned(),
            date: day,
            state,
            created_at: crate::now_ms(),
        });
    }
    this.send(Command::ToggleHabit(habit.to_owned(), day));
}

/// The day the screen records and reports on.
fn shown_day(app: &AtlasApp) -> jiff::civil::Date {
    if app.habits_ui.yesterday {
        shift_date_key(app.today, -1)
    } else {
        app.today
    }
}

fn open_sheet(
    this: &mut AtlasApp,
    kind: HabitKind,
    parent_id: Option<String>,
    editing: Option<&Habit>,
    window: &mut Window,
    cx: &mut Context<AtlasApp>,
) {
    let placeholder = if kind == HabitKind::Group {
        "e.g. Skincare routine"
    } else {
        "e.g. Meditate"
    };
    let input = cx.new(|cx| TextInput::new(placeholder, cx));
    if let Some(h) = editing {
        input.update(cx, |i, cx| i.set_text(&h.name, cx));
    }
    let subs = vec![
        cx.subscribe(&input, |this: &mut AtlasApp, _, _: &Submit, cx| {
            save_sheet(this, cx)
        }),
        cx.subscribe(&input, |this: &mut AtlasApp, _, _: &Cancel, cx| {
            this.habits_ui.sheet = None;
            cx.notify();
        }),
        // Redrawn as the name changes, for the Add button's disabled state.
        cx.observe(&input, |_, _, cx| cx.notify()),
    ];
    let handle = input.read(cx).focus_handle(cx);
    window.focus(&handle, cx);
    // A new habit's colour follows the number of habit rows, as `useHabits` picks it.
    let n = this.snap.habit_rows;
    this.habits_ui.seq += 1;
    this.habits_ui.menu = None;
    this.habits_ui.sheet = Some(Sheet {
        editing: editing.map(|h| h.id.clone()),
        kind,
        parent_id: editing.map_or(parent_id, |h| h.parent_id.clone()),
        goal_kind: editing.map_or(GoalKind::Daily, |h| h.goal_kind),
        days: editing.map_or_else(Vec::new, |h| h.days.clone()),
        target: editing.map_or(1, |h| h.target),
        color: editing.map_or_else(
            || color_hex(PROJECT_COLORS[n % PROJECT_COLORS.len()]),
            |h| h.color.clone(),
        ),
        input,
        seq: this.habits_ui.seq,
        _subs: subs,
    });
    cx.notify();
}

fn find_habit<'a>(app: &'a AtlasApp, id: &str) -> Option<&'a Habit> {
    app.snap
        .habits
        .iter()
        .chain(app.snap.habit_groups.iter())
        .find(|h| h.id == id)
}

/// Write the sheet: a new `habit` row with `createHabit`'s fields, or the changed fields of the
/// one edited (a goal change recorded in `schedule_history` first, as `updateHabit` does).
fn save_sheet(this: &mut AtlasApp, cx: &mut Context<AtlasApp>) {
    let Some(sheet) = this.habits_ui.sheet.as_ref() else {
        return;
    };
    let name = sheet.input.read(cx).text().trim().to_owned();
    if name.is_empty() {
        return;
    }
    let now = crate::now_ms();
    let group = sheet.kind == HabitKind::Group;
    match sheet.editing.clone() {
        None => {
            let fields = vec![
                ("name", Value::from(name)),
                ("kind", Value::from(if group { "group" } else { "habit" })),
                (
                    "parent_id",
                    if group {
                        Value::Null
                    } else {
                        sheet.parent_id.clone().map_or(Value::Null, Value::from)
                    },
                ),
                ("goal_kind", Value::from(sheet.goal_kind.as_str())),
                ("days", Value::from(sheet.days.clone())),
                ("target", Value::from(sheet.target)),
                ("color", Value::from(sheet.color.clone())),
                ("icon", Value::from(if group { "folder" } else { "hash" })),
                ("notes", Value::from("")),
                ("steps", Value::Array(Vec::new())),
                ("reminder_time", Value::Null),
                ("archived_at", Value::Null),
                ("created_at", Value::from(now)),
                ("sort_order", Value::from(now)),
            ];
            this.send(Command::CreateEntity {
                kind: "habit".into(),
                fields: fields.into_iter().map(|(k, v)| (k.to_owned(), v)).collect(),
            });
        }
        Some(id) => {
            let Some(habit) = find_habit(this, &id).cloned() else {
                this.habits_ui.sheet = None;
                return;
            };
            let mut fields: Vec<(String, Value)> = Vec::new();
            let patch = GoalPatch {
                goal_kind: (sheet.goal_kind != habit.goal_kind).then_some(sheet.goal_kind),
                days: (sheet.days != habit.days).then(|| sheet.days.clone()),
                target: (sheet.target != habit.target).then_some(sheet.target),
            };
            if !group {
                if let Some(history) = append_schedule_change(&habit, &patch, this.today) {
                    fields.push(("schedule_history".into(), schedule_history_json(&history)));
                }
                if let Some(k) = patch.goal_kind {
                    fields.push(("goal_kind".into(), Value::from(k.as_str())));
                }
                if let Some(d) = patch.days {
                    fields.push(("days".into(), Value::from(d)));
                }
                if let Some(t) = patch.target {
                    fields.push(("target".into(), Value::from(t)));
                }
                if sheet.parent_id != habit.parent_id {
                    // Last among its new siblings (`moveHabitTarget`, `rankBetween(last, null)`).
                    let last = this
                        .snap
                        .habits
                        .iter()
                        .filter(|h| h.id != id && h.parent_id == sheet.parent_id)
                        .chain(
                            this.snap
                                .habit_groups
                                .iter()
                                .filter(|_| sheet.parent_id.is_none()),
                        )
                        .map(|h| h.sort_order)
                        .reduce(f64::max);
                    fields.push((
                        "parent_id".into(),
                        sheet.parent_id.clone().map_or(Value::Null, Value::from),
                    ));
                    fields.push((
                        "sort_order".into(),
                        Value::from(last.map_or(0.0, |l| l + 1.0)),
                    ));
                }
            }
            if name != habit.name {
                fields.push(("name".into(), Value::from(name)));
            }
            if sheet.color != habit.color {
                fields.push(("color".into(), Value::from(sheet.color.clone())));
            }
            if !fields.is_empty() {
                this.send(Command::SetFields {
                    kind: "habit".into(),
                    id,
                    fields,
                });
            }
        }
    }
    this.habits_ui.sheet = None;
    cx.notify();
}

/// Archive (`archived_at`) or trash (`deleted_at`) a habit or group, gone from the list at once.
/// A group's members leave with it and come back when it is restored.
fn retire(this: &mut AtlasApp, id: &str, field: &str, cx: &mut Context<AtlasApp>) {
    let snap = Rc::make_mut(&mut this.snap);
    snap.habits
        .retain(|h| h.id != id && h.parent_id.as_deref() != Some(id));
    snap.habit_groups.retain(|h| h.id != id);
    this.send(Command::SetFields {
        kind: "habit".into(),
        id: id.to_owned(),
        fields: vec![(field.to_owned(), Value::from(crate::now_ms()))],
    });
    this.habits_ui.menu = None;
    cx.notify();
}

/// Groups folded in the list (the synced `habit_group_expanded` map; a group is open by default).
fn expanded(app: &AtlasApp, group: &str) -> bool {
    app.pref("habit_group_expanded")
        .and_then(|m| m.get(group))
        .and_then(Value::as_bool)
        != Some(false)
}

fn toggle_group(this: &mut AtlasApp, group: &str, cx: &mut Context<AtlasApp>) {
    let open = expanded(this, group);
    let mut map = this
        .pref("habit_group_expanded")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    map.insert(group.to_owned(), Value::from(!open));
    this.set_pref("habit_group_expanded", Value::Object(map), cx);
}

struct Shown<'a> {
    snap: &'a crate::model::Snapshot,
    day: jiff::civil::Date,
    ws: i64,
    states: &'a HashMap<String, CheckinStates>,
    yesterday: bool,
}

fn menu_button(id: String, t: &Theme, cx: &mut Context<AtlasApp>) -> impl IntoElement {
    div()
        .id(SharedString::from(format!("habit-menu-{id}")))
        .p(px(4.))
        .rounded(px(6.))
        .cursor_pointer()
        .hover(|d| d.bg(t.hover))
        .on_click(cx.listener(move |this, ev: &ClickEvent, _, cx| {
            this.habits_ui.menu = Some(Menu {
                habit: id.clone(),
                pos: ev.position(),
            });
            cx.notify();
        }))
        .child(icon("ellipsis-vertical", 18., t.faint))
}

fn habit_card(
    h: &Habit,
    shown: &Shown,
    in_group: bool,
    t: &Theme,
    cx: &mut Context<AtlasApp>,
) -> AnyElement {
    let color = color_of(h);
    let empty = CheckinStates::new();
    let states = shown.states.get(&h.id).unwrap_or(&empty);
    let day = shown.day;
    let state = states.get(&day).copied();
    let done = state == Some(CheckinState::Done);
    let streak = current_streak(h, states, day, shown.ws);
    let period = current_period(h, states, day, shown.ws);
    let hid = h.id.clone();
    let check = div()
        .id(SharedString::from(format!("habit-check-{}", h.id)))
        .size(px(30.))
        .rounded_full()
        .flex()
        .items_center()
        .justify_center()
        .cursor_pointer()
        .map(|d| match state {
            Some(CheckinState::Done) => d.bg(color),
            Some(CheckinState::Skip) => d.border_2().border_dashed().border_color(t.faint),
            None => d.border_2().border_color(t.border),
        })
        .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| {
            let day = shown_day(this);
            toggle_today(this, &hid, day);
            cx.notify();
        }))
        .when(done, |d| d.child(icon("check", 16., t.on_accent)));
    // A done check pops: it springs from slightly small to full size.
    let check = motion::spring_from(
        check,
        SharedString::from(format!("habit-pop-{}-{done}", h.id)),
        motion::SNAPPY,
        if done { 0.6 } else { 1.0 },
        1.0,
        |el, v| el.size(px(30. * v)),
    );
    let created = h.created;
    let mut week = div().flex().gap(px(8.));
    for back in (0..7).rev() {
        let d = shift_date_key(day, -back);
        let st = states.get(&d).copied();
        let scheduled = is_scheduled_on(h, d, shown.ws);
        let current = back == 0;
        let backfilled = st == Some(CheckinState::Done) && shown.snap.backfilled(&h.id, d);
        // Every day before the shown one is settled: due and not recorded means missed. The shown
        // day is still open; so are days before the habit existed.
        let missed = st.is_none() && scheduled && !current && d >= created;
        let hid = h.id.clone();
        let cell = div()
            .id(SharedString::from(format!("habit-day-{}-{d}", h.id)))
            .size(px(32.))
            .rounded_full()
            .flex()
            .items_center()
            .justify_center()
            .text_size(ts(13.))
            .cursor_pointer()
            .map(|c| match st {
                Some(CheckinState::Done) if backfilled => {
                    c.border_2().border_color(color).text_color(t.text_soft)
                }
                Some(CheckinState::Done) => c
                    .bg(color)
                    .text_color(t.on_accent)
                    .font_weight(FontWeight::MEDIUM),
                Some(CheckinState::Skip) => c
                    .border_1()
                    .border_dashed()
                    .border_color(t.faint)
                    .text_color(t.text_soft),
                None if missed => c.bg(t.cell_off).text_color(t.text_soft),
                None if scheduled => c.border_1().border_color(t.border).text_color(t.text_soft),
                None => c.text_color(t.faint),
            })
            .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| {
                toggle_today(this, &hid, d);
                cx.notify();
            }))
            .child(SharedString::from(d.day().to_string()));
        week = week.child(
            div()
                .flex()
                .flex_col()
                .items_center()
                .gap(px(4.))
                .child(
                    div()
                        .text_size(ts(12.))
                        .text_color(if current { t.accent_text } else { t.faint })
                        .when(current, |d| d.font_weight(FontWeight::SEMIBOLD))
                        .child(format::weekday_short(d.weekday())),
                )
                .child(if current {
                    div()
                        .p(px(2.))
                        .rounded_full()
                        .border_2()
                        .border_color(t.accent)
                        .child(cell)
                } else {
                    div().p(px(4.)).child(cell)
                }),
        );
    }
    let unit = if h.goal_kind == GoalKind::Daily {
        if streak == 1 {
            "day"
        } else {
            "days"
        }
    } else if streak == 1 {
        "period"
    } else {
        "periods"
    };
    let progress = period
        .filter(|p| p.target > 0)
        .map(|p| format!("{} of {}", p.done, p.target));
    div()
        .flex()
        .items_center()
        .gap(px(12.))
        .px(px(12.))
        .py(px(10.))
        .map(|d| {
            if in_group {
                d.border_t_1().border_color(t.border)
            } else {
                d.rounded(px(10.))
                    .border_1()
                    .border_color(t.border)
                    .bg(t.surface)
            }
        })
        .when(in_group, |d| {
            // The routine's colour, run down the card's inside edge.
            d.child(div().w(px(2.)).h(px(40.)).rounded_full().bg(color))
        })
        .child(
            div()
                .size(px(32.))
                .flex()
                .items_center()
                .justify_center()
                .child(check),
        )
        .child(
            div()
                .flex_1()
                .min_w_0()
                .flex()
                .flex_col()
                .gap(px(2.))
                .child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(10.))
                        .child(icon("hash", 15., color))
                        .child(
                            div()
                                .text_size(ts(16.))
                                .truncate()
                                .child(SharedString::from(h.name.clone())),
                        ),
                )
                .child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(10.))
                        .text_size(ts(14.))
                        .text_color(t.muted)
                        .child(icon("flame", 14., rgb(FLAME)))
                        .child(SharedString::from(format!("{streak} {unit}")))
                        .when_some(progress, |d, p| d.child(SharedString::from(p))),
                ),
        )
        .child(week)
        .child(menu_button(h.id.clone(), t, cx))
        .into_any_element()
}

fn group_box(
    group: &Habit,
    members: &[&Habit],
    all_members: &[&Habit],
    open: bool,
    shown: &Shown,
    t: &Theme,
    cx: &mut Context<AtlasApp>,
) -> AnyElement {
    let empty = CheckinStates::new();
    let scored: Vec<HabitGroupMember> = all_members
        .iter()
        .map(|habit| HabitGroupMember {
            habit,
            states: shown.states.get(&habit.id).unwrap_or(&empty),
        })
        .collect();
    let streak = habit_group_streak(&scored, shown.day, shown.ws);
    let today = habit_group_today(&scored, shown.day, shown.ws);
    let when = if shown.yesterday {
        "yesterday"
    } else {
        "today"
    };
    let status = match today {
        Some(d) if d.due > 0 => format!("{} of {} {when}", d.done, d.due),
        _ if shown.yesterday => "Nothing was scheduled yesterday".into(),
        _ => "Nothing scheduled today".into(),
    };
    let gid = group.id.clone();
    let header = div()
        .flex()
        .items_center()
        .gap(px(10.))
        .px(px(12.))
        .py(px(10.))
        .bg(t.hover)
        .child(
            div()
                .flex_1()
                .min_w_0()
                .flex()
                .flex_col()
                .gap(px(2.))
                .child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(10.))
                        .child(icon("folder", 16., color_of(group)))
                        .child(
                            div()
                                .text_size(ts(16.))
                                .font_weight(FontWeight::SEMIBOLD)
                                .truncate()
                                .child(SharedString::from(group.name.clone())),
                        ),
                )
                .child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(10.))
                        .text_size(ts(14.))
                        .text_color(t.muted)
                        .child(icon("flame", 14., rgb(FLAME)))
                        .child(SharedString::from(format!(
                            "{streak} {}",
                            if streak == 1 { "day" } else { "days" }
                        )))
                        .child(SharedString::from(status)),
                ),
        )
        .child(
            div()
                .id(SharedString::from(format!("habit-group-fold-{gid}")))
                .p(px(4.))
                .rounded(px(6.))
                .cursor_pointer()
                .hover(|d| d.bg(t.selected))
                .on_click(
                    cx.listener(move |this, _: &ClickEvent, _, cx| toggle_group(this, &gid, cx)),
                )
                .child(icon(
                    if open { "chevron-up" } else { "chevron-down" },
                    16.,
                    t.muted,
                )),
        )
        .child(menu_button(group.id.clone(), t, cx));
    let mut col = div()
        .flex()
        .flex_col()
        .rounded(px(10.))
        .border_1()
        .border_color(t.border)
        .bg(t.surface)
        .overflow_hidden()
        .child(header);
    if open {
        for m in members {
            col = col.child(habit_card(m, shown, true, t, cx));
        }
    }
    col.into_any_element()
}

fn dashed(
    id: &'static str,
    glyph: &'static str,
    label: &'static str,
    kind: HabitKind,
    t: &Theme,
    cx: &mut Context<AtlasApp>,
) -> impl IntoElement {
    div()
        .id(id)
        .flex_1()
        .h(px(44.))
        .flex()
        .items_center()
        .justify_center()
        .gap(px(10.))
        .rounded(px(10.))
        .border_1()
        .border_dashed()
        .border_color(t.border)
        .text_size(ts(16.))
        .text_color(t.accent_text)
        .cursor_pointer()
        .hover(|d| d.bg(t.hover))
        .on_click(cx.listener(move |this, _: &ClickEvent, window, cx| {
            open_sheet(this, kind, None, None, window, cx)
        }))
        .child(icon(glyph, 18., t.accent_text))
        .child(label)
}

pub fn habits(app: &mut AtlasApp, t: &Theme, cx: &mut Context<AtlasApp>) -> AnyElement {
    let snap = app.snap.clone();
    let day = shown_day(app);
    let yesterday = app.habits_ui.yesterday;
    let ws = snap.week_starts_on();
    // Defaults to Due: a habit not scheduled on the shown day is noise.
    let due_only = app.pref("habits_scope").and_then(Value::as_str) != Some("all");
    let states: HashMap<String, CheckinStates> = snap
        .habits
        .iter()
        .map(|h| (h.id.clone(), snap.states_of(&h.id)))
        .collect();
    let mut all: Vec<Habit> = snap
        .habits
        .iter()
        .chain(snap.habit_groups.iter())
        .cloned()
        .collect();
    all.sort_by(|a, b| {
        a.sort_order
            .total_cmp(&b.sort_order)
            .then(a.created_at.cmp(&b.created_at))
    });
    let listed: Vec<Habit> = if due_only {
        let active = |h: &Habit| is_active_today(h, &states[&h.id], day, ws);
        all.iter()
            .filter(|item| {
                if item.kind != HabitKind::Group {
                    return active(item);
                }
                let mut members = snap
                    .habits
                    .iter()
                    .filter(|h| h.parent_id.as_deref() == Some(&item.id))
                    .peekable();
                // An empty group is kept: hiding it would strand a new routine.
                members.peek().is_none() || members.any(active)
            })
            .cloned()
            .collect()
    } else {
        all.clone()
    };
    let hidden = all.len() - listed.len();
    let rows = flatten_habit_groups(&listed, |g| expanded(app, g));

    let e1 = cx.entity();
    let e2 = cx.entity();
    let tabs = div()
        .flex()
        .flex_col()
        .gap(px(12.))
        .child(segmented(
            "habit-day",
            &["Today", "Yesterday"],
            usize::from(yesterday),
            true,
            t,
            move |i, _, cx| {
                e1.update(cx, |this, cx| {
                    this.habits_ui.yesterday = i == 1;
                    cx.notify();
                })
            },
        ))
        .child(segmented(
            "habit-filter",
            &["Due", "All"],
            usize::from(!due_only),
            true,
            t,
            move |i, _, cx| {
                e2.update(cx, |this, cx| {
                    this.set_pref(
                        "habits_scope",
                        Value::from(if i == 0 { "today" } else { "all" }),
                        cx,
                    )
                })
            },
        ));
    let mut col = div().flex().flex_col().gap(px(8.));
    if !snap.habits.is_empty() {
        col = col.child(tabs);
    }
    col = col.child(
        div()
            .mt(px(8.))
            .flex()
            .gap(px(8.))
            .child(dashed(
                "habit-add",
                "plus",
                "Add habit",
                HabitKind::Habit,
                t,
                cx,
            ))
            .child(dashed(
                "habit-add-group",
                "folder-plus",
                "New group",
                HabitKind::Group,
                t,
                cx,
            )),
    );
    let shown = Shown {
        snap: &snap,
        day,
        ws,
        states: &states,
        yesterday,
    };
    let mut i = 0;
    while i < rows.len() {
        match &rows[i] {
            HabitListRow::Habit { habit, .. } => {
                col = col.child(habit_card(habit, &shown, false, t, cx));
                i += 1;
            }
            HabitListRow::Group {
                group, expanded, ..
            } => {
                let mut members = Vec::new();
                i += 1;
                while let Some(HabitListRow::Habit { habit, depth: 1 }) = rows.get(i) {
                    members.push(*habit);
                    i += 1;
                }
                let all_members: Vec<&Habit> = snap
                    .habits
                    .iter()
                    .filter(|h| h.parent_id.as_deref() == Some(&group.id))
                    .collect();
                col = col.child(group_box(
                    group,
                    &members,
                    &all_members,
                    *expanded,
                    &shown,
                    t,
                    cx,
                ));
            }
        }
    }
    if snap.habits.is_empty() && snap.habit_groups.is_empty() {
        col = col.child(crate::list::empty(
            "flame",
            "No habits yet. Add one to start a streak.",
            t,
        ));
    } else if rows.is_empty() {
        col = col.child(crate::list::empty(
            "flame",
            if yesterday {
                "No habits were due yesterday."
            } else {
                "No habits due today. Enjoy the day off."
            },
            t,
        ));
        let e = cx.entity();
        col = col.child(
            div().flex().justify_center().child(
                div()
                    .id("habit-show-all")
                    .px(px(14.))
                    .py(px(8.))
                    .rounded(px(8.))
                    .bg(t.accent)
                    .text_color(t.on_accent)
                    .text_size(ts(14.))
                    .cursor_pointer()
                    .on_click(move |_, _, cx| {
                        e.update(cx, |this, cx| {
                            this.set_pref("habits_scope", Value::from("all"), cx)
                        })
                    })
                    .child("Show all habits"),
            ),
        );
    }
    let swatch = |label: &'static str, el: gpui::Div| {
        div()
            .flex()
            .items_center()
            .gap(px(6.))
            .child(el)
            .child(label)
    };
    let legend = div()
        .mt(px(4.))
        .flex()
        .flex_wrap()
        .gap(px(18.))
        .text_size(ts(13.))
        .text_color(t.muted)
        .child(swatch("Done", dot(11., t.accent)))
        .child(swatch("Missed", dot(11., t.cell_off)))
        .child(swatch(
            "Skipped",
            div()
                .size(px(11.))
                .rounded_full()
                .border_1()
                .border_dashed()
                .border_color(t.faint),
        ))
        .child(swatch(
            "Not done yet",
            div()
                .size(px(11.))
                .rounded_full()
                .border_1()
                .border_color(t.border),
        ))
        .child(swatch(
            "Today",
            div()
                .size(px(11.))
                .rounded_full()
                .border_2()
                .border_color(t.accent),
        ));
    col = col.child(legend);
    if hidden > 0 && !rows.is_empty() {
        let (one, many) = if yesterday {
            (
                "habit wasn't scheduled yesterday.",
                "habits weren't scheduled yesterday.",
            )
        } else {
            (
                "habit isn't scheduled today.",
                "habits aren't scheduled today.",
            )
        };
        col = col.child(
            div()
                .text_size(ts(13.))
                .text_color(t.muted)
                .child(SharedString::from(format!(
                    "{hidden} {}",
                    if hidden == 1 { one } else { many }
                ))),
        );
    }
    div()
        .flex()
        .flex_col()
        .size_full()
        .child(app.header(None, "Habits", div().into_any_element(), t))
        .child(
            div()
                .id("habits")
                .flex_1()
                .min_h_0()
                .overflow_y_scroll()
                .px(px(16.))
                .pt(px(14.))
                .pb(px(40.))
                .child(col),
        )
        .into_any_element()
}

/// The open menu or sheet, over the whole window.
pub fn overlay(app: &mut AtlasApp, t: &Theme, cx: &mut Context<AtlasApp>) -> Option<AnyElement> {
    if app.habits_ui.sheet.is_some() {
        return Some(sheet(app, t, cx));
    }
    let menu = app.habits_ui.menu.as_ref()?;
    let habit = find_habit(app, &menu.habit)?.clone();
    let pos = menu.pos;
    let group = habit.kind == HabitKind::Group;
    let item = |id: &'static str, glyph: &'static str, label: &'static str, danger: bool| {
        div()
            .id(id)
            .h(px(36.))
            .px(px(12.))
            .flex()
            .items_center()
            .gap(px(10.))
            .rounded(px(6.))
            .cursor_pointer()
            .hover(|d| d.bg(t.hover))
            .text_size(ts(15.))
            .text_color(if danger { rgb(RED) } else { t.text_soft })
            .child(icon(glyph, 16., if danger { rgb(RED) } else { t.muted }))
            .child(label)
    };
    let sep = || div().my(px(4.)).h(px(1.)).bg(t.border);
    let mut list = div()
        .id("habit-menu")
        .w(px(230.))
        .p(px(4.))
        .flex()
        .flex_col()
        .rounded(px(10.))
        .border_1()
        .border_color(t.border)
        .bg(t.surface)
        .shadow_lg()
        .on_click(|_, _, cx| cx.stop_propagation());
    if group {
        let gid = habit.id.clone();
        list = list.child(
            item("habit-menu-add", "plus", "Add habit to group", false).on_click(cx.listener(
                move |this, _: &ClickEvent, window, cx| {
                    open_sheet(this, HabitKind::Habit, Some(gid.clone()), None, window, cx)
                },
            )),
        );
    }
    let edit = habit.clone();
    list = list.child(
        item(
            "habit-menu-edit",
            "pencil",
            if group { "Edit group" } else { "Edit habit" },
            false,
        )
        .on_click(cx.listener(move |this, _: &ClickEvent, window, cx| {
            open_sheet(this, edit.kind, None, Some(&edit), window, cx)
        })),
    );
    let (aid, did) = (habit.id.clone(), habit.id.clone());
    list = list
        .child(sep())
        .child(
            item(
                "habit-menu-archive",
                "archive",
                if group {
                    "Archive group"
                } else {
                    "Archive habit"
                },
                false,
            )
            .on_click(
                cx.listener(move |this, _: &ClickEvent, _, cx| {
                    retire(this, &aid, "archived_at", cx)
                }),
            ),
        )
        .child(sep())
        .child(item("habit-menu-delete", "trash", "Delete", true).on_click(
            cx.listener(move |this, _: &ClickEvent, _, cx| retire(this, &did, "deleted_at", cx)),
        ));
    let list = motion::enter(
        list,
        SharedString::from(format!("habit-menu-in-{}-{:?}", habit.id, pos)),
        160,
        |el, v| el.opacity(v).mt(px((1. - v) * -6.)),
    );
    Some(
        div()
            .id("habit-menu-backdrop")
            .absolute()
            .inset_0()
            .on_click(cx.listener(|this, _: &ClickEvent, _, cx| {
                this.habits_ui.menu = None;
                cx.notify();
            }))
            .child(deferred(
                anchored()
                    .position(pos)
                    .snap_to_window_with_margin(px(8.))
                    .child(list),
            ))
            .into_any_element(),
    )
}

fn stepper(
    label: &'static str,
    value: i64,
    max: i64,
    t: &Theme,
    cx: &mut Context<AtlasApp>,
) -> impl IntoElement {
    let button = |id: &'static str, glyph: &'static str, on: bool, delta: i64| {
        div()
            .id(id)
            .size(px(32.))
            .rounded_full()
            .flex()
            .items_center()
            .justify_center()
            .border_1()
            .border_color(t.border)
            .when(!on, |d| d.opacity(0.4))
            .when(on, |d| d.cursor_pointer().hover(|d| d.bg(t.hover)))
            .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| {
                if let Some(s) = this.habits_ui.sheet.as_mut() {
                    s.target = (s.target + delta).clamp(1, max);
                }
                cx.notify();
            }))
            .child(icon(glyph, 16., t.text_soft))
    };
    div()
        .flex()
        .items_center()
        .justify_between()
        .child(
            div()
                .text_size(ts(15.))
                .text_color(t.text_soft)
                .child(label),
        )
        .child(
            div()
                .flex()
                .items_center()
                .gap(px(12.))
                .child(button("habit-goal-minus", "minus", value > 1, -1))
                .child(
                    div()
                        .min_w(px(24.))
                        .flex()
                        .justify_center()
                        .text_size(ts(16.))
                        .font_weight(FontWeight::SEMIBOLD)
                        .child(SharedString::from(value.to_string())),
                )
                .child(button("habit-goal-plus", "plus", value < max, 1)),
        )
}

fn sheet(app: &mut AtlasApp, t: &Theme, cx: &mut Context<AtlasApp>) -> AnyElement {
    let ws = app.snap.week_starts_on();
    let groups: Vec<(String, String)> = app
        .snap
        .habit_groups
        .iter()
        .map(|g| (g.id.clone(), g.name.clone()))
        .collect();
    let s = app.habits_ui.sheet.as_ref().expect("the sheet is open");
    let group = s.kind == HabitKind::Group;
    let editing = s.editing.is_some();
    let name_empty = s.input.read(cx).text().trim().is_empty();
    let title = match (group, editing) {
        (true, true) => "Edit group",
        (true, false) => "New group",
        (false, true) => "Edit habit",
        (false, false) => "New habit",
    };
    let subtitle = (!editing)
        .then_some(s.parent_id.as_ref())
        .flatten()
        .and_then(|p| groups.iter().find(|(id, _)| id == p))
        .map(|(_, name)| format!("Adding to {name}"));
    let (goal_kind, days, target, color, parent) = (
        s.goal_kind,
        s.days.clone(),
        s.target,
        s.color.clone(),
        s.parent_id.clone(),
    );
    let (input, seq) = (s.input.clone(), s.seq);

    let mut body = div().flex().flex_col().gap(px(16.)).child(
        div()
            .h(px(40.))
            .px(px(12.))
            .flex()
            .items_center()
            .rounded(px(8.))
            .border_1()
            .border_color(t.border)
            .text_size(ts(15.))
            .text_color(t.text)
            .child(input),
    );

    let mut swatches = div().flex().flex_wrap().gap(px(8.));
    for c in PROJECT_COLORS {
        let h = color_hex(c);
        let on = h.eq_ignore_ascii_case(&color);
        swatches = swatches.child(
            div()
                .id(SharedString::from(format!("habit-color-{h}")))
                .size(px(26.))
                .rounded_full()
                .flex()
                .items_center()
                .justify_center()
                .bg(rgb(c))
                .cursor_pointer()
                .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| {
                    if let Some(s) = this.habits_ui.sheet.as_mut() {
                        s.color = h.clone();
                    }
                    cx.notify();
                }))
                .when(on, |d| d.child(icon("check", 14., t.on_accent))),
        );
    }
    body = body.child(
        div()
            .flex()
            .flex_col()
            .gap(px(8.))
            .child(crate::ui::caps("Colour", t))
            .child(swatches),
    );

    if !group {
        let e = cx.entity();
        let mut goal = div()
            .flex()
            .flex_col()
            .gap(px(12.))
            .child(crate::ui::caps("Goal", t))
            .child(segmented(
                "habit-goal-kind",
                &["Daily", "Weekly", "Interval"],
                match goal_kind {
                    GoalKind::Daily => 0,
                    GoalKind::Weekly => 1,
                    GoalKind::Interval => 2,
                },
                true,
                t,
                move |i, _, cx| {
                    e.update(cx, |this, cx| {
                        if let Some(s) = this.habits_ui.sheet.as_mut() {
                            // Each kind reads `target` differently; reset it to that kind's default.
                            let (kind, target) = match i {
                                1 => (GoalKind::Weekly, 3),
                                2 => (GoalKind::Interval, 2),
                                _ => (GoalKind::Daily, 1),
                            };
                            if s.goal_kind != kind {
                                s.goal_kind = kind;
                                s.target = target;
                            }
                        }
                        cx.notify();
                    })
                },
            ));
        match goal_kind {
            GoalKind::Daily => {
                let mut row = div().flex().gap(px(4.));
                for i in 0..7 {
                    let wd = ((ws + i).rem_euclid(7)) as u8;
                    let on = days.is_empty() || days.contains(&wd);
                    let label = jiff::civil::Weekday::from_sunday_zero_offset(wd as i8)
                        .map(format::weekday_short)
                        .unwrap_or("");
                    row = row.child(
                        div()
                            .id(SharedString::from(format!("habit-weekday-{wd}")))
                            .flex_1()
                            .h(px(32.))
                            .rounded_full()
                            .flex()
                            .items_center()
                            .justify_center()
                            .text_size(ts(13.))
                            .cursor_pointer()
                            .map(|d| {
                                if on {
                                    d.bg(t.accent_soft)
                                        .text_color(t.accent_text)
                                        .font_weight(FontWeight::MEDIUM)
                                } else {
                                    d.bg(t.chip).text_color(t.muted)
                                }
                            })
                            .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| {
                                if let Some(s) = this.habits_ui.sheet.as_mut() {
                                    if let Some(i) = s.days.iter().position(|d| *d == wd) {
                                        s.days.remove(i);
                                    } else {
                                        s.days.push(wd);
                                        s.days.sort_unstable();
                                    }
                                }
                                cx.notify();
                            }))
                            .child(label),
                    );
                }
                let n = days.len();
                goal =
                    goal.child(row)
                        .child(div().text_size(ts(13.)).text_color(t.muted).child(
                            SharedString::from(match n {
                                0 => "Every day".to_owned(),
                                1 => "1 day a week".to_owned(),
                                n => format!("{n} days a week"),
                            }),
                        ));
            }
            GoalKind::Weekly => {
                goal = goal.child(stepper("Times per week", target, MAX_WEEKLY, t, cx));
            }
            GoalKind::Interval => {
                goal = goal.child(stepper("Every N days", target, MAX_INTERVAL, t, cx));
            }
        }
        body = body.child(goal);

        if editing && !groups.is_empty() {
            let mut picks = div().flex().flex_wrap().gap(px(8.));
            let options = std::iter::once((None, "No group".to_owned()))
                .chain(groups.iter().map(|(id, n)| (Some(id.clone()), n.clone())));
            for (i, (id, name)) in options.enumerate() {
                let on = id == parent;
                picks = picks.child(
                    div()
                        .id(SharedString::from(format!("habit-group-pick-{i}")))
                        .px(px(10.))
                        .py(px(6.))
                        .rounded(px(8.))
                        .border_1()
                        .text_size(ts(14.))
                        .cursor_pointer()
                        .map(|d| {
                            if on {
                                d.bg(t.accent_soft)
                                    .border_color(t.accent)
                                    .text_color(t.accent_text)
                            } else {
                                d.border_color(t.border).text_color(t.text_soft)
                            }
                        })
                        .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| {
                            if let Some(s) = this.habits_ui.sheet.as_mut() {
                                s.parent_id = id.clone();
                            }
                            cx.notify();
                        }))
                        .child(SharedString::from(name)),
                );
            }
            body = body.child(
                div()
                    .flex()
                    .flex_col()
                    .gap(px(8.))
                    .child(crate::ui::caps("Group", t))
                    .child(picks),
            );
        }
    }

    let buttons = div()
        .flex()
        .justify_end()
        .gap(px(8.))
        .child(
            div()
                .id("habit-sheet-cancel")
                .px(px(12.))
                .py(px(8.))
                .rounded(px(8.))
                .cursor_pointer()
                .hover(|d| d.bg(t.hover))
                .text_size(ts(14.))
                .text_color(t.text_soft)
                .on_click(cx.listener(|this, _: &ClickEvent, _, cx| {
                    this.habits_ui.sheet = None;
                    cx.notify();
                }))
                .child("Cancel"),
        )
        .child(
            div()
                .id("habit-sheet-save")
                .px(px(16.))
                .py(px(8.))
                .rounded(px(8.))
                .text_size(ts(14.))
                .font_weight(FontWeight::MEDIUM)
                .map(|d| {
                    if name_empty {
                        d.bg(t.chip).text_color(t.faint)
                    } else {
                        d.bg(t.accent).text_color(t.on_accent).cursor_pointer()
                    }
                })
                .on_click(cx.listener(|this, _: &ClickEvent, _, cx| save_sheet(this, cx)))
                .child(if editing { "Save" } else { "Add" }),
        );

    let dialog = div()
        .id("habit-sheet")
        .w(px(460.))
        .flex()
        .flex_col()
        .gap(px(18.))
        .p(px(22.))
        .rounded(px(16.))
        .bg(t.surface)
        .border_1()
        .border_color(t.border)
        .shadow_2xl()
        .on_click(|_, _, cx| cx.stop_propagation())
        .child(
            div()
                .flex()
                .flex_col()
                .gap(px(4.))
                .child(
                    div()
                        .text_size(ts(19.))
                        .font_weight(FontWeight::BOLD)
                        .child(title),
                )
                .when_some(subtitle, |d, s| {
                    d.child(
                        div()
                            .text_size(ts(14.))
                            .text_color(t.muted)
                            .child(SharedString::from(s)),
                    )
                }),
        )
        .child(body)
        .child(buttons);
    let dialog = motion::enter(
        dialog,
        SharedString::from(format!("habit-sheet-in-{seq}")),
        280,
        |el, v| el.opacity(v).mt(px((1. - v) * 24.)),
    );
    let overlay = div()
        .id("habit-sheet-overlay")
        .absolute()
        .inset_0()
        .flex()
        .items_center()
        .justify_center()
        .bg(t.overlay)
        .on_click(cx.listener(|this, _: &ClickEvent, _, cx| {
            this.habits_ui.sheet = None;
            cx.notify();
        }))
        .child(dialog);
    motion::enter(
        overlay,
        SharedString::from(format!("habit-sheet-fade-{seq}")),
        180,
        |el, v| el.opacity(v),
    )
}

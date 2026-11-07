//! The focus (pomodoro) timer, as the web app's `FocusProvider`, `FocusScreen` and `FocusBar`: a
//! run of work and break phases at the synced lengths (`pomodoro_*` preferences), started, paused,
//! skipped and stopped here. The run lives in the app, not the account: it is kept in the state
//! directory per account and recomputed at the next start (`rehydrate_run`), so a phase that ended
//! with the app closed is banked and the next waits for a click. Each work phase that ends
//! (finished, skipped or stopped) is logged as a `focus_session` with the time actually focused.
//!
//! The ring follows the wall clock frame by frame while it runs; the clock ticks four times a
//! second. While a run is active, a bar floats in the corner of every other screen.

use std::f32::consts::{FRAC_PI_2, TAU};
use std::path::PathBuf;
use std::rc::Rc;
use std::time::Duration;

use atlas_todo_rules::rules::pomodoro::{
    format_clock, phase_duration_ms, rehydrate_run, FocusSessionLog, Phase, PomodoroConfig,
    RunSnapshot,
};
use atlas_todo_rules::rules::task::Task;
use gpui::{
    canvas, div, point, prelude::*, px, rgb, AnyElement, ClickEvent, Context, FontWeight, Hsla,
    PathBuilder, Pixels, Point, Rgba, SharedString, Window,
};
use serde_json::Value;

use crate::app::{AtlasApp, Route};
use crate::motion;
use crate::sync::Command;
use crate::theme::Theme;
use crate::ui::{caps, icon, ts};

const TICK: Duration = Duration::from_millis(250);
/// Emerald-600, the colour both breaks are drawn in (`focusPhase.ts`).
const BREAK: u32 = 0x059669;
const MAX_DOTS: i64 = 12;

#[derive(Default)]
pub struct FocusTimer {
    pub run: Option<RunSnapshot>,
    /// The last instant the run was accurate.
    last_tick: i64,
    /// The account whose saved run was read.
    loaded_for: Option<String>,
    /// The task the next run is for (`None`: no task).
    picked: Option<String>,
    picker_open: bool,
    bar_collapsed: bool,
    /// Bumped to stop the running ticker.
    generation: u64,
}

pub fn config(app: &AtlasApp) -> PomodoroConfig {
    PomodoroConfig::from_prefs(&app.snap.prefs)
}

fn now() -> i64 {
    crate::now_ms()
}

fn run_file(user: &str) -> Option<PathBuf> {
    let base = std::env::var_os("XDG_STATE_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/state")))?;
    Some(
        base.join("atlas-todo-gpui")
            .join(format!("focus-run-{user}.json")),
    )
}

/// Keep the run (with when it was accurate) for the next start, or forget it when it ended.
fn persist(app: &AtlasApp) {
    if !app.is_live() || app.snap.user_id.is_empty() {
        return;
    }
    let Some(path) = run_file(&app.snap.user_id) else {
        return;
    };
    match &app.focus_timer.run {
        Some(run) => {
            let mut v = serde_json::to_value(run).unwrap_or_default();
            if let Some(o) = v.as_object_mut() {
                o.insert("savedAt".into(), Value::from(app.focus_timer.last_tick));
            }
            let _ = std::fs::create_dir_all(path.parent().expect("a parent"));
            if let Err(e) = std::fs::write(&path, v.to_string()) {
                eprintln!("could not keep the focus run: {e}");
            }
        }
        None => {
            let _ = std::fs::remove_file(&path);
        }
    }
}

/// Read the account's saved run once, recomputed for the time since.
pub fn ensure_loaded(app: &mut AtlasApp, cx: &mut Context<AtlasApp>) {
    let user = app.snap.user_id.clone();
    if user.is_empty() || app.focus_timer.loaded_for.as_deref() == Some(user.as_str()) {
        return;
    }
    app.focus_timer.loaded_for = Some(user.clone());
    let saved = run_file(&user)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str::<Value>(&s).ok());
    let Some(saved) = saved else {
        return;
    };
    let Some(saved_at) = saved.get("savedAt").and_then(Value::as_i64) else {
        return;
    };
    let Ok(run) = serde_json::from_value::<RunSnapshot>(saved) else {
        return;
    };
    let now = now();
    let (run, sessions) = rehydrate_run(&run, saved_at, now, &config(app));
    for s in sessions {
        log_session(app, s);
    }
    app.focus_timer.last_tick = now;
    set(app, Some(run), cx);
}

/// The `focus_session` of a work phase that ended (`useFocusSessions.logSession`).
fn log_session(app: &mut AtlasApp, s: FocusSessionLog) {
    if s.duration_ms <= 0 {
        return;
    }
    Rc::make_mut(&mut app.snap)
        .focus
        .push((s.duration_ms, s.ended_at));
    app.send(Command::CreateEntity {
        kind: "focus_session".into(),
        fields: vec![
            ("task_id".into(), Value::from(s.task_id.unwrap_or_default())),
            ("started_at".into(), Value::from(s.started_at)),
            ("ended_at".into(), Value::from(s.ended_at)),
            ("duration_ms".into(), Value::from(s.duration_ms)),
            ("created_at".into(), Value::from(now())),
        ],
    });
}

/// Commit a run: kept for the next start, ticking while it runs.
fn set(app: &mut AtlasApp, run: Option<RunSnapshot>, cx: &mut Context<AtlasApp>) {
    let running = run.as_ref().is_some_and(|r| r.running);
    app.focus_timer.run = run;
    app.focus_timer.generation += 1;
    persist(app);
    if running {
        let generation = app.focus_timer.generation;
        cx.spawn(async move |this, cx| loop {
            cx.background_executor().timer(TICK).await;
            let go = this.update(cx, |this, cx| {
                if this.focus_timer.generation != generation {
                    return false;
                }
                tick(this, cx);
                true
            });
            if !matches!(go, Ok(true)) {
                break;
            }
        })
        .detach();
    }
    cx.notify();
}

fn tick(app: &mut AtlasApp, cx: &mut Context<AtlasApp>) {
    let Some(prev) = app.focus_timer.run.clone().filter(|r| r.running) else {
        return;
    };
    let now = now();
    let ticked = prev.ticked(now - app.focus_timer.last_tick);
    app.focus_timer.last_tick = now;
    if ticked.remaining_ms > 0 {
        let moved = format_clock(ticked.remaining_ms) != format_clock(prev.remaining_ms);
        app.focus_timer.run = Some(ticked);
        if moved {
            cx.notify();
        }
        return;
    }
    // The phase ran out: bank the work, load the next phase waiting for a click, and say so.
    if let Some(log) = ticked.work_log(now) {
        log_session(app, log);
    }
    let work = ticked.phase == Phase::Work;
    let next = ticked.advanced(now, &config(app));
    set(app, Some(next), cx);
    if app.is_live() {
        crate::notify::listen(cx);
        let (title, body) = if work {
            ("Focus complete", "Time for a break.")
        } else {
            ("Break over", "Ready when you are.")
        };
        crate::notify::show(title, body, cx);
    }
}

/// Begin a fresh run, for a task or none.
pub fn start(app: &mut AtlasApp, task: Option<String>, cx: &mut Context<AtlasApp>) {
    let now = now();
    app.focus_timer.last_tick = now;
    let run = RunSnapshot::start(task, now, &config(app));
    set(app, Some(run), cx);
}

fn pause(app: &mut AtlasApp, cx: &mut Context<AtlasApp>) {
    tick(app, cx);
    if let Some(r) = app.focus_timer.run.clone() {
        set(
            app,
            Some(RunSnapshot {
                running: false,
                ..r
            }),
            cx,
        );
    }
}

fn resume(app: &mut AtlasApp, cx: &mut Context<AtlasApp>) {
    if let Some(r) = app.focus_timer.run.clone() {
        let now = now();
        app.focus_timer.last_tick = now;
        set(app, Some(r.resumed(now)), cx);
    }
}

fn skip(app: &mut AtlasApp, cx: &mut Context<AtlasApp>) {
    tick(app, cx);
    if let Some(r) = app.focus_timer.run.clone() {
        let now = now();
        if let Some(log) = r.work_log(now) {
            log_session(app, log);
        }
        let next = r.advanced(now, &config(app));
        set(app, Some(next), cx);
    }
}

fn stop(app: &mut AtlasApp, cx: &mut Context<AtlasApp>) {
    tick(app, cx);
    if let Some(log) = app.focus_timer.run.as_ref().and_then(|r| r.work_log(now())) {
        log_session(app, log);
    }
    set(app, None, cx);
}

/// The primary action under the ring, or the bar's play/pause.
fn primary(app: &mut AtlasApp, cx: &mut Context<AtlasApp>) {
    match app.focus_timer.run.clone() {
        None => {
            let task = app.focus_timer.picked.clone();
            start(app, task, cx);
        }
        Some(r) if r.running => pause(app, cx),
        Some(_) => resume(app, cx),
    }
}

/// The remaining time this frame: between ticks, the wall clock since the last one.
fn live_remaining(app: &AtlasApp) -> i64 {
    match &app.focus_timer.run {
        Some(r) if r.running => (r.remaining_ms - (now() - app.focus_timer.last_tick)).max(0),
        Some(r) => r.remaining_ms,
        None => 0,
    }
}

fn phase_label(phase: Phase) -> &'static str {
    match phase {
        Phase::Work => "Focus",
        Phase::ShortBreak => "Short break",
        Phase::LongBreak => "Long break",
    }
}

fn phase_start_label(phase: Phase) -> &'static str {
    match phase {
        Phase::Work => "Start focus",
        Phase::ShortBreak => "Start short break",
        Phase::LongBreak => "Start long break",
    }
}

fn phase_icon(phase: Phase) -> &'static str {
    match phase {
        Phase::Work => "timer",
        _ => "coffee",
    }
}

fn phase_color(phase: Phase, t: &Theme) -> Rgba {
    match phase {
        Phase::Work => t.accent,
        _ => rgb(BREAK),
    }
}

/// `displayTitle`: a task this device cannot read is named as such.
fn title_of(task: &Task) -> String {
    if task.locked {
        "Encrypted task".into()
    } else if task.title.is_empty() {
        "Untitled".into()
    } else {
        task.title.clone()
    }
}

/// `formatDuration`: "1h 5m", "25m", "<1m".
fn duration(ms: i64) -> String {
    let min = ms / 60_000;
    if min <= 0 {
        return "<1m".into();
    }
    if min >= 60 {
        format!("{}h {}m", min / 60, min % 60)
    } else {
        format!("{min}m")
    }
}

/// The countdown ring: a track, and an arc from twelve o'clock clockwise for the part of the phase
/// still to run, with round ends.
fn ring(size: f32, stroke: f32, progress: f32, color: Rgba, track: Rgba) -> impl IntoElement {
    canvas(
        |_, _, _| {},
        move |bounds, _, window, _| {
            let c = bounds.center();
            let r = (size - stroke) / 2.;
            let at = |f: f32, radius: f32| -> Point<Pixels> {
                let a = -FRAC_PI_2 + TAU * f;
                point(c.x + px(radius * a.cos()), c.y + px(radius * a.sin()))
            };
            const STEPS: usize = 180;
            let mut path = PathBuilder::stroke(px(stroke));
            path.move_to(at(0., r));
            for i in 1..=STEPS {
                path.line_to(at(i as f32 / STEPS as f32, r));
            }
            path.close();
            if let Ok(p) = path.build() {
                window.paint_path(p, track);
            }
            let p = progress.clamp(0., 1.);
            // Nothing at zero: a cap alone would paint a dot at twelve o'clock.
            if p <= 0. {
                return;
            }
            let n = ((STEPS as f32 * p).ceil() as usize).max(2);
            let mut arc = PathBuilder::stroke(px(stroke));
            arc.move_to(at(0., r));
            for i in 1..=n {
                arc.line_to(at(p * i as f32 / n as f32, r));
            }
            if let Ok(a) = arc.build() {
                window.paint_path(a, color);
            }
            for end in [0., p] {
                let centre = at(end, r);
                let mut cap = PathBuilder::fill();
                let pts: Vec<Point<Pixels>> = (0..24)
                    .map(|i| {
                        let a = TAU * i as f32 / 24.;
                        point(
                            centre.x + px(stroke / 2. * a.cos()),
                            centre.y + px(stroke / 2. * a.sin()),
                        )
                    })
                    .collect();
                cap.add_polygon(&pts, true);
                if let Ok(d) = cap.build() {
                    window.paint_path(d, color);
                }
            }
        },
    )
    .size(px(size))
}

fn pill_button(
    id: &str,
    glyph: &str,
    label: &str,
    t: &Theme,
    on_click: impl Fn(&mut AtlasApp, &mut Context<AtlasApp>) + 'static,
    cx: &mut Context<AtlasApp>,
) -> AnyElement {
    div()
        .id(SharedString::from(id.to_owned()))
        .flex()
        .items_center()
        .gap(px(6.))
        .px(px(16.))
        .py(px(8.))
        .rounded_full()
        .border_1()
        .border_color(if t.dark { rgb(0x404040) } else { t.border })
        .cursor_pointer()
        .hover(|s| s.bg(t.hover))
        .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| on_click(this, cx)))
        .child(icon(glyph, 16., t.text_soft))
        .child(
            div()
                .text_size(ts(14.))
                .text_color(t.text_soft)
                .child(SharedString::from(label.to_owned())),
        )
        .into_any_element()
}

/// The focus screen: the ring and its controls, the task, and today's sessions.
pub fn screen(
    app: &mut AtlasApp,
    t: &Theme,
    window: &mut Window,
    cx: &mut Context<AtlasApp>,
) -> AnyElement {
    ensure_loaded(app, cx);
    let snap = app.snap.clone();
    let cfg = config(app);
    let run = app.focus_timer.run.clone();
    let active = run.is_some();
    let phase = run.as_ref().map_or(Phase::Work, |r| r.phase);
    let color = phase_color(phase, t);
    let track = if t.dark { rgb(0x262626) } else { rgb(0xe5e5e5) };
    let phase_ms = phase_duration_ms(phase, &cfg);
    let shown = if active {
        live_remaining(app)
    } else {
        phase_ms
    };
    // Idle shows the work phase at full length around an empty track: a full ring reads as done.
    let progress = if active && phase_ms > 0 {
        shown as f32 / phase_ms as f32
    } else {
        0.
    };
    let running = run.as_ref().is_some_and(|r| r.running);
    if running && motion::enabled() {
        window.request_animation_frame();
    }
    let task = run
        .as_ref()
        .and_then(|r| r.task_id.as_deref())
        .and_then(|id| snap.task(id));
    let every = cfg.every();
    let done = run.as_ref().map_or(0, |r| r.cycle_done(&cfg));

    const SIZE: f32 = 300.;
    let ring_el = motion::spring(
        div().size(px(SIZE)).relative(),
        "focus-ring",
        motion::SMOOTH,
        progress,
        move |el, v| el.child(ring(SIZE, 8., v, color, track)),
    );
    let face = div().relative().size(px(SIZE)).child(ring_el).child(
        div()
            .absolute()
            .inset_0()
            .flex()
            .flex_col()
            .items_center()
            .justify_center()
            .gap(px(4.))
            .px(px(24.))
            .child(
                div()
                    .text_size(ts(SIZE / 4.4))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(t.text)
                    .child(SharedString::from(format_clock(shown))),
            )
            .when_some(task, |d, task| {
                d.child(
                    div()
                        .max_w(px(220.))
                        .text_size(ts(14.))
                        .text_color(t.muted)
                        .text_center()
                        .line_clamp(2)
                        .child(SharedString::from(title_of(task))),
                )
            }),
    );

    let mut dots = div().flex().items_center().gap(px(8.));
    for i in 0..every.min(MAX_DOTS) {
        dots = dots.child(div().size(px(10.)).rounded_full().bg(if i < done {
            color
        } else if t.dark {
            rgb(0x404040)
        } else {
            rgb(0xe5e5e5)
        }));
    }
    let cycle = div()
        .flex()
        .flex_col()
        .items_center()
        .gap(px(8.))
        .when(every <= MAX_DOTS, |d| d.child(dots))
        .child(
            div()
                .text_size(ts(12.))
                .text_color(t.muted)
                .child(SharedString::from(format!(
                    "{done} of {every} until a long break"
                ))),
        );

    let (label, glyph) = match &run {
        None => ("Start focus", "play"),
        Some(r) if r.running => ("Pause", "pause"),
        Some(r) if r.awaiting_start => (phase_start_label(r.phase), "play"),
        Some(_) => ("Resume", "play"),
    };
    let main_button = div()
        .id("focus-primary")
        .w_full()
        .flex()
        .items_center()
        .justify_center()
        .gap(px(8.))
        .px(px(24.))
        .py(px(14.))
        .rounded_full()
        .bg(color)
        .cursor_pointer()
        .hover(|s| s.opacity(0.92))
        .on_click(cx.listener(|this, _: &ClickEvent, _, cx| primary(this, cx)))
        .child(icon(glyph, 20., t.on_accent))
        .child(
            div()
                .text_size(ts(16.))
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(t.on_accent)
                .child(label),
        );
    let controls = div()
        .w(px(320.))
        .flex()
        .flex_col()
        .items_center()
        .gap(px(12.))
        .child(main_button)
        .when(active, |d| {
            d.child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .child(pill_button(
                        "focus-skip",
                        "skip-forward",
                        "Skip phase",
                        t,
                        skip,
                        cx,
                    ))
                    .child(pill_button(
                        "focus-stop",
                        "square",
                        "Stop focus",
                        t,
                        stop,
                        cx,
                    )),
            )
        });

    let phase_row = div()
        .flex()
        .items_center()
        .gap(px(8.))
        .child(icon(phase_icon(phase), 16., color))
        .child(
            div()
                .text_size(ts(12.))
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(color)
                .child(if active {
                    phase_label(phase).to_uppercase()
                } else {
                    "READY".into()
                }),
        );

    let about = if active {
        div()
            .flex()
            .flex_col()
            .items_center()
            .gap(px(4.))
            .child(caps("Focusing on", t).text_color(t.muted))
            .child(
                div()
                    .text_size(ts(14.))
                    .text_color(t.text_soft)
                    .child(SharedString::from(task.map_or("No task".into(), title_of))),
            )
            .into_any_element()
    } else {
        picker(app, &snap, t, cx)
    };

    let start_of_day = app
        .today
        .at(0, 0, 0, 0)
        .to_zoned(snap.tz.clone())
        .map_or(i64::MAX, |z| z.timestamp().as_millisecond());
    let today: Vec<i64> = snap
        .focus
        .iter()
        .filter(|(_, ended)| *ended >= start_of_day)
        .map(|(len, _)| *len)
        .collect();
    let today_ms: i64 = today.iter().sum();
    let sessions = format!(
        "{} {}{}",
        today.len(),
        if today.len() == 1 {
            "session"
        } else {
            "sessions"
        },
        if today_ms > 0 {
            format!(" · {}", duration(today_ms))
        } else {
            String::new()
        }
    );
    let today_box = div()
        .w(px(448.))
        .pt(px(16.))
        .border_t_1()
        .border_color(t.divider)
        .flex()
        .flex_col()
        .items_center()
        .gap(px(4.))
        .child(caps("Today", t).text_color(t.muted))
        .child(
            div()
                .text_size(ts(14.))
                .text_color(t.text_soft)
                .child(SharedString::from(sessions)),
        );

    div()
        .flex()
        .flex_col()
        .size_full()
        .child(app.header(None, "Focus", div().into_any_element(), t))
        .child(
            div()
                .id("focus-scroll")
                .flex_1()
                .min_h_0()
                .overflow_y_scroll()
                .child(
                    div()
                        .flex()
                        .flex_col()
                        .items_center()
                        .gap(px(24.))
                        .pt(px(8.))
                        .pb(px(64.))
                        .px(px(16.))
                        .child(phase_row)
                        .child(face)
                        .child(cycle)
                        .child(controls)
                        .child(about)
                        .child(today_box),
                ),
        )
        .into_any_element()
}

/// The task for the next run: a chip that opens the open tasks, and "No task".
fn picker(
    app: &AtlasApp,
    snap: &crate::model::Snapshot,
    t: &Theme,
    cx: &mut Context<AtlasApp>,
) -> AnyElement {
    let picked = app
        .focus_timer
        .picked
        .as_deref()
        .and_then(|id| snap.task(id))
        .map_or("No task".into(), title_of);
    let open = app.focus_timer.picker_open;
    let chip = div()
        .id("focus-task-chip")
        .flex()
        .items_center()
        .gap(px(8.))
        .px(px(12.))
        .py(px(6.))
        .rounded_full()
        .border_1()
        .border_color(t.border)
        .cursor_pointer()
        .hover(|s| s.bg(t.hover))
        .on_click(cx.listener(|this, _: &ClickEvent, _, cx| {
            this.focus_timer.picker_open = !this.focus_timer.picker_open;
            cx.notify();
        }))
        .child(div().text_size(ts(13.)).text_color(t.muted).child("Task"))
        .child(
            div()
                .max_w(px(260.))
                .truncate()
                .text_size(ts(14.))
                .text_color(t.text)
                .child(SharedString::from(picked)),
        )
        .child(crate::ui::chevron("focus-task-chevron", open, 14., t.muted));
    let mut col = div()
        .flex()
        .flex_col()
        .items_center()
        .gap(px(8.))
        .child(chip);
    if open {
        let row = |id: String, label: String, hint: Option<&str>, on: bool| {
            let pick = (!id.is_empty()).then(|| id.clone());
            div()
                .id(SharedString::from(format!("focus-pick-{id}")))
                .px(px(12.))
                .py(px(8.))
                .flex()
                .flex_col()
                .rounded(px(6.))
                .cursor_pointer()
                .when(on, |d| d.bg(t.selected))
                .hover(|s| s.bg(t.hover))
                .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| {
                    this.focus_timer.picked = pick.clone();
                    this.focus_timer.picker_open = false;
                    cx.notify();
                }))
                .child(
                    div()
                        .truncate()
                        .text_size(ts(14.))
                        .text_color(if on { t.selected_text } else { t.text })
                        .child(SharedString::from(label)),
                )
                .when_some(hint, |d, h| {
                    d.child(
                        div()
                            .text_size(ts(12.))
                            .text_color(t.muted)
                            .child(SharedString::from(h.to_owned())),
                    )
                })
        };
        let mut list = div()
            .id("focus-task-list")
            .w(px(360.))
            .max_h(px(280.))
            .overflow_y_scroll()
            .p(px(4.))
            .rounded(px(10.))
            .border_1()
            .border_color(t.border)
            .bg(t.surface)
            .shadow_lg()
            .child(row(
                String::new(),
                "No task".into(),
                Some("Tracked, but not counted against a task"),
                app.focus_timer.picked.is_none(),
            ));
        for task in snap.tasks.iter().filter(|x| !x.is_completed) {
            let on = app.focus_timer.picked.as_deref() == Some(task.id.as_str());
            list = list.child(row(task.id.clone(), title_of(task), None, on));
        }
        col = col.child(list);
    }
    col.into_any_element()
}

fn bar_button(
    id: &str,
    glyph: &str,
    t: &Theme,
    on_click: impl Fn(&mut AtlasApp, &mut Context<AtlasApp>) + 'static,
    cx: &mut Context<AtlasApp>,
) -> AnyElement {
    div()
        .id(SharedString::from(id.to_owned()))
        .p(px(6.))
        .rounded(px(6.))
        .cursor_pointer()
        .hover(|s| s.bg(t.hover))
        .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| on_click(this, cx)))
        .child(icon(glyph, 20., t.text_soft))
        .into_any_element()
}

/// The floating bar over the other screens while a run is active (`FocusBar`): the phase, the
/// task and the clock, which open the focus screen, and play/pause, skip, stop and collapse. It
/// slides up into the bottom-right corner.
pub fn bar(app: &mut AtlasApp, t: &Theme, cx: &mut Context<AtlasApp>) -> Option<AnyElement> {
    ensure_loaded(app, cx);
    let run = app.focus_timer.run.clone()?;
    if app.route == Route::Focus || app.pref("focus_enabled") == Some(&Value::Bool(false)) {
        return None;
    }
    let work = run.phase == Phase::Work;
    let (bg, border, tint): (Hsla, Hsla, Hsla) = match (work, t.dark) {
        (true, false) => (
            t.accent_soft.into(),
            rgb(0xc7d2fe).into(),
            rgb(0x6366f1).into(),
        ),
        (true, true) => (
            rgb(0x1e1b4b).into(),
            rgb(0x312e81).into(),
            rgb(0x6366f1).into(),
        ),
        (false, false) => (
            rgb(0xecfdf5).into(),
            rgb(0xa7f3d0).into(),
            rgb(0x10b981).into(),
        ),
        (false, true) => (
            rgb(0x022c22).into(),
            rgb(0x064e3b).into(),
            rgb(0x10b981).into(),
        ),
    };
    let clock = format_clock(run.remaining_ms);
    let label = if run.awaiting_start {
        format!("{} · ready", phase_label(run.phase))
    } else {
        phase_label(run.phase).to_owned()
    };
    let task = run
        .task_id
        .as_deref()
        .and_then(|id| app.snap.task(id))
        .map_or("Focus session".into(), title_of);
    let open_focus = cx.listener(|this, _: &ClickEvent, _, cx| this.go(Route::Focus, cx));
    let body = if app.focus_timer.bar_collapsed {
        div()
            .id("focus-bar")
            .flex()
            .items_center()
            .gap(px(8.))
            .px(px(14.))
            .py(px(8.))
            .rounded_full()
            .cursor_pointer()
            .on_click(cx.listener(|this, _: &ClickEvent, _, cx| {
                this.focus_timer.bar_collapsed = false;
                cx.notify();
            }))
            .child(icon(phase_icon(run.phase), 18., tint))
            .child(
                div()
                    .text_size(ts(14.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(t.text)
                    .child(SharedString::from(clock)),
            )
            .child(icon("chevron-up", 16., t.muted))
    } else {
        let play = if run.running {
            bar_button("focus-bar-pause", "pause", t, pause, cx)
        } else {
            bar_button("focus-bar-play", "play", t, resume, cx)
        };
        div()
            .id("focus-bar")
            .flex()
            .items_center()
            .gap(px(12.))
            .px(px(16.))
            .py(px(10.))
            .rounded(px(12.))
            .child(
                div()
                    .id("focus-bar-open")
                    .flex()
                    .items_center()
                    .gap(px(12.))
                    .min_w_0()
                    .cursor_pointer()
                    .on_click(open_focus)
                    .child(icon(phase_icon(run.phase), 22., tint))
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .min_w_0()
                            .max_w(px(180.))
                            .child(
                                div()
                                    .text_size(ts(12.))
                                    .font_weight(FontWeight::MEDIUM)
                                    .text_color(t.muted)
                                    .child(SharedString::from(label.to_uppercase())),
                            )
                            .child(
                                div()
                                    .truncate()
                                    .text_size(ts(14.))
                                    .text_color(t.text_soft)
                                    .child(SharedString::from(task)),
                            ),
                    )
                    .child(
                        div()
                            .text_size(ts(20.))
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(t.text)
                            .child(SharedString::from(clock)),
                    ),
            )
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(4.))
                    .child(play)
                    .child(bar_button("focus-bar-skip", "skip-forward", t, skip, cx))
                    .child(bar_button("focus-bar-stop", "square", t, stop, cx))
                    .child(bar_button(
                        "focus-bar-collapse",
                        "chevron-down",
                        t,
                        |this, cx| {
                            this.focus_timer.bar_collapsed = true;
                            cx.notify();
                        },
                        cx,
                    )),
            )
    };
    let el = div()
        .absolute()
        .right(px(16.))
        .bg(bg)
        .border_1()
        .border_color(border)
        .rounded(px(if app.focus_timer.bar_collapsed {
            999.
        } else {
            12.
        }))
        .shadow_lg()
        .child(body);
    Some(motion::enter(el, "focus-bar-in", 320, |el, v| {
        el.bottom(px(16. - (1. - v) * 40.)).opacity(v)
    }))
}

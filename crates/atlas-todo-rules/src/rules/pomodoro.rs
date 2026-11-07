//! The pomodoro state machine of `@atlastodo/todo-core`'s `pomodoro.ts`: pure and time-free. The
//! running clock lives in the app; this decides which phase comes next and how long each lasts.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    Work,
    ShortBreak,
    LongBreak,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PomodoroConfig {
    pub work_min: f64,
    pub short_break_min: f64,
    pub long_break_min: f64,
    pub long_break_every: f64,
}

pub const DEFAULT_POMODORO: PomodoroConfig = PomodoroConfig {
    work_min: 25.0,
    short_break_min: 5.0,
    long_break_min: 15.0,
    long_break_every: 4.0,
};

impl PomodoroConfig {
    /// The config in the synced preferences (`usePomodoroConfig`): a missing or non-positive value
    /// falls back to the default, since a phase of no length would never run.
    pub fn from_prefs(prefs: &Map<String, Value>) -> Self {
        let read = |field: &str, default: f64| {
            prefs
                .get(field)
                .and_then(Value::as_f64)
                .filter(|v| *v > 0.0)
                .unwrap_or(default)
        };
        Self {
            work_min: read("pomodoro_work_min", DEFAULT_POMODORO.work_min),
            short_break_min: read("pomodoro_short_break_min", DEFAULT_POMODORO.short_break_min),
            long_break_min: read("pomodoro_long_break_min", DEFAULT_POMODORO.long_break_min),
            long_break_every: read(
                "pomodoro_long_break_every",
                DEFAULT_POMODORO.long_break_every,
            ),
        }
    }

    /// Work phases per cycle, at least one.
    pub fn every(&self) -> i64 {
        (self.long_break_every.floor() as i64).max(1)
    }
}

pub fn phase_duration_ms(phase: Phase, config: &PomodoroConfig) -> i64 {
    let min = match phase {
        Phase::Work => config.work_min,
        Phase::ShortBreak => config.short_break_min,
        Phase::LongBreak => config.long_break_min,
    };
    (min * 60_000.0).round().max(0.0) as i64
}

/// `mm:ss`, rounded up so the last second reads `00:01`.
pub fn format_clock(ms: i64) -> String {
    let total = if ms <= 0 { 0 } else { (ms + 999) / 1000 };
    format!("{:02}:{:02}", total / 60, total % 60)
}

/// `completed_work` includes the work phase just completed; every `long_break_every`-th gets a
/// long break.
pub fn next_phase(phase: Phase, completed_work: i64, config: &PomodoroConfig) -> Phase {
    if phase != Phase::Work {
        return Phase::Work;
    }
    if completed_work % config.every() == 0 {
        Phase::LongBreak
    } else {
        Phase::ShortBreak
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PomodoroState {
    pub phase: Phase,
    pub completed_work: i64,
}

pub fn advance(state: PomodoroState, config: &PomodoroConfig) -> PomodoroState {
    let completed_work = if state.phase == Phase::Work {
        state.completed_work + 1
    } else {
        state.completed_work
    };
    PomodoroState {
        phase: next_phase(state.phase, completed_work, config),
        completed_work,
    }
}

/// A run of the timer, as the app keeps (and persists) it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunSnapshot {
    pub task_id: Option<String>,
    pub phase: Phase,
    pub completed_work: i64,
    pub remaining_ms: i64,
    pub running: bool,
    /// Loaded at full length but waiting for a tap; distinct from a paused run.
    #[serde(default)]
    pub awaiting_start: bool,
    pub work_started_at: i64,
    pub work_elapsed_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FocusSessionLog {
    pub task_id: Option<String>,
    pub started_at: i64,
    pub ended_at: i64,
    pub duration_ms: i64,
}

impl RunSnapshot {
    /// A fresh run: a work phase at full length, running from `now`.
    pub fn start(task_id: Option<String>, now: i64, config: &PomodoroConfig) -> Self {
        Self {
            task_id,
            phase: Phase::Work,
            completed_work: 0,
            remaining_ms: phase_duration_ms(Phase::Work, config),
            running: true,
            awaiting_start: false,
            work_started_at: now,
            work_elapsed_ms: 0,
        }
    }

    /// The focused time to bank when a work phase ends at `now` (finished, skipped or stopped).
    pub fn work_log(&self, now: i64) -> Option<FocusSessionLog> {
        (self.phase == Phase::Work && self.work_elapsed_ms > 0).then(|| FocusSessionLog {
            task_id: self.task_id.clone(),
            started_at: self.work_started_at,
            ended_at: now,
            duration_ms: self.work_elapsed_ms,
        })
    }

    /// Move to the next phase at full length, waiting for a tap (`FocusProvider`'s
    /// `advancePhase`); the caller banks [`work_log`](Self::work_log) first.
    pub fn advanced(&self, now: i64, config: &PomodoroConfig) -> Self {
        let next = advance(
            PomodoroState {
                phase: self.phase,
                completed_work: self.completed_work,
            },
            config,
        );
        Self {
            task_id: self.task_id.clone(),
            phase: next.phase,
            completed_work: next.completed_work,
            remaining_ms: phase_duration_ms(next.phase, config),
            running: false,
            awaiting_start: true,
            work_started_at: now,
            work_elapsed_ms: 0,
        }
    }

    /// `delta` ms of a running clock.
    pub fn ticked(&self, delta: i64) -> Self {
        let mut next = self.clone();
        next.remaining_ms -= delta;
        if next.phase == Phase::Work {
            next.work_elapsed_ms += delta;
        }
        next
    }

    /// Resume a paused phase, or start one awaiting its first tap.
    pub fn resumed(&self, now: i64) -> Self {
        let mut next = self.clone();
        next.running = true;
        if self.awaiting_start {
            // Beginning a phase (not un-pausing) starts its clock.
            next.work_started_at = now;
        }
        next.awaiting_start = false;
        next
    }

    /// The work phases of the current cycle done, as the dots under the ring show them.
    pub fn cycle_done(&self, config: &PomodoroConfig) -> i64 {
        cycle_done(self.phase, self.completed_work, config)
    }
}

/// `completed_work` only ticks over at the end of a work phase, so a fresh cycle's first phase reads
/// back to zero explicitly.
pub fn cycle_done(phase: Phase, completed_work: i64, config: &PomodoroConfig) -> i64 {
    let every = config.every();
    if completed_work == 0 || (phase == Phase::Work && completed_work % every == 0) {
        0
    } else {
        (completed_work - 1) % every + 1
    }
}

/// Recompute a persisted run at a later `now`. A running one completes at most one phase: one that
/// ended while the app was closed parks on the next phase with `awaiting_start`, rather than
/// replaying a break nobody was present for.
pub fn rehydrate_run(
    saved: &RunSnapshot,
    saved_at: i64,
    now: i64,
    config: &PomodoroConfig,
) -> (RunSnapshot, Vec<FocusSessionLog>) {
    if !saved.running || now <= saved_at {
        return (saved.clone(), Vec::new());
    }
    let elapsed = now - saved_at;
    if elapsed < saved.remaining_ms {
        return (saved.ticked(elapsed), Vec::new());
    }
    let phase_end = saved_at + saved.remaining_ms;
    let sessions = if saved.phase == Phase::Work {
        vec![FocusSessionLog {
            task_id: saved.task_id.clone(),
            started_at: saved.work_started_at,
            ended_at: phase_end,
            duration_ms: saved.work_elapsed_ms + saved.remaining_ms,
        }]
    } else {
        Vec::new()
    };
    (saved.advanced(phase_end, config), sessions)
}

#[cfg(test)]
mod tests {
    use super::*;

    const MIN: i64 = 60_000;

    #[test]
    fn work_short_break_work_with_a_long_break_every_fourth() {
        let config = DEFAULT_POMODORO;
        let mut state = PomodoroState {
            phase: Phase::Work,
            completed_work: 0,
        };
        let mut seq = Vec::new();
        for _ in 0..8 {
            state = advance(state, &config);
            seq.push(state.phase);
        }
        use Phase::*;
        assert_eq!(
            seq,
            [ShortBreak, Work, ShortBreak, Work, ShortBreak, Work, LongBreak, Work]
        );
        assert_eq!(state.completed_work, 4);
    }

    #[test]
    fn honours_a_custom_cadence() {
        let config = PomodoroConfig {
            long_break_every: 2.0,
            ..DEFAULT_POMODORO
        };
        assert_eq!(next_phase(Phase::Work, 1, &config), Phase::ShortBreak);
        assert_eq!(next_phase(Phase::Work, 2, &config), Phase::LongBreak);
        assert_eq!(next_phase(Phase::ShortBreak, 2, &config), Phase::Work);
        assert_eq!(next_phase(Phase::LongBreak, 2, &config), Phase::Work);
    }

    #[test]
    fn phase_durations() {
        let c = DEFAULT_POMODORO;
        assert_eq!(phase_duration_ms(Phase::Work, &c), 25 * MIN);
        assert_eq!(phase_duration_ms(Phase::ShortBreak, &c), 5 * MIN);
        assert_eq!(phase_duration_ms(Phase::LongBreak, &c), 15 * MIN);
    }

    #[test]
    fn config_from_prefs_ignores_non_positive_values() {
        let prefs: Map<String, Value> = serde_json::from_value(serde_json::json!({
            "pomodoro_work_min": 50,
            "pomodoro_short_break_min": 0,
            "pomodoro_long_break_every": "x",
        }))
        .unwrap();
        let c = PomodoroConfig::from_prefs(&prefs);
        assert_eq!(c.work_min, 50.0);
        assert_eq!(c.short_break_min, 5.0);
        assert_eq!(c.long_break_every, 4.0);
    }

    #[test]
    fn format_clock_pads_rounds_up_and_floors() {
        assert_eq!(format_clock(25 * MIN), "25:00");
        assert_eq!(format_clock(5 * MIN), "05:00");
        assert_eq!(format_clock(9 * MIN + 59_000), "09:59");
        assert_eq!(format_clock(1), "00:01");
        assert_eq!(format_clock(1000), "00:01");
        assert_eq!(format_clock(1001), "00:02");
        assert_eq!(format_clock(0), "00:00");
        assert_eq!(format_clock(-5000), "00:00");
    }

    #[test]
    fn cycle_dots() {
        let c = DEFAULT_POMODORO;
        assert_eq!(cycle_done(Phase::Work, 0, &c), 0);
        assert_eq!(cycle_done(Phase::ShortBreak, 1, &c), 1);
        assert_eq!(cycle_done(Phase::Work, 3, &c), 3);
        assert_eq!(cycle_done(Phase::LongBreak, 4, &c), 4);
        assert_eq!(cycle_done(Phase::Work, 4, &c), 0);
        assert_eq!(cycle_done(Phase::ShortBreak, 5, &c), 1);
    }

    fn running() -> RunSnapshot {
        RunSnapshot {
            task_id: Some("t1".into()),
            phase: Phase::Work,
            completed_work: 0,
            remaining_ms: 25 * MIN,
            running: true,
            awaiting_start: false,
            work_started_at: 0,
            work_elapsed_ms: 0,
        }
    }

    #[test]
    fn rehydrate_within_the_phase() {
        let saved = RunSnapshot {
            work_started_at: 1000,
            ..running()
        };
        let (run, sessions) = rehydrate_run(&saved, 1000, 1000 + 10 * MIN, &DEFAULT_POMODORO);
        assert_eq!(run.phase, Phase::Work);
        assert_eq!(run.remaining_ms, 15 * MIN);
        assert_eq!(run.work_elapsed_ms, 10 * MIN);
        assert!(run.running);
        assert!(sessions.is_empty());
    }

    #[test]
    fn rehydrate_leaves_paused_and_awaiting_runs() {
        let paused = RunSnapshot {
            running: false,
            remaining_ms: 12 * MIN,
            work_elapsed_ms: 13 * MIN,
            ..running()
        };
        let (run, sessions) = rehydrate_run(&paused, 1000, 1000 + 60 * MIN, &DEFAULT_POMODORO);
        assert_eq!(run, paused);
        assert!(sessions.is_empty());
        let awaiting = RunSnapshot {
            running: false,
            awaiting_start: true,
            phase: Phase::ShortBreak,
            remaining_ms: 5 * MIN,
            ..running()
        };
        let (run, _) = rehydrate_run(&awaiting, 1000, 1000 + 60 * MIN, &DEFAULT_POMODORO);
        assert_eq!(run, awaiting);
    }

    #[test]
    fn rehydrate_banks_a_finished_work_phase() {
        let saved = RunSnapshot {
            remaining_ms: 15 * MIN,
            work_elapsed_ms: 10 * MIN,
            work_started_at: 1000,
            ..running()
        };
        let (run, sessions) = rehydrate_run(&saved, 1000, 1000 + 18 * MIN, &DEFAULT_POMODORO);
        assert_eq!(
            sessions,
            [FocusSessionLog {
                task_id: Some("t1".into()),
                started_at: 1000,
                ended_at: 1000 + 15 * MIN,
                duration_ms: 25 * MIN
            }]
        );
        assert_eq!(run.phase, Phase::ShortBreak);
        assert_eq!(run.completed_work, 1);
        assert_eq!(run.remaining_ms, 5 * MIN);
        assert!(!run.running);
        assert!(run.awaiting_start);
    }

    #[test]
    fn rehydrate_untethered_and_stops_after_one_phase() {
        let saved = RunSnapshot {
            task_id: None,
            remaining_ms: 5 * MIN,
            work_elapsed_ms: 20 * MIN,
            ..running()
        };
        let (_, sessions) = rehydrate_run(&saved, 0, 5 * MIN, &DEFAULT_POMODORO);
        assert_eq!(sessions[0].task_id, None);
        assert_eq!(sessions[0].duration_ms, 25 * MIN);

        let (run, sessions) = rehydrate_run(&running(), 0, 65 * MIN, &DEFAULT_POMODORO);
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].ended_at, 25 * MIN);
        assert_eq!(run.phase, Phase::ShortBreak);
        assert_eq!(run.work_elapsed_ms, 0);
        assert!(run.awaiting_start);
    }

    #[test]
    fn run_snapshot_round_trips_the_web_shape() {
        let json = serde_json::json!({
            "taskId": null, "phase": "short_break", "completedWork": 1, "remainingMs": 300000,
            "running": false, "awaitingStart": true, "workStartedAt": 5, "workElapsedMs": 0
        });
        let run: RunSnapshot = serde_json::from_value(json.clone()).unwrap();
        assert_eq!(run.phase, Phase::ShortBreak);
        assert_eq!(serde_json::to_value(&run).unwrap(), json);
    }
}

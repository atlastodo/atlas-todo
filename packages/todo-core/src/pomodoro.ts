/**
 * Pomodoro state machine: pure and time-free. The running clock lives in the FocusProvider; this
 * decides which phase comes next and how long each lasts.
 */

export type Phase = "work" | "short_break" | "long_break";

export interface PomodoroConfig {
  workMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  longBreakEvery: number;
}

export const DEFAULT_POMODORO: PomodoroConfig = {
  workMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  longBreakEvery: 4,
};

// A synced preference, so values and default live here: a default that differs across clients looks like a setting changing by itself.
export type FocusCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export const FOCUS_CORNERS: FocusCorner[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];

// Where the bar starts before a per-device drag.
export const DEFAULT_FOCUS_CORNER: FocusCorner = "bottom-right";

export function isFocusCorner(value: unknown): value is FocusCorner {
  return typeof value === "string" && (FOCUS_CORNERS as string[]).includes(value);
}

export function phaseDurationMs(phase: Phase, config: PomodoroConfig): number {
  const min =
    phase === "work"
      ? config.workMin
      : phase === "short_break"
        ? config.shortBreakMin
        : config.longBreakMin;
  return Math.max(0, Math.round(min * 60_000));
}

// Rounded up so the last second reads `00:01`.
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// `completedWork` includes the work phase just completed; every `longBreakEvery`-th gets a long break.
export function nextPhase(phase: Phase, completedWork: number, config: PomodoroConfig): Phase {
  if (phase !== "work") return "work";
  const every = Math.max(1, Math.floor(config.longBreakEvery));
  return completedWork % every === 0 ? "long_break" : "short_break";
}

export interface PomodoroState {
  phase: Phase;
  completedWork: number;
}

export function advance(state: PomodoroState, config: PomodoroConfig): PomodoroState {
  const completedWork = state.phase === "work" ? state.completedWork + 1 : state.completedWork;
  return { phase: nextPhase(state.phase, completedWork, config), completedWork };
}

export interface RunSnapshot {
  taskId: string | null;
  phase: Phase;
  completedWork: number;
  remainingMs: number;
  running: boolean;
  // Loaded at full length but waiting for a tap; distinct from a paused run.
  awaitingStart: boolean;
  workStartedAt: number;
  workElapsedMs: number;
}

export interface FocusSessionLog {
  taskId: string | null;
  startedAt: number;
  endedAt: number;
  durationMs: number;
}

/**
 * Recompute a persisted run at a later `now`. A running one completes at most one phase: one that
 * ended while the app was closed parks on the next phase with `awaitingStart`, rather than
 * replaying a break nobody was present for.
 */
export function rehydrateRun(
  saved: RunSnapshot,
  savedAt: number,
  now: number,
  config: PomodoroConfig,
): { run: RunSnapshot; sessions: FocusSessionLog[] } {
  if (!saved.running || now <= savedAt) return { run: saved, sessions: [] };

  const elapsed = now - savedAt;

  // Still inside the phase: consume the elapsed time.
  if (elapsed < saved.remainingMs) {
    return {
      run: {
        ...saved,
        remainingMs: saved.remainingMs - elapsed,
        workElapsedMs: saved.phase === "work" ? saved.workElapsedMs + elapsed : saved.workElapsedMs,
      },
      sessions: [],
    };
  }

  // The phase ended while away. Bank it and stop; the next waits for a tap.
  const phaseEnd = savedAt + saved.remainingMs;
  const sessions: FocusSessionLog[] =
    saved.phase === "work"
      ? [
          {
            taskId: saved.taskId,
            startedAt: saved.workStartedAt,
            endedAt: phaseEnd,
            durationMs: saved.workElapsedMs + saved.remainingMs,
          },
        ]
      : [];
  const next = advance({ phase: saved.phase, completedWork: saved.completedWork }, config);
  return {
    run: {
      ...saved,
      phase: next.phase,
      completedWork: next.completedWork,
      remainingMs: phaseDurationMs(next.phase, config),
      running: false,
      awaitingStart: true,
      workStartedAt: phaseEnd,
      workElapsedMs: 0,
    },
    sessions,
  };
}

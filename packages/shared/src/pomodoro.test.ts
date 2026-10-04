import { describe, it, expect } from "vitest";
import {
  DEFAULT_POMODORO,
  advance,
  formatClock,
  nextPhase,
  phaseDurationMs,
  rehydrateRun,
  type Phase,
  type PomodoroState,
  type RunSnapshot,
} from "./pomodoro";

describe("pomodoro state machine", () => {
  it("transitions work -> short break -> work, with a long break every 4th work phase", () => {
    const config = { ...DEFAULT_POMODORO, longBreakEvery: 4 };
    let state: PomodoroState = { phase: "work", completedWork: 0 };
    const sequence: Phase[] = [];

    // Simulate 4 full work+break cycles by advancing at each phase end.
    for (let i = 0; i < 8; i++) {
      state = advance(state, config);
      sequence.push(state.phase);
    }

    expect(sequence).toEqual([
      "short_break", // after work #1
      "work",
      "short_break", // after work #2
      "work",
      "short_break", // after work #3
      "work",
      "long_break", // after work #4 (cadence hit)
      "work",
    ]);
    expect(state.completedWork).toBe(4);
  });

  it("honours a custom long-break cadence", () => {
    const config = { ...DEFAULT_POMODORO, longBreakEvery: 2 };
    expect(nextPhase("work", 1, config)).toBe("short_break");
    expect(nextPhase("work", 2, config)).toBe("long_break");
    expect(nextPhase("short_break", 2, config)).toBe("work");
    expect(nextPhase("long_break", 2, config)).toBe("work");
  });

  it("computes phase durations in ms from the configured minutes", () => {
    const config = { workMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4 };
    expect(phaseDurationMs("work", config)).toBe(25 * 60_000);
    expect(phaseDurationMs("short_break", config)).toBe(5 * 60_000);
    expect(phaseDurationMs("long_break", config)).toBe(15 * 60_000);
  });
});

describe("formatClock", () => {
  it("zero-pads both halves so the digits never change width", () => {
    expect(formatClock(25 * 60_000)).toBe("25:00");
    expect(formatClock(5 * 60_000)).toBe("05:00");
    expect(formatClock(9 * 60_000 + 59_000)).toBe("09:59");
  });

  it("rounds up, so the final second reads 00:01 rather than 00:00", () => {
    expect(formatClock(1)).toBe("00:01");
    expect(formatClock(1000)).toBe("00:01");
    expect(formatClock(1001)).toBe("00:02");
  });

  it("floors a spent or negative remainder at 00:00", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(-5000)).toBe("00:00");
  });
});

describe("rehydrateRun", () => {
  const config = DEFAULT_POMODORO; // work 25, short 5, long 15, longBreakEvery 4
  const min = 60_000;

  function running(overrides: Partial<RunSnapshot> = {}): RunSnapshot {
    return {
      taskId: "t1",
      phase: "work",
      completedWork: 0,
      remainingMs: 25 * min,
      running: true,
      awaitingStart: false,
      workStartedAt: 0,
      workElapsedMs: 0,
      ...overrides,
    };
  }

  it("advances a running timer by the elapsed wall time within the same phase", () => {
    const saved = running({ remainingMs: 25 * min, workElapsedMs: 0, workStartedAt: 1000 });
    // Saved at t=1000; reloaded 10 minutes later, still in the work phase.
    const { run, sessions } = rehydrateRun(saved, 1000, 1000 + 10 * min, config);
    expect(run.phase).toBe("work");
    expect(run.remainingMs).toBe(15 * min);
    expect(run.workElapsedMs).toBe(10 * min);
    expect(run.running).toBe(true);
    expect(sessions).toEqual([]); // no phase completed yet
  });

  it("leaves a paused timer untouched (resumes paused at the saved position)", () => {
    const saved = running({ running: false, remainingMs: 12 * min, workElapsedMs: 13 * min });
    const { run, sessions } = rehydrateRun(saved, 1000, 1000 + 60 * min, config);
    expect(run.remainingMs).toBe(12 * min);
    expect(run.running).toBe(false);
    expect(sessions).toEqual([]);
  });

  it("leaves a run awaiting its start tap untouched", () => {
    const saved = running({
      running: false,
      awaitingStart: true,
      phase: "short_break",
      remainingMs: 5 * min,
    });
    const { run, sessions } = rehydrateRun(saved, 1000, 1000 + 60 * min, config);
    expect(run.remainingMs).toBe(5 * min);
    expect(run.awaitingStart).toBe(true);
    expect(sessions).toEqual([]);
  });

  it("completes a work phase that fully elapsed while closed and logs its session", () => {
    // Work phase had 15m left with 10m already focused; reloaded 18m later -> the phase finished
    // (25m total focus) and the break is loaded but not started.
    const saved = running({ remainingMs: 15 * min, workElapsedMs: 10 * min, workStartedAt: 1000 });
    const { run, sessions } = rehydrateRun(saved, 1000, 1000 + 18 * min, config);
    expect(sessions).toEqual([
      { taskId: "t1", startedAt: 1000, endedAt: 1000 + 15 * min, durationMs: 25 * min },
    ]);
    expect(run.phase).toBe("short_break");
    expect(run.completedWork).toBe(1);
    expect(run.remainingMs).toBe(5 * min); // the full break, waiting to be started
    expect(run.running).toBe(false);
    expect(run.awaitingStart).toBe(true);
  });

  it("attributes an untethered session to no task", () => {
    const saved = running({ taskId: null, remainingMs: 5 * min, workElapsedMs: 20 * min });
    const { sessions } = rehydrateRun(saved, 0, 5 * min, config);
    expect(sessions).toEqual([
      { taskId: null, startedAt: 0, endedAt: 5 * min, durationMs: 25 * min },
    ]);
  });

  it("stops after one phase however long the app was closed, rather than replaying breaks", () => {
    // Start of a work phase, reopened 65 minutes later. Only the work phase the user was actually
    // present for is banked; the break waits for a tap instead of having silently run and ended.
    const saved = running({ remainingMs: 25 * min, workElapsedMs: 0, workStartedAt: 0 });
    const { run, sessions } = rehydrateRun(saved, 0, 65 * min, config);
    expect(sessions).toEqual([
      { taskId: "t1", startedAt: 0, endedAt: 25 * min, durationMs: 25 * min },
    ]);
    expect(run.phase).toBe("short_break");
    expect(run.completedWork).toBe(1);
    expect(run.remainingMs).toBe(5 * min);
    expect(run.running).toBe(false);
    expect(run.awaitingStart).toBe(true);
    expect(run.workElapsedMs).toBe(0);
  });
});

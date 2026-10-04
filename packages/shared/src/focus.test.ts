import { describe, expect, it } from "vitest";
import { formatDuration, toFocusSession, trackedMsForTask, type FocusSession } from "./focus";

describe("toFocusSession", () => {
  it("maps a store bag to a typed session", () => {
    const s = toFocusSession("f1", {
      task_id: "t1",
      started_at: 1000,
      ended_at: 2000,
      duration_ms: 900,
      created_at: 1500,
    });
    expect(s).toEqual({
      id: "f1",
      task_id: "t1",
      started_at: 1000,
      ended_at: 2000,
      duration_ms: 900,
      created_at: 1500,
    });
  });

  it("degrades missing/wrong-typed fields to safe defaults", () => {
    const s = toFocusSession("f2", { task_id: 42, started_at: "nope" });
    expect(s.task_id).toBe("");
    expect(s.started_at).toBe(0);
    expect(s.duration_ms).toBe(0);
  });
});

describe("trackedMsForTask", () => {
  const sessions: FocusSession[] = [
    { id: "a", task_id: "t1", started_at: 0, ended_at: 0, duration_ms: 600_000, created_at: 0 },
    { id: "b", task_id: "t1", started_at: 0, ended_at: 0, duration_ms: 300_000, created_at: 0 },
    { id: "c", task_id: "t2", started_at: 0, ended_at: 0, duration_ms: 120_000, created_at: 0 },
  ];

  it("sums only the sessions for the given task", () => {
    expect(trackedMsForTask(sessions, "t1")).toBe(900_000);
    expect(trackedMsForTask(sessions, "t2")).toBe(120_000);
    expect(trackedMsForTask(sessions, "none")).toBe(0);
  });
});

describe("formatDuration", () => {
  it("formats hours and minutes", () => {
    expect(formatDuration(90 * 60_000)).toBe("1h 30m");
  });
  it("formats minutes only", () => {
    expect(formatDuration(25 * 60_000)).toBe("25m");
  });
  it("floors sub-minute durations", () => {
    expect(formatDuration(30_000)).toBe("<1m");
    expect(formatDuration(0)).toBe("<1m");
  });
});

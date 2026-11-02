/**
 * Focus (pomodoro) session records: pure helpers over `focus_session` entities that log tracked
 * time against tasks.
 */

export interface FocusSession {
  id: string;
  task_id: string;
  started_at: number;
  ended_at: number;
  /** Tracked focused duration in ms (less than ended - started if paused). */
  duration_ms: number;
  created_at: number;
}

export function toFocusSession(id: string, fields: Record<string, unknown>): FocusSession {
  const num = (v: unknown) => (typeof v === "number" ? v : 0);
  return {
    id,
    task_id: typeof fields.task_id === "string" ? fields.task_id : "",
    started_at: num(fields.started_at),
    ended_at: num(fields.ended_at),
    duration_ms: num(fields.duration_ms),
    created_at: num(fields.created_at),
  };
}

export function trackedMsForTask(sessions: FocusSession[], taskId: string): number {
  return sessions.filter((s) => s.task_id === taskId).reduce((sum, s) => sum + s.duration_ms, 0);
}

/** Format a millisecond duration compactly as `Hh Mm` / `Mm` / `<1m`. */
export function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin <= 0) return "<1m";
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

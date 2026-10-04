import { describe, it, expect } from "vitest";
import { LocalStore, MAX_CLOCK_DRIFT_MS } from "./store";
import { MemoryPersistence } from "./persistence";
import type { Operation } from "./types";

const NODE_A = "00000000-0000-0000-0000-0000000000a1";
const NODE_B = "00000000-0000-0000-0000-0000000000a2";

/** A store with a controllable clock + id sequence for deterministic tests. */
function makeStore(node: string, startMs = 1000) {
  let t = startMs;
  let n = 0;
  return new LocalStore(node, {
    now: () => t++,
    newId: () => `op-${node}-${n++}`,
  });
}

describe("LocalStore local mutations", () => {
  it("updates the read model and enqueues an op", () => {
    const store = makeStore(NODE_A);
    const op = store.set("task", "t1", "title", "Buy milk");
    expect(op.op).toBe("set");
    expect(store.get("task", "t1")).toEqual({ title: "Buy milk" });
    expect(store.unsyncedOps()).toHaveLength(1);
  });

  it("later local write to the same field wins", () => {
    const store = makeStore(NODE_A);
    store.set("task", "t1", "title", "old");
    store.set("task", "t1", "title", "new");
    expect(store.get("task", "t1")).toEqual({ title: "new" });
  });

  it("delete hides the entity; a later set resurrects a field", () => {
    const store = makeStore(NODE_A);
    store.set("task", "t1", "title", "doomed");
    store.remove("task", "t1");
    expect(store.get("task", "t1")).toBeNull();
    expect(store.list("task")).toHaveLength(0);

    store.set("task", "t1", "title", "reborn");
    expect(store.get("task", "t1")).toEqual({ title: "reborn" });
  });

  it("markSynced clears acknowledged ops from the outbox", () => {
    const store = makeStore(NODE_A);
    const a = store.set("task", "t1", "title", "a");
    const b = store.set("task", "t2", "title", "b");
    store.markSynced([a.id]);
    expect(store.unsyncedOps().map((o) => o.id)).toEqual([b.id]);
  });

  it("notifies onChange listeners when state changes and after unsubscribe stops", () => {
    const store = makeStore(NODE_A);
    let calls = 0;
    const unsub = store.onChange(() => calls++);
    store.set("task", "t1", "title", "a");
    expect(calls).toBe(1);
    unsub();
    store.set("task", "t1", "title", "b");
    expect(calls).toBe(1);
  });
});

describe("LocalStore.applyRemote", () => {
  it("applies a higher-HLC remote op over local state and ignores a lower one", () => {
    // Build a remote op with a large wall time from a separate store.
    const remote = makeStore(NODE_B, 10_000);
    const hi = remote.set("task", "t1", "title", "remote-new");

    const local = makeStore(NODE_A, 1000);
    local.set("task", "t1", "title", "local-old"); // small wall time
    expect(local.applyRemote(hi)).toBe(true);
    expect(local.get("task", "t1")).toEqual({ title: "remote-new" });

    // A stale remote op (older wall time) must not override.
    const stale = makeStore(NODE_B, 5);
    const lo = stale.set("task", "t1", "title", "remote-stale");
    expect(local.applyRemote(lo)).toBe(false);
    expect(local.get("task", "t1")).toEqual({ title: "remote-new" });
  });

  it("is idempotent — applying the same op twice changes nothing the second time", () => {
    const remote = makeStore(NODE_B, 10_000);
    const op = remote.set("task", "t1", "title", "x");
    const local = makeStore(NODE_A);
    expect(local.applyRemote(op)).toBe(true);
    expect(local.applyRemote(op)).toBe(false);
    expect(local.get("task", "t1")).toEqual({ title: "x" });
  });

  it("does not enqueue remote ops for push-back", () => {
    const remote = makeStore(NODE_B, 10_000);
    const op = remote.set("task", "t1", "title", "x");
    const local = makeStore(NODE_A);
    local.applyRemote(op);
    expect(local.unsyncedOps()).toHaveLength(0);
  });
});

describe("LocalStore.applyRemoteBatch", () => {
  it("applies every op but notifies listeners exactly once", () => {
    // A batch that creates a task and then deletes it: applied op-by-op, the create would flash the
    // task on screen before the delete removes it. Batched, listeners only see the converged state.
    const remote = makeStore(NODE_B, 10_000);
    const create = remote.set("task", "t1", "title", "ephemeral");
    const del = remote.remove("task", "t1");

    const local = makeStore(NODE_A);
    let calls = 0;
    local.onChange(() => calls++);

    expect(local.applyRemoteBatch([create, del])).toBe(true);
    expect(calls).toBe(1); // one render, not one per op
    expect(local.get("task", "t1")).toBeNull(); // converged: the delete wins
  });

  it("does not notify when nothing in the batch changes state", () => {
    const remote = makeStore(NODE_B, 10_000);
    const op = remote.set("task", "t1", "title", "x");
    const local = makeStore(NODE_A);
    local.applyRemoteBatch([op]); // first apply
    let calls = 0;
    local.onChange(() => calls++);
    expect(local.applyRemoteBatch([op])).toBe(false); // re-applying the same op: idempotent no-op
    expect(calls).toBe(0);
  });
});

describe("LocalStore convergence", () => {
  it("two stores applying the same ops in different orders converge", () => {
    // Produce a set of ops from two devices.
    const gen = makeStore(NODE_A, 100);
    const ops: Operation[] = [
      gen.set("task", "t1", "title", "A"),
      gen.set("task", "t1", "notes", "hello"),
      gen.set("task", "t1", "title", "B"),
      gen.remove("task", "t2"),
      gen.set("task", "t2", "title", "resurrect"),
    ];

    const s1 = makeStore(NODE_B);
    const s2 = makeStore(NODE_B);
    for (const op of ops) s1.applyRemote(op);
    for (const op of [...ops].reverse()) s2.applyRemote(op);

    expect(s1.get("task", "t1")).toEqual(s2.get("task", "t1"));
    expect(s1.get("task", "t2")).toEqual(s2.get("task", "t2"));
    expect(s1.get("task", "t1")).toEqual({ title: "B", notes: "hello" });
  });
});

describe("saved_filter entity kind", () => {
  it("syncs generically like any other entity (parity with atlas_core EntityKind)", () => {
    const store = makeStore(NODE_A);
    store.set("saved_filter", "f1", "name", "Work today");
    store.set("saved_filter", "f1", "query", "@work & due:today");
    store.set("saved_filter", "f1", "pinned", true);

    expect(store.get("saved_filter", "f1")).toEqual({
      name: "Work today",
      query: "@work & due:today",
      pinned: true,
    });
    expect(store.list("saved_filter")).toHaveLength(1);

    store.remove("saved_filter", "f1");
    expect(store.get("saved_filter", "f1")).toBeNull();
  });
});

describe("reminder entity kind", () => {
  it("syncs generically like any other entity (parity with atlas_core EntityKind)", () => {
    const store = makeStore(NODE_A);
    store.set("reminder", "r1", "task_id", "t1");
    store.set("reminder", "r1", "offset_min_before_due", 30);

    expect(store.get("reminder", "r1")).toEqual({ task_id: "t1", offset_min_before_due: 30 });
    expect(store.list("reminder")).toHaveLength(1);

    store.remove("reminder", "r1");
    expect(store.get("reminder", "r1")).toBeNull();
  });
});

describe("project_member entity kind", () => {
  it("syncs generically like any other entity (parity with atlas_core EntityKind)", () => {
    const store = makeStore(NODE_A);
    store.set("project_member", "pm1", "project_id", "p1");
    store.set("project_member", "pm1", "user_id", "u1");
    store.set("project_member", "pm1", "role", "editor");
    store.set("project_member", "pm1", "state", "active");

    expect(store.get("project_member", "pm1")).toEqual({
      project_id: "p1",
      user_id: "u1",
      role: "editor",
      state: "active",
    });
    expect(store.list("project_member")).toHaveLength(1);

    store.remove("project_member", "pm1");
    expect(store.get("project_member", "pm1")).toBeNull();
  });
});

describe("activity entity kind", () => {
  it("syncs generically like any other entity (parity with atlas_core EntityKind)", () => {
    const store = makeStore(NODE_A);
    store.set("activity", "a1", "task_id", "t1");
    store.set("activity", "a1", "actor_id", "u1");
    store.set("activity", "a1", "kind", "status");
    store.set("activity", "a1", "to", "completed");

    expect(store.get("activity", "a1")).toEqual({
      task_id: "t1",
      actor_id: "u1",
      kind: "status",
      to: "completed",
    });
    expect(store.list("activity")).toHaveLength(1);

    store.remove("activity", "a1");
    expect(store.get("activity", "a1")).toBeNull();
  });
});

describe("focus_session entity kind", () => {
  it("syncs generically like any other entity (parity with atlas_core EntityKind)", () => {
    const store = makeStore(NODE_A);
    store.set("focus_session", "fs1", "task_id", "t1");
    store.set("focus_session", "fs1", "started_at", 1000);
    store.set("focus_session", "fs1", "ended_at", 2500);
    store.set("focus_session", "fs1", "duration_ms", 1500);

    expect(store.get("focus_session", "fs1")).toEqual({
      task_id: "t1",
      started_at: 1000,
      ended_at: 2500,
      duration_ms: 1500,
    });
    expect(store.list("focus_session")).toHaveLength(1);

    store.remove("focus_session", "fs1");
    expect(store.get("focus_session", "fs1")).toBeNull();
  });
});

describe("habit + habit_checkin entity kinds", () => {
  it("sync generically like any other entity (parity with atlas_core EntityKind)", () => {
    const store = makeStore(NODE_A);
    store.set("habit", "h1", "name", "Meditate");
    store.set("habit", "h1", "days", [1, 3, 5]);
    store.set("habit_checkin", "c1", "habit_id", "h1");
    store.set("habit_checkin", "c1", "date", "2026-07-06");

    expect(store.get("habit", "h1")).toEqual({ name: "Meditate", days: [1, 3, 5] });
    expect(store.get("habit_checkin", "c1")).toEqual({ habit_id: "h1", date: "2026-07-06" });
    expect(store.list("habit")).toHaveLength(1);
    expect(store.list("habit_checkin")).toHaveLength(1);

    store.remove("habit", "h1");
    store.remove("habit_checkin", "c1");
    expect(store.get("habit", "h1")).toBeNull();
    expect(store.get("habit_checkin", "c1")).toBeNull();
  });
});

describe("reading one kind", () => {
  // 20 000 entities listed 20 times over: on a loaded CI runner (all test jobs share it) this
  // crossed vitest's 5s default and timed out, so give it room to breathe.
  it("does not walk the entities of other kinds", { timeout: 30_000 }, () => {
    let n = 0;
    const s = new LocalStore("00000000-0000-0000-0000-0000000000a1", { newId: () => `op-${n++}` });
    s.set("task", "t1", "title", "the only task");
    s.applyRemoteBatch(
      Array.from({ length: 20_000 }, (_, i) => ({
        id: `r-${i}`,
        entity: "habit_checkin" as const,
        entityId: `c-${i}`,
        ts: { wallMs: 1000 + i, counter: 0, node: "00000000-0000-0000-0000-0000000000a2" },
        op: "set" as const,
        field: "date",
        value: "2026-01-01",
      })),
    );
    const time = (fn: () => void) => {
      const start = performance.now();
      for (let i = 0; i < 20; i++) fn();
      return performance.now() - start;
    };
    time(() => s.list("habit_checkin")); // warm up
    time(() => s.list("task"));
    const checkins = time(() => s.list("habit_checkin"));
    const tasks = time(() => s.list("task"));
    expect(s.list("task")).toHaveLength(1);
    // Listing the one task costs next to nothing next to listing the 20 000 check-ins; a scan of
    // every entity made it cost a sizeable share of it.
    expect(tasks * 20).toBeLessThan(checkins);
  });
});

describe("a timestamp from far in the future", () => {
  const NOW = 1_800_000_000_000;
  const future = (id: string, wallMs: number): Operation => ({
    id,
    entity: "task",
    entityId: "t1",
    ts: { wallMs, counter: 0, node: NODE_B },
    op: "set",
    field: "title",
    value: id,
  });

  it("does not drag the clock along, so later local ops stay within the server's tolerance", async () => {
    let n = 0;
    const s = new LocalStore(NODE_A, { now: () => NOW, newId: () => `op-${n++}` });
    s.applyRemote(future("far", NOW + 30 * 24 * 3600_000));
    expect(s.get("task", "t1")).toEqual({ title: "far" });
    expect(s.set("task", "t2", "title", "x").ts.wallMs).toBeLessThanOrEqual(
      NOW + MAX_CLOCK_DRIFT_MS,
    );

    // Within the tolerance the clock still follows, so a local write beats what it has seen.
    s.applyRemote(future("near", NOW + 60_000));
    expect(s.set("task", "t3", "title", "y").ts.wallMs).toBe(NOW + 60_000);

    // Nor does one replayed from the log.
    const persistence = new MemoryPersistence();
    await persistence.append(future("stored", NOW + 30 * 24 * 3600_000), true);
    const reloaded = new LocalStore(NODE_A, { now: () => NOW, persistence });
    await reloaded.hydrate();
    expect(reloaded.set("task", "t4", "title", "z").ts.wallMs).toBeLessThanOrEqual(
      NOW + MAX_CLOCK_DRIFT_MS,
    );
  });
});

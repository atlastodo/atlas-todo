import { describe, it, expect } from "vitest";
import { LocalStore, PersistError } from "./store";
import {
  MemoryPersistence,
  SqlitePersistence,
  type Persistence,
  type SqlDatabase,
} from "./persistence";
import { FakeSqlDatabase } from "./persistence.testutil";

const NODE_A = "00000000-0000-0000-0000-0000000000a1";

let idSeq = 0;
/** A bare store used only to mint ops with globally-unique ids (stands in for UUIDs). */
function mint(node = NODE_A) {
  return new LocalStore(node, { newId: () => `op-${idSeq++}` });
}

/** A persistence-backed store; `tag` namespaces newly-minted op ids so reloads don't collide. */
function sqliteStore(tag: string, db: SqlDatabase, startMs = 1000) {
  let t = startMs;
  let n = 0;
  return new LocalStore(NODE_A, {
    now: () => t++,
    newId: () => `${tag}-${n++}`,
    persistence: new SqlitePersistence(db),
  });
}

/** A {@link FakeSqlDatabase} that records every statement it runs, in order. */
class LoggingSqlDatabase extends FakeSqlDatabase {
  readonly log: string[] = [];
  override async execute(query: string, params: unknown[] = []) {
    this.log.push(query.trim().split(/\s+/).slice(0, 3).join(" ").toUpperCase());
    return super.execute(query, params);
  }
}

describe("SqlitePersistence", () => {
  it("never lets another write land inside a batch's transaction on the shared connection", async () => {
    const db = new LoggingSqlDatabase();
    const p = new SqlitePersistence(db);
    await p.getCursor(); // tables exist
    const g = mint();
    const batch = [g.set("task", "t1", "title", "a"), g.set("task", "t2", "title", "b")];

    // The sync cursor and a batch of pulled ops written at the same time, as the app does: the
    // cursor write must not become part of the batch's transaction (a rollback would take it too).
    await Promise.all([p.appendBatch(batch, true), p.setCursor(7)]);

    const begin = db.log.indexOf("BEGIN TRANSACTION");
    const commit = db.log.indexOf("COMMIT");
    expect(db.log.slice(begin, commit).some((q) => q.startsWith("INSERT INTO META"))).toBe(false);
    expect(await p.getCursor()).toBe(7);
  });

  it("round-trips set and delete ops in insertion order with synced flags", async () => {
    const p = new SqlitePersistence(new FakeSqlDatabase());
    const gen = mint();
    const setOp = gen.set("task", "t1", "title", "Buy milk");
    const delOp = gen.remove("task", "t2");

    await p.append(setOp, false);
    await p.append(delOp, true);

    const loaded = await p.load();
    expect(loaded).toHaveLength(2);
    expect(loaded[0]).toEqual({ op: setOp, synced: false });
    expect(loaded[1]).toEqual({ op: delOp, synced: true });
  });

  it("preserves all JSON-representable field value types", async () => {
    const p = new SqlitePersistence(new FakeSqlDatabase());
    const gen = mint();
    const values: unknown[] = ["str", 42, true, false, null, [1, 2, 3], { a: 1, b: "two" }];
    const ops = values.map((v, i) => gen.set("task", `t${i}`, "value", v));
    for (const op of ops) await p.append(op, false);

    const loaded = await p.load();
    expect(loaded.map((l) => (l.op.op === "set" ? l.op.value : undefined))).toEqual(values);
  });

  it("is idempotent on op id (append twice stores once)", async () => {
    const p = new SqlitePersistence(new FakeSqlDatabase());
    const gen = mint();
    const op = gen.set("task", "t1", "title", "x");
    await p.append(op, false);
    await p.append(op, true);
    const loaded = await p.load();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.synced).toBe(false); // first write wins; markSynced flips it
  });

  it("markSynced flips only the named ops", async () => {
    const p = new SqlitePersistence(new FakeSqlDatabase());
    const gen = mint();
    const a = gen.set("task", "t1", "title", "a");
    const b = gen.set("task", "t2", "title", "b");
    await p.append(a, false);
    await p.append(b, false);
    await p.markSynced([a.id]);

    const loaded = await p.load();
    expect(loaded.find((l) => l.op.id === a.id)!.synced).toBe(true);
    expect(loaded.find((l) => l.op.id === b.id)!.synced).toBe(false);
  });

  it("markSynced on an empty list is a no-op", async () => {
    const p = new SqlitePersistence(new FakeSqlDatabase());
    await expect(p.markSynced([])).resolves.toBeUndefined();
  });

  it("cursor defaults to 0 and round-trips", async () => {
    const p = new SqlitePersistence(new FakeSqlDatabase());
    expect(await p.getCursor()).toBe(0);
    await p.setCursor(17);
    expect(await p.getCursor()).toBe(17);
    await p.setCursor(42);
    expect(await p.getCursor()).toBe(42);
  });
});

describe("MemoryPersistence", () => {
  it("satisfies the same contract (append/load/markSynced/cursor)", async () => {
    const p: Persistence = new MemoryPersistence();
    const gen = mint();
    const a = gen.set("task", "t1", "title", "a");
    const b = gen.remove("task", "t2");
    await p.append(a, false);
    await p.append(b, false);
    await p.append(a, true); // idempotent
    await p.markSynced([b.id]);

    const loaded = await p.load();
    expect(loaded).toEqual([
      { op: a, synced: false },
      { op: b, synced: true },
    ]);
    expect(await p.getCursor()).toBe(0);
    await p.setCursor(9);
    expect(await p.getCursor()).toBe(9);
  });
});

describe("LocalStore durability (op-log write-through)", () => {
  it("persists local edits and rebuilds an identical read model on hydrate", async () => {
    const db = new FakeSqlDatabase();
    const store = sqliteStore(NODE_A, db);
    store.set("task", "t1", "title", "Buy milk");
    store.set("task", "t1", "notes", "2%");
    store.set("task", "t1", "title", "Buy oat milk");
    store.set("project", "p1", "name", "Errands");
    store.remove("task", "t2");
    await store.flush();

    const reloaded = sqliteStore(NODE_A, db);
    await reloaded.hydrate();

    expect(reloaded.get("task", "t1")).toEqual({ title: "Buy oat milk", notes: "2%" });
    expect(reloaded.get("project", "p1")).toEqual({ name: "Errands" });
    expect(reloaded.get("task", "t2")).toBeNull();
    expect(reloaded.list("task")).toHaveLength(1);
  });

  it("restores the unsynced outbox across reload (offline durability)", async () => {
    const db = new FakeSqlDatabase();
    const store = sqliteStore(NODE_A, db);
    const a = store.set("task", "t1", "title", "a");
    const b = store.set("task", "t1", "title", "b");
    await store.flush();

    // Fresh store over the same DB: all ops still unsynced -> back in the outbox for push.
    const reloaded = sqliteStore(NODE_A, db);
    await reloaded.hydrate();
    expect(
      reloaded
        .unsyncedOps()
        .map((o) => o.id)
        .sort(),
    ).toEqual([a.id, b.id].sort());
  });

  it("does not restore synced ops to the outbox", async () => {
    const db = new FakeSqlDatabase();
    const store = sqliteStore(NODE_A, db);
    const a = store.set("task", "t1", "title", "a");
    store.markSynced([a.id]);
    await store.flush();

    const reloaded = sqliteStore(NODE_A, db);
    await reloaded.hydrate();
    expect(reloaded.get("task", "t1")).toEqual({ title: "a" });
    expect(reloaded.unsyncedOps()).toHaveLength(0);
  });

  it("advances the clock past replayed ops so a new local write wins", async () => {
    const db = new FakeSqlDatabase();
    const store = sqliteStore("orig", db, 10_000);
    store.set("task", "t1", "title", "old");
    await store.flush();

    // Reload with a clock that starts *earlier* in wall time than the persisted op.
    const reloaded = sqliteStore("re", db, 1000);
    await reloaded.hydrate();
    reloaded.set("task", "t1", "title", "new");
    expect(reloaded.get("task", "t1")).toEqual({ title: "new" });
  });

  it("hydrate is a no-op with no persistence configured", async () => {
    const store = new LocalStore(NODE_A);
    await expect(store.hydrate()).resolves.toBeUndefined();
    expect(store.list("task")).toHaveLength(0);
  });

  it("surfaces background persistence write failures via onPersistError", async () => {
    const failing: Persistence = {
      load: async () => [],
      append: async () => {
        throw new Error("disk full");
      },
      markSynced: async () => {},
      getCursor: async () => 0,
      setCursor: async () => {},
    };
    const errors: unknown[] = [];
    const store = new LocalStore(NODE_A, {
      persistence: failing,
      onPersistError: (e) => errors.push(e),
    });
    store.set("task", "t1", "title", "x"); // read model still updates synchronously
    expect(store.get("task", "t1")).toEqual({ title: "x" });
    // The flush writes it again, and says so when that fails too: a caller must not move its
    // sync cursor past an op that is not on disk.
    await expect(store.flush()).rejects.toBeInstanceOf(PersistError);
    expect(store.unsavedCount()).toBe(1);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect((errors[0] as Error).message).toBe("disk full");
  });
});

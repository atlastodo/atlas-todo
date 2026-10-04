import { describe, it, expect } from "vitest";
import { rankMoveWrites, reorderRank, type RankWrite } from "./reorder";

type Item = { id: string; sort_order: number };
const items = (...orders: number[]): Item[] =>
  orders.map((sort_order, i) => ({ id: `t${i}`, sort_order }));

describe("reorderRank", () => {
  it("ranks a downward move between its new neighbours", () => {
    // splice-out then splice-in (the reorderable-list semantics): [10,20,30,40] move index 0 to
    // index 2 -> [20,30,t0,40], so t0 lands between 30 and 40.
    const r = reorderRank(items(10, 20, 30, 40), 0, 2);
    expect(r).toMatchObject({ id: "t0", sort_order: 35 });
  });

  it("ranks an upward move between its new neighbours", () => {
    // move index 3 (40) to index 1 -> between 10 and 20.
    const r = reorderRank(items(10, 20, 30, 40), 3, 1);
    expect(r).toMatchObject({ id: "t3", sort_order: 15 });
  });

  it("moves to the start (no lower neighbour)", () => {
    const r = reorderRank(items(10, 20, 30), 2, 0);
    // rankBetween(null, 10) = 9, so it sorts before everything.
    expect(r).toMatchObject({ id: "t2", sort_order: 9 });
  });

  it("moves to the end (no upper neighbour)", () => {
    const r = reorderRank(items(10, 20, 30), 0, 2);
    // rankBetween(30, null) = 31, after the last item.
    expect(r).toMatchObject({ id: "t0", sort_order: 31 });
  });

  it("is a no-op when the item does not move", () => {
    expect(reorderRank(items(10, 20, 30), 1, 1)).toBeNull();
  });

  it("guards out-of-range indices", () => {
    expect(reorderRank(items(10, 20), 5, 0)).toBeNull();
    expect(reorderRank(items(10, 20), 0, 9)).toBeNull();
    expect(reorderRank([], 0, 0)).toBeNull();
  });

  it("keeps every other item's rank (only the moved one is re-ranked)", () => {
    // The whole point of fractional ranking: a move touches one row, not the list.
    const list = items(10, 20, 30, 40);
    const r = reorderRank(list, 0, 3)!;
    expect(r.id).toBe("t0");
    // Its new rank sits after 40; the others are untouched by this function.
    expect(r.sort_order).toBeGreaterThan(40);
  });
});

/** `items` after applying a move's writes, in display order (rank, then original position). */
function apply(list: Item[], writes: RankWrite[]): string[] {
  const rank = new Map(list.map((it) => [it.id, it.sort_order]));
  for (const w of writes) rank.set(w.id, w.sort_order);
  return list
    .map((it, i) => ({ id: it.id, r: rank.get(it.id)!, i }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.id);
}

/** Display order: by rank. */
const byRank = (list: Item[]) => [...list].sort((a, b) => a.sort_order - b.sort_order);

describe("tied ranks", () => {
  // Quick-add tasks all start at rank 0.
  const tied = () => [
    { id: "A", sort_order: 0 },
    { id: "B", sort_order: 0 },
    { id: "C", sort_order: 0 },
    { id: "D", sort_order: 0 },
  ];

  it("reorderRank moves D to index 1 among [A0,B0,C0,D0] instead of snapping back", () => {
    const list = tied();
    const move = reorderRank(list, 3, 1)!;
    const writes = (move as { writes?: RankWrite[] }).writes ?? [move];
    expect(apply(list, writes)).toEqual(["A", "D", "B", "C"]);
    expect(writes.find((w) => w.id === "D")!.sort_order).toBe(move.sort_order);
  });

  it("rankMoveWrites renumbers only when the neighbours leave no room", () => {
    expect(rankMoveWrites(items(10, 20, 30), "t2", 1)).toEqual([{ id: "t2", sort_order: 15 }]);
    const list = tied();
    const writes = rankMoveWrites(list, "D", 1);
    expect(apply(list, writes)).toEqual(["A", "D", "B", "C"]);
    // Rows already at their new index are not rewritten.
    expect(writes.map((w) => w.id)).not.toContain("A");
  });

  it("keeps 30 successive inserts into one gap strictly increasing", () => {
    let list: Item[] = [
      { id: "A", sort_order: 0 },
      { id: "B", sort_order: 1 },
    ];
    const expected = ["A", "B"];
    for (let k = 0; k < 30; k++) {
      const id = `x${k}`;
      const writes = rankMoveWrites(byRank(list), id, 1); // always right after A
      list = [...list, { id, sort_order: NaN }];
      const rank = new Map(list.map((it) => [it.id, it.sort_order]));
      for (const w of writes) rank.set(w.id, w.sort_order);
      list = list.map((it) => ({ ...it, sort_order: rank.get(it.id)! }));
      expected.splice(1, 0, id);
    }
    const sorted = [...list].sort((a, b) => a.sort_order - b.sort_order);
    expect(sorted.map((it) => it.id)).toEqual(expected);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]!.sort_order).toBeGreaterThan(sorted[i - 1]!.sort_order);
    }
  });

  it("falls back to renumbering once the gap is exhausted", () => {
    let list: Item[] = [
      { id: "A", sort_order: 0 },
      { id: "B", sort_order: 1 },
    ];
    for (let k = 0; k < 1200; k++) {
      const id = `x${k}`;
      const writes = rankMoveWrites(byRank(list), id, 1);
      const rank = new Map([...list.map((it) => [it.id, it.sort_order] as const)]);
      for (const w of writes) rank.set(w.id, w.sort_order);
      list = [...list, { id, sort_order: 0 }].map((it) => ({
        ...it,
        sort_order: rank.get(it.id)!,
      }));
    }
    const ranks = [...list].map((it) => it.sort_order).sort((a, b) => a - b);
    expect(new Set(ranks).size).toBe(ranks.length);
  });
});

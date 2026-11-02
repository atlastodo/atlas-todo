import { rankBetween } from "./rank";

export interface RankWrite {
  id: string;
  sort_order: number;
}

/**
 * The writes that place `movedId` at `toIndex` among `siblings`. Tasks without a rank all default
 * to `0` and `rankBetween` returns the tie value between them, so a move would snap back: a single
 * fractional write is kept only when strictly between the neighbours, else siblings are renumbered.
 */
export function rankMoveWrites(
  siblings: readonly { id: string; sort_order: number }[],
  movedId: string,
  toIndex: number,
): RankWrite[] {
  const others = siblings.filter((s) => s.id !== movedId);
  const at = Math.max(0, Math.min(toIndex, others.length));
  const before = at > 0 ? others[at - 1]!.sort_order : null;
  const after = at < others.length ? others[at]!.sort_order : null;
  const rank = rankBetween(before, after);
  if ((before === null || rank > before) && (after === null || rank < after)) {
    return [{ id: movedId, sort_order: rank }];
  }
  const ordered = [...others.slice(0, at), null, ...others.slice(at)];
  const writes: RankWrite[] = [];
  ordered.forEach((item, i) => {
    if (item === null) writes.push({ id: movedId, sort_order: i });
    else if (item.sort_order !== i) writes.push({ id: item.id, sort_order: i });
  });
  return writes;
}

// Via {@link rankMoveWrites}. `writes` is every row to re-rank, the moved one included; apply all. `null` for a no-op.
export function reorderRank<T extends { id: string; sort_order: number }>(
  items: T[],
  from: number,
  to: number,
): { id: string; sort_order: number; writes: RankWrite[] } | null {
  if (from === to || from < 0 || from >= items.length || to < 0 || to >= items.length) return null;
  const moved = items[from]!;
  // `to` is the moved item's index in the reordered list, i.e. among the others.
  const writes = rankMoveWrites(items, moved.id, to);
  const own = writes.find((w) => w.id === moved.id)!;
  return { id: moved.id, sort_order: own.sort_order, writes };
}

/**
 * Fractional ranking for `sort_order`. Ordering uses a `f64` `sort_order` so an item can be re-ranked between two neighbours
 * without renumbering the whole list: the new rank is the midpoint of its neighbours' ranks.
 *
 * `before`/`after` are the `sort_order` values of the items that will sit immediately before and
 * after the moved item at its destination; pass `null` when there is no such neighbour (the moved
 * item lands at the start/end, or the list is empty).
 */
export function rankBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) return 0;
  if (before === null) return after! - 1;
  if (after === null) return before + 1;
  return (before + after) / 2;
}

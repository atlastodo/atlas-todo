/**
 * Tiny fuzzy matcher for the command palette. Pure and DOM-free so ranking is unit-testable.
 * A query matches if its characters appear in order (subsequence) in the item's text; contiguous
 * and early matches score higher. An empty query keeps every item in its original order.
 */

export interface FuzzyItem {
  label: string;
  /** Extra searchable text (synonyms, group name) that doesn't show in the label. */
  keywords?: string;
}

/** Score a subsequence match of `query` against `text`, or null if not all chars appear in order. */
export function scoreMatch(text: string, query: string): number | null {
  if (query === "") return 0;
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  let ti = 0;
  let score = 0;
  let streak = 0;
  let firstIndex = -1;

  for (const ch of q) {
    const idx = t.indexOf(ch, ti);
    if (idx === -1) return null;
    if (firstIndex < 0) firstIndex = idx;
    if (idx === ti) {
      streak += 1;
      score += 2 + streak; // reward contiguous runs
    } else {
      streak = 0;
      score += 1;
    }
    ti = idx + 1;
  }
  return score - firstIndex * 0.1; // prefer earlier first matches
}

/** Filter and rank items by a fuzzy query, best first. Stable for equal scores. */
export function filterActions<T extends FuzzyItem>(query: string, items: T[]): T[] {
  if (query.trim() === "") return items;
  const q = query.trim();
  return items
    .map((item, i) => {
      const labelScore = scoreMatch(item.label, q);
      const kwScore = item.keywords ? scoreMatch(item.keywords, q) : null;
      const best =
        labelScore === null
          ? kwScore === null
            ? null
            : kwScore - 1 // slight penalty for matching only keywords
          : kwScore === null
            ? labelScore
            : Math.max(labelScore, kwScore - 1);
      return { item, i, score: best };
    })
    .filter((r): r is { item: T; i: number; score: number } => r.score !== null)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((r) => r.item);
}

/**
 * Move the j/k task-list cursor over an ordered list of ids. `current` may be null or an id no
 * longer in the list (completed or filtered away); both resolve to an end of the list. Movement
 * clamps at the ends and does not wrap.
 */
export function cursorStep(ids: string[], current: string | null, dir: 1 | -1): string | null {
  if (ids.length === 0) return null;
  const idx = current == null ? -1 : ids.indexOf(current);
  // No current cursor (or it left the list): land on the first row going down, the last going up.
  if (idx === -1) return dir > 0 ? ids[0]! : ids[ids.length - 1]!;
  const next = idx + dir;
  if (next < 0) return ids[0]!;
  if (next >= ids.length) return ids[ids.length - 1]!;
  return ids[next]!;
}

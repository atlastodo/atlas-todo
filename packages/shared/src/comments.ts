/**
 * A `comment` entity synced like any other. Pure mapping only; the author id is stamped by the
 * hook from the current session.
 */
export interface Comment {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  created_at: number;
  /** When the comment was last edited (Unix ms), or null if never. */
  edited_at: number | null;
}

export function toComment(id: string, fields: Record<string, unknown>): Comment {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  return {
    id,
    task_id: str(fields.task_id),
    author_id: str(fields.author_id),
    body: str(fields.body),
    created_at: num(fields.created_at) ?? 0,
    edited_at: num(fields.edited_at),
  };
}

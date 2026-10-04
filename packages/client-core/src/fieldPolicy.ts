/**
 * Which field values leave the device in plaintext. Everything else, including fields nothing
 * declares yet, is end-to-end encrypted, so a new field cannot leak because a list was forgotten.
 *
 * The table is `test-vectors/plaintext_fields.json`, shared with the server, which asserts that
 * every field value it reads is listed there.
 */

import vector from "../../../test-vectors/plaintext_fields.json";
import type { EntityKind } from "./types";

/**
 * Every entity kind, as a record so adding a kind to `EntityKind` fails to compile until listed.
 */
const ENTITY_KINDS: Record<EntityKind, true> = {
  task: true,
  project: true,
  section: true,
  label: true,
  comment: true,
  preference: true,
  saved_filter: true,
  reminder: true,
  project_member: true,
  activity: true,
  focus_session: true,
  habit: true,
  habit_checkin: true,
  attachment: true,
};

function loadTable(raw: Record<string, unknown>): Record<EntityKind, readonly string[] | "all"> {
  const table = {} as Record<EntityKind, readonly string[] | "all">;
  for (const kind of Object.keys(ENTITY_KINDS) as EntityKind[]) {
    const entry = raw[kind];
    if (entry === "all") table[kind] = "all";
    else if (Array.isArray(entry) && entry.every((f) => typeof f === "string"))
      table[kind] = Object.freeze([...entry]);
    else throw new Error(`plaintext_fields.json: no valid entry for "${kind}"`);
  }
  return Object.freeze(table);
}

export const PLAINTEXT_FIELDS: Readonly<Record<EntityKind, readonly string[] | "all">> = loadTable(
  vector.plaintext_fields,
);

export function shouldEncryptField(entity: EntityKind, field: string): boolean {
  const plain = PLAINTEXT_FIELDS[entity] as readonly string[] | "all" | undefined;
  if (plain === "all") return false;
  return !plain?.includes(field);
}

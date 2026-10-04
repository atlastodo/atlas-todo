import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PLAINTEXT_FIELDS, shouldEncryptField } from "./index";
import type { EntityKind } from "./types";

const vectorPath = fileURLToPath(
  new URL("../../../test-vectors/plaintext_fields.json", import.meta.url),
);
const vector = JSON.parse(readFileSync(vectorPath, "utf8")) as {
  plaintext_fields: Record<string, string[] | "all">;
};

describe("field encryption policy", () => {
  it("is exactly the shared plaintext_fields table", () => {
    expect(PLAINTEXT_FIELDS).toEqual(vector.plaintext_fields);
  });

  it.each<[EntityKind, string]>([
    ["task", "title"],
    ["task", "notes"],
    ["task", "due_at"],
    ["task", "is_completed"],
    ["task", "deleted_at"],
    ["task", "section_id"],
    ["project", "name"],
    ["project", "deleted_at"],
    ["section", "name"],
    ["label", "name"],
    ["comment", "body"],
    ["activity", "old_value"],
    ["activity", "new_value"],
    ["habit", "steps"],
    ["habit", "schedule_history"],
    ["habit_checkin", "note"],
    ["reminder", "title"],
    ["saved_filter", "query"],
    ["preference", "value"],
    ["focus_session", "task_id"],
    ["attachment", "blob_size"],
  ])("encrypts %s.%s", (entity, field) => {
    expect(shouldEncryptField(entity, field)).toBe(true);
  });

  it.each<[EntityKind, string]>([
    ["task", "project_id"],
    ["task", "assignee_id"],
    ["section", "project_id"],
    ["comment", "task_id"],
    ["activity", "task_id"],
    ["activity", "actor_id"],
    ["attachment", "task_id"],
    ["attachment", "blob_sha"],
    ["attachment", "thumb_sha"],
    ["attachment", "wrapped_key"],
    ["attachment", "meta"],
  ])("keeps %s.%s plaintext", (entity, field) => {
    expect(shouldEncryptField(entity, field)).toBe(false);
  });

  it("encrypts fields nothing has declared yet", () => {
    expect(shouldEncryptField("task", "some_future_field")).toBe(true);
    expect(shouldEncryptField("comment", "anything")).toBe(true);
    expect(shouldEncryptField("no_such_entity" as EntityKind, "project_id")).toBe(true);
  });

  it("never encrypts server-authored project_member fields", () => {
    for (const field of ["project_id", "user_id", "email", "role", "state", "whatever"]) {
      expect(shouldEncryptField("project_member", field)).toBe(false);
    }
  });
});

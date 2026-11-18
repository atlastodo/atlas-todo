import { describe, expect, it } from "vitest";
import {
  DEK_KEY_ID,
  Keyring,
  actorFieldOf,
  decodeOps,
  encodeOp,
  generateDek,
  type WireOp,
} from "@atlastodo/client-core";
import { registerTodoApp } from "./app";

const ME = "0190a6f0-0000-7000-8000-0000000000e1";
const OTHER = "0190a6f0-0000-7000-8000-0000000000e2";

registerTodoApp();

describe("writer fields", () => {
  it("bind an activity's actor and a comment's author to the account that pushed them", () => {
    expect(actorFieldOf("activity")).toBe("actor_id");
    expect(actorFieldOf("comment")).toBe("author_id");
  });

  it("drops a comment author another member pushed", () => {
    const dek = generateDek();
    const keyring = new Keyring({ dek });
    const personal = { key: dek, keyId: DEK_KEY_ID, scope: { kind: "personal" as const } };
    const author = (pushed_by: string): WireOp => ({
      ...encodeOp(
        {
          id: crypto.randomUUID(),
          entity: "comment",
          entityId: "0190a6f0-0000-7000-8000-00000000c001",
          ts: { wallMs: 1, counter: 0, node: ME },
          op: "set",
          field: "author_id",
          value: ME,
        },
        personal,
      ),
      pushed_by,
    });
    const ctx = { keyring, store: { kindOf: () => null }, openLegacy: () => null };
    expect(decodeOps([author(ME)], ctx)).toHaveLength(1);
    expect(decodeOps([author(OTHER)], ctx)).toEqual([]);
  });
});

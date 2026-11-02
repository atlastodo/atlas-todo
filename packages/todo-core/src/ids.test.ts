import { describe, it, expect } from "vitest";
import { derivedUuidV1 as derivedUuid, derivedUuidV2, PREFERENCES_ID } from "./ids";
import { ticktickUuid } from "./importTicktick";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("derivedUuidV1 (legacy)", () => {
  it("is shaped as a v4 UUID", () => {
    // A non-UUID `entity_id` makes the server reject the whole /sync/push batch with 422.
    expect(derivedUuid("habit_checkin", "h1 2026-07-06")).toMatch(UUID_V4);
    expect(PREFERENCES_ID).toMatch(UUID_V4);
  });

  it("is deterministic for the same namespace and key", () => {
    expect(derivedUuid("habit_checkin", "h1 2026-07-06")).toBe(
      derivedUuid("habit_checkin", "h1 2026-07-06"),
    );
  });

  it("separates namespaces, so the same key in two kinds never collides", () => {
    expect(derivedUuid("habit_checkin", "x")).not.toBe(derivedUuid("habit", "x"));
  });

  it("varies with the key", () => {
    expect(derivedUuid("habit_checkin", "h1 2026-07-06")).not.toBe(
      derivedUuid("habit_checkin", "h1 2026-07-07"),
    );
  });
});

describe("ticktickUuid", () => {
  // Pinned literals: a re-import is only idempotent if the same source id keeps yielding the same
  // entity id, so these must survive any refactor of the underlying hash.
  it("keeps its historical output", () => {
    expect(ticktickUuid("task", "abc")).toBe("5a5875d4-a1b1-41df-8616-6114a07065df");
    expect(ticktickUuid("project", "Inbox")).toBe("b7de6dcd-878d-49f8-9767-045a64694c3c");
    expect(ticktickUuid("label", "home")).toBe("b2c16c87-3d9d-49a6-a75e-ed2b875473dd");
  });

  it("is the ticktick-namespaced case of derivedUuid", () => {
    expect(ticktickUuid("task", "abc")).toBe(derivedUuid("ticktick:task", "abc"));
  });
});

// sha256("habit_checkin\0h1\u00002026-07-06"), computed with node:crypto rather than the code under test.
const PINNED_V2 = "f03f5286-b08a-80c7-84d5-b75ae1a24cd1";

describe("derivedUuidV2", () => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  // Two (habit, day) keys whose legacy ids are equal: v1 has only 32 bits of state.
  const A = "ee4fc151-75e1-446c-bd80-a032138ca39c\u00002025-12-08";
  const B = "b89ee133-57c4-4731-b26a-9442bccea377\u00002029-03-01";

  it("separates the known legacy collision", () => {
    expect(derivedUuid("habit_checkin", A)).toBe(derivedUuid("habit_checkin", B));
    expect(derivedUuidV2("habit_checkin", A)).not.toBe(derivedUuidV2("habit_checkin", B));
  });

  it("is a well-formed (RFC 9562 v8) UUID, deterministic, and namespace- and key-sensitive", () => {
    expect(derivedUuidV2("habit_checkin", A)).toMatch(UUID);
    expect(derivedUuidV2("habit_checkin", A)).toBe(derivedUuidV2("habit_checkin", A));
    expect(derivedUuidV2("habit_checkin", "x")).not.toBe(derivedUuidV2("habit", "x"));
    // The namespace/key boundary is unambiguous, unlike a plain ":" join.
    expect(derivedUuidV2("a:b", "c")).not.toBe(derivedUuidV2("a", "b:c"));
    expect(derivedUuidV2("ns", "æøå 🎉")).toMatch(UUID);
  });

  it("pins its output, so ids stay stable across releases", () => {
    expect(derivedUuidV2("habit_checkin", "h1\u00002026-07-06")).toBe(PINNED_V2);
  });
});

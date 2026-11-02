import { describe, expect, it } from "vitest";
import {
  initialsOf,
  isOwnerDeletionScheduled,
  isProjectOwner,
  toMember,
  type Member,
} from "./members";

const member = (over: Partial<Member>): Member => ({
  id: "m",
  project_id: "p1",
  user_id: "u1",
  email: "a@b.c",
  display_name: "Ada",
  role: "editor",
  state: "active",
  ...over,
});

describe("isProjectOwner", () => {
  it("treats an unshared project (no member rows) as owned by the caller", () => {
    expect(isProjectOwner([], "p1", "u1")).toBe(true);
    // even with rows for *other* projects, p1 has none → implicit owner
    expect(isProjectOwner([member({ project_id: "other" })], "p1", "u1")).toBe(true);
  });

  it("is true only for the caller's active owner row on a shared project", () => {
    const rows = [
      member({ user_id: "owner", role: "owner" }),
      member({ user_id: "u1", role: "editor" }),
    ];
    expect(isProjectOwner(rows, "p1", "owner")).toBe(true);
    expect(isProjectOwner(rows, "p1", "u1")).toBe(false);
  });

  it("is false for an unknown/absent user on a shared project", () => {
    const rows = [member({ user_id: "owner", role: "owner" })];
    expect(isProjectOwner(rows, "p1", undefined)).toBe(false);
    expect(isProjectOwner(rows, "p1", "stranger")).toBe(false);
  });

  it("ignores a pending (not yet accepted) owner row", () => {
    const rows = [member({ user_id: "u1", role: "owner", state: "pending" })];
    expect(isProjectOwner(rows, "p1", "u1")).toBe(false);
  });
});

describe("toMember", () => {
  it("defaults an unknown role to commenter and a non-pending state to active", () => {
    const m = toMember("id", { project_id: "p", user_id: "u", role: "bogus" });
    expect(m.role).toBe("commenter");
    expect(m.state).toBe("active");
    expect(m.deletion_scheduled).toBe(false);
  });

  it("parses deletion_scheduled correctly", () => {
    const m = toMember("id", { project_id: "p", user_id: "u", deletion_scheduled: true });
    expect(m.deletion_scheduled).toBe(true);
  });
});

describe("isOwnerDeletionScheduled", () => {
  it("returns false for unshared projects or when no owners exist", () => {
    expect(isOwnerDeletionScheduled([], "p1")).toBe(false);
    expect(isOwnerDeletionScheduled([member({ role: "editor" })], "p1")).toBe(false);
  });

  it("returns true when the sole active owner is scheduled for deletion", () => {
    const members = [
      member({ user_id: "owner", role: "owner", state: "active", deletion_scheduled: true }),
      member({ user_id: "editor", role: "editor", state: "active" }),
    ];
    expect(isOwnerDeletionScheduled(members, "p1")).toBe(true);
  });

  it("returns false when the active owner is NOT scheduled for deletion", () => {
    const members = [
      member({ user_id: "owner", role: "owner", state: "active", deletion_scheduled: false }),
      member({ user_id: "editor", role: "editor", state: "active" }),
    ];
    expect(isOwnerDeletionScheduled(members, "p1")).toBe(false);
  });

  it("returns false if at least one active owner is not scheduled for deletion", () => {
    const members = [
      member({ user_id: "owner1", role: "owner", state: "active", deletion_scheduled: true }),
      member({ user_id: "owner2", role: "owner", state: "active", deletion_scheduled: false }),
    ];
    expect(isOwnerDeletionScheduled(members, "p1")).toBe(false);
  });
});

describe("initialsOf", () => {
  it("uses up to two initials from the display name, else the email", () => {
    expect(initialsOf({ display_name: "Ada Lovelace", email: "a@b.c" })).toBe("AL");
    expect(initialsOf({ display_name: "", email: "grace@navy.mil" })).toBe("GN");
  });
});

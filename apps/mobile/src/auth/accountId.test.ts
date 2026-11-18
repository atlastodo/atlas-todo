import { assertAccountId, assertStorageScope, isAccountId, LOCAL_SCOPE } from "./accountId";
import { sessionFromAuth } from "./session";

const ID = "0190a6f0-0000-7000-8000-0000000000e1";

describe("account ids", () => {
  it("are UUIDs, never the local-only scope or a path", () => {
    expect(isAccountId(ID)).toBe(true);
    for (const bad of [LOCAL_SCOPE, "", "../x", `${ID}/..`, 7, null]) {
      expect(isAccountId(bad)).toBe(false);
    }
    expect(() => assertAccountId(LOCAL_SCOPE)).toThrow();
  });

  it("name storage alongside the local-only scope", () => {
    expect(() => assertStorageScope(ID)).not.toThrow();
    expect(() => assertStorageScope(LOCAL_SCOPE)).not.toThrow();
    expect(() => assertStorageScope("../x")).toThrow();
  });

  it("are checked before a sign-in opens a session", () => {
    const auth = { user: { id: LOCAL_SCOPE } } as Parameters<typeof sessionFromAuth>[0];
    expect(() => sessionFromAuth(auth)).toThrow("invalid account id");
  });
});

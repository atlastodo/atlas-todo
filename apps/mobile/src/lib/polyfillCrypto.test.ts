import "./polyfillCrypto";

describe("crypto polyfill", () => {
  it("defines globalThis.crypto with getRandomValues and randomUUID", () => {
    expect(typeof globalThis.crypto).toBe("object");
    expect(typeof globalThis.crypto.getRandomValues).toBe("function");
    expect(typeof globalThis.crypto.randomUUID).toBe("function");
  });

  it("fills Uint8Array with random bytes using getRandomValues", () => {
    const arr = new Uint8Array(32);
    globalThis.crypto.getRandomValues(arr);
    // Should not be completely empty
    const nonZero = arr.some((byte) => byte !== 0);
    expect(nonZero).toBe(true);
  });

  it("returns a valid UUID from randomUUID", () => {
    const uuid = globalThis.crypto.randomUUID();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});

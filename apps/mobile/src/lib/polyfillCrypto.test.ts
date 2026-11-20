/**
 * Hermes has no `globalThis.crypto`; the polyfill installs one backed by expo-crypto's native CSPRNG.
 * Node (and so jest) already has WebCrypto, so the runtime is stripped of it before the polyfill
 * loads, and expo-crypto's native calls are stood in for by recognisable answers.
 */
jest.mock("expo-crypto", () => ({
  getRandomValues: (array: Uint8Array) => array.fill(7),
  randomUUID: () => "00000000-0000-4000-8000-000000000007",
}));

describe("crypto polyfill on a runtime without WebCrypto", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");

  beforeEach(() => {
    Object.defineProperty(globalThis, "crypto", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    jest.isolateModules(() => {
      jest.requireActual("./polyfillCrypto");
    });
  });

  afterEach(() => {
    if (original) Object.defineProperty(globalThis, "crypto", original);
  });

  it("fills getRandomValues from the native CSPRNG", () => {
    const array = new Uint8Array(4);
    expect(globalThis.crypto.getRandomValues(array)).toBe(array);
    expect([...array]).toEqual([7, 7, 7, 7]);
  });

  it("answers randomUUID from the native module", () => {
    expect(globalThis.crypto.randomUUID()).toBe("00000000-0000-4000-8000-000000000007");
  });
});

/**
 * The web build's half of the native PBKDF2 seam. Metro resolves `nativePbkdf2.web.ts` for the
 * browser; jest resolves the base `.ts`, so this names the web file directly.
 */
jest.mock("react-native-quick-crypto", () => {
  throw new Error("react-native-quick-crypto reached the web build");
});

describe("nativePbkdf2 on the web", () => {
  it("registers nothing, logs nothing, and never loads the native module", async () => {
    const info = jest.spyOn(console, "info").mockImplementation(() => {});
    try {
      // Loaded after the spy: the native module registers (and logs) at import.
      jest.isolateModules(() => {
        const { registerNativePbkdf2 } =
          jest.requireActual<typeof import("./nativePbkdf2.web")>("./nativePbkdf2.web");
        registerNativePbkdf2();
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      // client-core's KDF already takes the WebCrypto path in a browser; nothing to announce.
      expect(info).not.toHaveBeenCalled();
    } finally {
      info.mockRestore();
    }
  });
});

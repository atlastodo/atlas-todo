import { registerNativePbkdf2 } from "./nativePbkdf2";

/**
 * Without the native module (as under jest) registration quietly leaves the portable derivation in
 * place: a build without quick-crypto is expected, not something to log on every launch.
 */
describe("registerNativePbkdf2", () => {
  it("falls back without logging when the native module is missing", async () => {
    const info = jest.spyOn(console, "info").mockImplementation(() => {});
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    registerNativePbkdf2();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    info.mockRestore();
    warn.mockRestore();
  });
});

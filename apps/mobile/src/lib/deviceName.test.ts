import { formatUserAgent, detectDeviceName } from "./deviceName";

describe("formatUserAgent", () => {
  it("formats Chrome on Linux", () => {
    const ua =
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
    expect(formatUserAgent(ua)).toBe("Chrome on Linux");
  });

  it("formats Edge on Windows", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0";
    expect(formatUserAgent(ua)).toBe("Edge on Windows");
  });

  it("falls back gracefully when user agent is missing or unknown", () => {
    expect(formatUserAgent(undefined)).toBe("Web Browser");
    expect(formatUserAgent("")).toBe("Web Browser");
  });
});

describe("detectDeviceName", () => {
  const originalAtlasDesktop = (window as unknown as { atlasDesktop?: unknown }).atlasDesktop;

  afterEach(() => {
    (window as unknown as { atlasDesktop?: unknown }).atlasDesktop = originalAtlasDesktop;
  });

  it("uses Electron hostname when running inside atlasDesktop", async () => {
    (window as unknown as { atlasDesktop?: unknown }).atlasDesktop = {
      getDeviceName: jest.fn().mockResolvedValue("my-nixos-pc"),
    };
    await expect(detectDeviceName()).resolves.toBe("my-nixos-pc");
  });
});

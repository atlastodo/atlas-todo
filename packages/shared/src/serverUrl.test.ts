import { describe, it, expect } from "vitest";
import { resolveServerUrl, stripTrailingSlash } from "./serverUrl";

const DEFAULT = "https://atlas.example.net";

describe("resolveServerUrl", () => {
  it("prefers a stored override over the default", () => {
    expect(resolveServerUrl("https://atlas.example.net", DEFAULT)).toBe(
      "https://atlas.example.net",
    );
  });

  it("falls back to the default when no override is stored", () => {
    expect(resolveServerUrl(null, DEFAULT)).toBe(DEFAULT);
    expect(resolveServerUrl(undefined, DEFAULT)).toBe(DEFAULT);
  });

  it("treats a blank override as unset, so clearing the settings field restores the default", () => {
    expect(resolveServerUrl("", DEFAULT)).toBe(DEFAULT);
    expect(resolveServerUrl("   ", DEFAULT)).toBe(DEFAULT);
  });

  it("trims an override the user typed with stray whitespace", () => {
    expect(resolveServerUrl("  https://atlas.example.net  ", DEFAULT)).toBe(
      "https://atlas.example.net",
    );
  });

  it("normalizes a trailing slash away, so paths never double up", () => {
    expect(resolveServerUrl("https://atlas.example.net/", DEFAULT)).toBe(
      "https://atlas.example.net",
    );
    expect(resolveServerUrl(null, "https://atlas.example.net/")).toBe("https://atlas.example.net");
  });

  it("allows an empty fallback, so a build with no baked-in default simply stays unset", () => {
    // A production build has no server of its own: with neither an env-configured default nor a
    // stored override there is nothing to talk to, and the login screen must ask for one.
    expect(resolveServerUrl(null, "")).toBe("");
    expect(resolveServerUrl("", "")).toBe("");
    expect(resolveServerUrl("  https://atlas.example.net  ", "")).toBe("https://atlas.example.net");
  });
});

describe("stripTrailingSlash", () => {
  it("leaves a url without a trailing slash alone", () => {
    expect(stripTrailingSlash("https://x.dev")).toBe("https://x.dev");
  });

  it("keeps a path segment intact", () => {
    expect(stripTrailingSlash("https://x.dev/api/")).toBe("https://x.dev/api");
  });
});

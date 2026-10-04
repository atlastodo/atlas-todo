import { describe, it, expect, afterEach } from "vitest";
import { COMMON_TIME_ZONES, REGION_OPTIONS, timeZoneOptions } from "./regions";

/** Swap `Intl.supportedValuesOf` to stand in for an engine that lacks or breaks it (e.g. Hermes). */
function withSupportedValuesOf(impl: unknown) {
  const intl = Intl as unknown as Record<string, unknown>;
  const original = intl.supportedValuesOf;
  if (impl === undefined) delete intl.supportedValuesOf;
  else intl.supportedValuesOf = impl;
  return () => {
    if (original === undefined) delete intl.supportedValuesOf;
    else intl.supportedValuesOf = original;
  };
}

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
});

describe("timeZoneOptions", () => {
  it("uses the engine's zone list when it has one", () => {
    restore = withSupportedValuesOf(() => ["Europe/Copenhagen", "Asia/Tokyo"]);
    expect(timeZoneOptions()).toEqual(["Europe/Copenhagen", "Asia/Tokyo"]);
  });

  it("falls back to the curated list on an engine without supportedValuesOf", () => {
    // This is Hermes, so it is the branch the phone actually takes.
    restore = withSupportedValuesOf(undefined);
    expect(timeZoneOptions()).toBe(COMMON_TIME_ZONES);
  });

  it("falls back when the engine throws on the timeZone key", () => {
    restore = withSupportedValuesOf(() => {
      throw new RangeError("unsupported key");
    });
    expect(timeZoneOptions()).toBe(COMMON_TIME_ZONES);
  });

  it("falls back when the engine returns an empty list", () => {
    // An empty picker offers the user nothing; the curated list is strictly better.
    restore = withSupportedValuesOf(() => []);
    expect(timeZoneOptions()).toBe(COMMON_TIME_ZONES);
  });
});

describe("COMMON_TIME_ZONES", () => {
  it("holds only zones Intl accepts", () => {
    // A bad zone here would throw inside date formatting on exactly the engines that need this list.
    for (const zone of COMMON_TIME_ZONES) {
      expect(() => new Intl.DateTimeFormat("en", { timeZone: zone }).format(0)).not.toThrow();
    }
  });

  it("has no duplicates", () => {
    expect(new Set(COMMON_TIME_ZONES).size).toBe(COMMON_TIME_ZONES.length);
  });
});

describe("REGION_OPTIONS", () => {
  it("holds only tags Intl accepts, and they format differently", () => {
    for (const { tag } of REGION_OPTIONS) {
      expect(() => new Intl.DateTimeFormat(tag).format(0)).not.toThrow();
    }
    // The whole point of the setting: a region changes date ordering.
    const d = Date.UTC(2024, 2, 5);
    const us = new Intl.DateTimeFormat("en-US", { timeZone: "UTC" }).format(d);
    const gb = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC" }).format(d);
    expect(us).not.toBe(gb);
  });

  it("has no duplicate tags", () => {
    const tags = REGION_OPTIONS.map((r) => r.tag);
    expect(new Set(tags).size).toBe(tags.length);
  });
});

import { describe, it, expect } from "vitest";
import { makeFormatters, resolveLocale } from "./format";

// A fixed instant: 2026-07-15 17:05 UTC.
const MS = Date.UTC(2026, 6, 15, 17, 5, 0);

describe("makeFormatters", () => {
  it("honours the 12/24h preference", () => {
    const twelve = makeFormatters({ locale: "en-US", timeZone: "UTC", timeFormat: "12h" });
    const twentyFour = makeFormatters({ locale: "en-US", timeZone: "UTC", timeFormat: "24h" });
    expect(twelve.time(MS)).toBe("5:05 PM");
    expect(twentyFour.time(MS)).toBe("17:05");
  });

  it("formats the time in the configured timezone", () => {
    // 17:05 UTC is 13:05 in New York (EDT, UTC-4).
    const ny = makeFormatters({ locale: "en-US", timeZone: "America/New_York", timeFormat: "24h" });
    expect(ny.time(MS)).toBe("13:05");
  });

  it("applies the date-format preference (short vs long)", () => {
    const short = makeFormatters({ locale: "en-US", timeZone: "UTC", dateFormat: "short" });
    const long = makeFormatters({ locale: "en-US", timeZone: "UTC", dateFormat: "long" });
    expect(short.date(MS)).toBe("7/15/26");
    expect(long.date(MS)).toBe("July 15, 2026");
  });

  it("produces a compact due chip and a month-year label", () => {
    const f = makeFormatters({ locale: "en-US", timeZone: "UTC" });
    expect(f.dueChip(MS)).toBe("Jul 15, 5:05 PM");
    const allDayMs = Date.UTC(2026, 6, 15, 23, 59, 0);
    expect(f.dueChip(allDayMs)).toBe("Jul 15");
    expect(f.monthYear(2026, 6)).toBe("July 2026");
  });

  it("formats numbers by locale", () => {
    expect(makeFormatters({ locale: "en-US" }).number(1234)).toBe("1,234");
    expect(makeFormatters({ locale: "de-DE" }).number(1234)).toBe("1.234");
  });

  it("orders dates by region: en-GB is day/month/year, en-US is month/day/year", () => {
    const gb = makeFormatters({ locale: "en-GB", timeZone: "UTC", dateFormat: "short" });
    const us = makeFormatters({ locale: "en-US", timeZone: "UTC", dateFormat: "short" });
    expect(gb.date(MS)).toBe("15/07/2026");
    expect(us.date(MS)).toBe("7/15/26");
  });
});

describe("resolveLocale", () => {
  it("prefers the region over the language", () => {
    expect(resolveLocale("en-GB", "en")).toBe("en-GB");
  });

  it("falls back to the language when no region is set", () => {
    expect(resolveLocale("", "da")).toBe("da");
  });

  it("returns undefined (device default) when neither is set", () => {
    expect(resolveLocale("", "")).toBeUndefined();
    expect(resolveLocale(undefined, undefined)).toBeUndefined();
  });
});

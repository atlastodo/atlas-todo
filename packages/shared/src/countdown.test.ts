import { describe, it, expect } from "vitest";
import { countdownTo, presetTarget } from "./countdown";
import { zonedParts } from "./zonedTime";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MINUTE = 60_000;

describe("countdownTo", () => {
  it("breaks a future duration into d/h/m/s and labels the two top units", () => {
    const now = 0;
    const c = countdownTo(3 * DAY + 4 * HOUR + 5 * MINUTE + 6_000, now);
    expect(c.overdue).toBe(false);
    expect(c).toMatchObject({ days: 3, hours: 4, minutes: 5, seconds: 6 });
    expect(c.label).toBe("3d 4h");
  });

  it("shows hours+minutes when under a day, minutes+seconds when under an hour", () => {
    expect(countdownTo(2 * HOUR + 5 * MINUTE, 0).label).toBe("2h 5m");
    expect(countdownTo(5 * MINUTE + 12_000, 0).label).toBe("5m 12s");
    expect(countdownTo(9_000, 0).label).toBe("9s");
  });

  it("marks and labels overdue distinctly (negative remaining)", () => {
    const c = countdownTo(0, 1 * DAY + 3 * HOUR);
    expect(c.overdue).toBe(true);
    expect(c.remaining).toBe(-(1 * DAY + 3 * HOUR));
    expect(c.days).toBe(1);
    expect(c.hours).toBe(3);
    expect(c.label).toBe("Overdue by 1d 3h");
  });

  it("says 'Due now' at exactly the target instant", () => {
    const c = countdownTo(1000, 1000);
    expect(c.overdue).toBe(false);
    expect(c.remaining).toBe(0);
    expect(c.label).toBe("Due now");
  });

  it("is timezone/DST correct: same absolute instant yields the same countdown", () => {
    // A deadline expressed in two different zones but denoting the SAME absolute instant:
    // 2026-03-08T12:00:00-05:00 (US Eastern, EST) == 2026-03-08T17:00:00Z == the same epoch ms.
    const targetEastern = Date.parse("2026-03-08T12:00:00-05:00");
    const targetUtc = Date.parse("2026-03-08T17:00:00Z");
    expect(targetEastern).toBe(targetUtc);
    const now = Date.parse("2026-03-08T15:00:00Z");
    expect(countdownTo(targetEastern, now)).toEqual(countdownTo(targetUtc, now));
    // Two hours of physical time remain regardless of the wall-clock/zone.
    expect(countdownTo(targetUtc, now).label).toBe("2h 0m");
  });

  it("reports true elapsed duration across a spring-forward DST boundary", () => {
    // US spring-forward: 2026-03-08 02:00 local jumps to 03:00. From 2026-03-07T12:00 local to
    // 2026-03-09T12:00 local is 48 wall-clock hours but only 47 physical hours. A countdown is a
    // physical duration, so it must report ~47h (1d 23h), not 2d.
    const now = Date.parse("2026-03-07T12:00:00-05:00"); // EST
    const target = Date.parse("2026-03-09T12:00:00-04:00"); // EDT (after the jump)
    const c = countdownTo(target, now);
    expect(c.remaining).toBe(47 * HOUR);
    expect(c.label).toBe("1d 23h");
  });
});

describe("presetTarget", () => {
  const tz = "Europe/Copenhagen";
  const friday = Date.parse("2026-06-05T10:00:00+02:00"); // a Friday

  it("weekend targets the coming Saturday midnight", () => {
    const p = zonedParts(presetTarget("weekend", friday, tz), tz);
    expect(p.weekday).toBe(6); // Saturday
    expect([p.year, p.month, p.day, p.hour, p.minute]).toEqual([2026, 5, 6, 0, 0]);
  });

  it("weekend jumps a full week when today is already Saturday", () => {
    const saturday = Date.parse("2026-06-06T10:00:00+02:00");
    const p = zonedParts(presetTarget("weekend", saturday, tz), tz);
    expect(p.weekday).toBe(6);
    expect(p.day).toBe(13); // next Saturday, not today
  });

  it("month_end targets 00:00 on the first of next month", () => {
    const p = zonedParts(presetTarget("month_end", friday, tz), tz);
    expect([p.year, p.month, p.day, p.hour]).toEqual([2026, 6, 1, 0]); // 2026-07-01 00:00
  });

  it("year_end targets next Jan 1 00:00", () => {
    const p = zonedParts(presetTarget("year_end", friday, tz), tz);
    expect([p.year, p.month, p.day, p.hour]).toEqual([2027, 0, 1, 0]);
  });

  it("stays correct across a DST boundary (America/New_York spring forward)", () => {
    const nz = "America/New_York";
    // 2026-03-01 (Sun) is before the Mar 8 2026 spring-forward; the month-end span crosses it.
    const beforeDst = Date.parse("2026-03-01T12:00:00-05:00");
    const p = zonedParts(presetTarget("month_end", beforeDst, nz), nz);
    expect([p.year, p.month, p.day, p.hour]).toEqual([2026, 3, 1, 0]); // Apr 1 00:00 EDT
  });
});

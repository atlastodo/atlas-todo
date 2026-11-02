import { effectiveActivityRetention } from "./useInstancePolicy";

describe("effectiveActivityRetention", () => {
  it("takes the stricter of the user's setting and the server's limit", () => {
    expect(effectiveActivityRetention(0, 0)).toBe(0);
    expect(effectiveActivityRetention(30, 0)).toBe(30);
    expect(effectiveActivityRetention(0, 90)).toBe(90);
    expect(effectiveActivityRetention(30, 90)).toBe(30);
    expect(effectiveActivityRetention(365, 90)).toBe(90);
  });
});

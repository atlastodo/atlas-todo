import { effectiveSyncStatus } from "./syncStatus";

describe("effectiveSyncStatus", () => {
  it("stays 'offline' only when the device itself has no connection", () => {
    expect(effectiveSyncStatus("offline", false)).toBe("offline");
    expect(effectiveSyncStatus("offline", false, "network")).toBe("offline");
  });

  it("is 'unreachable' when the device is online but the request never reached the server", () => {
    expect(effectiveSyncStatus("offline", true, "network")).toBe("unreachable");
  });

  it("is 'error' when the device is online and the server responded with an error", () => {
    expect(effectiveSyncStatus("offline", true, "http")).toBe("error");
    // No error kind recorded (e.g. a stale/unknown failure) reads as a generic error, not "unreachable".
    expect(effectiveSyncStatus("offline", true)).toBe("error");
  });

  it("passes the realtime 'live-ws' state through unchanged", () => {
    expect(effectiveSyncStatus("live-ws", true)).toBe("live-ws");
    // Connected realtime beats a disconnected device reading for the badge: the socket proves the
    // server is reachable, and the state is positive — no failure disambiguation applies.
    expect(effectiveSyncStatus("live-ws", false)).toBe("live-ws");
  });
});

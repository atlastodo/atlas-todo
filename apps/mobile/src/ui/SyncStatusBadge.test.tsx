import { render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import type { SyncStatus } from "@atlas/client-core";
import { StoreContext, type SyncErrorInfo } from "../data/StoreProvider";
import { SyncStatusBadge } from "./SyncStatusBadge";

/**
 * `useOnline` defaults to online under jest, so a store-"offline" with an HTTP error renders "sync error" and a network
 * error renders "unreachable". The pure split is tested in `../lib/syncStatus.test.ts`.
 */
function withStatus(status: SyncStatus, lastError: SyncErrorInfo | null = null) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <StoreContext.Provider
        value={{
          store: {} as never,
          status,
          version: 0,
          kick: () => {},
          resync: async () => {},
          diagnostics: { lastError, lastSyncAt: null, quarantined: [], pending: 0 },
          attachments: null,
          initialSyncDone: true,
        }}
      >
        {children}
      </StoreContext.Provider>
    );
  };
}

describe("SyncStatusBadge", () => {
  it("reads 'Synced' when idle", async () => {
    await render(<SyncStatusBadge />, { wrapper: withStatus("idle") });
    expect(screen.getByText("Synced")).toBeTruthy();
  });

  it("reads 'Syncing' while syncing", async () => {
    await render(<SyncStatusBadge />, { wrapper: withStatus("syncing") });
    expect(screen.getByText("Syncing")).toBeTruthy();
  });

  it("reads 'Live' while the realtime WebSocket is connected", async () => {
    await render(<SyncStatusBadge />, { wrapper: withStatus("live-ws") });
    expect(screen.getByText("Live")).toBeTruthy();
  });

  it("reads 'Sync error' when the server responded with an HTTP error", async () => {
    const err: SyncErrorInfo = { kind: "http", status: 500, message: "boom", at: 0 };
    await render(<SyncStatusBadge />, { wrapper: withStatus("offline", err) });
    expect(screen.getByText("Sync error")).toBeTruthy();
  });

  it("reads 'Server unreachable' when the request never reached the server", async () => {
    const err: SyncErrorInfo = { kind: "network", message: "Network request failed", at: 0 };
    await render(<SyncStatusBadge />, { wrapper: withStatus("offline", err) });
    const textEl = screen.getByText("Server unreachable");
    expect(textEl).toBeTruthy();
    expect(textEl.props.numberOfLines).toBe(1);
    expect(textEl.props.ellipsizeMode).toBe("tail");
  });
});

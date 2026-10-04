import { useEffect, useState } from "react";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "up-to-date"
  | "disabled"
  | "error";

export type DisableReason = "cli-flag" | "env" | "nixos" | "package-manager" | null;

export interface UpdateState {
  status: UpdateStatus;
  currentVersion: string;
  availableVersion: string | null;
  releaseNotes: string | null;
  releaseUrl: string | null;
  downloadProgress: number; // 0-100
  error: string | null;
  disabled: boolean;
  disableReason: DisableReason;
  manager: string | null;
  canSelfUpdate: boolean;
}

export interface DesktopUpdatesBridge {
  getState(): Promise<UpdateState | null>;
  checkForUpdates(): Promise<UpdateState | null>;
  downloadUpdate(): Promise<void>;
  installUpdate(): void;
  onStateChange(callback: (state: UpdateState) => void): () => void;
}

function desktopUpdatesBridge(): DesktopUpdatesBridge | null {
  if (typeof window === "undefined") return null;
  return (
    (window as unknown as { atlasDesktop?: { updates?: DesktopUpdatesBridge } }).atlasDesktop
      ?.updates ?? null
  );
}

// In-memory session dismissal so dismissed banner stays hidden until new version or reload
let sessionDismissedVersion: string | null = null;

export function useDesktopUpdates() {
  const [state, setState] = useState<UpdateState | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(false);

  useEffect(() => {
    const bridge = desktopUpdatesBridge();
    if (!bridge) return;

    let mounted = true;
    bridge
      .getState()
      .then((s) => {
        if (mounted && s) {
          setState(s);
          if (s.availableVersion && s.availableVersion === sessionDismissedVersion) {
            setDismissed(true);
          }
        }
      })
      .catch(() => {});

    const unsubscribe = bridge.onStateChange((s) => {
      if (mounted) {
        setState(s);
        if (s.availableVersion && s.availableVersion === sessionDismissedVersion) {
          setDismissed(true);
        } else {
          setDismissed(false);
        }
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const checkForUpdates = async () => {
    const bridge = desktopUpdatesBridge();
    if (!bridge) return;
    try {
      const next = await bridge.checkForUpdates();
      if (next) setState(next);
    } catch {}
  };

  const downloadUpdate = async () => {
    const bridge = desktopUpdatesBridge();
    if (!bridge) return;
    try {
      await bridge.downloadUpdate();
    } catch {}
  };

  const installUpdate = () => {
    const bridge = desktopUpdatesBridge();
    if (!bridge) return;
    bridge.installUpdate();
  };

  const dismiss = () => {
    if (state?.availableVersion) {
      sessionDismissedVersion = state.availableVersion;
      setDismissed(true);
    }
  };

  return {
    state,
    isDesktop: Boolean(desktopUpdatesBridge()),
    dismissed,
    dismiss,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
  };
}

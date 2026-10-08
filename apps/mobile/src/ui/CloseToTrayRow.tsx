import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Toggle } from "./Toggle";
import { Section } from "./Section";
import { Monitor } from "./icons";

/**
 * Settings → Desktop app's "Close to tray" switch, in its own section: whether closing the Electron window
 * hides it to the tray (the default) or quits. The choice lives in the desktop shell
 * (`apps/electron/src/desktopSettings.ts`), not the synced preferences, since it belongs to this
 * install. Shown only where the preload bridge reports a tray (not on macOS or a Linux session
 * without a tray host).
 */

interface CloseToTrayState {
  available: boolean;
  enabled: boolean;
}

interface CloseToTrayBridge {
  get(): Promise<CloseToTrayState | null>;
  set(enabled: boolean): Promise<CloseToTrayState | null>;
}

function closeToTrayBridge(): CloseToTrayBridge | null {
  if (typeof window === "undefined") return null;
  return (
    (window as unknown as { atlasDesktop?: { closeToTray?: CloseToTrayBridge } }).atlasDesktop
      ?.closeToTray ?? null
  );
}

export function CloseToTrayRow() {
  const { t } = useTranslation();
  const [state, setState] = useState<CloseToTrayState | null>(null);

  useEffect(() => {
    const desktop = closeToTrayBridge();
    if (!desktop) return;
    let live = true;
    desktop
      .get()
      .then((next) => {
        if (live) setState(next);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (!state?.available) return null;

  const change = (enabled: boolean) => {
    const desktop = closeToTrayBridge();
    if (!desktop) return;
    const previous = state;
    setState({ ...state, enabled });
    desktop
      .set(enabled)
      .then((next) => setState(next ?? previous))
      .catch(() => setState(previous));
  };

  return (
    <Section icon={Monitor} title={t("settings.desktop")}>
      <Toggle
        label={t("settings.closeToTray")}
        description={t("settings.closeToTrayDesc")}
        value={state.enabled}
        onValueChange={change}
      />
    </Section>
  );
}

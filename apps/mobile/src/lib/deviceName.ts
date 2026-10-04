import { Platform } from "react-native";
import Constants from "expo-constants";

/** Parse a user-agent string into a friendly "Browser on OS" label. */
export function formatUserAgent(ua?: string): string {
  if (!ua) return "Web Browser";

  let os = "Web";
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/Macintosh|Mac OS X/i.test(ua)) os = "macOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  let browser = "Browser";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\/|CriOS\//i.test(ua)) browser = "Chrome";
  else if (/Firefox\/|FxiOS\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua)) browser = "Safari";

  return `${browser} on ${os}`;
}

/**
 * Detect a human-readable name for the current device:
 * - Desktop (Electron): the machine hostname via IPC (e.g. "work-laptop")
 * - Native Mobile: the device name or model from Expo Constants (e.g. "Pixel 8" or "Mikkel's iPhone")
 * - Web: friendly "Browser on OS" (e.g. "Chrome on Linux")
 */
export async function detectDeviceName(): Promise<string> {
  // Desktop shell (Electron)
  if (typeof window !== "undefined") {
    const desktop = (
      window as unknown as { atlasDesktop?: { getDeviceName?: () => Promise<string | null> } }
    ).atlasDesktop;
    if (typeof desktop?.getDeviceName === "function") {
      try {
        const name = await desktop.getDeviceName();
        if (name && name.trim()) return name.trim();
      } catch {
        // Fall through on error
      }
    }
  }

  if (Platform.OS === "android") {
    return Constants.deviceName || "Android Device";
  }

  if (Platform.OS === "ios") {
    return Constants.deviceName || "iOS Device";
  }

  if (Platform.OS === "web") {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : undefined;
    return formatUserAgent(ua);
  }

  return "Atlas Device";
}

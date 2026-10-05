import { Platform } from "react-native";

/** The invite code an admin's invite link (web, `?invite=`) carries, or "". */
export function readInviteFromLink(): string {
  if (Platform.OS !== "web" || typeof window === "undefined") return "";
  try {
    return new URLSearchParams(window.location.search).get("invite") ?? "";
  } catch {
    return "";
  }
}

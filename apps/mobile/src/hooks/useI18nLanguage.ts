import { useEffect } from "react";
import i18n, { deviceLanguage } from "../i18n";
import { usePreferences } from "./usePreferences";

/**
 * Applies the synced `language` preference to i18next at runtime. Mount once near the app root, so
 * a language change re-renders every `t()` call (react-i18next handles the re-render). An empty
 * preference means "follow the device", so the fallback is {@link deviceLanguage}.
 */
export function useI18nLanguage(): void {
  const { language } = usePreferences();

  useEffect(() => {
    const lng = language || deviceLanguage();
    if (i18n.language !== lng) void i18n.changeLanguage(lng);
  }, [language]);
}

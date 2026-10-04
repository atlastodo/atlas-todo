import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getLocales } from "expo-localization";
import { LANGUAGES, resources } from "@atlas/shared";

/**
 * i18next setup. The catalogs and the offered language list come from `@atlas/shared`. The initial
 * language is the device's (via expo-localization), and the synced `language` preference then
 * takes over through {@link useI18nLanguage}.
 *
 * Resources are bundled, not fetched, so `t()` resolves synchronously (no Suspense boundary, and
 * tests render translated copy at once). English is the base and the fallback.
 */

/** The device's preferred language, narrowed to one we actually ship. */
export function deviceLanguage(): string {
  const codes = LANGUAGES.map((l) => l.code);
  for (const locale of getLocales()) {
    // `languageCode` is the bare tag ("da"); a device set to "da-DK" should still get Danish.
    const code = locale.languageCode ?? "";
    if (codes.includes(code)) return code;
  }
  return "en";
}

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: deviceLanguage(),
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
}

export default i18n;

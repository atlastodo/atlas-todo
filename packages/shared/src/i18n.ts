import en from "./locales/en.json";
import da from "./locales/da.json";

/**
 * The translation catalogs and offered languages, shared so apps cannot drift. Only data lives
 * here; each app runs its own i18next `init`. English is the base and fallback. Catalogs stay JSON
 * because the ESLint rule banning unicode glyphs targets `.ts`/`.tsx`. A new UI string needs its
 * key in both `en.json` and `da.json`.
 */
export const resources = {
  en: { translation: en },
  da: { translation: da },
} as const;

export const LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "da", label: "Dansk" },
];

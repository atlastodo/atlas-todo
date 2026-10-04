// Curated region and timezone options for Settings, shared so web and phone offer the same choices.

// Format locales (date order, number separators) independent of the UI language; the value goes to `Intl` via `resolveLocale`.
export const REGION_OPTIONS: { tag: string; label: string }[] = [
  { tag: "en-US", label: "United States (en-US)" },
  { tag: "en-GB", label: "United Kingdom (en-GB)" },
  { tag: "en-CA", label: "Canada (en-CA)" },
  { tag: "en-AU", label: "Australia (en-AU)" },
  { tag: "en-IE", label: "Ireland (en-IE)" },
  { tag: "da-DK", label: "Denmark (da-DK)" },
  { tag: "de-DE", label: "Germany (de-DE)" },
  { tag: "fr-FR", label: "France (fr-FR)" },
  { tag: "es-ES", label: "Spain (es-ES)" },
  { tag: "it-IT", label: "Italy (it-IT)" },
  { tag: "nl-NL", label: "Netherlands (nl-NL)" },
  { tag: "sv-SE", label: "Sweden (sv-SE)" },
  { tag: "nb-NO", label: "Norway (nb-NO)" },
  { tag: "pt-BR", label: "Brazil (pt-BR)" },
  { tag: "ja-JP", label: "Japan (ja-JP)" },
];

// Fallback for engines without `Intl.supportedValuesOf` (Hermes): one zone per major offset.
export const COMMON_TIME_ZONES: string[] = [
  "UTC",
  "Pacific/Honolulu",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Denver",
  "America/Phoenix",
  "America/Chicago",
  "America/Mexico_City",
  "America/New_York",
  "America/Toronto",
  "America/Bogota",
  "America/Halifax",
  "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires",
  "Atlantic/Azores",
  "Atlantic/Reykjavik",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Lisbon",
  "Europe/Amsterdam",
  "Europe/Berlin",
  "Europe/Brussels",
  "Europe/Copenhagen",
  "Europe/Madrid",
  "Europe/Oslo",
  "Europe/Paris",
  "Europe/Prague",
  "Europe/Rome",
  "Europe/Stockholm",
  "Europe/Vienna",
  "Europe/Warsaw",
  "Europe/Zurich",
  "Europe/Athens",
  "Europe/Helsinki",
  "Europe/Kyiv",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "Africa/Nairobi",
  "Europe/Istanbul",
  "Europe/Moscow",
  "Asia/Jerusalem",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Jakarta",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Singapore",
  "Asia/Manila",
  "Asia/Seoul",
  "Asia/Tokyo",
  "Australia/Perth",
  "Australia/Adelaide",
  "Australia/Brisbane",
  "Australia/Sydney",
  "Pacific/Auckland",
];

export function timeZoneOptions(): string[] {
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
    .supportedValuesOf;
  if (typeof supported === "function") {
    try {
      const zones = supported("timeZone");
      if (Array.isArray(zones) && zones.length > 0) return zones;
    } catch {
      // Engines that expose the function but not the "timeZone" key fall through to the list below.
    }
  }
  return COMMON_TIME_ZONES;
}

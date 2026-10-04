import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Segmented } from "./Segmented";

export type AdminSection = "users" | "reports" | "settings";

const SECTIONS: { value: AdminSection; labelKey: string }[] = [
  { value: "users", labelKey: "admin.users" },
  { value: "reports", labelKey: "admin.reports" },
  { value: "settings", labelKey: "admin.settings" },
];

/**
 * The section switcher every admin screen renders at the top.
 *
 * The admin area is its own route group (`/admin/users`, `/admin/reports`, `/admin/settings`) so
 * each section is deep-linkable and the server's SPA fallback serves it on a fresh load; this nav is
 * the in-page expression of those routes. Navigation itself is passed in from the route file --
 * screens under `src/` never import expo-router's `router` (the jest module-graph rule).
 */
export function AdminSectionNav({
  active,
  onNavigate,
}: {
  active: AdminSection;
  onNavigate: (href: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="px-4 pt-3">
      <Segmented
        value={active}
        options={SECTIONS.map((s) => ({ value: s.value, label: t(s.labelKey) }))}
        onChange={(section) => onNavigate(`/admin/${section}`)}
        label={t("admin.title")}
      />
    </View>
  );
}

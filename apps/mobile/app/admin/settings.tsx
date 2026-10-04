import { router } from "expo-router";
import { AdminSettingsScreen } from "../../src/screens/AdminSettingsScreen";
import { ScreenFocusBoundary } from "../../src/ui/ScreenFocusBoundary";
import { AdminSectionNav } from "../../src/ui/AdminSectionNav";

/** The admin panel's instance section: signup toggle, invites, audit trail. */
export default function AdminSettings() {
  return (
    <ScreenFocusBoundary>
      <AdminSectionNav active="settings" onNavigate={(href) => router.replace(href)} />
      <AdminSettingsScreen />
    </ScreenFocusBoundary>
  );
}

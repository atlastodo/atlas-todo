import { router } from "expo-router";
import { AdminReportsScreen } from "../../src/screens/AdminReportsScreen";
import { ScreenFocusBoundary } from "../../src/ui/ScreenFocusBoundary";
import { AdminSectionNav } from "../../src/ui/AdminSectionNav";

/** The admin panel's error-report section (the panel's original resident). */
export default function AdminReports() {
  return (
    <ScreenFocusBoundary>
      <AdminSectionNav active="reports" onNavigate={(href) => router.replace(href)} />
      <AdminReportsScreen />
    </ScreenFocusBoundary>
  );
}

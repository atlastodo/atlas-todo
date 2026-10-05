import { View } from "react-native";
import { router } from "expo-router";
import { AdminReportsScreen } from "../../src/screens/AdminReportsScreen";
import { ScreenFocusBoundary } from "../../src/ui/ScreenFocusBoundary";
import { AdminSectionNav } from "../../src/ui/AdminSectionNav";

/** The admin panel's error-report section (the panel's original resident). */
export default function AdminReports() {
  return (
    <ScreenFocusBoundary>
      <View className="w-full max-w-2xl flex-1 self-center">
        <AdminSectionNav active="reports" onNavigate={(href) => router.replace(href)} />
        <AdminReportsScreen />
      </View>
    </ScreenFocusBoundary>
  );
}

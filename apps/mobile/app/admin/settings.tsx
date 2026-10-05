import { View } from "react-native";
import { router } from "expo-router";
import { AdminSettingsScreen } from "../../src/screens/AdminSettingsScreen";
import { ScreenFocusBoundary } from "../../src/ui/ScreenFocusBoundary";
import { AdminSectionNav } from "../../src/ui/AdminSectionNav";

/** The admin panel's instance section: signup toggle, invites, audit trail. */
export default function AdminSettings() {
  return (
    <ScreenFocusBoundary>
      <View className="w-full max-w-2xl flex-1 self-center">
        <AdminSectionNav active="settings" onNavigate={(href) => router.replace(href)} />
        <AdminSettingsScreen />
      </View>
    </ScreenFocusBoundary>
  );
}

import { View } from "react-native";
import { router } from "expo-router";
import { AdminUsersScreen } from "../../src/screens/AdminUsersScreen";
import { ScreenFocusBoundary } from "../../src/ui/ScreenFocusBoundary";
import { AdminSectionNav } from "../../src/ui/AdminSectionNav";

/** The admin panel's account section. Section switching lives in the route file (router rule). */
export default function AdminUsers() {
  return (
    <ScreenFocusBoundary>
      {/* The Settings column: centred and capped, so rows do not stretch across a wide window. */}
      <View className="w-full max-w-2xl flex-1 self-center">
        <AdminSectionNav active="users" onNavigate={(href) => router.replace(href)} />
        <AdminUsersScreen />
      </View>
    </ScreenFocusBoundary>
  );
}

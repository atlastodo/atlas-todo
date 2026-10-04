import { router } from "expo-router";
import { AdminUsersScreen } from "../../src/screens/AdminUsersScreen";
import { ScreenFocusBoundary } from "../../src/ui/ScreenFocusBoundary";
import { AdminSectionNav } from "../../src/ui/AdminSectionNav";

/** The admin panel's account section. Section switching lives in the route file (router rule). */
export default function AdminUsers() {
  return (
    <ScreenFocusBoundary>
      <AdminSectionNav active="users" onNavigate={(href) => router.replace(href)} />
      <AdminUsersScreen />
    </ScreenFocusBoundary>
  );
}

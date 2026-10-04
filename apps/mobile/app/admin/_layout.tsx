import { useEffect } from "react";
import { useColorScheme } from "nativewind";
import { useTranslation } from "react-i18next";
import { Stack, router, type ErrorBoundaryProps } from "expo-router";
import { isAdmin } from "@atlas/client-core";
import { useAuth } from "../../src/auth/AuthContext";
import { useAutoReport } from "../../src/hooks/useAutoReport";
import { CrashScreen } from "../../src/ui/CrashScreen";
import { headerThemeOptions } from "../../src/theme/navTheme";

/**
 * The standalone admin area: `/admin/users`, `/admin/reports`, `/admin/settings`.
 *
 * It lives outside the drawer shell (an administration console, not a place the app browses) while
 * staying deep-linkable: the server's SPA fallback and the desktop `app://` handler serve
 * index.html for the path, and the section screens render their own switcher. Settings shows the
 * entry only to an administrator (`isAdmin`, a UI hint).
 *
 * The gate below is that same hint: a non-admin reaching the URL is bounced to Today instead of
 * seeing load errors. The server re-checks `users.is_admin` on every `/admin/*` request, so nothing
 * here is the real gate.
 */
export default function AdminLayout() {
  const { session, sessionRestored } = useAuth();
  const { t } = useTranslation();
  const { colorScheme: scheme } = useColorScheme();

  // `session` is also null mid-restore; bouncing then would send every cold deep link to Today.
  const allowed = sessionRestored && isAdmin(session);
  useEffect(() => {
    if (sessionRestored && !allowed) router.replace("/today");
  }, [sessionRestored, allowed]);
  if (!allowed) return null;

  return (
    <Stack
      screenOptions={{
        headerTitleAlign: "left",
        ...headerThemeOptions(scheme),
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="users" options={{ title: t("admin.users") }} />
      <Stack.Screen name="reports" options={{ title: t("admin.reports") }} />
      <Stack.Screen name="settings" options={{ title: t("admin.settings") }} />
    </Stack>
  );
}

/** An admin-only crash must not take the rest of the app down with it. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { t } = useTranslation();
  const report = useAutoReport(error);
  if (__DEV__) console.error(error);
  return (
    <CrashScreen
      error={error}
      report={report}
      onRetry={() => void retry()}
      onGoHome={() => router.replace("/today")}
      homeLabel={t("crash.goHome")}
    />
  );
}

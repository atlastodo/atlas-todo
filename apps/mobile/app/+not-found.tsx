import { Redirect, Stack, router, usePathname } from "expo-router";
import { useTranslation } from "react-i18next";
import { usePreferences } from "../src/hooks/usePreferences";
import { viewPath } from "../src/nav/navModel";
import { EmptyState } from "../src/ui/EmptyState";
import { CircleAlert } from "../src/ui/icons";

/**
 * Catch-all for an unknown URL: a stale bookmark, mistyped path or shared link lands here, with a
 * 200 since the SPA fallback serves the app. It says what happened and offers one way out rather
 * than silently redirecting.
 *
 * Rendered inside the store, so the synced `default_view` is available; when signed out the auth
 * gate shows the login screen instead.
 */
export default function NotFound() {
  const { t } = useTranslation();
  const { defaultView } = usePreferences();
  const path = usePathname();

  // Browser or Electron can land on /index or /index.html; send them to the app root.
  if (path === "/index" || path === "/index.html" || path === "index" || path === "index.html") {
    return <Redirect href={viewPath(defaultView)} />;
  }

  return (
    <>
      <Stack.Screen options={{ title: t("notFound.title") }} />
      <EmptyState
        icon={CircleAlert}
        title={t("notFound.title")}
        description={t("notFound.body", { path })}
        // One action, not two: "back" is unreliable here (a stale link or cold deep link leaves no
        // history to pop, or it returns to the broken URL).
        actions={[
          {
            label: t("notFound.goHome", { view: t(`nav.${defaultView}`) }),
            onPress: () => router.replace(viewPath(defaultView)),
            primary: true,
          },
        ]}
      />
    </>
  );
}

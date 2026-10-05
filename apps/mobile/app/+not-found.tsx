import { Redirect, Stack, router, usePathname } from "expo-router";
import { useTranslation } from "react-i18next";
import { useCommandPalette } from "../src/data/CommandPaletteContext";
import { usePreferences } from "../src/hooks/usePreferences";
import { viewPath } from "../src/nav/navModel";
import { EmptyState } from "../src/ui/EmptyState";
import { CircleAlert } from "../src/ui/icons";

/**
 * Catch-all for an unknown URL: a stale bookmark, mistyped path or shared link lands here, with a
 * 200 since the SPA fallback serves the app. It says what happened and offers one way out rather
 * than silently redirecting: back to the default view, or the command palette to search for where
 * they meant to go.
 *
 * Rendered inside the store, so the synced `default_view` is available; when signed out the auth
 * gate shows the login screen instead.
 */
export default function NotFound() {
  const { t } = useTranslation();
  const { defaultView } = usePreferences();
  const path = usePathname();
  const { openPalette } = useCommandPalette();

  // Browser or Electron can land on /index or /index.html; send them to the app root.
  if (path === "/index" || path === "/index.html" || path === "index" || path === "index.html") {
    return <Redirect href={viewPath(defaultView)} />;
  }

  return (
    <>
      {/* The tab keeps the title; the header shows none, so the page has one heading, not two. */}
      <Stack.Screen options={{ title: t("notFound.title"), headerTitle: "" }} />
      <EmptyState
        icon={CircleAlert}
        title={t("notFound.title")}
        description={t("notFound.body", { path })}
        // No "back": a stale link or cold deep link leaves no history to pop, or it returns to the
        // broken URL.
        actions={[
          {
            label: t("notFound.goHome", { view: t(`nav.${defaultView}`) }),
            onPress: () => router.replace(viewPath(defaultView)),
            primary: true,
          },
          { label: t("notFound.search"), onPress: openPalette },
        ]}
      />
    </>
  );
}

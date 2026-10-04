import { Redirect } from "expo-router";
import { usePreferences } from "../../src/hooks/usePreferences";
import { useRestoredRoute } from "../../src/lib/devRoute";
import { viewPath } from "../../src/nav/navModel";

/**
 * The app's landing route: redirect to the synced `default_view` preference, Today by default. It
 * re-renders when the store changes and is mounted only until it redirects, so reading the
 * preference directly is enough.
 *
 * In development a remembered route wins, since a change Fast Refresh cannot hot-swap reloads the
 * app to `/`. `useRestoredRoute` is null from the first render in production, so a real launch
 * redirects immediately.
 */
export default function Index() {
  const { defaultView } = usePreferences();
  const restored = useRestoredRoute();
  if (restored === undefined) return null;
  return <Redirect href={restored ?? viewPath(defaultView)} />;
}

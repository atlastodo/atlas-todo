import { Redirect } from "expo-router";

/**
 * `/admin` itself has no content of its own; the panel opens on the account list. A Redirect (not a
 * replace-in-layout) so old links straight to `/admin` keep working.
 */
export default function AdminIndex() {
  return <Redirect href="/admin/users" />;
}

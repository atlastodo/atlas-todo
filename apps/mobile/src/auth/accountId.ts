/**
 * Account ids name local storage (each account's database is `atlas-<id>`), next to the reserved
 * local-only scope. The id comes from the server, so it is checked before it names anything: a
 * server that answered with `"local"` would otherwise point a sign-in at the local-only data.
 */

/** The storage scope of data kept on the device without an account. */
export const LOCAL_SCOPE = "local";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isAccountId(id: unknown): id is string {
  return typeof id === "string" && UUID.test(id);
}

/** Throw unless `id` is an account id (never the local-only scope). */
export function assertAccountId(id: unknown): asserts id is string {
  if (!isAccountId(id)) throw new Error("the server sent an invalid account id");
}

/** Throw unless `scope` is the local-only scope or an account id. */
export function assertStorageScope(scope: string): void {
  if (scope !== LOCAL_SCOPE && !isAccountId(scope)) throw new Error("invalid storage scope");
}

/**
 * Server-URL resolution: pure, so both frontends share the rule. Reading and writing the override
 * is the platform's job. Atlas Todo is self-hosted, so a stored override beats the build-time
 * default.
 */

/**
 * The effective server URL. A blank override means "not set" (clearing the settings field) and
 * falls back to `fallback`. The trailing slash is removed because callers build
 * `${baseUrl}${path}`.
 */
export function resolveServerUrl(override: string | null | undefined, fallback: string): string {
  const trimmed = override?.trim();
  return stripTrailingSlash(trimmed ? trimmed : fallback);
}

export function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

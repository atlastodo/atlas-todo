// Dynamic Expo config: app.json holds the defaults (the upstream identifiers, and the version that
// scripts/bump-version.sh maintains); this file lets a fork or CI override the identifiers from the
// environment without editing it.
//
//   ATLAS_APP_ID          Android package and iOS bundle identifier.
//   ATLAS_EAS_PROJECT_ID  EAS project id; the update URL follows it. `none` removes both, so the
//                         build never contacts an Expo update server.
//
// Empty counts as unset (CI passes an unset repository variable as an empty string), so the
// app.json defaults apply.
import type { ConfigContext, ExpoConfig } from "expo/config";

function envValue(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const expo = config as ExpoConfig;
  const appId = envValue("ATLAS_APP_ID");
  const projectId = envValue("ATLAS_EAS_PROJECT_ID");

  let extra = expo.extra;
  let updates = expo.updates;
  if (projectId === "none") {
    const { eas, ...rest } = extra ?? {};
    const { projectId: _dropped, ...easRest } = (eas ?? {}) as Record<string, unknown>;
    extra = Object.keys(easRest).length > 0 ? { ...rest, eas: easRest } : rest;
    const { url: _url, ...updatesRest } = updates ?? {};
    updates = { ...updatesRest, enabled: false };
  } else if (projectId) {
    extra = { ...extra, eas: { ...extra?.eas, projectId } };
    updates = { ...updates, url: `https://u.expo.dev/${projectId}` };
  }

  return {
    ...expo,
    ios: appId ? { ...expo.ios, bundleIdentifier: appId } : expo.ios,
    android: appId ? { ...expo.android, package: appId } : expo.android,
    extra,
    updates,
  };
};

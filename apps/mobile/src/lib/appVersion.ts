import Constants from "expo-constants";
import appConfig from "../../app.json";

/**
 * The running app's version, read from the Expo config the build embeds, falling back to the
 * `app.json` the bundle was built from (which `version:bump` keeps in lockstep), so no hardcoded
 * number can go stale.
 */
export const APP_VERSION: string = Constants.expoConfig?.version ?? appConfig.expo.version;

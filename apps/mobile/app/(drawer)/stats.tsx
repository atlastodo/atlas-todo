import { Redirect } from "expo-router";
import { StatsScreen } from "../../src/screens/StatsScreen";
import { useFeature } from "../../src/hooks/useFeature";

/**
 * Stats, gated behind the `stats` feature flag. The drawer hides the entry when the flag is
 * off; this redirect covers a direct navigation (deep link / command) to a disabled feature.
 */
export default function Stats() {
  if (!useFeature("stats")) return <Redirect href="/today" />;
  return <StatsScreen />;
}

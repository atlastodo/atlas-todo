import { Redirect } from "expo-router";
import { CountdownScreen } from "../../src/screens/CountdownScreen";
import { useFeature } from "../../src/hooks/useFeature";

/**
 * Countdowns, gated behind the `countdowns` feature flag. The drawer hides the entry when the
 * flag is off; this redirect covers a direct navigation (deep link / command) to a disabled feature.
 */
export default function Countdowns() {
  if (!useFeature("countdowns")) return <Redirect href="/today" />;
  return <CountdownScreen />;
}

import { Redirect } from "expo-router";
import { FocusScreen } from "../../src/screens/FocusScreen";
import { useFeature } from "../../src/hooks/useFeature";

/**
 * The full focus timer, gated behind the `focus` feature flag. The drawer hides the entry when the
 * flag is off; this redirect covers a direct navigation (deep link / command) to a disabled feature.
 */
export default function Focus() {
  if (!useFeature("focus")) return <Redirect href="/today" />;
  return <FocusScreen />;
}

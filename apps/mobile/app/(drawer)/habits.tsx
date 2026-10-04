import { Redirect, router } from "expo-router";
import { HabitsScreen } from "../../src/screens/HabitsScreen";
import { useFeature } from "../../src/hooks/useFeature";
import { ScreenFocusBoundary } from "../../src/ui/ScreenFocusBoundary";

/**
 * Habits, gated behind the `habits` feature flag. The drawer hides the entry when it is off; this
 * redirect covers a direct navigation (deep link, command) by falling back to Today.
 */
export default function Habits() {
  if (!useFeature("habits")) return <Redirect href="/today" />;
  return (
    <ScreenFocusBoundary>
      <HabitsScreen onOpenHabit={(habit) => router.push(`/habit/${habit.id}`)} />
    </ScreenFocusBoundary>
  );
}

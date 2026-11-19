import { router } from "expo-router";
import { TodayScreen } from "../../../src/screens/TodayScreen";
import { ScreenFocusBoundary } from "../../../src/ui/ScreenFocusBoundary";

/** Today. The route owns navigation; the screen only reports which task or habit was opened. */
export default function Today() {
  return (
    <ScreenFocusBoundary>
      <TodayScreen
        onOpenTask={(task) => router.push(`/task/${task.id}`)}
        onOpenHabit={(habit) => router.push(`/habit/${habit.id}`)}
      />
    </ScreenFocusBoundary>
  );
}

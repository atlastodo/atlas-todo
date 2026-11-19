import { router } from "expo-router";
import { TodayScreen } from "../../../src/screens/TodayScreen";
import { ScreenFocusBoundary } from "../../../src/ui/ScreenFocusBoundary";

/** Today. The route owns navigation; the screen only reports which task was opened. */
export default function Today() {
  return (
    <ScreenFocusBoundary>
      <TodayScreen onOpenTask={(task) => router.push(`/task/${task.id}`)} />
    </ScreenFocusBoundary>
  );
}

import { router } from "expo-router";
import { UpcomingScreen } from "../../../src/screens/UpcomingScreen";
import { ScreenFocusBoundary } from "../../../src/ui/ScreenFocusBoundary";

/** Upcoming. The route owns navigation; the screen only reports which task was opened. */
export default function Upcoming() {
  return (
    <ScreenFocusBoundary>
      <UpcomingScreen onOpenTask={(task) => router.push(`/task/${task.id}`)} />
    </ScreenFocusBoundary>
  );
}

import { router } from "expo-router";
import { AllTasksScreen } from "../../src/screens/AllTasksScreen";
import { ScreenFocusBoundary } from "../../src/ui/ScreenFocusBoundary";

/** All tasks. The route owns navigation; the screen only reports which task was opened. */
export default function All() {
  return (
    <ScreenFocusBoundary>
      <AllTasksScreen onOpenTask={(task) => router.push(`/task/${task.id}`)} />
    </ScreenFocusBoundary>
  );
}

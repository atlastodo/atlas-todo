import { router } from "expo-router";
import { CompletedScreen } from "../../src/screens/CompletedScreen";
import { ScreenFocusBoundary } from "../../src/ui/ScreenFocusBoundary";

/** Completed. The route owns navigation; the screen only reports which task was opened. */
export default function Completed() {
  return (
    <ScreenFocusBoundary>
      <CompletedScreen onOpenTask={(task) => router.push(`/task/${task.id}`)} />
    </ScreenFocusBoundary>
  );
}

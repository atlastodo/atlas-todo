import { router } from "expo-router";
import { AssignedScreen } from "../../src/screens/AssignedScreen";
import { ScreenFocusBoundary } from "../../src/ui/ScreenFocusBoundary";

/** Assigned to me. The route owns navigation; the screen only reports which task was opened. */
export default function Assigned() {
  return (
    <ScreenFocusBoundary>
      <AssignedScreen onOpenTask={(task) => router.push(`/task/${task.id}`)} />
    </ScreenFocusBoundary>
  );
}

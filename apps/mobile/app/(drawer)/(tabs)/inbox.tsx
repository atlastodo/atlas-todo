import { router } from "expo-router";
import { InboxScreen } from "../../../src/screens/InboxScreen";
import { ScreenFocusBoundary } from "../../../src/ui/ScreenFocusBoundary";

/** Inbox. The route owns navigation; the screen only reports which task was opened. */
export default function Inbox() {
  return (
    <ScreenFocusBoundary>
      <InboxScreen onOpenTask={(task) => router.push(`/task/${task.id}`)} />
    </ScreenFocusBoundary>
  );
}

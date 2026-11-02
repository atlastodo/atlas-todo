import { useLayoutEffect } from "react";
import { router } from "expo-router";
import { AssignedScreen } from "../../src/screens/AssignedScreen";
import { ScreenFocusBoundary } from "../../src/ui/ScreenFocusBoundary";
import { ActivityButton, activityHref } from "../../src/ui/ActivityButton";
import { useHeaderRight } from "../../src/ui/useHeaderTitle";

/** Assigned to me. The route owns navigation; the screen only reports which task was opened. */
export default function Assigned() {
  const setHeaderRight = useHeaderRight();
  useLayoutEffect(() => {
    setHeaderRight(
      <ActivityButton onPress={() => router.push(activityHref({ view: "assigned" }))} />,
    );
  }, [setHeaderRight]);
  return (
    <ScreenFocusBoundary>
      <AssignedScreen onOpenTask={(task) => router.push(`/task/${task.id}`)} />
    </ScreenFocusBoundary>
  );
}

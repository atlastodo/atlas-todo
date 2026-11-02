import { useLayoutEffect } from "react";
import { router } from "expo-router";
import { AllTasksScreen } from "../../src/screens/AllTasksScreen";
import { ScreenFocusBoundary } from "../../src/ui/ScreenFocusBoundary";
import { ActivityButton, activityHref } from "../../src/ui/ActivityButton";
import { useHeaderRight } from "../../src/ui/useHeaderTitle";

/** All tasks. The route owns navigation; the screen only reports which task was opened. */
export default function All() {
  const setHeaderRight = useHeaderRight();
  useLayoutEffect(() => {
    setHeaderRight(<ActivityButton onPress={() => router.push(activityHref({ view: "all" }))} />);
  }, [setHeaderRight]);
  return (
    <ScreenFocusBoundary>
      <AllTasksScreen onOpenTask={(task) => router.push(`/task/${task.id}`)} />
    </ScreenFocusBoundary>
  );
}

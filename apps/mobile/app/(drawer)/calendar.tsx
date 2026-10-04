import { router } from "expo-router";
import { CalendarScreen } from "../../src/screens/CalendarScreen";

/** Calendar. The route owns navigation; the screen only reports which task was opened. */
export default function Calendar() {
  return <CalendarScreen onOpenTask={(task) => router.push(`/task/${task.id}`)} />;
}

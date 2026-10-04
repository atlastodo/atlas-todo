import { router } from "expo-router";
import { FiltersScreen } from "../../src/screens/FiltersScreen";

/** Saved filters list. The route owns navigation; the screen only reports intent. */
export default function Filters() {
  return (
    <FiltersScreen
      onOpen={(id) => router.push(`/filter/${id}`)}
      onNew={() => router.push("/filter/new")}
    />
  );
}

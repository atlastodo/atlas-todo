import "react-native";

declare module "react-native" {
  interface ViewProps {
    /**
     * react-native-web forwards `dataSet` to `data-*` DOM attributes on the web build (a no-op on
     * native). We use `dataSet={{ atlasRow: id }}` (rendered as `data-atlas-row`) to let a
     * document-level pointer hit-test map the element under the cursor back to a task id -- see
     * `usePaintHandlers.web.ts` / `SelectionProvider`'s paint pointermove.
     */
    dataSet?: Record<string, string | number | undefined>;
  }
}

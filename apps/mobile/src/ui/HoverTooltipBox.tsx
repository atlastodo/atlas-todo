import { Text, View } from "react-native";

/** The rail hover tooltip's label box, shared by both platform overlays. */
export function HoverTooltipBox({ label, pos }: { label: string; pos: { x: number; y: number } }) {
  return (
    // Cast as in `MobileBottomNav`: RN's ViewStyle has no `fixed`, a react-native-web-only value.
    // `pointerEvents: "none"` keeps the overlay click-through so the row's hover-out still fires.
    <View
      style={
        {
          position: "fixed",
          left: pos.x,
          top: pos.y,
          zIndex: 9999,
          pointerEvents: "none",
        } as object
      }
      className="-translate-y-1/2 rounded bg-neutral-900 px-2 py-1 dark:bg-neutral-700"
    >
      <Text numberOfLines={1} className="text-xs text-white">
        {label}
      </Text>
    </View>
  );
}

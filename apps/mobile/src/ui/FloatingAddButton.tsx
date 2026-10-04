import { Platform, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { Plus } from "./icons";
import { BOTTOM_CHROME_GAP, useBottomChrome } from "../data/BottomChromeContext";
import { haptics } from "../lib/haptics";
import { useMotion } from "../lib/motion";

export interface FloatingAddButtonProps {
  onPress: () => void;
  /** Optional custom accessibility label */
  accessibilityLabel?: string;
  /** Hide the FAB (e.g. during selection mode or when list is editing) */
  visible?: boolean;
}

/**
 * A floating action button in the bottom right corner of the screen for adding tasks on mobile.
 *
 * Press feedback is a spring scale on the icon (the `active:` darken on the background stays);
 * the spring relies on reanimated's `ReduceMotion.System` default, which jumps to the end value
 * when the OS reduce-motion setting is on.
 */
export function FloatingAddButton({
  onPress,
  accessibilityLabel,
  visible = true,
}: FloatingAddButtonProps) {
  const { t } = useTranslation();
  // Sit above the focus bar whenever it is parked along the bottom, so the timer reads as the lower
  // of the two rather than as something the button is standing on. It is already clear of the
  // phone's nav bar, which lies below this list's own box.
  const { focusBarBottom } = useBottomChrome();
  const m = useMotion();
  const press = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));

  if (!visible) return null;

  const base = Platform.OS === "web" ? 24 : 16;
  const bottom = base + (focusBarBottom > 0 ? focusBarBottom + BOTTOM_CHROME_GAP : 0);

  // Positioned through `style`: NativeWind ignores `className` on Reanimated's Animated.View.
  return (
    <Animated.View
      entering={m.fabEntering}
      exiting={m.fabExiting}
      style={{
        pointerEvents: "box-none",
        position: "absolute",
        right: Platform.OS === "web" ? 24 : 16,
        bottom,
        zIndex: 30,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? t("common.add")}
        onPress={() => {
          haptics.impact("light");
          onPress();
        }}
        onPressIn={() => (press.value = withSpring(0.9, { damping: 20, stiffness: 300 }))}
        onPressOut={() => (press.value = withSpring(1, { damping: 20, stiffness: 300 }))}
        hitSlop={8}
        className="h-[60px] w-[60px] web:h-14 web:w-14 items-center justify-center rounded-full bg-accent-600 shadow-lg active:bg-accent-700 web:cursor-pointer"
        style={Platform.select({
          ios: {
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 6,
          },
          android: {
            elevation: 8,
          },
          default: {},
        })}
      >
        <Animated.View style={[{ alignItems: "center", justifyContent: "center" }, pressStyle]}>
          <Plus size={Platform.OS === "web" ? 28 : 30} className="text-white" strokeWidth={2.5} />
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

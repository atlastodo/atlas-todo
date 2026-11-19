import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, type GestureResponderEvent } from "react-native";
import { useTranslation } from "react-i18next";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { Flame, Plus } from "./icons";
import { BOTTOM_CHROME_GAP, useBottomChrome } from "../data/BottomChromeContext";
import { useOptionalHabitsDialog } from "../data/HabitsDialogContext";
import { haptics } from "../lib/haptics";
import { useMotion } from "../lib/motion";

export interface FloatingAddButtonProps {
  onPress: () => void;
  /** Optional custom accessibility label */
  accessibilityLabel?: string;
  /** Hide the FAB (e.g. during selection mode or when list is editing) */
  visible?: boolean;
}

const SPRING = { damping: 20, stiffness: 300 } as const;
/** How far left of the add button the habits button settles, centre to centre. */
const HABITS_OFFSET = 76;
/** How long a press must last before it reveals the habits button rather than adding a task. */
const HOLD_MS = 300;

/** A press event's page position; react-native-web leaves it on the touch for touch events. */
function pagePoint(e: GestureResponderEvent): { x: number; y: number } | null {
  const ev = e.nativeEvent as unknown as {
    pageX?: number;
    pageY?: number;
    changedTouches?: ArrayLike<{ pageX: number; pageY: number }>;
    touches?: ArrayLike<{ pageX: number; pageY: number }>;
  };
  if (typeof ev.pageX === "number" && typeof ev.pageY === "number") {
    return { x: ev.pageX, y: ev.pageY };
  }
  const touch = ev.changedTouches?.[0] ?? ev.touches?.[0];
  return touch ? { x: touch.pageX, y: touch.pageY } : null;
}

/**
 * A floating action button in the bottom right corner of the screen for adding tasks on mobile.
 *
 * Press feedback is a spring scale on the icon (the `active:` darken on the background stays);
 * the spring relies on reanimated's `ReduceMotion.System` default, which jumps to the end value
 * when the OS reduce-motion setting is on.
 *
 * Press and hold (with habits on, inside the app's `HabitsDialogProvider`) springs a habits button
 * out to its left, like a radial menu: slide onto it and let go to open the habits dialog; let go
 * anywhere else and it tucks back without adding a task. Screen readers get the same as an
 * accessibility action.
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
  const habitsDialog = useOptionalHabitsDialog();
  const holdable = habitsDialog?.enabled === true;
  const m = useMotion();
  const press = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));

  // Where the hold began, and whether the finger is over the habits button.
  const origin = useRef<{ x: number; y: number } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [over, setOver] = useState(false);
  const reveal = useSharedValue(0);
  const hover = useSharedValue(0);
  useEffect(() => {
    reveal.value = withSpring(revealed ? 1 : 0, SPRING);
  }, [revealed, reveal]);
  useEffect(() => {
    hover.value = withSpring(over ? 1 : 0, SPRING);
  }, [over, hover]);
  const habitsStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [
      { translateX: -HABITS_OFFSET * reveal.value },
      { scale: 0.4 + 0.6 * reveal.value + 0.15 * hover.value },
    ],
  }));

  if (!visible) return null;

  const base = Platform.OS === "web" ? 24 : 16;
  const bottom = base + (focusBarBottom > 0 ? focusBarBottom + BOTTOM_CHROME_GAP : 0);

  /** Whether the finger, at `e`, is over the habits button (judged from where the hold began). */
  const isOverHabits = (e: GestureResponderEvent) => {
    const start = origin.current;
    const at = pagePoint(e);
    if (!start || !at) return false;
    const dx = at.x - start.x;
    return dx < -HABITS_OFFSET / 2 && dx > -HABITS_OFFSET * 1.6 && Math.abs(at.y - start.y) < 48;
  };

  const endHold = () => {
    origin.current = null;
    setRevealed(false);
    setOver(false);
  };

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
      {holdable && (
        // Behind the add button, centred on it, sliding left. Not pressable itself: the add button
        // keeps the touch for the whole hold, and its release decides.
        <Animated.View
          style={[
            {
              pointerEvents: "none",
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              alignItems: "center",
              justifyContent: "center",
            },
            habitsStyle,
          ]}
        >
          <Animated.View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[
              {
                width: 52,
                height: 52,
                borderRadius: 26,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: over ? "#f97316" : "#ffffff",
              },
              Platform.select({
                ios: {
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 3 },
                  shadowOpacity: 0.25,
                  shadowRadius: 5,
                },
                android: { elevation: 6 },
                web: { boxShadow: "0 3px 10px rgba(0, 0, 0, 0.25)" },
                default: {},
              }),
            ]}
          >
            <Flame size={24} color={over ? "#ffffff" : "#f97316"} />
          </Animated.View>
        </Animated.View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? t("common.add")}
        accessibilityActions={
          holdable ? [{ name: "openHabits", label: t("habits.openHabits") }] : undefined
        }
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === "openHabits") habitsDialog?.openHabits();
        }}
        onPress={() => {
          haptics.impact("light");
          onPress();
        }}
        onLongPress={
          holdable
            ? (e) => {
                origin.current = pagePoint(e);
                haptics.impact("medium");
                setRevealed(true);
              }
            : undefined
        }
        delayLongPress={HOLD_MS}
        // Keep the press alive while the finger travels to the habits button, so the release there
        // still reaches this button.
        pressRetentionOffset={
          holdable ? { top: 120, left: HABITS_OFFSET * 2, right: 40, bottom: 40 } : undefined
        }
        onTouchMove={
          revealed
            ? (e) => {
                const next = isOverHabits(e);
                if (next !== over) {
                  if (next) haptics.selection();
                  setOver(next);
                }
              }
            : undefined
        }
        onPressIn={() => (press.value = withSpring(0.9, SPRING))}
        onPressOut={(e) => {
          press.value = withSpring(1, SPRING);
          if (!revealed) return;
          if (isOverHabits(e)) habitsDialog?.openHabits();
          endHold();
        }}
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

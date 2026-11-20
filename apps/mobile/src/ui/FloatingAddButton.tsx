import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, type GestureResponderEvent } from "react-native";
import { useTranslation } from "react-i18next";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Flame, Plus, X } from "./icons";
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
/** The habits button's size, and the gap between it and the add button above which it sits. */
const HABITS_SIZE = 52;
const HABITS_GAP = 12;
const ADD_SIZE = Platform.OS === "web" ? 56 : 60;
/** Centre to centre, the habits button above the add button: how far the finger travels up to it. */
const HABITS_RISE = HABITS_SIZE / 2 + HABITS_GAP + ADD_SIZE / 2;
/** How long a press must last before it brings out the habits button rather than adding a task. */
const HOLD_MS = 300;
/** A plain slide, in and out: no overshoot. */
const SLIDE = { duration: 180, easing: Easing.out(Easing.cubic) };

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
 * With habits on (inside the app's `HabitsDialogProvider`), pressing and holding slides a habits
 * button up out of it, two ways to use:
 * - Slide up onto it and let go: the habits dialog opens, like a radial menu.
 * - Let go anywhere else: it stays out, to be tapped. Tapping it opens habits; tapping the add
 *   button or anywhere else on the list puts it away (without adding a task).
 * Screen readers get the same as an accessibility action. Until that has been used once, someone
 * with habits sees a callout above the button saying so.
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

  // Where the hold began; whether the habits button is out, and whether the finger still holds it
  // out (a slide decides) or it stays out to be tapped.
  const origin = useRef<{ x: number; y: number } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [holding, setHolding] = useState(false);
  const [over, setOver] = useState(false);
  // Habits turned off (here or on another device) while the button was out: put it away, or its
  // backdrop would linger and the next tap of + would only put it away instead of adding.
  if (!holdable && (revealed || holding || over)) {
    origin.current = null;
    setRevealed(false);
    setHolding(false);
    setOver(false);
  }
  const reveal = useSharedValue(0);
  useEffect(() => {
    reveal.value = withTiming(revealed ? 1 : 0, SLIDE);
  }, [revealed, reveal]);
  const habitsStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    // Up out of the add button, into its own slot above.
    transform: [{ translateY: HABITS_RISE * (1 - reveal.value) }],
  }));

  if (!visible) return null;

  const base = Platform.OS === "web" ? 24 : 16;
  const bottom = base + (focusBarBottom > 0 ? focusBarBottom + BOTTOM_CHROME_GAP : 0);

  /** Whether the finger, at `e`, is over the habits button (judged from where the hold began). */
  const isOverHabits = (e: GestureResponderEvent) => {
    const start = origin.current;
    const at = pagePoint(e);
    if (!start || !at) return false;
    const dy = at.y - start.y;
    return dy < -HABITS_RISE / 2 && dy > -HABITS_RISE * 1.6 && Math.abs(at.x - start.x) < 44;
  };

  const putAway = () => {
    origin.current = null;
    setRevealed(false);
    setHolding(false);
    setOver(false);
  };
  const openHabits = () => {
    putAway();
    habitsDialog?.openHabits();
  };

  const tipShown = holdable && habitsDialog.holdTipDue && !revealed;

  return (
    <>
      {/* While the habits button waits to be tapped, a press anywhere else on the list puts it away. */}
      {revealed && !holding && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
          onPress={putAway}
          style={[StyleSheet.absoluteFill, { zIndex: 29 }]}
        />
      )}
      {/* Positioned through `style`: NativeWind ignores `className` on Reanimated's Animated.View. */}
      <Animated.View
        entering={m.fabEntering}
        exiting={m.fabExiting}
        style={{
          pointerEvents: "box-none",
          position: "absolute",
          right: Platform.OS === "web" ? 24 : 16,
          bottom,
          zIndex: 30,
          alignItems: "center",
        }}
      >
        {holdable && (
          // A slot of its own above the add button, so the habits button lies inside this box
          // (Android delivers no touches outside a parent's bounds). Untouchable while put away.
          <Animated.View
            style={[
              {
                width: HABITS_SIZE,
                height: HABITS_SIZE,
                marginBottom: HABITS_GAP,
                pointerEvents: revealed && !holding ? "auto" : "none",
              },
              habitsStyle,
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("habits.openHabits")}
              accessibilityElementsHidden={!revealed}
              importantForAccessibility={revealed ? "auto" : "no-hide-descendants"}
              onPress={openHabits}
              // Orange 600 on white and 400 on the dark surface: both clear the 3:1 an icon needs
              // (the 500 it was, on white, did not). Hovered, white on orange 600.
              className={over ? "bg-orange-600" : "bg-white dark:bg-neutral-800"}
              style={[
                {
                  width: HABITS_SIZE,
                  height: HABITS_SIZE,
                  borderRadius: HABITS_SIZE / 2,
                  alignItems: "center",
                  justifyContent: "center",
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
              <Flame
                size={24}
                className={over ? "text-white" : "text-orange-600 dark:text-orange-400"}
              />
            </Pressable>
          </Animated.View>
        )}

        {tipShown && (
          // The one-time tip, above the button: a toast is too narrow on a phone for the sentence.
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("habits.tipHold")}
            accessibilityHint={t("habits.tipHoldHint")}
            onPress={habitsDialog.dismissHoldTip}
            style={{ position: "absolute", right: 0, bottom: ADD_SIZE + HABITS_GAP, width: 220 }}
            className="flex-row items-start gap-2 rounded-xl bg-neutral-900 px-3 py-2.5 shadow-lg dark:bg-neutral-100"
          >
            <Text className="flex-1 text-sm text-white dark:text-neutral-900">
              {t("habits.tipHold")}
            </Text>
            <X size={16} className="mt-0.5 text-neutral-400 dark:text-neutral-500" />
          </Pressable>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? t("common.add")}
          accessibilityActions={
            holdable ? [{ name: "openHabits", label: t("habits.openHabits") }] : undefined
          }
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === "openHabits") openHabits();
          }}
          onPress={() => {
            // A tap while the habits button waits puts it away rather than adding a task.
            if (revealed) {
              putAway();
              return;
            }
            haptics.impact("light");
            onPress();
          }}
          onLongPress={
            holdable
              ? (e) => {
                  origin.current = pagePoint(e);
                  haptics.impact("medium");
                  if (habitsDialog.holdTipDue) habitsDialog.dismissHoldTip();
                  setRevealed(true);
                  setHolding(true);
                }
              : undefined
          }
          delayLongPress={HOLD_MS}
          // Keep the press alive while the finger travels up to the habits button, so the release
          // there still reaches this button.
          pressRetentionOffset={
            holdable ? { top: HABITS_RISE * 2, left: 60, right: 40, bottom: 40 } : undefined
          }
          onTouchMove={
            holding
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
            if (!holding) return;
            // Slid onto it: open. Let go anywhere else: it stays out, to be tapped.
            if (isOverHabits(e)) openHabits();
            else {
              setHolding(false);
              setOver(false);
            }
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
    </>
  );
}

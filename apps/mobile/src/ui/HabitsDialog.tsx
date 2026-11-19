import { Modal, Platform, Pressable, View } from "react-native";
import { GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import type { Habit } from "@atlastodo/todo-core";
import { useIsWide } from "../hooks/useIsWide";
import { useHabitsDialog } from "../data/HabitsDialogContext";
import { HabitsScreen } from "../screens/HabitsScreen";
import { ThemeScope } from "../theme/ThemeProvider";
import { SheetHeader } from "./BottomSheet";
import {
  ELEVATED_SURFACE_CLASS,
  SCRIM_CLASS,
  useSheetDismiss,
  WEB_OVERLAY_STYLE,
} from "./useSheetDismiss";

/**
 * The full Habits screen over whatever screen is showing, opened by H (web/desktop) or the floating
 * add button's press-and-hold (phone) through `HabitsDialogContext`. Wide: a centred dialog. Narrow:
 * a drawer sliding up from the bottom, under the status bar, that a pull down its header closes, as
 * on the app's other sheets. Escape, the backdrop, the X and the Android back button close it.
 * Opening a habit closes it and pushes the habit's screen.
 *
 * Renders nothing while the habits feature is off, so neither entry point can reach it then.
 */
export function HabitsDialog({ onOpenHabit }: { onOpenHabit: (habit: Habit) => void }) {
  const { t } = useTranslation();
  const { enabled, open, closeHabits } = useHabitsDialog();
  const isWide = useIsWide();
  const insets = useSafeAreaInsets();
  // The phone drawer slides in, and out on a pull down its header, like the app's other sheets.
  const { isWeb, dismiss, animatedStyle, headerPanGesture } = useSheetDismiss(
    closeHabits,
    open && !isWide,
  );
  if (!enabled) return null;
  // The drawer slides itself out; the wide dialog has nothing to slide.
  const close = isWide ? closeHabits : dismiss;

  const header = (
    <View className="border-b border-neutral-100 px-4 pt-3 dark:border-neutral-800">
      {!isWide && !isWeb && (
        <View className="mb-2 items-center py-1">
          <View className="h-1.5 w-12 rounded-full bg-neutral-300 dark:bg-neutral-600" />
        </View>
      )}
      <SheetHeader title={t("nav.habits")} onClose={close} />
    </View>
  );
  const list = (
    <View className="flex-1">
      <HabitsScreen
        onOpenHabit={(habit) => {
          closeHabits();
          onOpenHabit(habit);
        }}
      />
    </View>
  );

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={close}
      statusBarTranslucent
    >
      {/* Its own gesture root: a native Modal sits outside the app's, and the list drags to reorder. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeScope
          className={`flex-1 ${SCRIM_CLASS}`}
          style={Platform.OS === "web" ? WEB_OVERLAY_STYLE : undefined}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.close")}
            onPress={close}
            className="absolute inset-0"
          />
          {isWide ? (
            <View
              style={{ top: "6%", bottom: "6%", pointerEvents: "box-none" }}
              className="absolute inset-x-6 items-center"
            >
              <View
                className={`h-full w-full max-w-[840px] flex-col overflow-hidden rounded-2xl ${ELEVATED_SURFACE_CLASS}`}
              >
                {header}
                {list}
              </View>
            </View>
          ) : (
            <Animated.View
              style={[
                {
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  top: insets.top + 24,
                },
                animatedStyle,
              ]}
            >
              {/* Plain View: NativeWind ignores `className` on Animated.View. Only the header drags,
                  so a pull inside the list scrolls it or reorders a habit. */}
              <View
                style={{ paddingBottom: insets.bottom }}
                className="flex-1 flex-col overflow-hidden rounded-t-3xl border-t border-neutral-200 bg-white dark:border-neutral-700 dark:bg-zinc-900"
              >
                <GestureDetector gesture={headerPanGesture}>{header}</GestureDetector>
                {list}
              </View>
            </Animated.View>
          )}
        </ThemeScope>
      </GestureHandlerRootView>
    </Modal>
  );
}

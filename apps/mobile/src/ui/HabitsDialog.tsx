import { Modal, Platform, Pressable, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import type { Habit } from "@atlastodo/todo-core";
import { useIsWide } from "../hooks/useIsWide";
import { useHabitsDialog } from "../data/HabitsDialogContext";
import { HabitsScreen } from "../screens/HabitsScreen";
import { ThemeScope } from "../theme/ThemeProvider";
import { SheetHeader } from "./BottomSheet";
import { ELEVATED_SURFACE_CLASS, SCRIM_CLASS, WEB_OVERLAY_STYLE } from "./useSheetDismiss";

/**
 * The full Habits screen over whatever screen is showing, opened by H (web/desktop) or the floating
 * add button's press-and-hold (phone) through `HabitsDialogContext`. Wide: a centred dialog. Narrow:
 * a drawer sliding up from the bottom, under the status bar. Escape, the backdrop, the X and the
 * Android back button close it. Opening a habit closes it and pushes the habit's screen.
 *
 * Renders nothing while the habits feature is off, so neither entry point can reach it then.
 */
export function HabitsDialog({ onOpenHabit }: { onOpenHabit: (habit: Habit) => void }) {
  const { t } = useTranslation();
  const { enabled, open, closeHabits } = useHabitsDialog();
  const isWide = useIsWide();
  const insets = useSafeAreaInsets();
  if (!enabled) return null;

  const body = (
    <>
      <View className="border-b border-neutral-100 px-4 pt-3 dark:border-neutral-800">
        <SheetHeader title={t("nav.habits")} onClose={closeHabits} />
      </View>
      <View className="flex-1">
        <HabitsScreen
          onOpenHabit={(habit) => {
            closeHabits();
            onOpenHabit(habit);
          }}
        />
      </View>
    </>
  );

  return (
    <Modal
      visible={open}
      transparent
      animationType={isWide ? "fade" : "slide"}
      onRequestClose={closeHabits}
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
            onPress={closeHabits}
            className="absolute inset-0"
          />
          {isWide ? (
            <View
              style={{ top: "6%", bottom: "6%", pointerEvents: "box-none" }}
              className="absolute inset-x-6 items-center"
            >
              <View
                className={`h-full w-full max-w-[760px] flex-col overflow-hidden rounded-2xl ${ELEVATED_SURFACE_CLASS}`}
              >
                {body}
              </View>
            </View>
          ) : (
            <View
              style={{ top: insets.top + 24, paddingBottom: insets.bottom }}
              className="absolute inset-x-0 bottom-0 flex-col overflow-hidden rounded-t-3xl border-t border-neutral-200 bg-white dark:border-neutral-700 dark:bg-zinc-900"
            >
              {body}
            </View>
          )}
        </ThemeScope>
      </GestureHandlerRootView>
    </Modal>
  );
}

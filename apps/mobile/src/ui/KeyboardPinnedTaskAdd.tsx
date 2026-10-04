import { useEffect, useRef, useState } from "react";
import { Keyboard, Platform, Pressable, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useKeyboardHeight } from "../hooks/useKeyboardHeight";
import { useIsWide } from "../hooks/useIsWide";
import { QuickAdd, type QuickAddProps } from "./QuickAdd";
import { ConfirmDialog } from "./ConfirmDialog";
import { useMotion } from "../lib/motion";

export interface KeyboardPinnedTaskAddProps extends QuickAddProps {
  /** Whether the keyboard-pinned quick-add panel is open */
  visible: boolean;
  /** Callback to close the panel (e.g. tapping backdrop or submitting) */
  onClose: () => void;
  /** Optional keyboard vertical offset */
  keyboardVerticalOffset?: number;
  /** Whether the container sits above a mobile bottom nav bar (default: true on phone) */
  hasBottomNav?: boolean;
}

/**
 * Task creation bar pinned directly above the software keyboard.
 */
export function KeyboardPinnedTaskAdd({
  visible,
  onClose,
  keyboardVerticalOffset = 0,
  hasBottomNav = true,
  ...quickAddProps
}: KeyboardPinnedTaskAddProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const isWide = useIsWide();
  const m = useMotion();
  const liveKeyboardHeight = useKeyboardHeight();
  const keyboardHeight = visible ? liveKeyboardHeight : 0;
  const [hasDraftInput, setHasDraftInput] = useState(false);
  const [showConfirmDiscard, setShowConfirmDiscard] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      setHasDraftInput(false);
      setShowConfirmDiscard(false);
    }
  }, [visible]);

  if (!visible) return null;

  const handleDismiss = () => {
    Keyboard.dismiss();
    timersRef.current.push(setTimeout(() => Keyboard.dismiss(), 50));
    timersRef.current.push(setTimeout(() => Keyboard.dismiss(), 150));
    setHasDraftInput(false);
    setShowConfirmDiscard(false);
    onClose();
  };

  const handleBackdropPress = () => {
    if (hasDraftInput) {
      Keyboard.dismiss();
      setShowConfirmDiscard(true);
    } else {
      handleDismiss();
    }
  };

  const isWeb = Platform.OS === "web";
  const isPhone = !isWeb && !isWide;

  // On phones with bottom nav, MobileBottomNav sits at the bottom of the drawer shell, so GroupedTaskList/ProjectTaskList
  // ends above MobileBottomNav. When the software keyboard opens, it covers MobileBottomNav.
  // We subtract the bottom nav's height and add 24dp (~0.5cm) clearance above the keyboard.
  const bottomNavHeight = isPhone && hasBottomNav ? 64 + Math.max(insets.bottom, 6) : 0;

  const bottomPadding =
    keyboardHeight > 0
      ? Math.max(0, keyboardHeight - bottomNavHeight + 24) + keyboardVerticalOffset
      : (isPhone && hasBottomNav ? 0 : Math.max(insets.bottom, 12)) + keyboardVerticalOffset;

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        isWeb ? ({ position: "fixed", zIndex: 9999 } as object) : undefined,
        { pointerEvents: "box-none" },
      ]}
      className="z-50 justify-end items-center"
    >
      {/* Backdrop: dismiss on tap outside anywhere around the modal */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("common.close", "Close")}
        onPress={handleBackdropPress}
        style={[StyleSheet.absoluteFill, isWeb ? ({ position: "fixed" } as object) : undefined]}
        className="bg-black/40 dark:bg-black/60 web:cursor-pointer"
      />

      {/* Keyboard-pinned container on mobile, bottom sheet card on web */}
      <View
        style={[
          isWeb
            ? { width: "100%", maxWidth: 768, zIndex: 1, paddingBottom: 24, paddingHorizontal: 16 }
            : {
                width: "100%",
                paddingBottom: bottomPadding,
              },
          { pointerEvents: "box-none" },
        ]}
      >
        <Animated.View layout={m.panelLayout} style={{ width: "100%" }}>
          {/* The card is a plain View: NativeWind ignores `className` on Reanimated's
              Animated.View, which left it without a background or padding. */}
          <View
            className={
              "w-full overflow-hidden shadow-2xl " +
              (isWeb
                ? "rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-zinc-900"
                : "rounded-t-3xl border-t border-slate-200 bg-white px-3.5 pt-2 pb-4 dark:border-slate-800 dark:bg-zinc-900")
            }
          >
            {/* Mobile Grab Handle */}
            {!isWeb && (
              <View className="items-center pt-1 pb-2 bg-transparent">
                <View className="h-1 w-9 rounded-full bg-slate-400 dark:bg-slate-600" />
              </View>
            )}

            <QuickAdd
              {...quickAddProps}
              isModal={true}
              autoFocus={true}
              onDraftChange={setHasDraftInput}
              onSubmitted={handleDismiss}
              onCancel={handleBackdropPress}
            />
          </View>
        </Animated.View>
      </View>

      <ConfirmDialog
        visible={showConfirmDiscard}
        title={t("quickAdd.discardTitle", "Discard task?")}
        message={t(
          "quickAdd.discardMessage",
          "You have unsaved changes. Are you sure you want to discard this task?",
        )}
        confirmLabel={t("common.discard", "Discard")}
        cancelLabel={t("common.cancel", "Cancel")}
        danger
        onConfirm={handleDismiss}
        onCancel={() => setShowConfirmDiscard(false)}
      />
    </View>
  );
}

import type { ReactNode } from "react";
import { Keyboard, Modal, Pressable, StyleSheet, View } from "react-native";
import { GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { ThemeScope } from "../theme/ThemeProvider";
import { useKeyboardHeight } from "../hooks/useKeyboardHeight";
import { useSheetDismiss, WEB_OVERLAY_STYLE } from "./useSheetDismiss";

/**
 * A bottom sheet that dismisses on an outside press, a pull-down gesture, Escape or hardware back
 * (`onRequestClose`). The overlay fills its host with `absolute inset-0`, so the scrim always
 * covers the viewport. Children are the sheet body.
 */
export function BottomSheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const { isWeb, dismiss, animatedStyle, headerPanGesture } = useSheetDismiss(onClose, visible);

  const handleBackdropPress = () => {
    if (!isWeb && keyboardHeight > 0) {
      Keyboard.dismiss();
      return;
    }
    dismiss();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeScope
          className="flex-1 justify-end bg-black/60"
          style={isWeb ? WEB_OVERLAY_STYLE : undefined}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.close")}
            onPress={handleBackdropPress}
            style={StyleSheet.absoluteFill}
          />
          <GestureDetector gesture={headerPanGesture}>
            <Animated.View style={[{ width: "100%", maxHeight: "92%" }, animatedStyle]}>
              {/* Plain View: NativeWind ignores `className` on Animated.View. */}
              <View
                style={{ flexShrink: 1, paddingBottom: Math.max(insets.bottom, 20) }}
                className="w-full flex-col rounded-t-3xl border-t border-neutral-200 bg-white px-5 pt-3 shadow-2xl dark:border-neutral-800 dark:bg-zinc-900"
              >
                {!isWeb && (
                  <View className="mb-2 items-center py-1">
                    <View className="h-1.5 w-12 rounded-full bg-neutral-300 dark:bg-neutral-600" />
                  </View>
                )}
                {children}
              </View>
            </Animated.View>
          </GestureDetector>
        </ThemeScope>
      </GestureHandlerRootView>
    </Modal>
  );
}

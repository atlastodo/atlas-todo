import { useEffect, useState, type ReactNode } from "react";
import { Keyboard, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { ThemeScope } from "../../theme/ThemeProvider";
import { useMotion } from "../../lib/motion";
import { Check, ChevronLeft, X } from "../icons";
import type { useSheetDismiss } from "../useSheetDismiss";

/** Height of the on-screen keyboard while the sheet is open, so the sheet can sit above it. */
function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, (e) => {
      if (e?.endCoordinates?.height) setHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  return height;
}

/** The mobile bottom sheet around a compose panel: grab handle, Cancel/Back, title, Save, scrolling body. */
export function ComposeSheet({
  title,
  onBack,
  onRequestClose,
  onSave,
  anim,
  children,
}: {
  title: string;
  /** Present while a nested step is showing; replaces Cancel with a back arrow. */
  onBack?: () => void;
  onRequestClose: () => void;
  onSave: () => void;
  anim: ReturnType<typeof useSheetDismiss>;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const m = useMotion();
  const keyboardHeight = useKeyboardHeight();
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onRequestClose}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeScope
          className="flex-1 justify-end"
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            paddingBottom: keyboardHeight > 0 ? keyboardHeight : Math.max(insets.bottom, 20),
          }}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={anim.dismiss}
            accessibilityLabel={t("common.close")}
          />
          <Animated.View
            style={[
              {
                width: "100%",
                maxHeight: keyboardHeight > 0 ? "55%" : "85%",
              },
              anim.animatedStyle,
            ]}
            layout={m.panelLayout}
          >
            {/* The surface is a plain View: NativeWind ignores `className` on Reanimated's
                Animated.View, which left the sheet without a background or padding. */}
            <View
              style={{ flexShrink: 1 }}
              className="w-full rounded-t-3xl border-t border-neutral-200 bg-white px-5 pb-6 pt-3 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900"
            >
              <GestureDetector gesture={anim.headerPanGesture}>
                <View>
                  <View className="mb-2 items-center bg-transparent py-0.5">
                    <View className="h-1.5 w-10 rounded-full bg-neutral-300 dark:bg-neutral-600" />
                  </View>

                  <View className="flex-row items-center justify-between border-b border-neutral-200 pb-4 dark:border-neutral-800">
                    {onBack ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t("common.back") ?? "Back"}
                        onPress={onBack}
                        hitSlop={12}
                        className="rounded-full bg-neutral-100 p-2 active:bg-neutral-200 dark:bg-neutral-800 dark:active:bg-neutral-700"
                      >
                        <ChevronLeft size={20} className="text-neutral-700 dark:text-neutral-300" />
                      </Pressable>
                    ) : (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t("common.cancel")}
                        onPress={anim.dismiss}
                        hitSlop={12}
                        className="rounded-full bg-neutral-100 p-2 active:bg-neutral-200 dark:bg-neutral-800 dark:active:bg-neutral-700"
                      >
                        <X size={20} className="text-neutral-700 dark:text-neutral-300" />
                      </Pressable>
                    )}
                    <Text className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                      {title}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t("common.save")}
                      onPress={onSave}
                      hitSlop={12}
                      className="rounded-full bg-accent-600 p-2 active:bg-accent-700"
                    >
                      <Check size={20} className="text-white" />
                    </Pressable>
                  </View>
                </View>
              </GestureDetector>

              <GestureDetector gesture={anim.composedGesture}>
                <Animated.ScrollView
                  contentContainerStyle={{ paddingTop: 12, paddingBottom: 24, gap: 12 }}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="none"
                  showsVerticalScrollIndicator={false}
                  scrollEventThrottle={16}
                  onScroll={anim.scrollHandler}
                  animatedProps={anim.scrollAnimatedProps}
                >
                  {children}
                </Animated.ScrollView>
              </GestureDetector>
            </View>
          </Animated.View>
        </ThemeScope>
      </GestureHandlerRootView>
    </Modal>
  );
}

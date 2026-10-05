import type { ReactNode } from "react";
import { Keyboard, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { ThemeScope } from "../theme/ThemeProvider";
import { useKeyboardHeight } from "../hooks/useKeyboardHeight";
import { useIsWide } from "../hooks/useIsWide";
import { X } from "./icons";
import {
  ELEVATED_SURFACE_CLASS,
  SCRIM_CLASS,
  useSheetDismiss,
  WEB_OVERLAY_STYLE,
} from "./useSheetDismiss";

/** Max width of the centred dialog a sheet becomes on wide web: forms read best narrow, lists get more room. */
const DIALOG_MAX_WIDTH = { form: 520, list: 640 } as const;

export type SheetSize = keyof typeof DIALOG_MAX_WIDTH;

/**
 * The one header every sheet and dialog uses: a title (optionally an icon and a subtitle), an
 * optional action, and an X that closes.
 */
export function SheetHeader({
  title,
  subtitle,
  icon,
  action,
  onClose,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="mb-3 flex-row items-center gap-2">
      {icon}
      <View className="min-w-0 flex-1">
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          className="text-base font-semibold text-neutral-900 dark:text-neutral-100"
        >
          {title}
        </Text>
        {subtitle != null && subtitle !== "" && (
          <Text numberOfLines={1} className="text-xs text-neutral-500 dark:text-neutral-400">
            {subtitle}
          </Text>
        )}
      </View>
      {action}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("common.close")}
        onPress={onClose}
        hitSlop={8}
        className="-mr-1.5 rounded-full p-1.5 active:bg-neutral-100 dark:active:bg-neutral-800 web:cursor-pointer web:hover:bg-neutral-100 dark:web:hover:bg-neutral-800"
      >
        <X size={20} className="text-neutral-500 dark:text-neutral-400" />
      </Pressable>
    </View>
  );
}

/**
 * A bottom sheet that dismisses on an outside press, a pull-down gesture, Escape or hardware back
 * (`onRequestClose`). The overlay fills its host with `absolute inset-0`, so the scrim always
 * covers the viewport. Children are the sheet body; a `title` adds the shared {@link SheetHeader}.
 *
 * On wide web (desktop, tablet) it is a centred dialog instead, `size` wide at most, like the web
 * task detail; phones and native keep the bottom sheet.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  icon,
  headerAction,
  size = "form",
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  icon?: ReactNode;
  headerAction?: ReactNode;
  size?: SheetSize;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const isWide = useIsWide();
  const { isWeb, dismiss, animatedStyle, headerPanGesture } = useSheetDismiss(onClose, visible);
  const centered = isWeb && isWide;

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
          className={`flex-1 ${centered ? "items-center justify-center p-6" : "justify-end"} ${SCRIM_CLASS}`}
          style={isWeb ? WEB_OVERLAY_STYLE : undefined}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.close")}
            onPress={handleBackdropPress}
            style={StyleSheet.absoluteFill}
          />
          <GestureDetector gesture={headerPanGesture}>
            <Animated.View
              style={[
                centered
                  ? { width: "100%", maxWidth: DIALOG_MAX_WIDTH[size], maxHeight: "85%" }
                  : { width: "100%", maxHeight: "92%" },
                animatedStyle,
              ]}
            >
              {/* Plain View: NativeWind ignores `className` on Animated.View. */}
              <View
                style={{
                  flexShrink: 1,
                  paddingBottom: centered ? 20 : Math.max(insets.bottom, 20),
                }}
                className={
                  centered
                    ? `w-full flex-col rounded-2xl px-5 pt-4 ${ELEVATED_SURFACE_CLASS}`
                    : "w-full flex-col rounded-t-3xl border-t border-neutral-200 bg-white px-5 pt-3 shadow-2xl dark:border-neutral-700 dark:bg-zinc-900"
                }
              >
                {!isWeb && (
                  <View className="mb-2 items-center py-1">
                    <View className="h-1.5 w-12 rounded-full bg-neutral-300 dark:bg-neutral-600" />
                  </View>
                )}
                {title != null && (
                  <SheetHeader
                    title={title}
                    subtitle={subtitle}
                    icon={icon}
                    action={headerAction}
                    onClose={dismiss}
                  />
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

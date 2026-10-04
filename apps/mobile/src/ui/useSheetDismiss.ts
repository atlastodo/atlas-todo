import { useEffect } from "react";
import { Platform, useWindowDimensions } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
  runOnJS,
} from "react-native-reanimated";

/** Fixes a web overlay to the viewport, above the app. */
export const WEB_OVERLAY_STYLE = {
  position: "fixed",
  top: 0,
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: 9999,
} as object;

/**
 * Slide-in, pull-down dismissal and animation shared by the bottom sheets. Native slides the
 * sheet in on `visible` and out on dismiss; web and tests close immediately.
 */
export function useSheetDismiss(onClose: () => void, visible = true) {
  const { height: screenHeight } = useWindowDimensions();
  const dismissTargetY = Math.max(screenHeight, 900);
  const translateY = useSharedValue(0);
  const scrollOffset = useSharedValue(0);
  const isWeb = Platform.OS === "web";

  useEffect(() => {
    if (visible) {
      translateY.value = isWeb ? 0 : dismissTargetY;
      scrollOffset.value = 0;
      if (!isWeb) {
        translateY.value = withTiming(0, {
          duration: 220,
          easing: Easing.out(Easing.cubic),
        });
      }
    }
  }, [visible, translateY, scrollOffset, isWeb, dismissTargetY]);

  const dismiss = () => {
    if (isWeb || process.env.NODE_ENV === "test") {
      onClose();
      return;
    }
    translateY.value = withTiming(
      dismissTargetY,
      { duration: 180, easing: Easing.in(Easing.cubic) },
      (finished) => {
        if (finished) {
          runOnJS(onClose)();
        }
      },
    );
  };

  const settleDrag = (translationY: number, velocityY: number, canDismiss: boolean) => {
    "worklet";
    if (canDismiss && (translationY > 80 || velocityY > 400)) {
      translateY.value = withTiming(
        dismissTargetY,
        { duration: 180, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) {
            runOnJS(onClose)();
          }
        },
      );
    } else {
      translateY.value = withTiming(0, { duration: 150 });
    }
  };

  const headerPanGesture = Gesture.Pan()
    .enabled(!isWeb)
    .activeOffsetY(5)
    .failOffsetY(-5)
    .onUpdate((event) => {
      if (event.translationY > 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      settleDrag(event.translationY, event.velocityY, true);
    });

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollOffset.value = event.contentOffset.y;
    },
  });

  const nativeScrollGesture = Gesture.Native();

  const contentPanGesture = Gesture.Pan()
    .enabled(!isWeb)
    .activeOffsetY(5)
    .failOffsetY(-5)
    .simultaneousWithExternalGesture(nativeScrollGesture)
    .onUpdate((event) => {
      if (scrollOffset.value <= 0 && event.translationY > 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      settleDrag(event.translationY, event.velocityY, scrollOffset.value <= 0);
    });

  const composedGesture = Gesture.Simultaneous(contentPanGesture, nativeScrollGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return {
    isWeb,
    dismiss,
    animatedStyle,
    headerPanGesture,
    scrollHandler,
    composedGesture,
  };
}

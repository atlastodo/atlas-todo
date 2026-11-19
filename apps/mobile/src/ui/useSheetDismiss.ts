import { useEffect } from "react";
import { Platform, useWindowDimensions } from "react-native";
import {
  GestureStateManager,
  useNativeGesture,
  usePanGesture,
  useSimultaneousGestures,
} from "react-native-gesture-handler";
import {
  useAnimatedProps,
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

/** The one scrim every overlay dims the app with. */
export const SCRIM_CLASS = "bg-black/50";

/**
 * The raised surface of a dialog, popover or desktop sheet. Dark mode gets a lighter border and a
 * deep shadow, since a 1px dark border alone barely lifts the panel off a near-black page.
 */
export const ELEVATED_SURFACE_CLASS =
  "border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-zinc-900 dark:shadow-black/80";

/** Placeholder text in overlay fields (neutral-500): dim enough in both themes not to read as a typed value. */
export const PLACEHOLDER_COLOR = "#737373";

/** A primary button with nothing to submit yet: a flat grey fill, not a faded accent that still looks pressable. */
export const DISABLED_BUTTON_CLASS = "bg-neutral-200 dark:bg-neutral-800";
export const DISABLED_BUTTON_TEXT_CLASS = "text-neutral-500 dark:text-neutral-400";

/** Longer than this at rest before moving, a press belongs to a long-press drag, not a pull. */
const LONG_PRESS_MS = 200;

/**
 * Slide-in, pull-down dismissal and animation shared by the bottom sheets. Native slides the
 * sheet in on `visible` and out on dismiss; web and tests close immediately.
 */
export function useSheetDismiss(onClose: () => void, visible = true) {
  const { height: screenHeight } = useWindowDimensions();
  const dismissTargetY = Math.max(screenHeight, 900);
  const translateY = useSharedValue(0);
  const scrollOffset = useSharedValue(0);
  // A content pull that has taken over the sheet: from the moment the sheet moves until the finger
  // lifts, the finger drives the sheet both ways and the scroll view is frozen.
  const dragging = useSharedValue(false);
  // The pan's translation when it took over, so the sheet starts from where the finger is, not
  // from wherever the gesture began (a pull that first scrolled the list back to the top).
  const dragStart = useSharedValue(0);
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

  const headerPanGesture = usePanGesture({
    enabled: !isWeb,
    activeOffsetY: 5,
    failOffsetY: -5,
    onUpdate: (event) => {
      translateY.value = Math.max(0, event.translationY);
    },
    onDeactivate: (event) => {
      settleDrag(event.translationY, event.velocityY, true);
    },
  });

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollOffset.value = event.contentOffset.y;
    },
  });

  const nativeScrollGesture = useNativeGesture();

  // Pulls the sheet down only from the top of the content. Once it has, the pull keeps the sheet
  // even if the finger reverses: pulling back up raises the sheet instead of scrolling the list.
  const contentPanGesture = usePanGesture({
    enabled: !isWeb,
    activeOffsetY: 5,
    failOffsetY: -5,
    simultaneousWith: nativeScrollGesture,
    onUpdate: (event) => {
      if (!dragging.value && scrollOffset.value <= 0 && event.translationY > 0) {
        dragging.value = true;
        dragStart.value = event.translationY;
      }
      if (dragging.value) {
        translateY.value = Math.max(0, event.translationY - dragStart.value);
      }
    },
    onDeactivate: (event) => {
      if (dragging.value && !event.canceled) {
        settleDrag(event.translationY - dragStart.value, event.velocityY, true);
      }
    },
    onFinalize: (event) => {
      // A cancelled pull (interrupted by the system) does not settle: put the sheet back.
      if (dragging.value && event.canceled) translateY.value = withTiming(0, { duration: 150 });
      dragging.value = false;
    },
  });

  // For a list that brings its own gesture detector (the reorderable habits list), which leaves no
  // way to run `contentPanGesture` alongside its scroll: a pan on the list's container that decides
  // by hand, from the offset the list reports through `scrollHandler`. Scrolled down, or moving up,
  // it fails and the list scrolls; at the top and pulling down, it takes the sheet. A press that
  // rests before it moves is the list's long-press drag (reordering), never a pull.
  const touchStartY = useSharedValue(0);
  const touchStartAt = useSharedValue(0);
  const topPullGesture = usePanGesture({
    enabled: !isWeb,
    manualActivation: true,
    onTouchesDown: (event) => {
      touchStartY.value = event.allTouches[0]?.absoluteY ?? 0;
      touchStartAt.value = Date.now();
    },
    onTouchesMove: (event) => {
      const y = event.allTouches[0]?.absoluteY;
      if (y === undefined) return;
      const dy = y - touchStartY.value;
      if (scrollOffset.value > 0 || dy < -5) {
        GestureStateManager.fail(event.handlerTag);
      } else if (dy > 8) {
        if (Date.now() - touchStartAt.value > LONG_PRESS_MS)
          GestureStateManager.fail(event.handlerTag);
        else GestureStateManager.activate(event.handlerTag);
      }
    },
    onUpdate: (event) => {
      translateY.value = Math.max(0, event.translationY);
    },
    onDeactivate: (event) => {
      settleDrag(event.translationY, event.velocityY, !event.canceled);
    },
  });

  /** For the sheet's scroll view: frozen while a pull drives the sheet. */
  const scrollAnimatedProps = useAnimatedProps(() => ({ scrollEnabled: !dragging.value }));

  const composedGesture = useSimultaneousGestures(contentPanGesture, nativeScrollGesture);

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
    contentPanGesture,
    topPullGesture,
    nativeScrollGesture,
    scrollAnimatedProps,
  };
}

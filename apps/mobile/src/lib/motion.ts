import {
  FadeIn,
  FadeOut,
  Keyframe,
  LinearTransition,
  SlideInDown,
  SlideOutDown,
  useReducedMotion,
} from "react-native-reanimated";

/**
 * Reduced-motion-aware transition presets: the single source for every `entering`/`exiting`/`layout`
 * animation in the app.
 *
 * Always gate through {@link useMotion}, never spread a raw reanimated builder. Each preset is
 * `undefined` when the OS "reduce motion" setting is on, and an `undefined` `entering`/`exiting`/
 * `layout` prop simply does not animate, so components need no per-site branching. The builders
 * are configured at module level and handed out by the hook.
 *
 * Inside a worklet, read `enabled` into a plain local first: a worklet captures whole identifiers,
 * so `motion.enabled` in a gesture callback or `useAnimatedStyle` drags the whole object (builders
 * included) to the UI thread, and reanimated throws "Cannot copy value of type `FadeIn`".
 * `const animate = useMotion().enabled;` captures a boolean and is safe.
 */

// Menu/popover: fade + a slight scale-up.
const MENU_ENTER = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.96 }] },
  100: { opacity: 1, transform: [{ scale: 1 }] },
}).duration(130);

const ROW_ENTERING = FadeIn.duration(180);
const ROW_EXITING = FadeOut.duration(120);
const ROW_LAYOUT = LinearTransition.springify().damping(18).stiffness(180);
// Keyboard-pinned panels (quick-add, rename bar, compose-bar picker): the keyboard drives their
// position, so the transition glides after it without spring overshoot, which reads as bouncing.
const PANEL_LAYOUT = LinearTransition.duration(200);
const SCREEN_ENTER = FadeIn.duration(150);
const MENU_EXIT = FadeOut.duration(90);
const TOAST_ENTERING = SlideInDown.duration(180);
const TOAST_EXITING = SlideOutDown.duration(160);

// FAB: fade + slight scale-up.
const FAB_ENTERING = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.9 }] },
  100: { opacity: 1, transform: [{ scale: 1 }] },
}).duration(180);
const FAB_EXITING = FadeOut.duration(120);

export function useMotion() {
  const on = !useReducedMotion();
  return {
    /** True when motion is allowed; gates anything not expressed as a preset. */
    enabled: on,
    /** List-item enter (add / first mount). */
    rowEntering: on ? ROW_ENTERING : undefined,
    /** List-item exit (remove). */
    rowExiting: on ? ROW_EXITING : undefined,
    /** List reflow when items reorder or a neighbour changes size. */
    rowLayout: on ? ROW_LAYOUT : undefined,
    /** Keyboard-pinned panel ride: track keyboard-driven repositioning, no overshoot. */
    panelLayout: on ? PANEL_LAYOUT : undefined,
    /** Screen/view content cross-fade on navigate-in. */
    screenEnter: on ? SCREEN_ENTER : undefined,
    /** Context-menu / popover grow-in (fade + slight scale). */
    menuEnter: on ? MENU_ENTER : undefined,
    /** Context-menu / popover fade-out. */
    menuExit: on ? MENU_EXIT : undefined,
    /** Toast slide up from the bottom edge. */
    toastEntering: on ? TOAST_ENTERING : undefined,
    /** Toast slide back down on dismiss. */
    toastExiting: on ? TOAST_EXITING : undefined,
    /** Floating action button grow-in. */
    fabEntering: on ? FAB_ENTERING : undefined,
    /** Floating action button fade-out. */
    fabExiting: on ? FAB_EXITING : undefined,
  };
}

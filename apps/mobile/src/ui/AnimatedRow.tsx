import type { ReactNode } from "react";
import Animated from "react-native-reanimated";
import { useMotion } from "../lib/motion";

/**
 * Wraps a list row so it fades/slides in, fades out on removal and slides on reorder, all
 * reduced-motion-safe via {@link useMotion}. Reorderable lists pass `layout={false}` and skip
 * `exiting`: the library drives its own drag transform and a reanimated `layout` fights it.
 */
export function AnimatedRow({
  children,
  layout = true,
  exit = true,
}: {
  children: ReactNode;
  /** Apply the reorder/reflow layout animation. Off for reorderable lists (they own the transform). */
  layout?: boolean;
  /** Apply the removal animation. Off for reorderable lists. */
  exit?: boolean;
}) {
  const m = useMotion();
  return (
    <Animated.View
      entering={m.rowEntering}
      exiting={exit ? m.rowExiting : undefined}
      layout={layout ? m.rowLayout : undefined}
    >
      {children}
    </Animated.View>
  );
}

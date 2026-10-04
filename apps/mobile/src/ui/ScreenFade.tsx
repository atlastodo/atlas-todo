import type { ReactNode } from "react";
import Animated from "react-native-reanimated";
import { useMotion } from "../lib/motion";

/**
 * Cross-fades a screen's content in on mount, reduced-motion-safe via {@link useMotion}. Used on
 * the non-list screens; task lists animate per row, so fading their container would double up.
 * `flex: 1` goes through `style`, not a NativeWind class: `className` does not reach reanimated's
 * `Animated.View`, and the container collapsed to content height.
 */
export function ScreenFade({ children }: { children: ReactNode }) {
  const m = useMotion();
  return (
    <Animated.View entering={m.screenEnter} style={{ flex: 1 }}>
      {children}
    </Animated.View>
  );
}

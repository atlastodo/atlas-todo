import { useEffect, useRef, useState, type ReactNode } from "react";
import { View, type ViewProps } from "react-native";
import { useTranslation } from "react-i18next";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

/**
 * The loading-placeholder primitive: surfaces that render awaited data show `<Skeleton>` blocks
 * (or {@link SkeletonRows}) instead of a blank list or spinner. NativeWind has no `animate-pulse`,
 * so the pulse is a reanimated opacity loop; with OS "reduce motion" on it renders static
 * (`lib/motion.ts`). Colour and shape come from `className`.
 */
export function Skeleton({ className, style, ...rest }: ViewProps & { className?: string }) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(reduced ? 0.6 : 1);

  useEffect(() => {
    if (reduced) return;
    opacity.value = withRepeat(withTiming(0.4, { duration: 800 }), -1, true);
  }, [reduced, opacity]);

  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));

  // The look lives on a plain inner View: NativeWind ignores `className` on Animated.View.
  return (
    <Animated.View style={[pulse, style]} {...rest}>
      <View style={{ flexGrow: 1 }} className={className ?? "bg-neutral-200 dark:bg-neutral-800"} />
    </Animated.View>
  );
}

/** A stack of task-row-shaped skeletons of varied widths, labelled "Loading" for assistive tech. */
export function SkeletonRows({ count = 4 }: { count?: number }) {
  const { t } = useTranslation();
  return (
    <View accessibilityLabel={t("common.loading")} className="gap-3 p-4">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} className="flex-row items-center gap-3">
          <Skeleton className="h-5 w-5 rounded-full bg-neutral-200 dark:bg-neutral-800" />
          <Skeleton
            className="h-4 rounded bg-neutral-200 dark:bg-neutral-800"
            style={{ width: `${55 + ((i * 7) % 35)}%` }}
          />
        </View>
      ))}
    </View>
  );
}

/**
 * Shows `children` only once a wait is real: 300 ms late, held for at least 400 ms once shown. A
 * placeholder flashing for the ~100 ms of a fast load reads as a glitch. The hold only works while
 * this component stays mounted; a branch-style gate that unmounts it gets only the delay.
 */
export function SkeletonGate({
  active,
  delayMs = 300,
  minMs = 400,
  children,
}: {
  active: boolean;
  delayMs?: number;
  minMs?: number;
  children: ReactNode;
}) {
  const [shown, setShown] = useState(false);
  // A ref, so a fast active-to-inactive flip within the show timer's tick still measures the hold from when the skeleton appeared.
  const shownAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (active) {
      const t = setTimeout(() => {
        shownAtRef.current = Date.now();
        setShown(true);
      }, delayMs);
      return () => clearTimeout(t);
    }
    if (shownAtRef.current === null) return;
    const elapsed = Date.now() - shownAtRef.current;
    const t = setTimeout(
      () => {
        shownAtRef.current = null;
        setShown(false);
      },
      Math.max(0, minMs - elapsed),
    );
    return () => clearTimeout(t);
  }, [active, delayMs, minMs]);

  return shown ? <>{children}</> : null;
}

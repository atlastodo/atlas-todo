import { useEffect } from "react";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { RefreshCw } from "./icons";

/**
 * Custom animated spinning sync icon replacing native ActivityIndicator.
 */
export function SpinningSyncIcon({
  size = 13,
  duration = 500,
  className = "text-accent-600 dark:text-accent-400",
}: {
  size?: number;
  duration?: number;
  className?: string;
} = {}) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(withTiming(360, { duration, easing: Easing.linear }), -1, false);
    return () => {
      cancelAnimation(rotation);
    };
  }, [rotation, duration]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <RefreshCw size={size} className={className} />
    </Animated.View>
  );
}

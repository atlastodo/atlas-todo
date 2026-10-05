import { useEffect, useState } from "react";
import { LayoutChangeEvent, Platform, Pressable, Text, View } from "react-native";
import { haptics } from "../lib/haptics";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import type { LucideIcon } from "./icons";

export interface SegmentedOption<T> {
  value: T;
  label: string;
  /** Shown in place of the label when the control is `iconOnly`; the label stays the accessible name. */
  icon?: LucideIcon;
}

interface ItemLayout {
  x: number;
  width: number;
}

/** A segmented single-choice control whose active pill slides to the selected option and sizes to each option's content. */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  accentColor,
  iconOnly = false,
}: {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  label: string;
  accentColor?: string;
  /** Render each option's `icon` instead of its text, for a narrow header. */
  iconOnly?: boolean;
}) {
  const activeIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const [layouts, setLayouts] = useState<Record<number, ItemLayout>>({});

  const activeX = layouts[activeIndex]?.x;
  const activeWidth = layouts[activeIndex]?.width;

  const translateX = useSharedValue(0);
  const indicatorWidth = useSharedValue(0);

  useEffect(() => {
    if (activeX !== undefined && activeWidth !== undefined && activeWidth > 0) {
      // First measurement after a mount: land the indicator without animating from 0, which would
      // read as a slide-in rather than a move. Only a later change between measured positions slides.
      const withMotion = indicatorWidth.value !== 0;
      translateX.value = withMotion ? withTiming(activeX, { duration: 180 }) : activeX;
      indicatorWidth.value = withMotion ? withTiming(activeWidth, { duration: 180 }) : activeWidth;
    }
  }, [activeX, activeWidth, translateX, indicatorWidth]);

  const onItemLayout = (index: number, e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    if (width > 0) {
      setLayouts((prev) => {
        if (prev[index]?.x === x && prev[index]?.width === width) return prev;
        return { ...prev, [index]: { x, width } };
      });
    }
  };

  const animatedIndicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    width: indicatorWidth.value,
  }));

  const activeAccent = accentColor ?? "#4f46e5";
  const hasMeasured = activeWidth !== undefined && activeWidth > 0;

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{ borderRadius: 12 }}
      className="overflow-hidden border border-neutral-200 bg-neutral-100 p-1 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <View className="relative flex-row items-center">
        {hasMeasured && (
          <Animated.View
            style={[
              animatedIndicatorStyle,
              {
                position: "absolute",
                top: 0,
                bottom: 0,
                left: 0,
                borderRadius: 8,
                backgroundColor: activeAccent,
              },
              Platform.select({
                web: { boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)" },
                ios: {
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.05,
                  shadowRadius: 1,
                },
                android: { elevation: 1 },
                default: {},
              }),
            ]}
          />
        )}

        {options.map((opt, index) => {
          const active = opt.value === value;
          return (
            <Pressable
              key={String(opt.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={opt.label}
              onPress={() => {
                haptics.selection();
                onChange(opt.value);
              }}
              onLayout={(e) => onItemLayout(index, e)}
              style={{
                // Grow into a stretched (full-width) control so the options share it, instead of
                // bunching at the start; a content-sized control has no free space and is unchanged.
                flexGrow: 1,
                borderRadius: 8,
                // Once measured, only the sliding pill is filled; anything opaque on the selected
                // option sits above it. Inactive options keep their className press tint.
                ...(active && { backgroundColor: hasMeasured ? "transparent" : activeAccent }),
              }}
              className={
                "z-10 items-center justify-center py-1.5 " +
                (iconOnly ? "px-2.5 " : "px-3.5 ") +
                "web:cursor-pointer web:transition-colors web:duration-150 " +
                (!hasMeasured && active ? "shadow-sm " : "") +
                (active
                  ? ""
                  : "bg-transparent active:bg-neutral-200/50 dark:active:bg-neutral-800/50")
              }
            >
              {iconOnly && opt.icon ? (
                <opt.icon
                  size={18}
                  className={active ? "text-white" : "text-neutral-600 dark:text-neutral-400"}
                />
              ) : (
                <Text
                  // Web only for the colour transition: on Android NativeWind's animated Text painted
                  // its own background, a lighter rectangle behind the selected label.
                  style={{ backgroundColor: "transparent" }}
                  className={
                    "text-center text-sm web:transition-colors web:duration-150 " +
                    (active
                      ? "font-semibold text-white"
                      : "font-medium text-neutral-600 dark:text-neutral-400")
                  }
                >
                  {opt.label}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

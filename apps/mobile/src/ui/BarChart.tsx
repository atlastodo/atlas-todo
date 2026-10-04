import { View } from "react-native";

/**
 * A bar chart hand-rolled from `View` heights (no chart library or `react-native-svg`). `dense` is
 * for a long series read as a shape (the strength curve), with bars edge to edge and no minimum width.
 */
export interface BarChartProps {
  values: number[];
  ariaLabel: string;
  max?: number;
  className?: string;
  barClassName?: string;
  dense?: boolean;
  /** Draw a faint column behind each bar. Useful when `max` is fixed, so a young habit's near-zero bars still show the extent they are measured against. */
  track?: boolean;
}

/** Floor for a non-zero bar, as a percentage of chart height, so a small real value is not indistinguishable from none. */
const MIN_VISIBLE_PERCENT = 4;

export function BarChart({
  values,
  ariaLabel,
  max,
  className = "h-32",
  barClassName = "bg-accent-500",
  dense = false,
  track = false,
}: BarChartProps) {
  const ceiling = Math.max(max ?? 0, 1, ...values);
  return (
    // No `items-end` and `h-full` on every column: Yoga resolves a percentage height only against
    // a definite parent height, and `flex-end` makes the column content-sized, so every bar was zero.
    <View
      accessible
      accessibilityLabel={ariaLabel}
      className={`flex-row ${dense ? "gap-px" : "gap-0.5"} ${className}`}
    >
      {values.map((value, index) => {
        const ratio = Math.max(0, Math.min(1, value / ceiling));
        const percent = ratio === 0 ? 0 : Math.max(MIN_VISIBLE_PERCENT, ratio * 100);
        return (
          <View
            key={index}
            className={
              (dense ? "h-full flex-1 justify-end" : "h-full min-w-[3px] flex-1 justify-end") +
              (track ? " rounded-sm bg-neutral-100 dark:bg-neutral-900" : "")
            }
          >
            <View className={`rounded-t-sm ${barClassName}`} style={{ height: `${percent}%` }} />
          </View>
        );
      })}
    </View>
  );
}

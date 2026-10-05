import { Text, View } from "react-native";

/**
 * A bar chart hand-rolled from `View` heights (no chart library or `react-native-svg`). `dense` is
 * for a long series read as a shape (the strength curve), with bars edge to edge and no minimum width.
 */
export interface BarChartProps {
  values: number[];
  ariaLabel: string;
  max?: number;
  className?: string;
  /** Plot height in px, overriding the height in `className` (e.g. sized from the container's width). */
  height?: number;
  barClassName?: string;
  dense?: boolean;
  /** Draw a faint column behind each bar. Useful when `max` is fixed, so a young habit's near-zero bars still show the extent they are measured against. */
  track?: boolean;
  /** Draw a baseline under the bars and a faint stub for each zero value, so an empty day reads as "none", not as missing data. */
  baseline?: boolean;
  /** Caption above the plot's top-right corner, e.g. the peak value the bars are scaled to. */
  peakLabel?: string;
  /** Captions under the first and last bar, e.g. the range's first date and "Today". */
  startLabel?: string;
  endLabel?: string;
}

/** Floor for a non-zero bar, as a percentage of chart height, so a small real value is not indistinguishable from none. */
const MIN_VISIBLE_PERCENT = 4;

export function BarChart({
  values,
  ariaLabel,
  max,
  className = "h-32",
  height,
  barClassName = "bg-accent-500",
  dense = false,
  track = false,
  baseline = false,
  peakLabel,
  startLabel,
  endLabel,
}: BarChartProps) {
  const ceiling = Math.max(max ?? 0, 1, ...values);
  const plot = (
    // No `items-end` and `h-full` on every column: Yoga resolves a percentage height only against
    // a definite parent height, and `flex-end` makes the column content-sized, so every bar was zero.
    <View
      accessible
      accessibilityLabel={ariaLabel}
      className={
        `flex-row ${dense ? "gap-px" : "gap-0.5"} ${className}` +
        (baseline ? " border-b border-neutral-300 dark:border-neutral-700" : "")
      }
      style={height === undefined ? undefined : { height }}
    >
      {values.map((value, index) => {
        const ratio = Math.max(0, Math.min(1, value / ceiling));
        const percent = ratio === 0 ? 0 : Math.max(MIN_VISIBLE_PERCENT, ratio * 100);
        return (
          <View
            key={index}
            className={
              (dense ? "h-full flex-1 justify-end" : "h-full min-w-[3px] flex-1 justify-end") +
              (track ? " rounded-sm bg-neutral-100 dark:bg-neutral-800" : "")
            }
          >
            {baseline && percent === 0 ? (
              <View className="h-0.5 rounded-t-sm bg-neutral-200 dark:bg-neutral-800" />
            ) : (
              <View className={`rounded-t-sm ${barClassName}`} style={{ height: `${percent}%` }} />
            )}
          </View>
        );
      })}
    </View>
  );
  if (peakLabel === undefined && startLabel === undefined && endLabel === undefined) return plot;
  return (
    <View>
      {peakLabel !== undefined && (
        <Text className="mb-1 self-end text-xs text-neutral-500 dark:text-neutral-400">
          {peakLabel}
        </Text>
      )}
      {plot}
      {(startLabel !== undefined || endLabel !== undefined) && (
        <View className="mt-1 flex-row justify-between gap-2">
          <Text className="text-xs text-neutral-500 dark:text-neutral-400">{startLabel}</Text>
          <Text className="text-xs text-neutral-500 dark:text-neutral-400">{endLabel}</Text>
        </View>
      )}
    </View>
  );
}

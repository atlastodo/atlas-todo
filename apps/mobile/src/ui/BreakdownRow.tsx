import { Text, View } from "react-native";

/**
 * A labelled horizontal bar: a name, a proportional bar and the value at the right. `count`/`max`
 * are the bar's geometry, not necessarily the text: a rate passes `count={94}` `max={100}` and
 * `valueLabel="94%"`.
 */
export function BreakdownRow({
  label,
  count,
  max,
  tint,
  valueLabel,
  indent = false,
}: {
  label: string;
  count: number;
  max: number;
  tint?: string;
  valueLabel?: string;
  indent?: boolean;
}) {
  return (
    <View className="flex-row items-center gap-3">
      <Text
        numberOfLines={1}
        className={
          "shrink-0 text-sm text-neutral-600 dark:text-neutral-300 " +
          (indent ? "w-28 pl-4" : "w-32")
        }
      >
        {label}
      </Text>
      <View className="h-4 flex-1 overflow-hidden rounded bg-neutral-100 dark:bg-neutral-800">
        <View
          className={"h-full rounded " + (tint ? "" : "bg-accent-500")}
          style={{
            width: `${max > 0 ? (count / max) * 100 : 0}%`,
            ...(tint ? { backgroundColor: tint } : {}),
          }}
        />
      </View>
      <Text className="w-10 shrink-0 text-right text-sm text-neutral-500">
        {valueLabel ?? count}
      </Text>
    </View>
  );
}

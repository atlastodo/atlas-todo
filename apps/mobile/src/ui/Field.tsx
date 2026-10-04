import { Text, View } from "react-native";

/**
 * A label-left / value-right row, the shape every diagnostics panel in the app uses.
 *
 * Lifted out of `SyncDetails` when the bug-report preview and the admin report detail needed the
 * same row: three panels showing the same kind of information should not drift into three slightly
 * different layouts.
 */
export function Field({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between border-b border-neutral-100 py-2 dark:border-neutral-800">
      <Text className="text-sm text-neutral-500">{label}</Text>
      <Text className="flex-shrink pl-3 text-right text-sm text-neutral-900 dark:text-neutral-100">
        {value}
      </Text>
    </View>
  );
}

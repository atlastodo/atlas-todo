import { Text, View } from "react-native";

/**
 * A headline metric box: the value large, the label muted beneath it. Shared by the habit detail
 * and habit group screens (the stats screen's `StatCard` adds an icon and keeps its own).
 */
export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <Text className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">{value}</Text>
      <Text className="text-xs text-neutral-500">{label}</Text>
    </View>
  );
}

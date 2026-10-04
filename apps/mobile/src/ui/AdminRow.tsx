import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

/** A tappable admin list row: a title line with optional badges, and a muted detail line. */
export function AdminRow({
  title,
  badges,
  detail,
  onPress,
}: {
  title: string;
  badges?: ReactNode;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="border-b border-neutral-100 py-3 dark:border-neutral-900"
    >
      <View className="flex-row items-center gap-2">
        <Text numberOfLines={1} className="flex-1 text-sm text-neutral-900 dark:text-neutral-100">
          {title}
        </Text>
        {badges}
      </View>
      <Text className="mt-1 text-xs text-neutral-500">{detail}</Text>
    </Pressable>
  );
}

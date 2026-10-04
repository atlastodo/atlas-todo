import { Pressable, Text, View } from "react-native";
import type { LucideIcon } from "./icons";

/**
 * A centred "there is nothing here" panel with an optional way out: an unknown route, or a task,
 * project or filter another device deleted while the screen was open.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actions = [],
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  actions?: { label: string; onPress: () => void; primary?: boolean }[];
}) {
  return (
    <View className="flex-1 items-center justify-center bg-white px-8 dark:bg-zinc-950">
      <Icon size={32} className="text-neutral-300 dark:text-neutral-700" />
      <Text className="mt-4 text-center text-base font-medium text-neutral-700 dark:text-neutral-200">
        {title}
      </Text>
      {description ? (
        <Text className="mt-2 text-center text-sm text-neutral-500">{description}</Text>
      ) : null}
      {actions.length > 0 ? (
        <View className="mt-6 w-full max-w-xs gap-2">
          {actions.map((action) => (
            <Pressable
              key={action.label}
              accessibilityRole="button"
              onPress={action.onPress}
              className={`items-center rounded-lg border px-4 py-3 ${
                action.primary
                  ? "border-accent-600 bg-accent-600"
                  : "border-neutral-200 dark:border-neutral-800"
              }`}
            >
              <Text
                className={`text-sm font-medium ${
                  action.primary ? "text-white" : "text-neutral-700 dark:text-neutral-200"
                }`}
              >
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

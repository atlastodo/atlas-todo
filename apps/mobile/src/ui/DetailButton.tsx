import { Pressable, Text } from "react-native";

export function DetailButton({
  label,
  onPress,
  primary,
  danger,
  disabled,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  const bgClass = primary
    ? "border-accent-600 bg-accent-600"
    : danger
      ? "border-red-600 bg-red-50 dark:bg-red-950/40"
      : "border-neutral-200 dark:border-neutral-800";
  const textClass = primary
    ? "text-white"
    : danger
      ? "text-red-600 dark:text-red-400"
      : "text-neutral-700 dark:text-neutral-200";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`flex-1 items-center rounded-lg border px-3 py-3 ${bgClass} ${
        disabled ? "opacity-50" : ""
      }`}
    >
      <Text className={`text-sm font-medium ${textClass}`}>{label}</Text>
    </Pressable>
  );
}

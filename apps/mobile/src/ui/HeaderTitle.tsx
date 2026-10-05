import { Text, View } from "react-native";
import type { LucideIcon } from "./icons";

/**
 * A nav-header title with a leading icon, used by the project and filter routes. `tintColor` is
 * the header's tint (from the `headerTitle` render prop); the icon may override it.
 */
export function HeaderTitle({
  icon: Icon,
  title,
  color,
  tintColor,
}: {
  icon: LucideIcon;
  title: string;
  color?: string;
  tintColor?: string;
}) {
  return (
    <View className="min-w-0 shrink flex-row items-center gap-2">
      <Icon size={20} color={color ?? tintColor} />
      <Text numberOfLines={1} style={{ color: tintColor }} className="shrink text-lg font-semibold">
        {title}
      </Text>
    </View>
  );
}

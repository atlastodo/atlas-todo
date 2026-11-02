import { Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { Activity } from "./icons";

/**
 * The header button that opens a view's activity feed. Presentational: the route says where it
 * goes (`/activity?view=…`, `?project=…`, `?filter=…`).
 */
export function ActivityButton({ onPress, label }: { onPress: () => void; label?: string }) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? t("activity.title")}
      onPress={onPress}
      hitSlop={8}
      className="mx-1 rounded-md p-1 web:cursor-pointer"
    >
      <Activity size={20} className="text-neutral-500" />
    </Pressable>
  );
}

/** Where a view's activity feed lives. */
export type ActivityTarget =
  | { view: "today" | "upcoming" | "inbox" | "assigned" | "all" }
  | { project: string }
  | { filter: string };

export function activityHref(target?: ActivityTarget): string {
  if (!target) return "/activity";
  if ("view" in target) return `/activity?view=${target.view}`;
  if ("project" in target) return `/activity?project=${encodeURIComponent(target.project)}`;
  return `/activity?filter=${encodeURIComponent(target.filter)}`;
}

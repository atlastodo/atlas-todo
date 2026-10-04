import { useState, type ReactNode } from "react";
import { Platform, Text, View } from "react-native";
import type { LucideIcon } from "./icons";

/** Settings layout primitives (`Section` / `Row`), shared by several settings surfaces. */

export function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  const isWeb = Platform.OS === "web";
  return (
    <View className="mb-6">
      <View className="mb-2 flex-row items-center gap-2 px-1">
        <Icon size={isWeb ? 16 : 18} className="text-neutral-500 dark:text-neutral-400" />
        <Text
          className={
            "font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 " +
            (isWeb ? "text-xs" : "text-xs")
          }
        >
          {title}
        </Text>
      </View>
      <View className="overflow-hidden rounded-2xl border border-neutral-200/80 bg-neutral-50/70 px-4 py-1 shadow-xs dark:border-neutral-800 dark:bg-zinc-900/60">
        {children}
      </View>
    </View>
  );
}

export function Row({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children?: ReactNode;
}) {
  const isWeb = Platform.OS === "web";
  // The row's own width picks the branch, since the pane shrinks with the window, sidebar and
  // nav, which no viewport query sees. The structural branch is inline style so jest sees it.
  const [width, setWidth] = useState<number | null>(null);
  // Below this width the control's `shrink-0` would crush the label, so the control stacks under it.
  const stacked = width != null && width < 400;
  return (
    <View
      onLayout={(e) => {
        const next = e.nativeEvent.layout.width;
        setWidth((prev) => (prev === next ? prev : next));
      }}
      style={{
        flexDirection: stacked ? "column" : "row",
        alignItems: stacked ? "stretch" : "center",
        justifyContent: stacked ? "flex-start" : "space-between",
        gap: stacked ? 8 : 16,
      }}
      className="border-t border-neutral-200/50 py-3.5 first:border-t-0 dark:border-neutral-800/60"
    >
      <View className={stacked ? "gap-0.5" : "flex-1 gap-0.5"}>
        <Text
          className={
            "font-medium text-neutral-900 dark:text-neutral-100 " +
            (isWeb ? "text-sm" : "text-base")
          }
        >
          {label}
        </Text>
        {description != null && (
          <Text
            className={"text-neutral-500 dark:text-neutral-400 " + (isWeb ? "text-xs" : "text-sm")}
          >
            {description}
          </Text>
        )}
      </View>
      {children != null && <View className={stacked ? undefined : "shrink-0"}>{children}</View>}
    </View>
  );
}

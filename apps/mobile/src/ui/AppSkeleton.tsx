import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Skeleton } from "./Skeleton";

/**
 * A lightweight app-shell placeholder shown while the store hydrates or the session restores. A cold
 * SQLite/IndexedDB replay is fast but not instant, so this shows the shape of the app (a header bar +
 * a few list rows) rather than a bare spinner, which reads as a faster load.
 *
 * Built from the reusable {@link Skeleton} primitive, so it pulses (reduced-motion-safe) like every
 * other loading surface. Purely visual; verified by eye, never by snapshot.
 */
export function AppSkeleton() {
  const { t } = useTranslation();
  return (
    <View className="flex-1 bg-white p-4 dark:bg-zinc-950" accessibilityLabel={t("common.loading")}>
      {/* Header bar */}
      <Skeleton className="mb-6 h-6 w-32 rounded bg-neutral-200 dark:bg-neutral-800" />
      {/* Quick-add line */}
      <Skeleton className="mb-5 h-9 w-full rounded-md bg-neutral-100 dark:bg-neutral-900" />
      {/* A few task-row placeholders */}
      {Array.from({ length: 6 }).map((_, i) => (
        <View key={i} className="mb-3 flex-row items-center gap-3">
          <Skeleton className="h-5 w-5 rounded-full bg-neutral-200 dark:bg-neutral-800" />
          <Skeleton
            className="h-4 rounded bg-neutral-200 dark:bg-neutral-800"
            style={{ width: `${55 + ((i * 7) % 35)}%` }}
          />
        </View>
      ))}
    </View>
  );
}

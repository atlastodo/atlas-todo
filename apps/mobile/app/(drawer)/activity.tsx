import { useCallback, useMemo } from "react";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { ActivityScreen } from "../../src/screens/ActivityScreen";
import type { FeedTarget } from "../../src/hooks/useActivityFeed";
import type { ActivityView } from "../../src/lib/activityScope";
import { ScreenFocusBoundary } from "../../src/ui/ScreenFocusBoundary";

const VIEWS: readonly ActivityView[] = ["today", "upcoming", "inbox", "assigned", "all"];

/**
 * Activity: everything (`/activity`) or one view's (`?view=today`, `?project=<id>`,
 * `?filter=<id>`). The scope lives in the URL, so a refresh or a shared link keeps it. The route
 * owns navigation and the header title; the screen reports both.
 */
export default function ActivityRoute() {
  const { view, project, filter } = useLocalSearchParams<{
    view?: string;
    project?: string;
    filter?: string;
  }>();
  const navigation = useNavigation();
  const target = useMemo<FeedTarget>(() => {
    if (typeof project === "string" && project) return { project };
    if (typeof filter === "string" && filter) return { filter };
    if (typeof view === "string" && (VIEWS as readonly string[]).includes(view)) {
      return { view: view as ActivityView };
    }
    return undefined;
  }, [view, project, filter]);
  const setTitle = useCallback((title: string) => navigation.setOptions({ title }), [navigation]);

  return (
    <ScreenFocusBoundary>
      <ActivityScreen
        // A new scope starts with fresh filters and paging.
        key={JSON.stringify(target ?? null)}
        target={target}
        onTitle={setTitle}
        onOpenTask={(id) => router.push(`/task/${id}`)}
      />
    </ScreenFocusBoundary>
  );
}

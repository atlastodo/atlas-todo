import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import {
  ACTIVITY_GROUPS,
  dayOffset,
  type Activity,
  type ActivityGroup,
  type FeedItem,
} from "@atlastodo/todo-core";
import { useActivityFeed, type FeedTarget } from "../hooks/useActivityFeed";
import { useFormat } from "../hooks/useFormat";
import { usePreferences } from "../hooks/usePreferences";
import { useNow } from "../hooks/useNow";
import { useToast } from "../data/ToastProvider";
import { EmptyState } from "../ui/EmptyState";
import { ListPicker, type PickerOption } from "../ui/ListPicker";
import { Activity as ActivityIcon, Undo2 } from "../ui/icons";

/**
 * A view's activity: what happened to the tasks it shows (and those completed or deleted from it
 * this past week), plus a project's own events, newest first and grouped by day. Comments are
 * mixed in. Filters narrow by person (when anyone else is in the feed) and by kind; an entry that
 * is still the latest change to its field can be undone, which records an entry of its own. Tapping
 * an entry opens its task. Navigation is injected.
 */

const PAGE = 50;

export interface ActivityScreenProps {
  target?: FeedTarget;
  onOpenTask?: (taskId: string) => void;
  /** Receives the feed's title ("Activity · Today") for the nav header. */
  onTitle?: (title: string) => void;
}

type Row =
  { type: "day"; key: string; label: string } | { type: "item"; key: string; item: FeedItem };

export function ActivityScreen({ target, onOpenTask, onTitle }: ActivityScreenProps) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const toast = useToast();
  const now = useNow();
  const timeZone = usePreferences().timezone || undefined;
  const [person, setPerson] = useState("");
  const [group, setGroup] = useState<"" | ActivityGroup>("");
  const [limit, setLimit] = useState(PAGE);

  const people = useMemo(() => (person ? new Set([person]) : undefined), [person]);
  const groups = useMemo(() => (group ? new Set([group]) : undefined), [group]);
  const feed = useActivityFeed(target, { people, groups, limit });
  useEffect(() => onTitle?.(feed.title), [onTitle, feed.title]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let lastDay: number | null = null;
    for (const item of feed.items) {
      const day = dayOffset(item.at, now, timeZone);
      if (day !== lastDay) {
        lastDay = day;
        const label =
          day === 0
            ? t("activity.today")
            : day === -1
              ? t("activity.yesterday")
              : fmt.date(item.at);
        out.push({ type: "day", key: `day-${day}`, label });
      }
      out.push({ type: "item", key: `${item.type}-${item.id}`, item });
    }
    return out;
  }, [feed.items, now, timeZone, t, fmt]);

  const personOptions = useMemo<PickerOption<string>[]>(
    () => [
      { value: "", label: t("activity.everyone") },
      ...feed.people.map((p) => ({ value: p.id, label: p.name })),
    ],
    [feed.people, t],
  );
  const groupOptions = useMemo<PickerOption<"" | ActivityGroup>[]>(
    () => [
      { value: "", label: t("activity.allKinds") },
      ...ACTIVITY_GROUPS.map((g) => ({ value: g, label: t(`activity.group.${g}`) })),
    ],
    [t],
  );

  const runUndo = (a: Activity) => {
    toast.show(feed.undo(a) ? t("activity.undone") : t("activity.undoFailed"));
  };

  if (!feed.found) {
    return <EmptyState icon={ActivityIcon} title={t("activity.empty")} />;
  }

  // Filters over nothing would only push the empty state down.
  const header = feed.anyInScope ? (
    <View className="flex-row flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      {feed.people.length > 1 && (
        <View className="grow basis-[220px] web:max-w-[300px]">
          <ListPicker
            label={t("activity.people")}
            value={person}
            options={personOptions}
            onChange={(v) => {
              setPerson(v);
              setLimit(PAGE);
            }}
            className=""
          />
        </View>
      )}
      <View className="grow basis-[220px] web:max-w-[300px]">
        <ListPicker
          label={t("activity.kinds")}
          value={group}
          options={groupOptions}
          onChange={(v) => {
            setGroup(v);
            setLimit(PAGE);
          }}
          className=""
        />
      </View>
    </View>
  ) : undefined;

  return (
    <View className="flex-1 bg-white dark:bg-zinc-950">
      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        ListHeaderComponent={header}
        contentContainerClassName="w-full max-w-3xl self-center pb-12"
        ListEmptyComponent={
          <EmptyState
            icon={ActivityIcon}
            title={feed.anyInScope ? t("activity.emptyFiltered") : t("activity.empty")}
          />
        }
        renderItem={({ item: row }) =>
          row.type === "day" ? (
            <Text
              accessibilityRole="header"
              className="px-4 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-neutral-500"
            >
              {row.label}
            </Text>
          ) : (
            <FeedRow
              item={row.item}
              feed={feed}
              time={fmt.time(row.item.at)}
              onOpenTask={onOpenTask}
              onUndo={runUndo}
            />
          )
        }
        ListFooterComponent={
          feed.hasMore ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setLimit((n) => n + PAGE)}
              className="mx-4 mt-4 items-center rounded-lg border border-neutral-200 py-2.5 web:cursor-pointer dark:border-neutral-800"
            >
              <Text className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                {t("activity.loadMore")}
              </Text>
            </Pressable>
          ) : undefined
        }
      />
    </View>
  );
}

function FeedRow({
  item,
  feed,
  time,
  onOpenTask,
  onUndo,
}: {
  item: FeedItem;
  feed: ReturnType<typeof useActivityFeed>;
  time: string;
  onOpenTask?: (taskId: string) => void;
  onUndo: (a: Activity) => void;
}) {
  const { t } = useTranslation();
  const taskId = item.type === "comment" ? item.comment.task_id : item.activity.task_id;
  const sentence =
    item.type === "comment"
      ? t("activity.commented", { task: feed.taskLabel(taskId) })
      : feed.describe(item.activity);
  const undoable = item.type === "activity" && feed.canUndo(item.activity);
  const open = taskId && onOpenTask ? () => onOpenTask(taskId) : undefined;
  return (
    <View className="flex-row items-start gap-3 px-4 py-2">
      <Pressable
        accessibilityRole={open ? "link" : undefined}
        accessibilityHint={open ? t("activity.openTask") : undefined}
        onPress={open}
        disabled={!open}
        className="min-w-0 flex-1 web:cursor-pointer"
      >
        <Text className="text-sm text-neutral-800 dark:text-neutral-100">
          <Text className="font-semibold">{feed.nameOf(item.actorId)}</Text> {sentence}
          {item.type === "activity" && item.activity.reverts ? (
            <Text className="text-xs text-neutral-500"> · {t("activity.undoTag")}</Text>
          ) : null}
        </Text>
        {item.type === "comment" ? (
          <Text numberOfLines={3} className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-300">
            {item.comment.body}
          </Text>
        ) : null}
        <Text className="mt-0.5 text-xs text-neutral-500">{time}</Text>
      </Pressable>
      {undoable && item.type === "activity" ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t("activity.undo")}: ${sentence}`}
          onPress={() => onUndo(item.activity)}
          hitSlop={6}
          className="flex-row items-center gap-1 rounded-md border border-neutral-200 px-2 py-1 web:cursor-pointer active:bg-neutral-100 dark:border-neutral-700 dark:active:bg-neutral-800"
        >
          <Undo2 size={14} className="text-neutral-600 dark:text-neutral-300" />
          <Text className="text-xs font-medium text-neutral-700 dark:text-neutral-200">
            {t("activity.undo")}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

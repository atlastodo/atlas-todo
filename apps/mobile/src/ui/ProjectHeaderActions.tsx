import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useIsWide } from "../hooks/useIsWide";
import { useSelection } from "../data/SelectionProvider";
import type { ListPref } from "../hooks/usePreferences";
import type { MenuPos } from "../hooks/useContextMenu";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import { ListPrefMenu, ListPrefSheet } from "./ListPrefMenu";
import { Segmented } from "./Segmented";
import { SelectButton } from "./SelectButton";
import { StyleEditButton } from "./StyleEditor";
import {
  EllipsisVertical,
  ListChecks,
  ListFilter,
  SlidersHorizontal,
  Star,
  UserPlus,
} from "./icons";

/**
 * A project's actions, rendered as the nav header's `headerRight` so the list and board keep their
 * full height. A wide viewport shows every action inline, with the List|Board switch at the far
 * right. A phone keeps only the switch and folds the rest into an overflow menu. Both layouts use
 * the same labels. Presentational: the screen owns what each action does.
 */
export interface ProjectHeaderActionsProps {
  mode: "list" | "board";
  onSetMode: (mode: "list" | "board") => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onEdit: () => void;
  onShare: () => void;
  /** Whether Select is offered: the list has tasks and is not already selecting. Never on the board. */
  canSelect: boolean;
  listPref?: ListPref;
  onChangeListPref?: (patch: Partial<ListPref>) => void;
  accentColor?: string;
}

export function ProjectHeaderActions({
  mode,
  onSetMode,
  isFavorite,
  onToggleFavorite,
  onEdit,
  onShare,
  canSelect,
  listPref,
  onChangeListPref,
  accentColor,
}: ProjectHeaderActionsProps) {
  const { t } = useTranslation();
  const isWide = useIsWide();
  const selection = useSelection();
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const [arranging, setArranging] = useState(false);

  const favoriteLabel = isFavorite
    ? t("workspace.unfavorite", "Remove from favorites")
    : t("workspace.favorite", "Favorite");

  const modeSwitch = (
    <Segmented
      value={mode}
      options={[
        { value: "list", label: t("board.viewList") },
        { value: "board", label: t("board.viewBoard") },
      ]}
      onChange={onSetMode}
      label={t("board.viewMode")}
      accentColor={accentColor}
    />
  );

  if (isWide) {
    return (
      <View className="flex-row items-center gap-2 pr-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={favoriteLabel}
          onPress={onToggleFavorite}
          hitSlop={8}
          className="p-1 web:cursor-pointer"
        >
          <Star
            size={18}
            className={isFavorite ? "text-amber-500 fill-amber-500" : "text-neutral-500"}
          />
        </Pressable>
        <StyleEditButton label={t("workspace.editProject")} onPress={onEdit} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("workspace.shareProject")}
          onPress={onShare}
          hitSlop={8}
          className="p-1 web:cursor-pointer"
        >
          <UserPlus size={18} className="text-neutral-500" />
        </Pressable>
        {canSelect && <SelectButton />}
        {listPref && onChangeListPref && (
          <ListPrefMenu value={listPref} onChange={onChangeListPref} />
        )}
        {modeSwitch}
      </View>
    );
  }

  const items: ContextMenuItem[] = [
    { key: "favorite", label: favoriteLabel, icon: Star, onPress: onToggleFavorite },
    { key: "edit", label: t("workspace.editProject"), icon: SlidersHorizontal, onPress: onEdit },
    { key: "share", label: t("workspace.shareProject"), icon: UserPlus, onPress: onShare },
    ...(canSelect
      ? [
          {
            key: "select",
            label: t("selection.select"),
            icon: ListChecks,
            onPress: () => selection.enter(),
          },
        ]
      : []),
    ...(listPref && onChangeListPref
      ? [
          {
            key: "arrange",
            label: t("workspace.listOptions"),
            icon: ListFilter,
            onPress: () => setArranging(true),
          },
        ]
      : []),
  ];

  return (
    <View className="flex-row items-center gap-1 pr-2">
      {modeSwitch}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("workspace.projectActions")}
        onPress={(e) =>
          setMenuPos({ x: e?.nativeEvent?.pageX ?? 0, y: e?.nativeEvent?.pageY ?? 0 })
        }
        hitSlop={8}
        className="p-1.5 web:cursor-pointer"
      >
        <EllipsisVertical size={20} className="text-neutral-500" />
      </Pressable>
      {menuPos && <ContextMenu items={items} pos={menuPos} onClose={() => setMenuPos(null)} />}
      {listPref && onChangeListPref && (
        <ListPrefSheet
          visible={arranging}
          onClose={() => setArranging(false)}
          value={listPref}
          onChange={onChangeListPref}
        />
      )}
    </View>
  );
}

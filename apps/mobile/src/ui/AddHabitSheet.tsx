import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { HabitGoalKind, HabitKind } from "@atlas/shared";
import { BottomSheet } from "./BottomSheet";
import { HabitGoalEditor, type HabitGoal } from "./HabitGoalEditor";
import { haptics } from "../lib/haptics";
import { KEEP_FOCUS_SUBMIT } from "../lib/submitBehavior";
import { useCancelOnEscape } from "../hooks/useCancelOnEscape";

export interface NewHabitSpec {
  name: string;
  goal_kind: HabitGoalKind;
  days: number[];
  target: number;
}

const BLANK: HabitGoal = { goal_kind: "daily", days: [], target: 1 };

/** Creating a habit, in a sheet: a goal like "3 times a week" needs more room than an inline form above the list. */
export function AddHabitSheet({
  visible,
  kind = "habit",
  groupName,
  weekStartsOn,
  onClose,
  onAdd,
}: {
  visible: boolean;
  kind?: HabitKind;
  groupName?: string;
  weekStartsOn: number;
  onClose: () => void;
  onAdd: (spec: NewHabitSpec) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [goal, setGoal] = useState<HabitGoal>(BLANK);

  const close = () => {
    setName("");
    setGoal(BLANK);
    onClose();
  };

  // Escape drops the draft and leaves the field.
  const escape = useCancelOnEscape(close);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    haptics.success();
    onAdd({ name: trimmed, ...goal });
    close();
  };

  return (
    <BottomSheet visible={visible} onClose={close}>
      <View className="gap-4">
        <View className="gap-0.5">
          <Text className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
            {t(kind === "group" ? "habits.newGroupTitle" : "habits.newTitle")}
          </Text>
          {/* Shown when a parent group was chosen before the sheet opened. */}
          {groupName !== undefined && (
            <Text numberOfLines={1} className="text-xs text-neutral-500">
              {t("habits.addingToGroup", { name: groupName })}
            </Text>
          )}
        </View>

        <TextInput
          ref={escape.ref}
          accessibilityLabel={t(kind === "group" ? "habits.groupName" : "habits.name")}
          placeholder={t(
            kind === "group" ? "habits.groupNamePlaceholder" : "habits.newPlaceholder",
          )}
          placeholderTextColor="#a1a1aa"
          value={name}
          onChangeText={setName}
          onKeyPress={escape.onKeyPress}
          onSubmitEditing={submit}
          autoFocus
          className="rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-900 dark:border-neutral-700 dark:text-neutral-100"
          {...KEEP_FOCUS_SUBMIT}
        />

        {kind !== "group" && (
          <HabitGoalEditor
            goal={goal}
            weekStartsOn={weekStartsOn}
            onChange={(patch) => setGoal((prev) => ({ ...prev, ...patch }))}
          />
        )}

        <View className="flex-row justify-end gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.cancel")}
            onPress={close}
            className="rounded-md px-3 py-2"
          >
            <Text className="text-sm text-neutral-600 dark:text-neutral-300">
              {t("common.cancel")}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.add")}
            disabled={!name.trim()}
            onPress={submit}
            className={"rounded-md bg-accent-600 px-4 py-2 " + (!name.trim() ? "opacity-40" : "")}
          >
            <Text className="text-sm font-medium text-white">{t("common.add")}</Text>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
}

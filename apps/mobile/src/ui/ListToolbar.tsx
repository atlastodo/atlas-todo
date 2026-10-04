import type { ReactElement } from "react";
import { View } from "react-native";
import { SelectButton } from "./SelectButton";
import { ListPrefMenu } from "./ListPrefMenu";
import type { ListPref } from "../hooks/usePreferences";

/**
 * The controls bar above a task list: the Select button and (when the view syncs a group/sort
 * preference) the group/sort menu, clustered at the far right. `leading` slots an affordance at
 * the left edge (Today's "Plan day").
 */
export interface ListToolbarProps {
  canSelect: boolean;
  listPref?: ListPref;
  onChangeListPref?: (patch: Partial<ListPref>) => void;
  leading?: ReactElement;
}

export function ListToolbar({ canSelect, listPref, onChangeListPref, leading }: ListToolbarProps) {
  const controls = (
    <View className="flex-row items-center gap-1.5">
      {canSelect && <SelectButton />}
      {listPref && onChangeListPref && (
        <ListPrefMenu value={listPref} onChange={onChangeListPref} />
      )}
    </View>
  );
  if (!leading) {
    return (
      <View className="w-full flex-row items-center justify-end gap-1.5 px-3 pt-2.5 pb-0.5">
        {controls}
      </View>
    );
  }
  return (
    <View className="w-full flex-row items-center justify-between gap-1.5 px-3 pt-2.5 pb-0.5">
      {leading}
      {controls}
    </View>
  );
}

import { Pressable, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { useSelection } from "../data/SelectionProvider";
import { ListChecks } from "./icons";

/** The visible Select button that enters multi-select mode; renders nothing while already selecting (the SelectionToolbar owns Clear/Exit). Shared by every list surface. */
export function SelectButton() {
  const { t } = useTranslation();
  const selection = useSelection();
  if (selection.mode) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("selection.select")}
      onPress={() => selection.enter()}
      className="flex-row items-center gap-1.5 rounded-md px-2.5 py-1.5 web:cursor-pointer web:hover:bg-neutral-100 dark:web:hover:bg-neutral-800"
    >
      <ListChecks size={18} className="text-neutral-500" />
      <Text className="text-sm text-neutral-600 dark:text-neutral-300">
        {t("selection.select")}
      </Text>
    </Pressable>
  );
}

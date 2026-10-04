import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";

/**
 * Cheat-sheet for the saved-filter query language. Each row pairs a literal token (never
 * translated) with a translated description, then example queries.
 */
const ROWS: { token: string; key: string }[] = [
  { token: "p1 p2 p3 p4", key: "filter.helpPriority" },
  { token: "@label", key: "filter.helpLabel" },
  { token: "#project", key: "filter.helpProject" },
  { token: "due:today | tomorrow | week | month", key: "filter.helpDue" },
  { token: "due:7d", key: "filter.helpWithin" },
  { token: "overdue", key: "filter.helpOverdue" },
  { token: "due:none", key: "filter.helpNone" },
  { token: "word", key: "filter.helpText" },
  { token: "a & b", key: "filter.helpAnd" },
  { token: "a | b", key: "filter.helpOr" },
  { token: "!a", key: "filter.helpNot" },
  { token: "( )", key: "filter.helpParens" },
];

const EXAMPLES = ["overdue | due:week", "@work & due:month & p1", "#home & !due:none", "p1 due:3d"];

export function FilterHelp() {
  const { t } = useTranslation();
  return (
    <View className="mt-1 gap-1 rounded-md border border-neutral-200 bg-neutral-50 p-2 dark:border-neutral-800 dark:bg-neutral-900">
      {ROWS.map((r) => (
        <View key={r.key} className="flex-row gap-3">
          <Text className="w-40 font-mono text-xs text-neutral-800 dark:text-neutral-100">
            {r.token}
          </Text>
          <Text className="flex-1 text-xs text-neutral-500 dark:text-neutral-400">{t(r.key)}</Text>
        </View>
      ))}
      <View className="mt-1 border-t border-neutral-200 pt-1 dark:border-neutral-800">
        <Text className="text-xs text-neutral-500 dark:text-neutral-400">
          {t("filter.helpExamples")}
        </Text>
        {EXAMPLES.map((ex) => (
          <Text key={ex} className="font-mono text-xs text-neutral-700 dark:text-neutral-200">
            {ex}
          </Text>
        ))}
      </View>
    </View>
  );
}

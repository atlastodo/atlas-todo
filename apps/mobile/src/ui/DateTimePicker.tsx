import { useCallback, useMemo, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useColorScheme } from "nativewind";
import { useTranslation } from "react-i18next";
import RNDateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { isDark } from "../theme/navTheme";

/**
 * The community date/time picker under a stable local name, so Metro can swap in the web variant
 * ({@link file://./DateTimePicker.web.tsx}); the native module throws "not supported on: web".
 *
 * Every platform reports exactly one terminal event: `onChange(event, date)` fires once with
 * `"set"` and the `Date`, or `"dismissed"`, and the caller then closes the picker. This callback
 * is the wrapper's own contract; v9 split it into `onValueChange`/`onDismiss`, which we subscribe to.
 *
 * iOS needs the wrapper because its picker is inline and live: it fires for every field touched,
 * and writing that back handed the mounted picker a new `value`, dismissing the popover mid-entry.
 * Here the draft is the picker's own state (seeded once) and only Done reports it. `inline` and
 * `spinner` displays are used because iOS 14+'s default `compact` popover is where that failed.
 */

type Mode = "date" | "time" | "datetime";

interface Props {
  value: Date;
  mode?: Mode;
  onChange?: (event: DateTimePickerEvent, date?: Date) => void;
}

const event = (type: "set" | "dismissed") => ({ type }) as unknown as DateTimePickerEvent;

export default function DateTimePicker({ value, mode = "date", onChange }: Props) {
  const { t } = useTranslation();
  // The applied app scheme, not the device's: without `themeVariant` the native dialog follows the OS and can pop up bright over the dark app.
  const { colorScheme } = useColorScheme();
  const variant = isDark(colorScheme) ? ("dark" as const) : ("light" as const);
  // Seeded once: `useState`'s initial value is read on the first render only, so caller writes cannot move the picker.
  const [draft, setDraft] = useState(value);
  const [androidStage, setAndroidStage] = useState<"date" | "time">("date");
  const [androidDate, setAndroidDate] = useState<Date | null>(null);

  const onDateValueChange = useCallback(
    (_e: unknown, date?: Date) => {
      if (date) {
        setAndroidDate(date);
        setAndroidStage("time");
      } else {
        onChange?.(event("dismissed"));
      }
    },
    [onChange],
  );

  const onDateDismiss = useCallback(() => {
    onChange?.(event("dismissed"));
  }, [onChange]);

  const onTimeValueChange = useCallback(
    (_e: unknown, time?: Date) => {
      if (time && androidDate) {
        const combined = new Date(androidDate);
        combined.setHours(
          time.getHours(),
          time.getMinutes(),
          time.getSeconds(),
          time.getMilliseconds(),
        );
        onChange?.(event("set"), combined);
      } else if (time) {
        onChange?.(event("set"), time);
      } else {
        onChange?.(event("dismissed"));
      }
    },
    [androidDate, onChange],
  );

  const onTimeDismiss = useCallback(() => {
    onChange?.(event("dismissed"));
  }, [onChange]);

  const timeInitialValue = useMemo(() => {
    if (!androidDate) return draft;
    const combined = new Date(androidDate);
    combined.setHours(
      draft.getHours(),
      draft.getMinutes(),
      draft.getSeconds(),
      draft.getMilliseconds(),
    );
    return combined;
  }, [androidDate, draft]);

  const onSingleValueChange = useCallback(
    (_e: unknown, date?: Date) => onChange?.(event("set"), date),
    [onChange],
  );

  const onSingleDismiss = useCallback(() => onChange?.(event("dismissed")), [onChange]);

  if (Platform.OS !== "ios") {
    // Android: a modal dialog that reports once. Its module supports only "date" or "time", so
    // "datetime" chains a date dialog then a time dialog.
    if (mode === "datetime") {
      if (androidStage === "date") {
        return (
          <RNDateTimePicker
            value={draft}
            mode="date"
            themeVariant={variant}
            onValueChange={onDateValueChange}
            onDismiss={onDateDismiss}
          />
        );
      }
      return (
        <RNDateTimePicker
          value={timeInitialValue}
          mode="time"
          themeVariant={variant}
          onValueChange={onTimeValueChange}
          onDismiss={onTimeDismiss}
        />
      );
    }

    return (
      <RNDateTimePicker
        value={draft}
        mode={mode}
        themeVariant={variant}
        onValueChange={onSingleValueChange}
        onDismiss={onSingleDismiss}
      />
    );
  }

  return (
    <View className="gap-2">
      <RNDateTimePicker
        value={draft}
        mode={mode}
        themeVariant={variant}
        display={mode === "time" ? "spinner" : "inline"}
        onValueChange={(_e, date) => setDraft(date)}
      />
      <View className="flex-row justify-end gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.cancel")}
          onPress={() => onChange?.(event("dismissed"))}
          className="rounded border border-neutral-200 px-3 py-2 dark:border-neutral-700"
        >
          <Text className="text-sm text-neutral-500">{t("common.cancel")}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.done")}
          onPress={() => onChange?.(event("set"), draft)}
          className="rounded bg-neutral-900 px-3 py-2 dark:bg-neutral-100"
        >
          <Text className="text-sm font-medium text-white dark:text-neutral-900">
            {t("common.done")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export type { DateTimePickerEvent };

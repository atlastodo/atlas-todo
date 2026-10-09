import { requireOptionalNativeModule } from "expo";

interface AtlasExactAlarm {
  canScheduleExactAlarms(): boolean;
  openExactAlarmSettingsAsync(): Promise<boolean>;
}

/** The Android module, or null where it is not built in (iOS, the web, tests). */
export const ExactAlarm = requireOptionalNativeModule<AtlasExactAlarm>("AtlasExactAlarm");

package expo.modules.atlasexactalarm

import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Exact-alarm access (Android 12+). expo-notifications books a reminder with
 * `setExactAndAllowWhileIdle` only while `canScheduleExactAlarms()` holds, and otherwise falls back
 * to an inexact alarm that Doze defers to its next maintenance window, minutes late. Android 14+
 * denies `SCHEDULE_EXACT_ALARM` to new installs, and expo-notifications exposes neither the check
 * nor the settings page that grants it.
 */
class AtlasExactAlarmModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AtlasExactAlarm")

    Function("canScheduleExactAlarms") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@Function true
      val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      return@Function alarmManager.canScheduleExactAlarms()
    }

    // The "Alarms & reminders" page for this app. Resolves to whether it opened.
    AsyncFunction("openExactAlarmSettingsAsync") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@AsyncFunction false
      val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
        data = Uri.parse("package:${context.packageName}")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
      return@AsyncFunction true
    }
  }

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React Application Context is null" }
}

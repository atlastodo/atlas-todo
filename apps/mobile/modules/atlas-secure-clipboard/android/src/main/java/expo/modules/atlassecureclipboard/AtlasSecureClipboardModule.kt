package expo.modules.atlassecureclipboard

import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.os.Build
import android.os.PersistableBundle
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Copies a secret (the recovery phrase) to the clipboard marked as sensitive, so Android 13+ hides
 * it from the copy preview and keyboards that honour the flag keep it out of their clipboard
 * history. expo-clipboard has no option for the flag.
 */
class AtlasSecureClipboardModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AtlasSecureClipboard")

    AsyncFunction("setSensitiveStringAsync") { content: String ->
      val clip = ClipData.newPlainText(null, content)
      clip.description.extras = PersistableBundle().apply {
        // ClipDescription.EXTRA_IS_SENSITIVE from API 33; the same key is read on older releases.
        val key =
          if (Build.VERSION.SDK_INT >= 33) ClipDescription.EXTRA_IS_SENSITIVE
          else "android.content.extra.IS_SENSITIVE"
        putBoolean(key, true)
      }
      clipboardManager.setPrimaryClip(clip)
      return@AsyncFunction true
    }
  }

  private val clipboardManager: ClipboardManager
    get() {
      val context = requireNotNull(appContext.reactContext) { "React Application Context is null" }
      return context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    }
}

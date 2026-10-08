import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useColorScheme } from "nativewind";
import { useTranslation } from "react-i18next";
import { CircleAlert, Globe } from "../ui/icons";
import { useAuth } from "./AuthContext";
import { RecoveryPhraseModal } from "./RecoveryPhraseModal";
import { AuthForm, describeSignOutNotice, useAuthForm } from "./AuthForm";
import { isDark } from "../theme/navTheme";

/**
 * The standalone sign-in / sign-up screen: the shared {@link AuthForm} in a card. On success the
 * provider persists the session and the gate in `app/_layout.tsx` swaps to the app. A first run
 * signs in or signs up from the welcome wizard instead; this screen is for after a sign-out and for
 * Settings > Account.
 *
 * `initialEmail` and `notice` serve the re-login a locked session falls back to when it holds no
 * wrapped keys: the account is known, only the password is needed.
 *
 * From local-only mode, `initialMode` opens on sign-in or signup and `onContinueLocal` offers the
 * way back to the app on this device.
 */
export function LoginScreen({
  initialEmail,
  notice,
  initialMode,
  onContinueLocal,
}: {
  initialEmail?: string;
  notice?: string;
  initialMode?: "login" | "signup";
  onContinueLocal?: () => void;
} = {}) {
  const { t } = useTranslation();
  const { recoveryPhrase, dismissRecoveryPhrase, signOutNotice } = useAuth();
  const form = useAuthForm({ initialMode, initialEmail });
  const { colorScheme } = useColorScheme();

  if (recoveryPhrase) {
    return <RecoveryPhraseModal phrase={recoveryPhrase} onClose={dismissRecoveryPhrase} />;
  }

  return (
    <KeyboardAvoidingView
      // On native a style, not classes: on Android the classes here did not take, leaving the card
      // at the top of a white page. On web the classes, so the page follows `.dark` on <html> like
      // the card does; the JS scheme can lag it before sign-in. neutral-50 / neutral-950.
      testID="login-page"
      className={Platform.OS === "web" ? "bg-neutral-50 dark:bg-neutral-950" : undefined}
      style={
        Platform.OS === "web"
          ? { flex: 1 }
          : { flex: 1, backgroundColor: isDark(colorScheme) ? "#0a0a0a" : "#fafafa" }
      }
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="w-full self-center rounded-xl border border-neutral-200 bg-white p-6 sm:max-w-sm dark:border-neutral-800 dark:bg-neutral-900">
          <View className="mb-6 flex-row items-center gap-2">
            {/* The app icon's globe, as in the sidebar. */}
            <Globe size={24} className="text-accent-600 dark:text-accent-400" />
            <Text className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              {t("app.title")}
            </Text>
          </View>

          <AuthForm
            form={form}
            banner={
              <>
                {notice ? (
                  <Text className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
                    {notice}
                  </Text>
                ) : null}
                {signOutNotice && form.error === null ? (
                  <View
                    accessibilityRole="alert"
                    className="mb-4 flex-row items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30"
                  >
                    <CircleAlert
                      size={18}
                      className="shrink-0 text-amber-700 dark:text-amber-400"
                    />
                    <Text className="flex-1 text-sm font-medium text-amber-800 dark:text-amber-300">
                      {describeSignOutNotice(signOutNotice, t)}
                    </Text>
                  </View>
                ) : null}
              </>
            }
            footer={
              onContinueLocal && (
                <Pressable
                  accessibilityRole="button"
                  onPress={onContinueLocal}
                  className="mt-2 border-t border-neutral-100 pt-3 dark:border-neutral-800"
                >
                  <Text className="text-center text-sm text-neutral-600 dark:text-neutral-300">
                    {t("localMode.continueWithout")}
                  </Text>
                </Pressable>
              )
            }
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

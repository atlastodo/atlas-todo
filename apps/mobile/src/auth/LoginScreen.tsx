import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type TextInputProps,
} from "react-native";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ApiError, RecoveryPhraseError, apiErrorCode } from "@atlas/client-core";
import { CircleAlert, CircleCheckBig } from "../ui/icons";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { useAuth, type SignOutNotice } from "./AuthContext";
import { defaultServerUrl, isOnlineWeb, loadServerUrl } from "./serverUrl";
import { RecoveryPhraseModal } from "./RecoveryPhraseModal";

/**
 * Combined sign-in / sign-up screen. On success the provider persists the session and the gate in
 * `app/_layout.tsx` swaps to the app.
 *
 * The server URL field is always visible (login, signup, recover) because the choice must precede
 * authentication: production builds ship no built-in default, and the account may not exist yet on
 * the instance being targeted. Submitting persists the override through `changeServerUrl`, which
 * rebuilds the API client before the auth calls run.
 *
 * `initialEmail` and `notice` serve the re-login a locked session falls back to when it holds no
 * wrapped keys: the account is known, only the password is needed.
 */
export function LoginScreen({
  initialEmail,
  notice,
}: { initialEmail?: string; notice?: string } = {}) {
  const { t } = useTranslation();
  const {
    login,
    signup,
    recoverAccount,
    cancelAccountDeletion,
    recoveryPhrase,
    dismissRecoveryPhrase,
    changeServerUrl,
    signOutNotice,
  } = useAuth();
  // An admin's invite link (web) opens straight into signup with its code filled in.
  const [inviteFromLink] = useState(readInviteFromLink);
  const [invite, setInvite] = useState(inviteFromLink);
  const [mode, setMode] = useState<"login" | "signup" | "recover">(
    inviteFromLink ? "signup" : "login",
  );
  const [email, setEmail] = useState(initialEmail ?? "");
  const [password, setPassword] = useState("");
  const [recoveryInput, setRecoveryInput] = useState("");
  const [displayName, setDisplayName] = useState("");
  // Starts at the build-time default (dev: localhost; empty if none was baked in), then is
  // reconciled with any stored override once AsyncStorage resolves.
  const [serverUrl, setServerUrl] = useState(defaultServerUrl);
  // What the client is currently bound to; submit rebinds only on a difference.
  const [effectiveUrl, setEffectiveUrl] = useState(defaultServerUrl);
  const [error, setError] = useState<string | null>(null);
  const [isScheduledDeletion, setIsScheduledDeletion] = useState(false);
  const [deletionDaysRemaining, setDeletionDaysRemaining] = useState(30);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void loadServerUrl().then((url) => {
      if (live) {
        setServerUrl(url);
        setEffectiveUrl(url);
      }
    });
    return () => {
      live = false;
    };
  }, []);

  const submit = async () => {
    if (busy) return;
    setError(null);
    setIsScheduledDeletion(false);

    // The server URL must be resolved before any auth call (see the module docs).
    const isOnline = isOnlineWeb();
    const url = (isOnline ? defaultServerUrl : serverUrl).trim().replace(/\/$/, "");
    if (!/^https?:\/\/\S+$/i.test(url)) {
      setError(t("auth.serverUrlRequired"));
      return;
    }

    setBusy(true);
    try {
      if (url !== effectiveUrl) await changeServerUrl(url);
      if (mode === "login") {
        await login(email, password);
      } else if (mode === "signup") {
        // A closed instance still admits a single signup through an invite code.
        await signup(email, password, displayName, invite.trim() || undefined);
      } else {
        await recoverAccount(email, recoveryInput.trim(), password);
      }
    } catch (err) {
      if (
        mode === "recover" &&
        (err instanceof RecoveryPhraseError || (err instanceof ApiError && err.status === 401))
      ) {
        // A wrong phrase fails before anything is posted; a 401 from /auth/recover means the same.
        setError(t("unlock.recoveryPhraseInvalid"));
      } else if (err instanceof ApiError) {
        if (err.message === "account_scheduled_deletion") {
          const remaining = (err.data as { days_remaining?: unknown } | undefined)?.days_remaining;
          const days = typeof remaining === "number" ? remaining : 30;
          setDeletionDaysRemaining(days);
          setIsScheduledDeletion(true);
          setShowRestoreModal(true);
          setError(t("auth.scheduledForDeletion"));
        } else {
          setError(describeAuthError(err, t));
        }
      } else {
        setError(t("auth.genericError"));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await cancelAccountDeletion(email, password);
      setShowRestoreModal(false);
    } catch (err) {
      setError(err instanceof ApiError ? describeAuthError(err, t) : t("auth.genericError"));
    } finally {
      setBusy(false);
    }
  };

  if (recoveryPhrase) {
    return <RecoveryPhraseModal phrase={recoveryPhrase} onClose={dismissRecoveryPhrase} />;
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-neutral-50 dark:bg-neutral-950"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerClassName="flex-grow justify-center p-4"
        keyboardShouldPersistTaps="handled"
      >
        <View className="w-full self-center rounded-xl border border-neutral-200 bg-white p-6 sm:max-w-sm dark:border-neutral-800 dark:bg-neutral-900">
          <View className="mb-6 flex-row items-center gap-2">
            <CircleCheckBig size={24} className="text-accent-500" />
            <Text className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              {t("app.title")}
            </Text>
          </View>

          {notice ? (
            <Text className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">{notice}</Text>
          ) : null}

          {signOutNotice && error === null ? (
            <View
              accessibilityRole="alert"
              className="mb-4 flex-row items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30"
            >
              <CircleAlert size={18} className="shrink-0 text-amber-700 dark:text-amber-400" />
              <Text className="flex-1 text-sm font-medium text-amber-800 dark:text-amber-300">
                {describeSignOutNotice(signOutNotice, t)}
              </Text>
            </View>
          ) : null}

          <View className="gap-3">
            {mode === "signup" && (
              <Field
                label={t("auth.name")}
                value={displayName}
                onChange={setDisplayName}
                textContentType="name"
              />
            )}
            <Field
              label={t("auth.email")}
              value={email}
              onChange={setEmail}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
            />
            {mode === "recover" && (
              <Field
                label={t("recovery.phraseLabel")}
                value={recoveryInput}
                onChange={setRecoveryInput}
                autoComplete="off"
              />
            )}
            <Field
              label={mode === "recover" ? t("auth.newPassword") : t("auth.password")}
              value={password}
              onChange={setPassword}
              secureTextEntry
              textContentType={mode === "login" ? "password" : "newPassword"}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              onSubmitEditing={submit}
            />
            {mode === "signup" && (
              <Field
                label={t("auth.inviteCode")}
                value={invite}
                onChange={setInvite}
                autoComplete="off"
                placeholder={t("auth.inviteCodePlaceholder")}
              />
            )}
            {!isOnlineWeb() && (
              <Field
                label={t("auth.serverUrl")}
                value={serverUrl}
                onChange={setServerUrl}
                keyboardType="url"
                textContentType="URL"
                placeholder={t("auth.serverUrlPlaceholder")}
              />
            )}

            {error !== null && (
              <Pressable
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                onPress={isScheduledDeletion ? () => setShowRestoreModal(true) : undefined}
                className="flex-row items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-950/30"
              >
                <CircleAlert size={18} className="shrink-0 text-red-600 dark:text-red-400" />
                <Text className="flex-1 text-sm font-medium text-red-600 dark:text-red-400">
                  {error}
                </Text>
              </Pressable>
            )}

            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={submit}
              className={
                "mt-1 flex-row items-center justify-center gap-2 rounded-md bg-accent-600 px-3 py-3 active:bg-accent-500 " +
                (busy ? "opacity-60" : "")
              }
            >
              {busy && <ActivityIndicator color="white" size="small" />}
              <Text className="text-sm font-medium text-white">
                {mode === "login"
                  ? t("auth.signIn")
                  : mode === "signup"
                    ? t("auth.createAccount")
                    : t("auth.resetAndRecover")}
              </Text>
            </Pressable>
          </View>

          <View className="mt-4 gap-1">
            {mode === "login" && (
              <>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setMode("signup");
                    setError(null);
                  }}
                  className="py-1"
                >
                  <Text className="text-center text-sm text-accent-600 dark:text-accent-400">
                    {t("auth.needAccount")}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setMode("recover");
                    setError(null);
                  }}
                  className="py-1"
                >
                  <Text className="text-center text-xs text-neutral-500 dark:text-neutral-400">
                    {t("auth.forgotPassword")}
                  </Text>
                </Pressable>
              </>
            )}

            {mode === "signup" && (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setMode("login");
                  setError(null);
                }}
                className="py-1"
              >
                <Text className="text-center text-sm text-accent-600 dark:text-accent-400">
                  {t("auth.haveAccount")}
                </Text>
              </Pressable>
            )}

            {mode === "recover" && (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setMode("login");
                  setError(null);
                }}
                className="py-1"
              >
                <Text className="text-center text-sm text-accent-600 dark:text-accent-400">
                  {t("auth.backToSignIn")}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={showRestoreModal}
        title={t("auth.scheduledForDeletion")}
        message={t("auth.scheduledForDeletionDetail", { count: deletionDaysRemaining })}
        confirmLabel={t("auth.cancelDeletionAndRestore")}
        cancelLabel={t("common.close")}
        danger={false}
        onConfirm={handleRestore}
        onCancel={() => setShowRestoreModal(false)}
      />
    </KeyboardAvoidingView>
  );
}

/** The user-facing text for an auth failure, by the server's code where it sends one. */
function describeAuthError(err: ApiError, t: TFunction): string {
  const code = apiErrorCode(err) ?? err.message;
  switch (code) {
    case "legacy_account":
      return t("auth.legacyAccount");
    case "account_deleted":
      return t("auth.accountDeleted");
    case "account_disabled":
      return t("auth.accountDisabled");
    case "signup_disabled":
      return t("auth.signupDisabled");
    case "invite_invalid":
      return t("auth.inviteInvalid");
  }
  if (err.status === 429) return t("auth.tooManyAttempts");
  if (
    err.status === 401 &&
    (err.message === "unauthorized" || err.message === "invalid credentials")
  ) {
    return t("auth.invalidCredentials");
  }
  return err.message;
}

/** Why the server ended the last session (see `SignOutNotice`). */
function describeSignOutNotice(notice: SignOutNotice, t: TFunction): string {
  switch (notice.code) {
    case "account_disabled":
      return t("auth.accountDisabled");
    case "account_deleted":
      return t("auth.accountDeleted");
    case "account_scheduled_deletion":
      return notice.daysRemaining === undefined
        ? t("auth.sessionEndedScheduledSoon")
        : t("auth.sessionEndedScheduled", { count: notice.daysRemaining });
  }
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  keyboardType?: KeyboardTypeOptions;
  secureTextEntry?: boolean;
  placeholder?: string;
  textContentType?: TextInputProps["textContentType"];
  autoComplete?: TextInputProps["autoComplete"];
  onSubmitEditing?: () => void;
}

/** The invite code an admin's link carries (`?invite=`), read once. Web only; screens under src/ must not import the router. */
function readInviteFromLink(): string {
  if (Platform.OS !== "web" || typeof window === "undefined") return "";
  try {
    return new URLSearchParams(window.location.search).get("invite") ?? "";
  } catch {
    return "";
  }
}

function Field({ label, value, onChange, ...input }: FieldProps) {
  return (
    <View className="gap-1">
      <Text className="text-sm text-neutral-600 dark:text-neutral-400">{label}</Text>
      <TextInput
        // The label is the accessible name; an RN TextInput has no <label for>.
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        // iOS would otherwise capitalise an email ("Ada@...") and the sign-in would fail invisibly.
        autoCapitalize="none"
        autoCorrect={false}
        className="rounded-md border border-neutral-300 bg-white px-3 py-3 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
        {...input}
      />
    </View>
  );
}

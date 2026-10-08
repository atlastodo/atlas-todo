import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";
import { AppSkeleton } from "../ui/AppSkeleton";
import { SkeletonGate } from "../ui/Skeleton";
import { useAuth } from "./AuthContext";

/**
 * Local-only mode: using Atlas without an account. With no session the app runs on a store kept
 * only on this device (the `atlas-local` database), with no server, no sync and no keys. The standalone
 * sign-in screen shows only when asked for (Settings), or when the server ended a session with a
 * notice to read; a first run signs in or signs up inside the welcome wizard.
 *
 * Someone who used an account keeps seeing the sign-in screen after the session ends (signing out,
 * an expired or revoked session), across restarts, until they choose "Continue without an
 * account": their data is in the account, not in the local store.
 *
 * Leaving the mode moves the local data into the account (`LocalUpgradeGate`).
 */

/** The scope `createPersistence` names the local-only database by (`atlas-local`). */
export const LOCAL_SCOPE = "local";

const DEVICE_ID_KEY = "@atlas_local_device_id";
/** Set when an account's session ends, cleared by "Continue without an account" or a sign-in. */
const SHOW_SIGN_IN_KEY = "@atlas_show_sign_in";

/** Which sign-in screen to show while local: sign in to an existing account, or create one. */
export type AuthScreen = "login" | "signup";

export interface LocalModeValue {
  /**
   * The local store's HLC node: a UUID kept for this device. It breaks ties between concurrent
   * edits, so it must be stable and unique, and the server takes only a UUID once the ops are pushed.
   */
  deviceId: string;
  /** The sign-in screen the user asked for, or null to show the app. */
  authScreen: AuthScreen | null;
  /** Show the standalone sign-in screen. */
  openAuth: (screen: AuthScreen) => void;
  /** Back to the local app from the sign-in screen. */
  closeAuth: () => void;
  /**
   * How the user left local-only mode, set when the sign-in form is submitted. A new account takes
   * the local data whole; an existing one is asked first and never takes local settings.
   */
  upgradeIntent: AuthScreen | null;
  /**
   * Record the intent. `resumeOnboarding` (the wizard's own form, signing up) carries the wizard on
   * past its account steps once the new account's app mounts: the session swaps the whole app tree,
   * the wizard with it.
   */
  setUpgradeIntent: (intent: AuthScreen, opts?: { resumeOnboarding?: boolean }) => void;
  /** Forget the intent once the move has read it, so a later sign-in is asked afresh. */
  clearUpgradeIntent: () => void;
  /** Whether onboarding should continue after the account step once the new account's app mounts. */
  resumeOnboarding: boolean;
  /** Clear `resumeOnboarding` once the wizard has picked it up. */
  clearResumeOnboarding: () => void;
}

/** Exported so a test can supply a fixed value without the provider's storage reads. */
export const LocalModeContext = createContext<LocalModeValue | null>(null);

/** Read or mint this device's local-only node id. */
async function loadDeviceId(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (stored) return stored;
  } catch (err) {
    console.warn("[atlas] could not read the local device id:", err);
  }
  const id = randomUUID();
  try {
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  } catch (err) {
    console.warn("[atlas] could not store the local device id:", err);
  }
  return id;
}

export function LocalModeProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [deviceId, setDeviceId] = useState<string | null>(null);
  // An admin's invite link opens the welcome wizard's signup form (`OnboardingProvider`).
  const [authScreen, setAuthScreen] = useState<AuthScreen | null>(null);
  const [upgradeIntent, setUpgradeIntent] = useState<AuthScreen | null>(null);
  const [resumeOnboarding, setResumeOnboarding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const id = await loadDeviceId();
      const showSignIn = await AsyncStorage.getItem(SHOW_SIGN_IN_KEY).catch(() => null);
      if (cancelled) return;
      if (showSignIn) setAuthScreen((s) => s ?? "login");
      setDeviceId(id);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // A session that ends while the app runs leads back to the sign-in screen, never to an empty
  // local app; a new one clears the sign-in request. Adjusted during render, so the local app
  // never mounts for a frame in between.
  const userId = session?.user.id ?? null;
  const [prevUserId, setPrevUserId] = useState(userId);
  if (userId !== prevUserId) {
    setPrevUserId(userId);
    setAuthScreen(userId === null ? "login" : null);
  }
  // The same, durably: the next launch opens on the sign-in screen too.
  const storedFor = useRef(userId);
  useEffect(() => {
    if (userId === storedFor.current) return;
    storedFor.current = userId;
    const write =
      userId === null
        ? AsyncStorage.setItem(SHOW_SIGN_IN_KEY, "1")
        : AsyncStorage.removeItem(SHOW_SIGN_IN_KEY);
    write.catch((err) => console.warn("[atlas] could not record the sign-in screen:", err));
  }, [userId]);

  const openAuth = useCallback((screen: AuthScreen) => {
    setAuthScreen(screen);
    setResumeOnboarding(false);
  }, []);
  const closeAuth = useCallback(() => {
    setAuthScreen(null);
    setResumeOnboarding(false);
    AsyncStorage.removeItem(SHOW_SIGN_IN_KEY).catch((err) =>
      console.warn("[atlas] could not clear the sign-in screen:", err),
    );
  }, []);
  const clearResumeOnboarding = useCallback(() => setResumeOnboarding(false), []);
  const recordUpgradeIntent = useCallback(
    (intent: AuthScreen, opts?: { resumeOnboarding?: boolean }) => {
      setUpgradeIntent(intent);
      // The wizard resumes for a new account only: an existing one is already set up.
      setResumeOnboarding(intent === "signup" && opts?.resumeOnboarding === true);
    },
    [],
  );
  const clearUpgradeIntent = useCallback(() => setUpgradeIntent(null), []);

  const value = useMemo<LocalModeValue | null>(
    () =>
      deviceId === null
        ? null
        : {
            deviceId,
            authScreen,
            openAuth,
            closeAuth,
            upgradeIntent,
            setUpgradeIntent: recordUpgradeIntent,
            clearUpgradeIntent,
            resumeOnboarding,
            clearResumeOnboarding,
          },
    [
      deviceId,
      authScreen,
      openAuth,
      closeAuth,
      upgradeIntent,
      recordUpgradeIntent,
      clearUpgradeIntent,
      resumeOnboarding,
      clearResumeOnboarding,
    ],
  );

  // One AsyncStorage read; the same splash the session restore shows.
  if (!value) {
    return (
      <SkeletonGate active>
        <AppSkeleton />
      </SkeletonGate>
    );
  }
  return <LocalModeContext.Provider value={value}>{children}</LocalModeContext.Provider>;
}

/** The local-only mode state, or null outside {@link LocalModeProvider} (tests that mount none). */
export function useLocalMode(): LocalModeValue | null {
  return useContext(LocalModeContext);
}

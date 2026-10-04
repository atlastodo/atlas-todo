import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useStore } from "./StoreProvider";
import { usePreferences } from "../hooks/usePreferences";
import { useFirstSyncDone } from "../hooks/useFirstSyncDone";

export interface OnboardingContextValue {
  isOpen: boolean;
  openOnboarding: () => void;
  closeOnboarding: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { store, version } = useStore();
  const firstSyncDone = useFirstSyncDone();
  const { onboardingCompleted, setOnboardingCompleted } = usePreferences();
  const [isOpen, setIsOpen] = useState(false);
  const autoPromptChecked = useRef(false);
  // Opened by the first-run check (not replayed by the user), so synced data may still close it.
  const autoOpened = useRef(false);

  const hasExistingData = useMemo(
    () => store.list("task").length > 0 || store.list("project").length > 0,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, version],
  );

  // First run only opens once a sync has succeeded: before that a new device holds none of the
  // account's data or preferences, so an existing user would be onboarded again and the wizard's
  // choices would overwrite their synced settings. An account with tasks or projects is established;
  // record that so other devices skip the prompt too.
  useEffect(() => {
    if (!firstSyncDone || autoPromptChecked.current) return;
    autoPromptChecked.current = true;
    if (onboardingCompleted || hasExistingData) {
      if (!onboardingCompleted) setOnboardingCompleted(true);
      return;
    }
    autoOpened.current = true;
    setIsOpen(true);
  }, [firstSyncDone, onboardingCompleted, hasExistingData, setOnboardingCompleted]);

  // Synced data that arrives later can still show the account is already onboarded (another device
  // finished it, or the data came in after the first cycle): put the first-run wizard away.
  useEffect(() => {
    if (!isOpen || !autoOpened.current) return;
    if (onboardingCompleted || hasExistingData) {
      autoOpened.current = false;
      setIsOpen(false);
    }
  }, [isOpen, onboardingCompleted, hasExistingData]);

  const openOnboarding = useCallback(() => {
    autoOpened.current = false;
    setIsOpen(true);
  }, []);

  const closeOnboarding = useCallback(() => {
    autoOpened.current = false;
    setIsOpen(false);
  }, []);

  const value = useMemo(
    () => ({
      isOpen,
      openOnboarding,
      closeOnboarding,
    }),
    [isOpen, openOnboarding, closeOnboarding],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    // Graceful fallback if used outside provider (e.g. isolated test)
    return {
      isOpen: false,
      openOnboarding: () => {},
      closeOnboarding: () => {},
    };
  }
  return ctx;
}

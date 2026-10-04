import { useCallback } from "react";
import { Redirect, useFocusEffect } from "expo-router";
import { useOnboarding } from "../../src/data/OnboardingContext";
import { usePreferences } from "../../src/hooks/usePreferences";
import { viewPath } from "../../src/nav/navModel";

/**
 * `/onboarding` (the command palette, a typed URL): opens the one app-level onboarding wizard and
 * moves on to the landing view underneath it. It renders no wizard of its own, and opens on every
 * visit since a drawer keeps this screen mounted.
 */
export default function OnboardingRoute() {
  const { openOnboarding } = useOnboarding();
  const { defaultView } = usePreferences();

  useFocusEffect(
    useCallback(() => {
      openOnboarding();
    }, [openOnboarding]),
  );

  return <Redirect href={viewPath(defaultView)} />;
}

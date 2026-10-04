import type { ReactNode } from "react";
import type { Keyring, Session } from "@atlas/client-core";
import { useAuth } from "./AuthContext";
import { LoginScreen } from "./LoginScreen";
import { RecoveryKeyPrompt } from "./RecoveryKeyPrompt";
import { RecoveryPhraseModal } from "./RecoveryPhraseModal";
import { UnlockScreen } from "./UnlockScreen";
import { UpdateRequiredScreen } from "./UpdateRequiredScreen";

/**
 * Everything that must be settled before the app (and its store and sync) may mount: a server that
 * refuses this build's sync protocol shows the update screen, no session the sign-in screen, and a
 * locked session (signed in, no unwrapped keys) the unlock screen. The app renders only with both a
 * session and a keyring, so sync never starts without keys. An account without a registered
 * recovery key is also asked, without blocking the app, to confirm its phrase.
 *
 * Lives under `src/` so it is testable without the router.
 */
export function AuthGate({
  children,
}: {
  children: (unlocked: { session: Session; keyring: Keyring }) => ReactNode;
}) {
  const { session, keyring, recoveryPhrase, dismissRecoveryPhrase, upgradeRequired } = useAuth();

  if (upgradeRequired) return <UpdateRequiredScreen />;
  if (!session) {
    return (
      <>
        <LoginScreen />
        <RecoveryPhraseModal phrase={recoveryPhrase} onClose={dismissRecoveryPhrase} />
      </>
    );
  }
  if (!keyring) return <UnlockScreen />;
  return (
    <>
      {children({ session, keyring })}
      <RecoveryKeyPrompt />
    </>
  );
}

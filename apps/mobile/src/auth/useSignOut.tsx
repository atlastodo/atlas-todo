import { useCallback, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useStoreOptional } from "../data/StoreProvider";
import { countUnsyncedChanges } from "../data/localData";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { useAuth } from "./AuthContext";

/**
 * Sign out, asking first when this device holds changes the server does not have: signing out
 * deletes the local database, and those changes with it. `dialog` must be rendered by the caller.
 *
 * The count comes from the mounted store, or from the database itself where none is mounted (the
 * unlock and update screens), which needs `countUnsynced` only there.
 */
export function useSignOut(
  countUnsynced: (userId: string) => Promise<number> = countUnsyncedChanges,
): { signOut: () => void; dialog: ReactNode } {
  const { t } = useTranslation();
  const { session, logout } = useAuth();
  const store = useStoreOptional()?.store ?? null;
  const [pending, setPending] = useState(0);

  const signOut = useCallback(() => {
    void (async () => {
      const userId = session?.user.id;
      let count = 0;
      try {
        if (store) count = store.unsyncedOps().length;
        else if (userId) count = await countUnsynced(userId);
      } catch (err) {
        console.warn("[atlas] could not count unsynced changes:", err);
      }
      if (count > 0) setPending(count);
      else await logout();
    })();
  }, [session, store, countUnsynced, logout]);

  const dialog = (
    <ConfirmDialog
      visible={pending > 0}
      danger
      title={t("auth.signOutUnsyncedTitle")}
      message={t("auth.signOutUnsyncedMessage", { count: pending })}
      confirmLabel={t("auth.signOutAnyway")}
      onCancel={() => setPending(0)}
      onConfirm={() => {
        setPending(0);
        void logout();
      }}
    />
  );
  return { signOut, dialog };
}

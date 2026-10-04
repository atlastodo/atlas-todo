import { useEffect, useState } from "react";
import { FlatList, Platform, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { AdminAuditEntry, AdminInviteView } from "@atlas/client-core";
import { useAdminSettings } from "../hooks/useAdminSettings";
import { useAdminInvites } from "../hooks/useAdminInvites";
import { useAdminAudit } from "../hooks/useAdminAudit";
import { useFormat } from "../hooks/useFormat";
import { useToast } from "../data/ToastProvider";
import { loadServerUrl } from "../auth/serverUrl";
import { Toggle } from "../ui/Toggle";
import { SkeletonRows } from "../ui/Skeleton";
import { EmptyState } from "../ui/EmptyState";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { CircleAlert, CircleX, Plus } from "../ui/icons";
import { copyText } from "../lib/clipboard";

/** The admin panel's instance section: the runtime signup toggle, signup invites, and the audit trail of admin actions. REST-driven (instance state, not a user's replica). */
export function AdminSettingsScreen() {
  const { t } = useTranslation();
  const { settings, loading, failed, refresh, setSignupEnabled } = useAdminSettings();
  const { invites, create, revoke } = useAdminInvites();
  const { entries } = useAdminAudit();
  const format = useFormat();
  const toast = useToast();
  const [freshInvite, setFreshInvite] = useState<AdminInviteView | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    loadServerUrl()
      .then((url) => {
        if (live) setServerUrl(url);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const onCreate = () => {
    void create().then((invite) => {
      if (invite) {
        setFreshInvite(invite);
        toast.show(t("admin.inviteCreated"));
      } else {
        toast.show(t("admin.actionFailed"));
      }
    });
  };

  const onRevoke = (id: string) => {
    void revoke(id).then((ok) =>
      toast.show(ok ? t("admin.inviteRevoked") : t("admin.actionFailed")),
    );
  };

  return (
    <View className="flex-1">
      <FlatList
        data={entries}
        keyExtractor={(e) => String(e.id)}
        contentContainerClassName="px-4 pb-16"
        ListHeaderComponent={
          <>
            {loading ? (
              <View className="px-4 pt-3">
                <SkeletonRows count={3} />
              </View>
            ) : failed || !settings ? (
              <EmptyState
                icon={CircleAlert}
                title={t("admin.settingsLoadFailed")}
                actions={[
                  { label: t("common.retry"), onPress: () => void refresh(), primary: true },
                ]}
              />
            ) : (
              <View className="pt-1">
                <Toggle
                  label={t("admin.signupToggle")}
                  description={t("admin.signupToggleDesc")}
                  value={settings.signup_enabled}
                  onValueChange={(next) =>
                    void setSignupEnabled(next).then((ok) => {
                      if (!ok) toast.show(t("admin.actionFailed"));
                    })
                  }
                  accessibilityLabel={t("admin.signupToggle")}
                />
              </View>
            )}

            <InviteSection invites={invites} onCreate={onCreate} onRevoke={onRevoke} />

            <Text className="px-4 pb-1 pt-6 text-xs font-medium uppercase tracking-wide text-neutral-500">
              {t("admin.auditSection")}
            </Text>
          </>
        }
        ListEmptyComponent={
          <View className="px-0">
            <EmptyState icon={CircleAlert} title={t("admin.noAudit")} />
          </View>
        }
        renderItem={({ item }) => (
          <AuditRow entry={item} when={format.dateTime(item.created_at_ms)} />
        )}
      />

      {/* The freshly minted invite, with the code to copy. The server hands out the code only in
          this answer (the list never carries it), so this is the one chance to copy the link. */}
      {freshInvite?.code ? (
        <ConfirmDialog
          visible
          title={t("admin.inviteCreatedTitle")}
          message={`${t("admin.inviteCreatedBody", { code: freshInvite.code })}\n\n${t(
            "admin.inviteLinkOnce",
          )}`}
          confirmLabel={t("admin.copyInvite")}
          onConfirm={async () => {
            await copyText(inviteUrl(freshInvite.code!, serverUrl));
            toast.show(t("admin.inviteCopied"));
            setFreshInvite(null);
          }}
          onCancel={() => setFreshInvite(null)}
        />
      ) : null}
    </View>
  );
}

/**
 * The shareable signup link for an invite code. In a browser tab it points at this web app; on a
 * phone or in the desktop app (`app://`) it points at the server, which serves the same web app
 * at its root and the API under `/api` (a trailing `/api` on the server URL is dropped).
 */
function inviteUrl(code: string, serverUrl: string | null): string {
  const inBrowserTab =
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    /^https?:$/.test(window.location?.protocol ?? "");
  const base = inBrowserTab
    ? window.location.origin
    : (serverUrl ?? "").replace(/\/+$/, "").replace(/\/api$/, "");
  return `${base}/signup?invite=${encodeURIComponent(code)}`;
}

function InviteSection({
  invites,
  onCreate,
  onRevoke,
}: {
  invites: AdminInviteView[];
  onCreate: () => void;
  onRevoke: (id: string) => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const live = invites.filter((i) => i.used_at_ms == null && i.revoked_at_ms == null);

  return (
    <View className="px-4 pt-6">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          {t("admin.inviteSection")}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("admin.createInvite")}
          onPress={onCreate}
          className="flex-row items-center gap-1 rounded-md bg-accent-50 px-2.5 py-2 active:bg-accent-100 dark:bg-accent-950 dark:active:bg-accent-900"
        >
          <Plus size={13} className="text-accent-600 dark:text-accent-400" />
          <Text className="text-xs font-medium text-accent-600 dark:text-accent-400">
            {t("admin.createInvite")}
          </Text>
        </Pressable>
      </View>

      {live.length === 0 ? (
        <Text className="py-3 text-sm text-neutral-500">{t("admin.noInvites")}</Text>
      ) : (
        live.map((invite) => (
          <View
            key={invite.id}
            className="flex-row items-center gap-2 border-b border-neutral-100 py-3 dark:border-neutral-900"
          >
            <View className="flex-1">
              <Text numberOfLines={1} className="text-sm text-neutral-900 dark:text-neutral-100">
                {t("admin.inviteExpires")} {format.date(invite.expires_at_ms)}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("admin.revokeInvite")}
              onPress={() => onRevoke(invite.id)}
              className="p-2"
            >
              <CircleX size={16} className="text-red-600 dark:text-red-400" />
            </Pressable>
          </View>
        ))
      )}
    </View>
  );
}

function AuditRow({ entry, when }: { entry: AdminAuditEntry; when: string }) {
  const { t } = useTranslation();
  return (
    <View className="border-b border-neutral-100 py-3 dark:border-neutral-900">
      <View className="flex-row items-center gap-2">
        <Text numberOfLines={1} className="flex-1 text-sm text-neutral-900 dark:text-neutral-100">
          {t(`admin.action.${entry.action}`, entry.action)}
        </Text>
      </View>
      <Text className="mt-1 text-xs text-neutral-500">
        {`${actorLabel(entry, t("admin.systemActor"))}${
          entry.target_email ? ` -> ${entry.target_email}` : ""
        } - ${when}`}
      </Text>
    </View>
  );
}

/** Who did it: the admin's email, or for an entry with no actor the system and its recorded source (`cli`, `env`, `purge`). */
function actorLabel(entry: AdminAuditEntry, system: string): string {
  if (entry.actor_email) return entry.actor_email;
  const source = entry.details?.source;
  return typeof source === "string" && source ? `${system} (${source})` : system;
}

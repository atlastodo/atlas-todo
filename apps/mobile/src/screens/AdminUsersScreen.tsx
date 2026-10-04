import { useEffect, useState } from "react";
import { FlatList, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { AdminUserView } from "@atlas/client-core";
import { useAdminUsers } from "../hooks/useAdminUsers";
import { useAuth } from "../auth/AuthContext";
import { useFormat } from "../hooks/useFormat";
import { useToast } from "../data/ToastProvider";
import { SkeletonRows } from "../ui/Skeleton";
import { EmptyState } from "../ui/EmptyState";
import { CircleAlert, Search } from "../ui/icons";
import { AdminRow } from "../ui/AdminRow";
import { AdminUserDetail } from "../ui/AdminUserDetail";

/**
 * The admin panel's account section: who is on this instance, and the lifecycle actions on each
 * (admin flag, disable, sign-out-everywhere, scheduled deletion). The list is server-searched;
 * actions are optimistic through `useAdminUsers` and reconciled with the server's answer, since
 * the guardrails are server-side.
 */
export function AdminUsersScreen() {
  const { t } = useTranslation();
  const format = useFormat();
  const toast = useToast();
  const { session } = useAuth();
  const {
    users,
    search,
    setSearch,
    loading,
    failed,
    refresh,
    setUserAdmin,
    setUserDisabled,
    logoutDevices,
    deleteUser,
  } = useAdminUsers();
  const [searchInput, setSearchInput] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  // Debounced so typing does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput, setSearch]);

  const run = (outcome: Promise<boolean>, successMessage: string) => {
    void outcome.then((ok) => toast.show(ok ? successMessage : t("admin.actionFailed")));
  };

  const open = users.find((u) => u.id === openId) ?? null;

  return (
    <View className="flex-1">
      <View className="flex-row items-center gap-2 px-4 py-3">
        <View className="flex-1 flex-row items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800">
          <Search size={16} className="text-neutral-400" />
          <TextInput
            value={searchInput}
            onChangeText={setSearchInput}
            placeholder={t("admin.userSearch")}
            placeholderTextColor="rgb(163 163 163)"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel={t("admin.userSearch")}
            className="flex-1 text-sm text-neutral-900 dark:text-neutral-100"
          />
        </View>
      </View>

      {loading ? (
        <View className="px-4">
          <SkeletonRows count={6} />
        </View>
      ) : failed ? (
        <EmptyState
          icon={CircleAlert}
          title={t("admin.usersLoadFailed")}
          actions={[{ label: t("common.retry"), onPress: () => void refresh(), primary: true }]}
        />
      ) : users.length === 0 ? (
        <EmptyState
          icon={CircleAlert}
          title={search ? t("admin.noUserMatches") : t("admin.noUsers")}
        />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          contentContainerClassName="px-4 pb-16"
          renderItem={({ item }) => (
            <UserRow
              user={item}
              when={format.dateTime(item.created_at_ms)}
              onPress={() => setOpenId(item.id)}
            />
          )}
        />
      )}

      {open ? (
        <AdminUserDetail
          user={open}
          isSelf={open.id === session?.user.id}
          onClose={() => setOpenId(null)}
          onSetAdmin={(isAdmin) =>
            run(
              setUserAdmin(open.id, isAdmin),
              isAdmin ? t("admin.userPromoted") : t("admin.userDemoted"),
            )
          }
          onSetDisabled={(disabled) =>
            run(
              setUserDisabled(open.id, disabled),
              disabled ? t("admin.userDisabled") : t("admin.userEnabled"),
            )
          }
          onForceLogout={() => run(logoutDevices(open.id), t("admin.devicesSignedOut"))}
          onDelete={() => run(deleteUser(open.id), t("admin.userDeleted"))}
        />
      ) : null}
    </View>
  );
}

function UserRow({
  user,
  when,
  onPress,
}: {
  user: AdminUserView;
  when: string;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  return (
    <AdminRow
      title={user.display_name || user.email}
      badges={
        <>
          {user.is_admin ? (
            <Text className="text-xs font-medium text-accent-600 dark:text-accent-400">
              {t("admin.adminBadge")}
            </Text>
          ) : null}
          {user.disabled ? (
            <Text className="text-xs text-red-600 dark:text-red-400">
              {t("admin.disabledBadge")}
            </Text>
          ) : null}
          {user.deletion_scheduled ? (
            <Text className="text-xs text-amber-600 dark:text-amber-400">
              {t("admin.deletionScheduled")}
            </Text>
          ) : null}
        </>
      }
      detail={`${user.email} - ${t("admin.joined")} ${when}`}
      onPress={onPress}
    />
  );
}

// app/(app)/notifications.tsx
import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────
type NotifType =
  | "ptp_today"
  | "auto_paid"
  | "pending_deposition"
  | "broadcast"
  | "target_alert";

interface AgentNotification {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  time: string;         // display time string
  timeRaw: string;      // ISO string for sorting
  read: boolean;
  meta?: {
    loanNo?: string;
    caseId?: number;
    amount?: number;
    screen?: string;
  };
}

// ─── Icon + colour per type ───────────────────────────────────────────────────
const TYPE_CONFIG: Record<
  NotifType,
  { icon: React.ComponentProps<typeof Ionicons>["name"]; color: string; bg: string }
> = {
  ptp_today:           { icon: "alarm-outline",          color: Colors.statusPTP,  bg: Colors.statusPTP  + "18" },
  auto_paid:           { icon: "checkmark-circle-outline", color: Colors.success,   bg: Colors.success    + "18" },
  pending_deposition:  { icon: "warning-outline",         color: Colors.warning,    bg: Colors.warning    + "18" },
  broadcast:           { icon: "megaphone-outline",       color: Colors.info,       bg: Colors.info       + "18" },
  target_alert:        { icon: "trending-up-outline",     color: Colors.primary,    bg: Colors.primary    + "18" },
};

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1)  return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24)   return `Today ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
    return `Yesterday ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
  } catch {
    return iso;
  }
}

// ─── Notification Card ────────────────────────────────────────────────────────
function NotifCard({ item }: { item: AgentNotification }) {
  const cfg = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.broadcast;

  const handlePress = () => {
    if (item.meta?.screen) router.push(item.meta.screen as any);
    else if (item.meta?.caseId) router.push(`/(app)/customer/${item.meta.caseId}` as any);
    else if (item.type === "pending_deposition") router.push("/(app)/deposition");
    else if (item.type === "ptp_today") router.push("/(app)/allocation");
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed, !item.read && styles.cardUnread]}
      onPress={handlePress}
    >
      <View style={[styles.iconWrap, { backgroundColor: cfg.bg }]}>
        <Ionicons name={cfg.icon} size={22} color={cfg.color} />
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.cardTime}>{item.time}</Text>
        </View>
        <Text style={styles.cardDesc} numberOfLines={3}>{item.body}</Text>
      </View>
      {!item.read && <View style={[styles.unreadDot, { backgroundColor: cfg.color }]} />}
    </Pressable>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <View style={styles.empty}>
      <Ionicons name="notifications-off-outline" size={52} color={Colors.textMuted} />
      <Text style={styles.emptyTitle}>No notifications</Text>
      <Text style={styles.emptySubtitle}>You're all caught up!</Text>
    </View>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ label }: { label: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionLabel}>{label}</Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();

  const { data, isLoading, refetch, isRefetching } = useQuery<AgentNotification[]>({
    queryKey: ["/api/agent/notifications"],
    queryFn: async () => {
      const res = await api.getAgentNotifications();
      return res.notifications ?? [];
    },
    refetchInterval: 60_000, // auto-refresh every minute
  });

  const notifications = data ?? [];

  // Split into today vs older
  const todayStr = new Date().toDateString();
  const today   = notifications.filter((n) => new Date(n.timeRaw).toDateString() === todayStr);
  const older   = notifications.filter((n) => new Date(n.timeRaw).toDateString() !== todayStr);

  type ListItem =
    | { kind: "header"; label: string; id: string }
    | { kind: "notif";  item: AgentNotification; id: string };

  const listData: ListItem[] = [];
  if (today.length > 0) {
    listData.push({ kind: "header", label: "TODAY", id: "hdr-today" });
    today.forEach((n) => listData.push({ kind: "notif", item: n, id: n.id }));
  }
  if (older.length > 0) {
    listData.push({ kind: "header", label: "EARLIER", id: "hdr-earlier" });
    older.forEach((n) => listData.push({ kind: "notif", item: n, id: n.id }));
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  const onRefresh = useCallback(() => { refetch(); }, [refetch]);

  if (isLoading) {
    return (
      <View style={[styles.loader, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notifications</Text>
        {unreadCount > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadBadgeText}>{unreadCount} new</Text>
          </View>
        )}
      </View>

      {/* ── List ── */}
      <FlatList
        data={listData}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.list,
          notifications.length === 0 && styles.listEmpty,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
        ListEmptyComponent={<EmptyState />}
        renderItem={({ item }) => {
          if (item.kind === "header") return <SectionHeader label={item.label} />;
          return <NotifCard item={item.item} />;
        }}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: Colors.background },
  loader:         { flex: 1, backgroundColor: Colors.background, justifyContent: "center", alignItems: "center" },
  header:         {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle:    { fontSize: 20, fontWeight: "800", color: Colors.text, flex: 1 },
  unreadBadge:    { backgroundColor: Colors.danger, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  unreadBadgeText:{ fontSize: 11, fontWeight: "800", color: "#fff" },
  list:           { padding: 12, gap: 8 },
  listEmpty:      { flex: 1 },
  sectionHeader:  { paddingHorizontal: 4, paddingVertical: 6, marginTop: 4 },
  sectionLabel:   { fontSize: 11, fontWeight: "800", color: Colors.textMuted, letterSpacing: 1, textTransform: "uppercase" },
  card:           {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  cardPressed:    { opacity: 0.75 },
  cardUnread:     { borderColor: Colors.primaryLight, backgroundColor: Colors.surfaceAlt },
  iconWrap:       { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  cardBody:       { flex: 1, gap: 4 },
  cardTop:        { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle:      { flex: 1, fontSize: 14, fontWeight: "700", color: Colors.text },
  cardTime:       { fontSize: 11, color: Colors.textMuted, fontWeight: "500" },
  cardDesc:       { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
  unreadDot:      { width: 8, height: 8, borderRadius: 4, marginTop: 4, flexShrink: 0 },
  empty:          { flex: 1, justifyContent: "center", alignItems: "center", gap: 10, paddingVertical: 80 },
  emptyTitle:     { fontSize: 17, fontWeight: "700", color: Colors.textSecondary },
  emptySubtitle:  { fontSize: 14, color: Colors.textMuted },
});

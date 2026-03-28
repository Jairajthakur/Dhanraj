import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";

function fmtDateTime(dateStr: any): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function fmtDate(dateStr: any): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function durLabel(checkIn: any, checkOut: any): string {
  if (!checkIn || !checkOut) return "";
  const diff = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  if (diff <= 0) return "";
  const hrs = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

const STATUS_FILTERS = ["All", "Present", "Incomplete", "Absent"];

export default function AdminAttendanceScreen() {
  const insets = useSafeAreaInsets();
  const [agentFilter, setAgentFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["/api/admin/attendance"],
    queryFn: () => api.admin.getAttendance(),
    refetchInterval: 30000,
    retry: 2,
  });

  // Debug: log errors to console in development
  if (__DEV__ && isError) {
    console.error("[AdminAttendance] fetch error:", error);
  }
  if (__DEV__ && data) {
    console.log("[AdminAttendance] fetched records:", data?.attendance?.length ?? 0);
  }

  const attendance: any[] = Array.isArray(data?.attendance) ? data.attendance : [];

  const agentNames = useMemo(() => {
    const names = Array.from(
      new Set(attendance.map((a: any) => a.agent_name).filter(Boolean))
    ) as string[];
    return ["All", ...names.sort()];
  }, [attendance]);

  const filtered = useMemo(() => {
    return attendance.filter((a: any) => {
      const matchAgent = agentFilter === "All" || a.agent_name === agentFilter;
      const hasIn = !!a.check_in;
      const hasOut = !!a.check_out;
      let matchStatus = true;
      if (statusFilter === "Present") matchStatus = hasIn && hasOut;
      else if (statusFilter === "Incomplete") matchStatus = hasIn && !hasOut;
      else if (statusFilter === "Absent") matchStatus = !hasIn;
      return matchAgent && matchStatus;
    });
  }, [attendance, agentFilter, statusFilter]);

  const agentSummary = useMemo(() => {
    const groups: Record<string, { name: string; present: number; incomplete: number; total: number }> = {};
    for (const a of attendance) {
      const name = a.agent_name || "Unknown";
      if (!groups[name]) groups[name] = { name, present: 0, incomplete: 0, total: 0 };
      groups[name].total++;
      if (a.check_in && a.check_out) groups[name].present++;
      else if (a.check_in && !a.check_out) groups[name].incomplete++;
    }
    return Object.values(groups).sort((a, b) => a.name.localeCompare(b.name));
  }, [attendance]);

  const todayStr = new Date().toDateString();
  const presentToday = attendance.filter(
    (a: any) => a.check_in && new Date(a.check_in).toDateString() === todayStr
  ).length;
  const totalAgents = agentNames.length - 1;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: Platform.OS === "web" ? 67 : 12 }]}>
        {/* Summary chips */}
        <View style={styles.chipRow}>
          <View style={[styles.chip, { backgroundColor: Colors.success + "18" }]}>
            <Ionicons name="checkmark-circle-outline" size={14} color={Colors.success} />
            <Text style={[styles.chipText, { color: Colors.success }]}>
              {presentToday} Present Today
            </Text>
          </View>
          <View style={[styles.chip, { backgroundColor: Colors.primary + "18" }]}>
            <Ionicons name="people-outline" size={14} color={Colors.primary} />
            <Text style={[styles.chipText, { color: Colors.primary }]}>
              {totalAgents} Agents
            </Text>
          </View>
          <View style={[styles.chip, { backgroundColor: Colors.info + "18" }]}>
            <Ionicons name="document-text-outline" size={14} color={Colors.info} />
            <Text style={[styles.chipText, { color: Colors.info }]}>
              {attendance.length} Records
            </Text>
          </View>

          {/* Refresh button */}
          <Pressable
            style={[styles.chip, { backgroundColor: Colors.primary + "18" }]}
            onPress={() => refetch()}
          >
            <Ionicons name="refresh-outline" size={14} color={Colors.primary} />
            <Text style={[styles.chipText, { color: Colors.primary }]}>Refresh</Text>
          </Pressable>
        </View>

        {/* Error banner */}
        {isError && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={14} color="#fff" />
            <Text style={styles.errorBannerText}>
              Failed to load — check your login session
            </Text>
          </View>
        )}

        {/* Status filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.filterRow}>
            {STATUS_FILTERS.map((f) => (
              <Pressable
                key={f}
                style={[
                  styles.filterChip,
                  statusFilter === f && {
                    backgroundColor: Colors.primary,
                    borderColor: Colors.primary,
                  },
                ]}
                onPress={() => setStatusFilter(f)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    statusFilter === f && { color: "#fff" },
                  ]}
                >
                  {f}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        {/* Agent filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.filterRow}>
            {agentNames.map((name) => (
              <Pressable
                key={name}
                style={[
                  styles.agentChip,
                  agentFilter === name && {
                    backgroundColor: Colors.accent,
                    borderColor: Colors.accent,
                  },
                ]}
                onPress={() => setAgentFilter(name)}
              >
                <Text
                  style={[
                    styles.agentChipText,
                    agentFilter === name && { color: "#fff" },
                  ]}
                  numberOfLines={1}
                >
                  {name}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={{ color: Colors.textMuted, marginTop: 12, fontSize: 13 }}>
            Loading attendance...
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item, i) => String(item.id ?? i)}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + 24 },
            !filtered.length && { flex: 1 },
          ]}
          ListHeaderComponent={
            agentFilter === "All" && statusFilter === "All" && agentSummary.length > 0 ? (
              <View style={styles.summaryCard}>
                <View style={styles.summaryCardHeader}>
                  <Ionicons name="bar-chart-outline" size={16} color={Colors.primary} />
                  <Text style={styles.summaryCardTitle}>Agent Summary</Text>
                </View>
                {agentSummary.map((s) => {
                  const pct = s.total > 0 ? Math.round((s.present / s.total) * 100) : 0;
                  return (
                    <View key={s.name} style={styles.summaryRow}>
                      <Text style={styles.summaryName} numberOfLines={1}>
                        {s.name}
                      </Text>
                      <View style={styles.summaryBarWrap}>
                        <View style={styles.summaryBar}>
                          <View style={[styles.summaryBarFill, { width: `${pct}%` as any }]} />
                        </View>
                        <Text style={styles.summaryPct}>{pct}%</Text>
                      </View>
                      <View style={styles.summaryStats}>
                        <Text style={[styles.summaryStat, { color: Colors.success }]}>
                          ✓{s.present}
                        </Text>
                        {s.incomplete > 0 && (
                          <Text style={[styles.summaryStat, { color: Colors.warning }]}>
                            ⏳{s.incomplete}
                          </Text>
                        )}
                        <Text style={[styles.summaryStat, { color: Colors.textMuted }]}>
                          /{s.total}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.count}>
                {filtered.length} record{filtered.length !== 1 ? "s" : ""}
              </Text>
            )
          }
          renderItem={({ item }) => {
            const hasIn = !!item.check_in;
            const hasOut = !!item.check_out;
            const dur = durLabel(item.check_in, item.check_out);
            const statusColor = !hasIn
              ? Colors.danger
              : !hasOut
              ? Colors.warning
              : Colors.success;
            const statusLabel = !hasIn ? "Absent" : !hasOut ? "In Progress" : "Present";
            const statusIcon = !hasIn
              ? "close-circle-outline"
              : !hasOut
              ? "time-outline"
              : "checkmark-circle-outline";

            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.agentAvatarWrap}>
                    <Text style={styles.agentInitial}>
                      {(item.agent_name || "?").charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.agentName} numberOfLines={1}>
                      {item.agent_name || "Unknown"}
                    </Text>
                    <Text style={styles.dateText}>
                      {fmtDate(item.check_in || item.created_at)}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusColor + "20" }]}>
                    <Ionicons name={statusIcon as any} size={12} color={statusColor} />
                    <Text style={[styles.statusText, { color: statusColor }]}>
                      {statusLabel}
                    </Text>
                  </View>
                </View>

                <View style={styles.timeGrid}>
                  <View style={styles.timeBox}>
                    <View style={styles.timeBoxHeader}>
                      <Ionicons name="log-in-outline" size={13} color={Colors.success} />
                      <Text style={styles.timeBoxLabel}>Check-in</Text>
                    </View>
                    <Text style={[styles.timeBoxValue, { color: hasIn ? Colors.success : Colors.textMuted }]}>
                      {hasIn ? fmtDateTime(item.check_in) : "—"}
                    </Text>
                  </View>

                  <View style={styles.timeDivider} />

                  <View style={styles.timeBox}>
                    <View style={styles.timeBoxHeader}>
                      <Ionicons name="log-out-outline" size={13} color={Colors.danger} />
                      <Text style={styles.timeBoxLabel}>Check-out</Text>
                    </View>
                    <Text style={[styles.timeBoxValue, { color: hasOut ? Colors.danger : Colors.textMuted }]}>
                      {hasOut ? fmtDateTime(item.check_out) : "—"}
                    </Text>
                  </View>

                  {dur ? (
                    <>
                      <View style={styles.timeDivider} />
                      <View style={styles.timeBox}>
                        <View style={styles.timeBoxHeader}>
                          <Ionicons name="timer-outline" size={13} color={Colors.primary} />
                          <Text style={styles.timeBoxLabel}>Duration</Text>
                        </View>
                        <Text style={[styles.timeBoxValue, { color: Colors.primary }]}>{dur}</Text>
                      </View>
                    </>
                  ) : null}
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={52} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No Records Found</Text>
              <Text style={styles.emptyText}>
                {isError
                  ? "Error loading data — tap Refresh above"
                  : agentFilter !== "All" || statusFilter !== "All"
                  ? "Try changing the filters"
                  : "No attendance records yet"}
              </Text>
              {isError && (
                <Pressable style={styles.retryBtn} onPress={() => refetch()}>
                  <Text style={styles.retryBtnText}>Retry</Text>
                </Pressable>
              )}
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    backgroundColor: Colors.surface,
    padding: 12,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  chipRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  chipText: { fontSize: 12, fontWeight: "700" },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.danger,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  errorBannerText: { color: "#fff", fontSize: 12, fontWeight: "600", flex: 1 },
  filterRow: { flexDirection: "row", gap: 8 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipText: { fontSize: 12, fontWeight: "600", color: Colors.textSecondary },
  agentChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    maxWidth: 150,
  },
  agentChipText: { fontSize: 12, fontWeight: "600", color: Colors.textSecondary },
  list: { padding: 12, gap: 10 },
  count: { fontSize: 13, color: Colors.textSecondary, fontWeight: "600", marginBottom: 4 },
  summaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    gap: 10,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  summaryCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  summaryCardTitle: { fontSize: 14, fontWeight: "800", color: Colors.primary },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  summaryName: { width: 110, fontSize: 12, fontWeight: "600", color: Colors.text },
  summaryBarWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  summaryBar: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: "hidden",
  },
  summaryBarFill: { height: "100%", backgroundColor: Colors.success, borderRadius: 3 },
  summaryPct: { fontSize: 11, fontWeight: "700", color: Colors.textSecondary, width: 34, textAlign: "right" },
  summaryStats: { flexDirection: "row", gap: 6 },
  summaryStat: { fontSize: 11, fontWeight: "700" },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  agentAvatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  agentInitial: { fontSize: 16, fontWeight: "800", color: "#fff" },
  agentName: { fontSize: 14, fontWeight: "700", color: Colors.text },
  dateText: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statusText: { fontSize: 11, fontWeight: "700" },
  timeGrid: {
    flexDirection: "row",
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  timeBox: { flex: 1, padding: 10, gap: 4 },
  timeBoxHeader: { flexDirection: "row", alignItems: "center", gap: 4 },
  timeBoxLabel: { fontSize: 10, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase" },
  timeBoxValue: { fontSize: 12, fontWeight: "700" },
  timeDivider: { width: StyleSheet.hairlineWidth, backgroundColor: Colors.border },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingVertical: 60,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: Colors.textMuted },
  emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: "center", paddingHorizontal: 32 },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: Colors.primary,
    borderRadius: 20,
  },
  retryBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});

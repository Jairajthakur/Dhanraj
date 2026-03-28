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

function fmt(dateStr: any): string {
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
  const hrs = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hrs <= 0 && mins <= 0) return "";
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
}

const FILTERS = ["All", "Present", "Absent", "Incomplete"];

export default function AdminAttendanceScreen() {
  const insets = useSafeAreaInsets();
  const [agentFilter, setAgentFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  const { data, isLoading } = useQuery({
    queryKey: ["/api/admin/attendance"],
    queryFn: () => api.admin.getAttendance(),
    refetchInterval: 30000,
  });

  const attendance: any[] = data?.attendance || [];

  // Unique agent names for filter
  const agentNames = useMemo(() => {
    const names = Array.from(new Set(attendance.map((a) => a.agent_name).filter(Boolean))) as string[];
    return ["All", ...names.sort()];
  }, [attendance]);

  const filtered = useMemo(() => {
    return attendance.filter((a) => {
      const matchAgent = agentFilter === "All" || a.agent_name === agentFilter;
      const hasCheckIn = !!a.check_in;
      const hasCheckOut = !!a.check_out;
      let matchStatus = true;
      if (statusFilter === "Present") matchStatus = hasCheckIn && hasCheckOut;
      else if (statusFilter === "Absent") matchStatus = !hasCheckIn;
      else if (statusFilter === "Incomplete") matchStatus = hasCheckIn && !hasCheckOut;
      return matchAgent && matchStatus;
    });
  }, [attendance, agentFilter, statusFilter]);

  // Group by agent for summary
  const agentSummary = useMemo(() => {
    const groups: Record<string, { name: string; presentDays: number; totalDays: number }> = {};
    for (const a of attendance) {
      const name = a.agent_name || "Unknown";
      if (!groups[name]) groups[name] = { name, presentDays: 0, totalDays: 0 };
      groups[name].totalDays++;
      if (a.check_in && a.check_out) groups[name].presentDays++;
    }
    return Object.values(groups).sort((a, b) => a.name.localeCompare(b.name));
  }, [attendance]);

  const presentToday = attendance.filter(
    (a) => a.check_in && new Date(a.check_in).toDateString() === new Date().toDateString()
  ).length;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={[styles.topBar, { paddingTop: Platform.OS === "web" ? 67 : 12 }]}>
        {/* Summary chips */}
        <View style={styles.chipRow}>
          <View style={[styles.chip, { backgroundColor: Colors.success + "18" }]}>
            <Ionicons name="person-circle-outline" size={14} color={Colors.success} />
            <Text style={[styles.chipText, { color: Colors.success }]}>{presentToday} Present Today</Text>
          </View>
          <View style={[styles.chip, { backgroundColor: Colors.primary + "18" }]}>
            <Ionicons name="list-outline" size={14} color={Colors.primary} />
            <Text style={[styles.chipText, { color: Colors.primary }]}>{attendance.length} Records</Text>
          </View>
        </View>

        {/* Status filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.filters}>
            {FILTERS.map((f) => (
              <Pressable
                key={f}
                style={[styles.filterChip, statusFilter === f && styles.filterChipActive]}
                onPress={() => setStatusFilter(f)}
              >
                <Text style={[styles.filterChipText, statusFilter === f && { color: "#fff" }]}>{f}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        {/* Agent filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.filters}>
            {agentNames.map((name) => (
              <Pressable
                key={name}
                style={[
                  styles.agentChip,
                  agentFilter === name && { backgroundColor: Colors.primary, borderColor: Colors.primary },
                ]}
                onPress={() => setAgentFilter(name)}
              >
                <Text
                  style={[styles.agentChipText, agentFilter === name && { color: "#fff" }]}
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
            agentSummary.length > 0 && agentFilter === "All" && statusFilter === "All" ? (
              <View style={styles.summaryBox}>
                <Text style={styles.summaryTitle}>Agent Attendance Summary</Text>
                {agentSummary.map((s) => (
                  <View key={s.name} style={styles.summaryRow}>
                    <Text style={styles.summaryName} numberOfLines={1}>{s.name}</Text>
                    <View style={styles.summaryMeta}>
                      <Text style={[styles.summaryDays, { color: Colors.success }]}>
                        ✓ {s.presentDays}
                      </Text>
                      <Text style={styles.summaryOf}>/ {s.totalDays} days</Text>
                    </View>
                    <View style={styles.summaryBar}>
                      <View
                        style={[
                          styles.summaryBarFill,
                          {
                            width: `${s.totalDays > 0 ? Math.round((s.presentDays / s.totalDays) * 100) : 0}%` as any,
                          },
                        ]}
                      />
                    </View>
                  </View>
                ))}
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const hasIn = !!item.check_in;
            const hasOut = !!item.check_out;
            const dur = durLabel(item.check_in, item.check_out);
            const statusColor = !hasIn
              ? Colors.danger
              : hasOut
              ? Colors.success
              : Colors.warning;
            const statusLabel = !hasIn ? "Absent" : hasOut ? "Present" : "Checked In";

            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.agentName} numberOfLines={1}>
                      {item.agent_name || "Unknown"}
                    </Text>
                    <Text style={styles.dateText}>{fmtDate(item.check_in || item.date)}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusColor + "20" }]}>
                    <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
                  </View>
                </View>

                <View style={styles.timeRow}>
                  <View style={styles.timeItem}>
                    <Ionicons name="log-in-outline" size={14} color={Colors.success} />
                    <View>
                      <Text style={styles.timeLabel}>Check-in</Text>
                      <Text style={[styles.timeValue, { color: Colors.success }]}>
                        {fmt(item.check_in)}
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="arrow-forward" size={14} color={Colors.textMuted} />
                  <View style={styles.timeItem}>
                    <Ionicons name="log-out-outline" size={14} color={Colors.danger} />
                    <View>
                      <Text style={styles.timeLabel}>Check-out</Text>
                      <Text style={[styles.timeValue, { color: hasOut ? Colors.danger : Colors.textMuted }]}>
                        {hasOut ? fmt(item.check_out) : "—"}
                      </Text>
                    </View>
                  </View>
                  {dur ? (
                    <View style={styles.durBadge}>
                      <Ionicons name="time-outline" size={12} color={Colors.primary} />
                      <Text style={styles.durText}>{dur}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No attendance records found</Text>
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
  chipRow: { flexDirection: "row", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  chipText: { fontSize: 12, fontWeight: "700" },
  filters: { flexDirection: "row", gap: 8 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: { fontSize: 12, fontWeight: "600", color: Colors.textSecondary },
  agentChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    maxWidth: 140,
  },
  agentChipText: { fontSize: 12, fontWeight: "600", color: Colors.textSecondary },
  list: { padding: 12, gap: 10 },
  summaryBox: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 4,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  summaryTitle: { fontSize: 13, fontWeight: "800", color: Colors.primary, marginBottom: 4 },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  summaryName: { flex: 1, fontSize: 13, fontWeight: "600", color: Colors.text },
  summaryMeta: { flexDirection: "row", alignItems: "center", gap: 3 },
  summaryDays: { fontSize: 13, fontWeight: "800" },
  summaryOf: { fontSize: 11, color: Colors.textSecondary },
  summaryBar: {
    width: 60,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    overflow: "hidden",
  },
  summaryBarFill: { height: "100%", backgroundColor: Colors.success, borderRadius: 2 },
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
  agentName: { fontSize: 14, fontWeight: "700", color: Colors.text },
  dateText: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: "700" },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 10,
    padding: 10,
    flexWrap: "wrap",
  },
  timeItem: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  timeLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: "600" },
  timeValue: { fontSize: 12, fontWeight: "700" },
  durBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.primary + "18",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  durText: { fontSize: 11, fontWeight: "700", color: Colors.primary },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText: { fontSize: 15, color: Colors.textMuted },
});

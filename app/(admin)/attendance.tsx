import React from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";
import { Platform } from "react-native";

function formatTime(dt: string | null) {
  if (!dt) return "—";
  try {
    return new Date(dt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
}

export default function AdminAttendanceScreen() {
  const insets = useSafeAreaInsets();
  const { data, isLoading } = useQuery({
    queryKey: ["/api/admin/attendance"],
    queryFn: () => api.admin.getAttendance(),
  });

  const attendance = data?.attendance || [];
  const present = attendance.filter((a: any) => a.check_in).length;

  return (
    <FlatList
      style={{ backgroundColor: Colors.background }}
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 24, paddingTop: Platform.OS === "web" ? 67 : 0 }]}
      data={attendance}
      keyExtractor={(item) => String(item.id)}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Attendance Records</Text>
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, { borderTopColor: Colors.success }]}>
              <Text style={[styles.summaryNum, { color: Colors.success }]}>{present}</Text>
              <Text style={styles.summaryLabel}>Present</Text>
            </View>
            <View style={[styles.summaryCard, { borderTopColor: Colors.info }]}>
              <Text style={[styles.summaryNum, { color: Colors.info }]}>{attendance.length}</Text>
              <Text style={styles.summaryLabel}>Total Records</Text>
            </View>
          </View>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.agentInfo}>
              <Ionicons name="person-circle" size={20} color={Colors.primary} />
              <Text style={styles.agentName} numberOfLines={1}>{item.agent_name}</Text>
            </View>
            <Text style={styles.date}>{item.date}</Text>
          </View>
          <View style={styles.timesRow}>
            <View style={styles.timeItem}>
              <Ionicons name="log-in" size={16} color={Colors.success} />
              <Text style={styles.timeLabel}>Check In</Text>
              <Text style={[styles.timeValue, { color: Colors.success }]}>{formatTime(item.check_in)}</Text>
            </View>
            <View style={styles.timeDivider} />
            <View style={styles.timeItem}>
              <Ionicons name="log-out" size={16} color={Colors.danger} />
              <Text style={styles.timeLabel}>Check Out</Text>
              <Text style={[styles.timeValue, { color: item.check_out ? Colors.danger : Colors.textMuted }]}>
                {formatTime(item.check_out)}
              </Text>
            </View>
          </View>
        </View>
      )}
      ListEmptyComponent={
        isLoading ? (
          <View style={{ padding: 60, alignItems: "center" }}>
            <ActivityIndicator color={Colors.primary} size="large" />
          </View>
        ) : (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No attendance records</Text>
          </View>
        )
      }
      scrollEnabled={!!attendance.length}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10 },
  header: { marginBottom: 8, gap: 12 },
  headerTitle: { fontSize: 20, fontWeight: "800", color: Colors.text },
  summaryRow: { flexDirection: "row", gap: 12 },
  summaryCard: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: 14, padding: 14,
    alignItems: "center", gap: 4, borderTopWidth: 3,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  summaryNum: { fontSize: 28, fontWeight: "800", color: Colors.text },
  summaryLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: "600" },
  card: {
    backgroundColor: Colors.surface, borderRadius: 14, padding: 14, gap: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  agentInfo: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  agentName: { fontSize: 14, fontWeight: "700", color: Colors.text, flex: 1 },
  date: { fontSize: 13, color: Colors.textSecondary, fontWeight: "600" },
  timesRow: { flexDirection: "row", backgroundColor: Colors.surfaceAlt, borderRadius: 12, overflow: "hidden" },
  timeItem: { flex: 1, alignItems: "center", padding: 12, gap: 4 },
  timeDivider: { width: 1, backgroundColor: Colors.border },
  timeLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: "600" },
  timeValue: { fontSize: 16, fontWeight: "800" },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText: { fontSize: 16, color: Colors.textMuted },
});

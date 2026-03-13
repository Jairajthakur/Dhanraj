import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, FlatList
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";
import { Platform } from "react-native";

const STATUS_COLORS: Record<string, string> = {
  Unpaid: Colors.statusUnpaid,
  PTP: Colors.statusPTP,
  Paid: Colors.statusPaid,
};

const TABS = ["All", "Unpaid", "PTP", "Paid"];

export default function AgentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState("All");

  const { data: agentsData } = useQuery({
    queryKey: ["/api/admin/agents"],
    queryFn: () => api.admin.getAgents(),
  });

  const { data: casesData, isLoading } = useQuery({
    queryKey: ["/api/admin/cases/agent", id],
    queryFn: () => api.admin.getAgentCases(Number(id)),
  });

  const { data: statsData } = useQuery({
    queryKey: ["/api/admin/agent/stats", id],
    queryFn: () => api.admin.getAgentStats(Number(id)),
  });

  const agent = agentsData?.agents?.find((a: any) => String(a.id) === id);
  const cases = casesData?.cases || [];
  const stats = statsData;

  const filtered = activeTab === "All" ? cases : cases.filter((c: any) => c.status === activeTab);

  if (isLoading) return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background }}>
      <ActivityIndicator color={Colors.primary} size="large" />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 24, paddingTop: Platform.OS === "web" ? 67 : 0 }]}
      >
        {agent && (
          <View style={styles.agentHeader}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={32} color="#fff" />
            </View>
            <View style={styles.agentInfo}>
              <Text style={styles.agentName}>{agent.name}</Text>
              {agent.phone && <Text style={styles.agentPhone}>{agent.phone}</Text>}
            </View>
          </View>
        )}

        {stats && (
          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { borderTopColor: Colors.info }]}>
              <Text style={styles.statNum}>{stats.total}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
            <View style={[styles.statCard, { borderTopColor: Colors.success }]}>
              <Text style={[styles.statNum, { color: Colors.success }]}>{stats.paid}</Text>
              <Text style={styles.statLabel}>Paid</Text>
            </View>
            <View style={[styles.statCard, { borderTopColor: Colors.statusPTP }]}>
              <Text style={[styles.statNum, { color: Colors.statusPTP }]}>{stats.ptp}</Text>
              <Text style={styles.statLabel}>PTP</Text>
            </View>
            <View style={[styles.statCard, { borderTopColor: Colors.danger }]}>
              <Text style={[styles.statNum, { color: Colors.danger }]}>{stats.notProcess}</Text>
              <Text style={styles.statLabel}>Unpaid</Text>
            </View>
          </View>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs}>
          {TABS.map((tab) => (
            <Pressable
              key={tab}
              style={[styles.tabChip, activeTab === tab && { backgroundColor: tab === "All" ? Colors.primary : STATUS_COLORS[tab] }]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabChipText, activeTab === tab && { color: "#fff" }]}>{tab}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={styles.sectionTitle}>{filtered.length} Cases</Text>

        {filtered.map((c: any) => (
          <View key={c.id} style={styles.caseCard}>
            <View style={styles.caseHeader}>
              <Text style={styles.caseName} numberOfLines={1}>{c.customer_name}</Text>
              <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[c.status] || Colors.textMuted) + "22" }]}>
                <Text style={[styles.statusText, { color: STATUS_COLORS[c.status] || Colors.textSecondary }]}>{c.status}</Text>
              </View>
            </View>
            <Text style={styles.caseMeta}>BKT: {c.bkt} • Loan: {c.loan_no}</Text>
            <Text style={styles.caseMobile}>{c.mobile_no}</Text>
            {c.latest_feedback && (
              <Text style={styles.caseFeedback}>{c.latest_feedback}</Text>
            )}
            <Text style={styles.caseAmount}>EMI: ₹{parseFloat(c.emi_amount || 0).toFixed(2)}</Text>
          </View>
        ))}

        {filtered.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No {activeTab === "All" ? "" : activeTab} cases</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16 },
  agentHeader: {
    flexDirection: "row", gap: 16, alignItems: "center",
    backgroundColor: Colors.surface, borderRadius: 16, padding: 16,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  avatar: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.primary,
    alignItems: "center", justifyContent: "center",
  },
  agentInfo: { flex: 1, gap: 4 },
  agentName: { fontSize: 18, fontWeight: "800", color: Colors.text },
  agentEmpId: { fontSize: 13, color: Colors.textSecondary, fontWeight: "600" },
  agentPhone: { fontSize: 13, color: Colors.textMuted },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statCard: {
    flex: 1, minWidth: "18%", backgroundColor: Colors.surface, borderRadius: 12,
    padding: 12, alignItems: "center", gap: 4, borderTopWidth: 3,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  statNum: { fontSize: 22, fontWeight: "800", color: Colors.text },
  statLabel: { fontSize: 10, color: Colors.textSecondary, fontWeight: "600" },
  tabs: { marginBottom: 4 },
  tabChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: Colors.surface, marginRight: 8, borderWidth: 1, borderColor: Colors.border,
  },
  tabChipText: { fontSize: 13, fontWeight: "600", color: Colors.textSecondary },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: Colors.text },
  caseCard: {
    backgroundColor: Colors.surface, borderRadius: 14, padding: 14, gap: 6,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  caseHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  caseName: { flex: 1, fontSize: 14, fontWeight: "700", color: Colors.text, textTransform: "uppercase" },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginLeft: 8 },
  statusText: { fontSize: 11, fontWeight: "700" },
  caseMeta: { fontSize: 12, color: Colors.textSecondary },
  caseMobile: { fontSize: 12, color: Colors.textMuted },
  caseFeedback: { fontSize: 12, fontWeight: "600", color: Colors.textSecondary, fontStyle: "italic" },
  caseAmount: { fontSize: 14, fontWeight: "700", color: Colors.primary },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText: { fontSize: 16, color: Colors.textMuted },
});

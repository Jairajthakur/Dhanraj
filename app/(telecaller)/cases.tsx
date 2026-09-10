import React, { useState, useMemo } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput,
  ActivityIndicator, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";
import {
  countByStatus, StatBox, CaseCard, CaseDetailModal, StatusFilter,
} from "@/components/TelecallerShared";

type AgentSummary = {
  agentId: string;
  agentName: string;
  counts: ReturnType<typeof countByStatus>;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

// Priority color: which agent most needs attention right now, at a glance.
function priorityColor(counts: AgentSummary["counts"]): string {
  const paidPct = counts.total ? counts.Paid / counts.total : 0;
  if (paidPct >= 0.6) return Colors.statusPaid;
  if (counts.Unpaid > counts.PTP + counts.Paid) return Colors.statusUnpaid;
  return Colors.statusPTP;
}

function AgentDashboardCard({ agent, onPress }: { agent: AgentSummary; onPress: () => void }) {
  const { counts } = agent;
  const paidPct = counts.total ? Math.round((counts.Paid / counts.total) * 100) : 0;
  const accent = priorityColor(counts);

  return (
    <Pressable style={styles.agentCard} onPress={onPress}>
      <View style={[styles.agentAccentBar, { backgroundColor: accent }]} />
      <View style={styles.agentCardBody}>
        <View style={styles.agentCardTop}>
          <View style={[styles.agentAvatar, { backgroundColor: accent }]}>
            <Text style={styles.agentAvatarText}>{initials(agent.agentName)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.agentCardName} numberOfLines={1}>{agent.agentName}</Text>
            <Text style={styles.agentCardSub}>{counts.total} case{counts.total !== 1 ? "s" : ""} assigned</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
        </View>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${paidPct}%` }]} />
        </View>

        <View style={styles.agentCardStats}>
          <View style={styles.agentStatItem}>
            <Text style={[styles.agentStatNum, { color: Colors.statusUnpaid }]}>{counts.Unpaid}</Text>
            <Text style={styles.agentStatLabel}>Unpaid</Text>
          </View>
          <View style={styles.agentStatDivider} />
          <View style={styles.agentStatItem}>
            <Text style={[styles.agentStatNum, { color: Colors.statusPTP }]}>{counts.PTP}</Text>
            <Text style={styles.agentStatLabel}>PTP</Text>
          </View>
          <View style={styles.agentStatDivider} />
          <View style={styles.agentStatItem}>
            <Text style={[styles.agentStatNum, { color: Colors.statusPaid }]}>{counts.Paid}</Text>
            <Text style={styles.agentStatLabel}>Paid</Text>
          </View>
          <View style={styles.agentStatDivider} />
          <View style={styles.agentStatItem}>
            <Text style={styles.agentStatNum}>{paidPct}%</Text>
            <Text style={styles.agentStatLabel}>Recovered</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function todayLabel(): string {
  return new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
}


export default function TelecallerDashboardScreen() {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [selectedCase, setSelectedCase] = useState<any>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/telecaller/cases"],
    queryFn: () => api.telecaller.getCases(),
  });

  const { data: ptpQueueData } = useQuery({
    queryKey: ["/api/telecaller/ptp-queue"],
    queryFn: () => api.telecaller.getPtpQueue(),
  });
  const dueTomorrow: any[] = ptpQueueData?.dueTomorrow || [];
  const ptpDueTomorrowCount = dueTomorrow.length;

  const allCases: any[] = data?.cases || [];
  const overallCounts = useMemo(() => countByStatus(allCases), [allCases]);

  // Agent-wise summary cards for the default (no search) dashboard view.
  const agentSummaries = useMemo<AgentSummary[]>(() => {
    const order: string[] = [];
    const map = new Map<string, any[]>();
    for (const c of allCases) {
      const key = String(c.agent_id ?? c.agent_name ?? "unassigned");
      if (!map.has(key)) { map.set(key, []); order.push(key); }
      map.get(key)!.push(c);
    }
    return order.map((key) => {
      const cases = map.get(key)!;
      return {
        agentId: key,
        agentName: cases[0]?.agent_name || "Unassigned",
        counts: countByStatus(cases),
      };
    });
  }, [allCases]);

  // When searching, show matching cases directly (across all agents) instead of the agent list.
  const searchResults = useMemo(() => {
    if (!search) return [];
    const q = search.toLowerCase();
    return allCases.filter((c: any) =>
      c.customer_name?.toLowerCase().includes(q) ||
      c.loan_no?.toLowerCase().includes(q) ||
      c.app_id?.toLowerCase().includes(q) ||
      c.registration_no?.toLowerCase().includes(q) ||
      c.agent_name?.toLowerCase().includes(q)
    );
  }, [allCases, search]);

  const goToAgent = (agent: AgentSummary) => {
    router.push({
      pathname: "/(telecaller)/agent/[id]",
      params: { id: agent.agentId, name: agent.agentName },
    });
  };

  const isSearching = !!search;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={[styles.greetingRow, { marginTop: insets.top + (Platform.OS === "web" ? 55 : 8) }]}>
        <Text style={styles.greetingTitle}>{search ? "Search" : "Today's Follow-ups"}</Text>
        <Text style={styles.greetingSub}>{todayLabel()}</Text>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={Colors.textMuted} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search name, loan no, app id, reg no, agent..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <Pressable onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.statsRow}>
        <StatBox label="Total" count={overallCounts.total} color={Colors.primary} active={false} />
        <StatBox label="Unpaid" count={overallCounts.Unpaid} color={Colors.statusUnpaid} active={false} />
        <StatBox label="PTP" count={overallCounts.PTP} color={Colors.statusPTP} active={false} />
        <StatBox label="Paid" count={overallCounts.Paid} color={Colors.statusPaid} active={false} />
      </View>

      {ptpDueTomorrowCount > 0 && (
        <Pressable style={styles.ptpBannerTomorrow} onPress={() => router.push("/(telecaller)/ptp-queue")}>
          <Ionicons name="logo-whatsapp" size={22} color="#fff" />
          <Text style={styles.ptpBannerText}>
            {`${ptpDueTomorrowCount} PTP${ptpDueTomorrowCount !== 1 ? "s" : ""} due tomorrow — tap to send WhatsApp reminders agent-wise`}
          </Text>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.8)" />
        </Pressable>
      )}

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : isSearching ? (
        <FlatList
          data={searchResults}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <CaseCard item={item} onDetails={setSelectedCase} />}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + 24 },
            searchResults.length === 0 && { flex: 1 },
          ]}
          ListHeaderComponent={
            <Text style={styles.countText}>
              {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} for "{search}"
            </Text>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="search-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No matching cases found</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={agentSummaries}
          keyExtractor={(item) => item.agentId}
          renderItem={({ item }) => (
            <AgentDashboardCard agent={item} onPress={() => goToAgent(item)} />
          )}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + 24 },
            agentSummaries.length === 0 && { flex: 1 },
          ]}
          ListHeaderComponent={
            <Text style={styles.countText}>
              {overallCounts.total} case{overallCounts.total !== 1 ? "s" : ""} across {agentSummaries.length} agent{agentSummaries.length !== 1 ? "s" : ""}
            </Text>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No allocations found</Text>
            </View>
          }
        />
      )}

      <CaseDetailModal item={selectedCase} onClose={() => setSelectedCase(null)} onUpdated={refetch} />
    </View>
  );
}

const styles = StyleSheet.create({
  greetingRow: { paddingHorizontal: 16, marginBottom: 10 },
  greetingTitle: { fontSize: 22, fontWeight: "800", color: Colors.text },
  greetingSub: { fontSize: 13, color: Colors.textMuted, marginTop: 2, fontWeight: "500" },
  searchContainer: {
    flexDirection: "row", alignItems: "center", marginHorizontal: 12, marginBottom: 12,
    backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.text },
  statsRow: { flexDirection: "row", gap: 8, paddingHorizontal: 12, marginBottom: 4 },
  ptpBanner: {
    flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 12, marginTop: 10,
    backgroundColor: Colors.danger, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 13,
    shadowColor: Colors.danger, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 3,
  },
  ptpBannerText: { flex: 1, color: "#fff", fontSize: 13, fontWeight: "700" },
  ptpBannerTomorrow: {
    flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 12, marginTop: 10,
    backgroundColor: Colors.warning, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 13,
    shadowColor: Colors.warning, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 3,
  },
  list: { padding: 12, gap: 12 },
  countText: { fontSize: 13, color: Colors.textSecondary, fontWeight: "600", marginBottom: 4 },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText: { fontSize: 16, color: Colors.textMuted },

  agentCard: {
    flexDirection: "row", backgroundColor: "#fff", borderRadius: 18, overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 10, elevation: 2,
  },
  agentAccentBar: { width: 5 },
  agentCardBody: { flex: 1, padding: 14, gap: 12 },
  agentCardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  agentAvatar: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: "center", justifyContent: "center",
  },
  agentAvatarText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  agentCardName: { fontSize: 15, fontWeight: "800", color: Colors.text },
  agentCardSub: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
  progressTrack: { height: 7, borderRadius: 4, backgroundColor: Colors.surfaceAlt, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 4, backgroundColor: Colors.statusPaid },
  agentCardStats: { flexDirection: "row", alignItems: "center" },
  agentStatItem: { flex: 1, alignItems: "center", gap: 2 },
  agentStatNum: { fontSize: 15, fontWeight: "800", color: Colors.text },
  agentStatLabel: { fontSize: 10, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase" },
  agentStatDivider: { width: 1, height: 24, backgroundColor: Colors.border },
});

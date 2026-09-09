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

function AgentDashboardCard({ agent, onPress }: { agent: AgentSummary; onPress: () => void }) {
  const { counts } = agent;
  const paidPct = counts.total ? Math.round((counts.Paid / counts.total) * 100) : 0;

  return (
    <Pressable style={styles.agentCard} onPress={onPress}>
      <View style={styles.agentCardTop}>
        <View style={styles.agentAvatar}>
          <Ionicons name="person" size={20} color="#fff" />
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
    </Pressable>
  );
}

export default function TelecallerDashboardScreen() {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [selectedCase, setSelectedCase] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/telecaller/cases"],
    queryFn: () => api.telecaller.getCases(),
  });

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
      <View style={[styles.searchContainer, { marginTop: Platform.OS === "web" ? 67 : 12 }]}>
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

      <CaseDetailModal item={selectedCase} onClose={() => setSelectedCase(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  searchContainer: {
    flexDirection: "row", alignItems: "center", margin: 12,
    backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.text },
  statsRow: { flexDirection: "row", gap: 8, paddingHorizontal: 12, marginBottom: 4 },
  list: { padding: 12, gap: 12 },
  countText: { fontSize: 13, color: Colors.textSecondary, fontWeight: "600", marginBottom: 4 },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText: { fontSize: 16, color: Colors.textMuted },

  agentCard: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 14, gap: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  agentCardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  agentAvatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary,
    alignItems: "center", justifyContent: "center",
  },
  agentCardName: { fontSize: 15, fontWeight: "800", color: Colors.text },
  agentCardSub: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: Colors.surfaceAlt, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3, backgroundColor: Colors.statusPaid },
  agentCardStats: { flexDirection: "row", alignItems: "center" },
  agentStatItem: { flex: 1, alignItems: "center", gap: 2 },
  agentStatNum: { fontSize: 15, fontWeight: "800", color: Colors.text },
  agentStatLabel: { fontSize: 10, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase" },
  agentStatDivider: { width: 1, height: 24, backgroundColor: Colors.border },
});

import React, { useMemo, useState } from "react";
import {
  View, Text, StyleSheet, SectionList, Pressable, TextInput,
  ActivityIndicator, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";
import {
  countByStatus, StatBox, CaseCard, CaseDetailModal, StatusFilter,
} from "@/components/TelecallerShared";

const SECTION_ORDER: { key: "Unpaid" | "PTP" | "Paid"; title: string }[] = [
  { key: "Unpaid", title: "Unpaid Cases" },
  { key: "PTP", title: "PTP Cases" },
  { key: "Paid", title: "Paid Cases" },
];

export default function TelecallerAgentDetailScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [selectedCase, setSelectedCase] = useState<any>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/telecaller/cases"],
    queryFn: () => api.telecaller.getCases(),
  });

  const allCases: any[] = data?.cases || [];

  const agentCases = useMemo(() => {
    return allCases.filter((c: any) => String(c.agent_id ?? c.agent_name ?? "unassigned") === String(id));
  }, [allCases, id]);

  const agentName = name || agentCases[0]?.agent_name || "Agent";
  const counts = useMemo(() => countByStatus(agentCases), [agentCases]);

  const searched = useMemo(() => {
    if (!search) return agentCases;
    const q = search.toLowerCase();
    return agentCases.filter((c: any) =>
      c.customer_name?.toLowerCase().includes(q) ||
      c.loan_no?.toLowerCase().includes(q) ||
      c.app_id?.toLowerCase().includes(q) ||
      c.registration_no?.toLowerCase().includes(q)
    );
  }, [agentCases, search]);

  const sections = useMemo(() => {
    const bySection = SECTION_ORDER
      .filter((s) => statusFilter === "All" || statusFilter === s.key)
      .map((s) => ({
        title: s.title,
        key: s.key,
        data: searched.filter((c: any) => c.status === s.key),
      }))
      .filter((s) => s.data.length > 0);
    return bySection;
  }, [searched, statusFilter]);

  const toggleStatusFilter = (status: StatusFilter) => {
    setStatusFilter((prev) => (prev === status ? "All" : status));
  };

  const paidPct = counts.total ? Math.round((counts.Paid / counts.total) * 100) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={[styles.header, { paddingTop: insets.top + (Platform.OS === "web" ? 20 : 8) }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>
        <View style={styles.headerAvatar}>
          <Ionicons name="person" size={18} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerName} numberOfLines={1}>{agentName}</Text>
          <Text style={styles.headerSub}>{counts.total} case{counts.total !== 1 ? "s" : ""} · {paidPct}% recovered</Text>
        </View>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${paidPct}%` }]} />
      </View>

      <View style={styles.statsRow}>
        <StatBox label="Total" count={counts.total} color={Colors.primary}
          active={statusFilter === "All"} onPress={() => setStatusFilter("All")} />
        <StatBox label="Unpaid" count={counts.Unpaid} color={Colors.statusUnpaid}
          active={statusFilter === "Unpaid"} onPress={() => toggleStatusFilter("Unpaid")} />
        <StatBox label="PTP" count={counts.PTP} color={Colors.statusPTP}
          active={statusFilter === "PTP"} onPress={() => toggleStatusFilter("PTP")} />
        <StatBox label="Paid" count={counts.Paid} color={Colors.statusPaid}
          active={statusFilter === "Paid"} onPress={() => toggleStatusFilter("Paid")} />
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={Colors.textMuted} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search name, loan no, app id, reg no..."
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

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <CaseCard item={item} onDetails={setSelectedCase} />}
          renderSectionHeader={({ section }) => (
            <View style={[styles.sectionHeader, { backgroundColor: sectionColor(section.key as any) + "18" }]}>
              <Text style={[styles.sectionHeaderText, { color: sectionColor(section.key as any) }]}>
                {section.title} ({section.data.length})
              </Text>
            </View>
          )}
          stickySectionHeadersEnabled
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + 24 },
            searched.length === 0 && { flex: 1 },
          ]}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No cases found</Text>
            </View>
          }
          scrollEnabled={!!searched.length}
        />
      )}

      <CaseDetailModal item={selectedCase} onClose={() => setSelectedCase(null)} onUpdated={refetch} />
    </View>
  );
}

function sectionColor(key: "Unpaid" | "PTP" | "Paid") {
  if (key === "Unpaid") return Colors.statusUnpaid;
  if (key === "PTP") return Colors.statusPTP;
  return Colors.statusPaid;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 12, paddingBottom: 12, backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 4 },
  headerAvatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primary,
    alignItems: "center", justifyContent: "center",
  },
  headerName: { fontSize: 16, fontWeight: "800", color: Colors.text },
  headerSub: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
  progressTrack: { height: 4, backgroundColor: Colors.surfaceAlt },
  progressFill: { height: "100%", backgroundColor: Colors.statusPaid },
  statsRow: { flexDirection: "row", gap: 8, paddingHorizontal: 12, marginTop: 12, marginBottom: 4 },
  searchContainer: {
    flexDirection: "row", alignItems: "center", margin: 12, marginTop: 10,
    backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.text },
  list: { padding: 12, paddingTop: 0, gap: 12 },
  sectionHeader: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginBottom: 10, marginTop: 2,
  },
  sectionHeaderText: { fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText: { fontSize: 16, color: Colors.textMuted },
});

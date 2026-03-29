import React, { useState, useMemo } from "react";
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Alert, Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";
import { Platform } from "react-native";

const STATUS_COLORS: Record<string, string> = {
  Unpaid: Colors.statusUnpaid,
  PTP:    Colors.statusPTP,
  Paid:   Colors.statusPaid,
};

const TABS = ["All", "Unpaid", "PTP", "Paid"];

// ── Inline status action bar ───────────────────────────────────────────────
function StatusActionBar({ item, onUpdated }: { item: any; onUpdated: () => void }) {
  const [loading, setLoading] = useState<string | null>(null);
  const tableType = item.case_type === "bkt" ? "bkt" : "loan";

  const handleStatus = async (status: "Paid" | "Unpaid", rollback_yn?: boolean) => {
    const key = status + (rollback_yn !== undefined ? "_rb" : "");
    setLoading(key);
    try {
      await api.admin.updateCaseStatus(item.id, { status, rollback_yn: rollback_yn ?? null, table: tableType });
      onUpdated();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(null);
    }
  };

  const isPaid     = item.status === "Paid";
  const isRollback = item.rollback_yn === true;

  return (
    <View style={actionStyles.bar}>
      <Pressable
        style={[actionStyles.btn, isPaid ? actionStyles.btnActivePaid : actionStyles.btnInactive, loading === "Paid" && { opacity: 0.6 }]}
        onPress={() => handleStatus(isPaid ? "Unpaid" : "Paid")}
        disabled={!!loading}
      >
        {loading === "Paid" ? <ActivityIndicator size="small" color="#fff" /> : (
          <>
            <Ionicons name={isPaid ? "checkmark-circle" : "checkmark-circle-outline"} size={14} color={isPaid ? "#fff" : Colors.success} />
            <Text style={[actionStyles.btnText, isPaid && { color: "#fff" }]}>{isPaid ? "Paid ✓" : "Mark Paid"}</Text>
          </>
        )}
      </Pressable>

      {isPaid && (
        <Pressable
          style={[actionStyles.btn, actionStyles.btnUnpaid, loading === "Unpaid" && { opacity: 0.6 }]}
          onPress={() => handleStatus("Unpaid")}
          disabled={!!loading}
        >
          {loading === "Unpaid" ? <ActivityIndicator size="small" color="#fff" /> : (
            <>
              <Ionicons name="close-circle-outline" size={14} color="#fff" />
              <Text style={[actionStyles.btnText, { color: "#fff" }]}>Unpaid</Text>
            </>
          )}
        </Pressable>
      )}

      <Pressable
        style={[actionStyles.btn, isRollback ? actionStyles.btnActiveRollback : actionStyles.btnInactive, loading === "Paid_rb" && { opacity: 0.6 }]}
        onPress={() => handleStatus(isPaid ? "Paid" : "Unpaid", !isRollback)}
        disabled={!!loading}
      >
        {loading === "Paid_rb" ? <ActivityIndicator size="small" color="#fff" /> : (
          <>
            <Ionicons name={isRollback ? "refresh-circle" : "refresh-circle-outline"} size={14} color={isRollback ? "#fff" : Colors.info} />
            <Text style={[actionStyles.btnText, isRollback && { color: "#fff" }]}>{isRollback ? "Rollback ✓" : "Rollback"}</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────
export default function AgentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets  = useSafeAreaInsets();
  const qc      = useQueryClient();
  const [activeTab, setActiveTab] = useState("All");

  const { data: agentsData } = useQuery({
    queryKey: ["/api/admin/agents"],
    queryFn:  () => api.admin.getAgents(),
  });

  // ── KEY FIX: was getAgentCases (doesn't exist) → now getCasesByAgent ──
  const { data: casesData, isLoading } = useQuery({
    queryKey: ["/api/admin/cases/agent", id],
    queryFn:  () => api.admin.getCasesByAgent(Number(id)),
    enabled:  !!id,
    refetchInterval: 20000,
  });

  const { data: statsData } = useQuery({
    queryKey: ["/api/admin/agent/stats", id],
    queryFn:  () => api.admin.getAgentStats(Number(id)),
    enabled:  !!id,
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["/api/admin/cases/agent", id] });
    qc.invalidateQueries({ queryKey: ["/api/admin/agent/stats", id] });
    qc.invalidateQueries({ queryKey: ["/api/admin/cases"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/stats"] });
  };

  const agent  = agentsData?.agents?.find((a: any) => String(a.id) === id);
  const cases: any[] = casesData?.cases || [];

  // Derive live stats from fetched cases; fall back to statsData
  const stats = useMemo(() => ({
    total:  cases.length   || statsData?.total      || 0,
    paid:   cases.filter((c: any) => c.status === "Paid").length   || statsData?.paid   || 0,
    ptp:    cases.filter((c: any) => c.status === "PTP").length    || statsData?.ptp    || 0,
    unpaid: cases.filter((c: any) => c.status !== "Paid" && c.status !== "PTP").length || statsData?.notProcess || 0,
  }), [cases, statsData]);

  const filtered = useMemo(() =>
    activeTab === "All" ? cases : cases.filter((c: any) => c.status === activeTab),
    [cases, activeTab]
  );

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background }}>
        <ActivityIndicator color={Colors.primary} size="large" />
        <Text style={{ color: Colors.textMuted, marginTop: 12, fontSize: 13 }}>Loading cases…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingBottom: insets.bottom + 24, paddingTop: Platform.OS === "web" ? 67 : 0 },
        ]}
      >
        {/* ── Agent header ── */}
        <View style={styles.agentHeader}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={32} color="#fff" />
          </View>
          <View style={styles.agentInfo}>
            <Text style={styles.agentName}>{agent?.name ?? `Agent #${id}`}</Text>
            {agent?.phone && <Text style={styles.agentPhone}>{agent.phone}</Text>}
          </View>
        </View>

        {/* ── Stats ── */}
        <View style={styles.statsGrid}>
          {[
            { label: "Total",  value: stats.total,  color: Colors.info       },
            { label: "Paid",   value: stats.paid,   color: Colors.success    },
            { label: "PTP",    value: stats.ptp,    color: Colors.statusPTP  },
            { label: "Unpaid", value: stats.unpaid, color: Colors.danger     },
          ].map((s) => (
            <View key={s.label} style={[styles.statCard, { borderTopColor: s.color }]}>
              <Text style={[styles.statNum, { color: s.color }]}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Tabs ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs}>
          {TABS.map((tab) => (
            <Pressable
              key={tab}
              style={[
                styles.tabChip,
                activeTab === tab && { backgroundColor: tab === "All" ? Colors.primary : STATUS_COLORS[tab], borderColor: "transparent" },
              ]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabChipText, activeTab === tab && { color: "#fff" }]}>{tab}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={styles.sectionTitle}>{filtered.length} Case{filtered.length !== 1 ? "s" : ""}</Text>

        {/* ── Case cards ── */}
        {filtered.map((c: any) => {
          const statusColor = STATUS_COLORS[c.status] || Colors.textMuted;
          return (
            <View key={`${c.case_type}-${c.id}`} style={styles.caseCard}>
              <View style={styles.caseHeader}>
                <Text style={styles.caseName} numberOfLines={1}>{c.customer_name}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  {c.case_type && (
                    <View style={[styles.typeBadge, { backgroundColor: Colors.accent + "22" }]}>
                      <Text style={[styles.typeText, { color: Colors.accent }]}>{c.case_type.toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={[styles.statusBadge, { backgroundColor: statusColor + "22" }]}>
                    <Text style={[styles.statusText, { color: statusColor }]}>{c.status}</Text>
                  </View>
                </View>
              </View>

              {/* Tags row */}
              <View style={styles.tagRow}>
                {c.loan_no && (
                  <View style={styles.tag}>
                    <Text style={styles.tagLabel}>LOAN</Text>
                    <Text style={styles.tagValue}>{c.loan_no}</Text>
                  </View>
                )}
                {c.bkt != null && (
                  <View style={[styles.tag, { backgroundColor: Colors.primary + "15" }]}>
                    <Text style={styles.tagLabel}>BKT</Text>
                    <Text style={[styles.tagValue, { color: Colors.primary }]}>{c.bkt}</Text>
                  </View>
                )}
                {c.pos && (
                  <View style={[styles.tag, { backgroundColor: Colors.info + "15" }]}>
                    <Text style={styles.tagLabel}>POS</Text>
                    <Text style={[styles.tagValue, { color: Colors.info }]}>
                      ₹{parseFloat(c.pos).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </Text>
                  </View>
                )}
              </View>

              {c.mobile_no && (
                <Pressable
                  style={styles.phoneRow}
                  onPress={() => Linking.openURL(`tel:${c.mobile_no.split(",")[0].trim()}`)}
                >
                  <Ionicons name="call-outline" size={13} color={Colors.info} />
                  <Text style={styles.caseMobile}>{c.mobile_no}</Text>
                </Pressable>
              )}

              {(c.feedback_code || c.latest_feedback) && (
                <View style={styles.feedbackRow}>
                  {c.feedback_code && (
                    <View style={styles.feedbackCodeBadge}>
                      <Text style={styles.feedbackCodeText}>{c.feedback_code}</Text>
                    </View>
                  )}
                  {c.latest_feedback && (
                    <Text style={styles.caseFeedback} numberOfLines={1}>{c.latest_feedback}</Text>
                  )}
                </View>
              )}

              <StatusActionBar item={c} onUpdated={invalidateAll} />
            </View>
          );
        })}

        {filtered.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>
              {cases.length === 0
                ? "No cases assigned to this agent"
                : `No ${activeTab === "All" ? "" : activeTab} cases`}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const actionStyles = StyleSheet.create({
  bar:               { flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" },
  btn:               { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: Colors.border },
  btnText:           { fontSize: 11, fontWeight: "700", color: Colors.text },
  btnInactive:       { backgroundColor: Colors.surfaceAlt, borderColor: Colors.border },
  btnActivePaid:     { backgroundColor: Colors.success, borderColor: Colors.success },
  btnUnpaid:         { backgroundColor: Colors.danger,  borderColor: Colors.danger  },
  btnActiveRollback: { backgroundColor: Colors.info,    borderColor: Colors.info    },
});

const styles = StyleSheet.create({
  container:    { padding: 16, gap: 16 },
  agentHeader:  { flexDirection: "row", gap: 16, alignItems: "center", backgroundColor: Colors.surface, borderRadius: 16, padding: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  avatar:       { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  agentInfo:    { flex: 1, gap: 4 },
  agentName:    { fontSize: 18, fontWeight: "800", color: Colors.text },
  agentPhone:   { fontSize: 13, color: Colors.textMuted },
  statsGrid:    { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statCard:     { flex: 1, minWidth: "18%", backgroundColor: Colors.surface, borderRadius: 12, padding: 12, alignItems: "center", gap: 4, borderTopWidth: 3, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  statNum:      { fontSize: 22, fontWeight: "800", color: Colors.text },
  statLabel:    { fontSize: 10, color: Colors.textSecondary, fontWeight: "600" },
  tabs:         { marginBottom: 4 },
  tabChip:      { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.surface, marginRight: 8, borderWidth: 1, borderColor: Colors.border },
  tabChipText:  { fontSize: 13, fontWeight: "600", color: Colors.textSecondary },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: Colors.textSecondary },
  caseCard:     { backgroundColor: Colors.surface, borderRadius: 14, padding: 14, gap: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border },
  caseHeader:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  caseName:     { flex: 1, fontSize: 13, fontWeight: "800", color: Colors.text, textTransform: "uppercase", marginRight: 8 },
  statusBadge:  { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText:   { fontSize: 10, fontWeight: "700" },
  typeBadge:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  typeText:     { fontSize: 9, fontWeight: "800" },
  tagRow:       { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag:          { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.surfaceAlt, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  tagLabel:     { fontSize: 9, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase" },
  tagValue:     { fontSize: 11, fontWeight: "700", color: Colors.text },
  phoneRow:     { flexDirection: "row", alignItems: "center", gap: 6 },
  caseMobile:   { fontSize: 12, color: Colors.info, textDecorationLine: "underline" },
  feedbackRow:       { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  feedbackCodeBadge: { backgroundColor: Colors.accent + "20", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  feedbackCodeText:  { fontSize: 11, fontWeight: "700", color: Colors.accent },
  caseFeedback:      { flex: 1, fontSize: 11, color: Colors.textSecondary, fontStyle: "italic" },
  empty:        { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText:    { fontSize: 15, color: Colors.textMuted, textAlign: "center" },
});

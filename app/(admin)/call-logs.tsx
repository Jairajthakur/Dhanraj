import React, { useState, useMemo } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  ActivityIndicator, TextInput, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDateTime(v: any) {
  if (!v) return "—";
  const d = new Date(v);
  const date = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${date}  ${time}`;
}

function fmtDate(v: any) {
  return v ? String(v).slice(0, 10) : "";
}

const OUTCOME_COLOR: Record<string, string> = {
  "Call Connected - Will Pay":      Colors.success,
  "Call Connected - PTP Set":       Colors.statusPTP ?? "#7C3AED",
  "Call Connected - Refused to Pay": Colors.danger,
  "Call Connected - Already Paid":  Colors.success,
  "Not Reachable":                  Colors.textMuted,
  "Switched Off":                   Colors.textMuted,
  "Call Back Later":                Colors.warning,
};

function outcomeColor(outcome: string | null) {
  if (!outcome) return Colors.textMuted;
  for (const key of Object.keys(OUTCOME_COLOR)) {
    if (outcome.includes(key.split(" - ")[1] ?? key)) return OUTCOME_COLOR[key];
  }
  return OUTCOME_COLOR[outcome] ?? Colors.info;
}

const STATUS_COLORS: Record<string, string> = {
  Unpaid: Colors.statusUnpaid,
  PTP:    Colors.statusPTP ?? "#7C3AED",
  Paid:   Colors.statusPaid,
};

// ─── Log Card ─────────────────────────────────────────────────────────────────
function LogCard({ log }: { log: any }) {
  const oc = outcomeColor(log.outcome);
  const sc = STATUS_COLORS[log.status] || Colors.textMuted;
  return (
    <View style={card.wrap}>
      {/* Header row */}
      <View style={card.header}>
        <View style={{ flex: 1 }}>
          <Text style={card.name} numberOfLines={1}>{log.customer_name ?? "—"}</Text>
          <Text style={card.loanNo}>{log.loan_no ?? "—"}</Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <View style={[card.typeBadge, { backgroundColor: log.case_type === "bkt" ? Colors.accent + "22" : Colors.info + "18" }]}>
            <Text style={[card.typeText, { color: log.case_type === "bkt" ? Colors.accent : Colors.info }]}>
              {log.case_type?.toUpperCase()}
            </Text>
          </View>
          <View style={[card.statusBadge, { backgroundColor: sc + "22" }]}>
            <Text style={[card.statusText, { color: sc }]}>{log.status}</Text>
          </View>
        </View>
      </View>

      {/* Outcome */}
      {log.outcome && (
        <View style={[card.outcomePill, { backgroundColor: oc + "18", borderColor: oc + "44" }]}>
          <View style={[card.outcomeDot, { backgroundColor: oc }]} />
          <Text style={[card.outcomeText, { color: oc }]}>{log.outcome}</Text>
        </View>
      )}

      {/* Comments */}
      {log.comments ? (
        <View style={card.commentRow}>
          <Ionicons name="chatbubble-outline" size={12} color={Colors.textMuted} />
          <Text style={card.commentText} numberOfLines={2}>{log.comments}</Text>
        </View>
      ) : null}

      {/* PTP date */}
      {log.ptp_date ? (
        <View style={card.ptpRow}>
          <Ionicons name="calendar-outline" size={12} color={Colors.statusPTP ?? "#7C3AED"} />
          <Text style={card.ptpText}>PTP: {fmtDate(log.ptp_date)}</Text>
        </View>
      ) : null}

      {/* Footer */}
      <View style={card.footer}>
        <View style={card.agentChip}>
          <Ionicons name="person-outline" size={11} color={Colors.primary} />
          <Text style={card.agentText} numberOfLines={1}>{log.agent_name ?? "—"}</Text>
        </View>
        <View style={card.timeChip}>
          <Ionicons name="time-outline" size={11} color={Colors.textMuted} />
          <Text style={card.timeText}>{fmtDateTime(log.logged_at)}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function CallLogsScreen() {
  const insets = useSafeAreaInsets();
  const [search, setSearch]         = useState("");
  const [agentFilter, setAgentFilter] = useState<string>("All");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("All");
  const [caseTypeFilter, setCaseTypeFilter] = useState<string>("All");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["/api/admin/call-logs"],
    queryFn: () => api.admin.getCallLogs(500),
    refetchInterval: 30000,
  });

  const logs: any[] = data?.logs ?? [];

  // ── Derived filter options ────────────────────────────────────────────────
  const agents = useMemo(() => {
    const names = Array.from(new Set(logs.map((l) => l.agent_name).filter(Boolean))).sort();
    return ["All", ...names];
  }, [logs]);

  const outcomes = useMemo(() => {
    const vals = Array.from(new Set(logs.map((l) => l.outcome).filter(Boolean))).sort();
    return ["All", ...vals];
  }, [logs]);

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (agentFilter !== "All" && l.agent_name !== agentFilter) return false;
      if (outcomeFilter !== "All" && l.outcome !== outcomeFilter) return false;
      if (caseTypeFilter !== "All" && l.case_type !== caseTypeFilter.toLowerCase()) return false;
      if (q) {
        const hay = `${l.customer_name ?? ""} ${l.loan_no ?? ""} ${l.agent_name ?? ""} ${l.outcome ?? ""} ${l.comments ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [logs, search, agentFilter, outcomeFilter, caseTypeFilter]);

  // ── Stats bar ─────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:     filtered.length,
    connected: filtered.filter((l) => l.outcome?.includes("Call Connected")).length,
    ptp:       filtered.filter((l) => l.status === "PTP").length,
    paid:      filtered.filter((l) => l.status === "Paid").length,
  }), [filtered]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background }}>
        <ActivityIndicator color={Colors.primary} size="large" />
        <Text style={{ color: Colors.textMuted, marginTop: 12, fontSize: 13 }}>Loading call logs…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView
        contentContainerStyle={[s.container, { paddingBottom: insets.bottom + 32, paddingTop: Platform.OS === "web" ? 67 : 0 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Search */}
        <View style={s.searchRow}>
          <View style={s.searchBox}>
            <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
            <TextInput
              style={s.searchInput}
              placeholder="Search customer, loan, agent…"
              placeholderTextColor={Colors.textMuted}
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")}>
                <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
              </Pressable>
            )}
          </View>
          <Pressable style={[s.refreshBtn, isRefetching && { opacity: 0.5 }]} onPress={() => refetch()} disabled={isRefetching}>
            <Ionicons name="refresh-outline" size={18} color={Colors.primary} />
          </Pressable>
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          {[
            { label: "Total Calls", value: stats.total,     color: Colors.info    },
            { label: "Connected",   value: stats.connected, color: Colors.success  },
            { label: "PTP Set",     value: stats.ptp,       color: Colors.statusPTP ?? "#7C3AED" },
            { label: "Paid",        value: stats.paid,      color: Colors.statusPaid },
          ].map((s2) => (
            <View key={s2.label} style={[s.statCard, { borderTopColor: s2.color }]}>
              <Text style={[s.statNum, { color: s2.color }]}>{s2.value}</Text>
              <Text style={s.statLabel}>{s2.label}</Text>
            </View>
          ))}
        </View>

        {/* Case type filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRow}>
          {["All", "Loan", "BKT"].map((t) => (
            <Pressable
              key={t}
              style={[s.chip, caseTypeFilter === t && { backgroundColor: Colors.primary, borderColor: Colors.primary }]}
              onPress={() => setCaseTypeFilter(t)}
            >
              <Text style={[s.chipText, caseTypeFilter === t && { color: "#fff" }]}>{t}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Agent filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRow}>
          {agents.map((a) => (
            <Pressable
              key={a}
              style={[s.chip, s.agentChipStyle, agentFilter === a && { backgroundColor: Colors.primary, borderColor: Colors.primary }]}
              onPress={() => setAgentFilter(a)}
            >
              <Ionicons name="person-outline" size={11} color={agentFilter === a ? "#fff" : Colors.primary} />
              <Text style={[s.chipText, agentFilter === a && { color: "#fff" }]} numberOfLines={1}>{a}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Outcome filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRow}>
          {outcomes.map((o) => {
            const oc = o === "All" ? Colors.primary : outcomeColor(o);
            const active = outcomeFilter === o;
            return (
              <Pressable
                key={o}
                style={[s.chip, { borderColor: oc + "88", backgroundColor: active ? oc : oc + "18" }]}
                onPress={() => setOutcomeFilter(o)}
              >
                <Text style={[s.chipText, { color: active ? "#fff" : oc }]} numberOfLines={1}>{o}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Results heading */}
        <Text style={s.sectionTitle}>
          {filtered.length} Call Log{filtered.length !== 1 ? "s" : ""}
          {agentFilter !== "All" ? ` · ${agentFilter}` : ""}
          {caseTypeFilter !== "All" ? ` · ${caseTypeFilter}` : ""}
        </Text>

        {/* Log cards */}
        {filtered.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="call-outline" size={48} color={Colors.textMuted} />
            <Text style={s.emptyText}>
              {logs.length === 0
                ? "No call logs yet.\nCall logs will appear here after agents log calls."
                : "No call logs match your filters."}
            </Text>
          </View>
        ) : (
          filtered.map((log) => <LogCard key={log.id} log={log} />)
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:    { padding: 16, gap: 12 },
  searchRow:    { flexDirection: "row", gap: 8, alignItems: "center" },
  searchBox:    { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 10 },
  searchInput:  { flex: 1, fontSize: 14, color: Colors.text },
  refreshBtn:   { width: 42, height: 42, borderRadius: 12, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center" },
  statsRow:     { flexDirection: "row", gap: 8 },
  statCard:     { flex: 1, backgroundColor: Colors.surface, borderRadius: 12, padding: 10, alignItems: "center", gap: 3, borderTopWidth: 3, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  statNum:      { fontSize: 20, fontWeight: "800" },
  statLabel:    { fontSize: 9, color: Colors.textSecondary, fontWeight: "600", textAlign: "center" },
  filterRow:    { marginBottom: 0 },
  chip:         { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, marginRight: 8 },
  chipText:     { fontSize: 12, fontWeight: "600", color: Colors.textSecondary },
  agentChipStyle: { backgroundColor: Colors.primary + "12", borderColor: Colors.primary + "44" },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: Colors.textSecondary },
  empty:        { paddingVertical: 60, alignItems: "center", gap: 14 },
  emptyText:    { fontSize: 14, color: Colors.textMuted, textAlign: "center", lineHeight: 22 },
});

const card = StyleSheet.create({
  wrap:         { backgroundColor: Colors.surface, borderRadius: 14, padding: 14, gap: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  header:       { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  name:         { fontSize: 13, fontWeight: "800", color: Colors.text, textTransform: "uppercase" },
  loanNo:       { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  typeBadge:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  typeText:     { fontSize: 9, fontWeight: "800" },
  statusBadge:  { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusText:   { fontSize: 10, fontWeight: "700" },
  outcomePill:  { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1 },
  outcomeDot:   { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  outcomeText:  { fontSize: 12, fontWeight: "700", flex: 1 },
  commentRow:   { flexDirection: "row", gap: 6, alignItems: "flex-start" },
  commentText:  { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 17, fontStyle: "italic" },
  ptpRow:       { flexDirection: "row", gap: 6, alignItems: "center" },
  ptpText:      { fontSize: 12, fontWeight: "600", color: Colors.statusPTP ?? "#7C3AED" },
  footer:       { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border, marginTop: 2 },
  agentChip:    { flexDirection: "row", alignItems: "center", gap: 4 },
  agentText:    { fontSize: 11, fontWeight: "700", color: Colors.primary },
  timeChip:     { flexDirection: "row", alignItems: "center", gap: 4 },
  timeText:     { fontSize: 10, color: Colors.textMuted },
});

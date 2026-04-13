import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────
interface FieldVisit {
  id: number;
  case_id: string;
  customer_name: string;
  latitude: number;
  longitude: number;
  address: string | null;
  outcome: "Contacted" | "Not Home" | "Partial Payment" | "Paid" | "Refused";
  notes: string;
  visited_at: string;
  agent_name: string;
}

const OUTCOMES = ["All", "Paid", "Partial Payment", "Contacted", "Not Home", "Refused"] as const;
type Filter = (typeof OUTCOMES)[number];

const OUTCOME_COLOR: Record<string, string> = {
  "Paid":            Colors.success,
  "Partial Payment": Colors.info,
  "Contacted":       Colors.primary,
  "Not Home":        Colors.warning ?? "#F59E0B",
  "Refused":         Colors.danger,
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

// ─── Agent Summary Row ────────────────────────────────────────────────────────
function AgentRow({ name, visits }: { name: string; visits: FieldVisit[] }) {
  const collected = visits.filter((v) => v.outcome === "Paid" || v.outcome === "Partial Payment").length;
  const today = new Date().toDateString();
  const todayCount = visits.filter((v) => new Date(v.visited_at).toDateString() === today).length;

  return (
    <View style={ar.wrap}>
      <View style={ar.avatar}>
        <Text style={ar.initials}>{name.slice(0, 2).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={ar.name}>{name}</Text>
        <Text style={ar.sub}>{todayCount} today · {visits.length} total</Text>
      </View>
      <View style={ar.badge}>
        <Ionicons name="checkmark-circle" size={12} color={Colors.success} />
        <Text style={ar.badgeText}>{collected} collected</Text>
      </View>
    </View>
  );
}

const ar = StyleSheet.create({
  wrap:       { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border },
  avatar:     { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.primary + "20", alignItems: "center", justifyContent: "center" },
  initials:   { fontSize: 13, fontWeight: "800", color: Colors.primary },
  name:       { fontSize: 14, fontWeight: "700", color: Colors.text },
  sub:        { fontSize: 11, color: Colors.textMuted },
  badge:      { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.success + "15", borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText:  { fontSize: 11, fontWeight: "700", color: Colors.success },
});

// ─── Visit List Row ───────────────────────────────────────────────────────────
function VisitRow({ visit }: { visit: FieldVisit }) {
  const color = OUTCOME_COLOR[visit.outcome] ?? Colors.textMuted;

  const openMaps = () => {
    const url = Platform.select({
      ios:     `maps://app?ll=${visit.latitude},${visit.longitude}`,
      android: `geo:${visit.latitude},${visit.longitude}?q=${visit.latitude},${visit.longitude}`,
      default: `https://www.google.com/maps?q=${visit.latitude},${visit.longitude}`,
    });
    Linking.openURL(url!);
  };

  return (
    <View style={vr.wrap}>
      <View style={[vr.dot, { backgroundColor: color }]} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={vr.topRow}>
          <Text style={vr.caseId}>{visit.case_id}</Text>
          <View style={[vr.chip, { backgroundColor: color + "20" }]}>
            <Text style={[vr.chipText, { color }]}>{visit.outcome}</Text>
          </View>
        </View>
        <Text style={vr.customer}>{visit.customer_name}</Text>
        <Pressable style={vr.locRow} onPress={openMaps}>
          <Ionicons name="location-outline" size={12} color={Colors.textMuted} />
          <Text style={vr.locText} numberOfLines={1}>
            {visit.address ?? `${visit.latitude.toFixed(4)}, ${visit.longitude.toFixed(4)}`}
          </Text>
          <Ionicons name="open-outline" size={11} color={Colors.primary} />
        </Pressable>
        <View style={vr.footer}>
          <Text style={vr.agent}>{visit.agent_name}</Text>
          <Text style={vr.time}>{fmtDate(visit.visited_at)} · {fmtTime(visit.visited_at)}</Text>
        </View>
      </View>
    </View>
  );
}

const vr = StyleSheet.create({
  wrap:     { flexDirection: "row", gap: 12, backgroundColor: Colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.border },
  dot:      { width: 10, height: 10, borderRadius: 5, marginTop: 4, flexShrink: 0 },
  topRow:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  caseId:   { fontSize: 11, fontWeight: "700", color: Colors.primary, textTransform: "uppercase", letterSpacing: 0.5 },
  chip:     { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  chipText: { fontSize: 10, fontWeight: "700" },
  customer: { fontSize: 14, fontWeight: "700", color: Colors.text },
  locRow:   { flexDirection: "row", alignItems: "center", gap: 5 },
  locText:  { flex: 1, fontSize: 11, color: Colors.textMuted },
  footer:   { flexDirection: "row", justifyContent: "space-between" },
  agent:    { fontSize: 11, fontWeight: "600", color: Colors.textSecondary },
  time:     { fontSize: 11, color: Colors.textMuted },
});

// ─── Main Admin Screen ────────────────────────────────────────────────────────
export default function AdminFieldVisitsScreen() {
  const insets = useSafeAreaInsets();
  const [activeFilter, setActiveFilter] = useState<Filter>("All");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/admin/field-visits"],
    queryFn:  () => api.admin.getFieldVisits(),
    refetchInterval: 30_000,
  });

  const visits: FieldVisit[] = data?.visits ?? [];

  const filtered = useMemo(() =>
    activeFilter === "All" ? visits : visits.filter((v) => v.outcome === activeFilter),
    [visits, activeFilter]
  );

  // Group by agent for the summary section
  const agentMap = useMemo(() => {
    const map: Record<string, FieldVisit[]> = {};
    for (const v of visits) {
      if (!map[v.agent_name]) map[v.agent_name] = [];
      map[v.agent_name].push(v);
    }
    return map;
  }, [visits]);

  const todayCount = visits.filter(
    (v) => new Date(v.visited_at).toDateString() === new Date().toDateString()
  ).length;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={[
        s.container,
        Platform.OS === "web" ? { paddingTop: 16 } : {},
        { paddingBottom: insets.bottom + 24 },
      ]}
    >
      {/* Header */}
      <View style={s.topBar}>
        <View style={s.topLeft}>
          <Ionicons name="map" size={16} color={Colors.primary} />
          <Text style={s.topTitle}>Field Visits — Admin</Text>
        </View>
        <Pressable style={s.refreshBtn} onPress={() => refetch()}>
          <Ionicons name="refresh" size={16} color={Colors.primary} />
        </Pressable>
      </View>

      {isLoading ? (
        <ActivityIndicator color={Colors.primary} size="large" style={{ marginTop: 60 }} />
      ) : (
        <>
          {/* Summary strip */}
          <View style={s.summaryRow}>
            <View style={s.summaryCard}>
              <Text style={s.summaryNum}>{visits.length}</Text>
              <Text style={s.summaryLbl}>Total</Text>
            </View>
            <View style={s.summaryCard}>
              <Text style={[s.summaryNum, { color: Colors.success }]}>{todayCount}</Text>
              <Text style={s.summaryLbl}>Today</Text>
            </View>
            <View style={s.summaryCard}>
              <Text style={[s.summaryNum, { color: Colors.primary }]}>
                {Object.keys(agentMap).length}
              </Text>
              <Text style={s.summaryLbl}>Agents</Text>
            </View>
            <View style={s.summaryCard}>
              <Text style={[s.summaryNum, { color: Colors.success }]}>
                {visits.filter((v) => v.outcome === "Paid").length}
              </Text>
              <Text style={s.summaryLbl}>Paid</Text>
            </View>
          </View>

          {/* Agent summary */}
          {Object.keys(agentMap).length > 0 && (
            <>
              <Text style={s.sectionTitle}>Agents Today</Text>
              {Object.entries(agentMap).map(([name, agentVisits]) => (
                <AgentRow key={name} name={name} visits={agentVisits} />
              ))}
            </>
          )}

          {/* Filter chips */}
          <Text style={s.sectionTitle}>All Visits</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll}>
            {OUTCOMES.map((o) => (
              <Pressable
                key={o}
                style={[
                  s.filterChip,
                  activeFilter === o && {
                    backgroundColor: (OUTCOME_COLOR[o] ?? Colors.primary) + "20",
                    borderColor: (OUTCOME_COLOR[o] ?? Colors.primary) + "60",
                  },
                ]}
                onPress={() => setActiveFilter(o)}
              >
                <Text
                  style={[
                    s.filterText,
                    activeFilter === o && { color: OUTCOME_COLOR[o] ?? Colors.primary, fontWeight: "700" },
                  ]}
                >
                  {o} {o !== "All" ? `(${visits.filter((v) => v.outcome === o).length})` : `(${visits.length})`}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {filtered.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="map-outline" size={40} color={Colors.textMuted} />
              <Text style={s.emptyText}>No visits with this outcome</Text>
            </View>
          ) : (
            filtered.map((v) => <VisitRow key={v.id} visit={v} />)
          )}
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container:    { padding: 16, gap: 12 },
  topBar:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topLeft:      { flexDirection: "row", alignItems: "center", gap: 7 },
  topTitle:     { fontSize: 16, fontWeight: "800", color: Colors.text },
  refreshBtn:   { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.primary + "18", alignItems: "center", justifyContent: "center" },
  summaryRow:   { flexDirection: "row", gap: 8 },
  summaryCard:  { flex: 1, backgroundColor: Colors.surface, borderRadius: 12, padding: 12, alignItems: "center", gap: 3, borderWidth: 1, borderColor: Colors.border },
  summaryNum:   { fontSize: 20, fontWeight: "900", color: Colors.text },
  summaryLbl:   { fontSize: 10, color: Colors.textMuted, fontWeight: "700", textTransform: "uppercase" },
  sectionTitle: { fontSize: 11, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  filterScroll: { flexGrow: 0, marginBottom: 4 },
  filterChip:   { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, marginRight: 8, backgroundColor: Colors.surface },
  filterText:   { fontSize: 12, color: Colors.textMuted },
  empty:        { alignItems: "center", paddingVertical: 40, gap: 8 },
  emptyText:    { fontSize: 13, color: Colors.textMuted },
});

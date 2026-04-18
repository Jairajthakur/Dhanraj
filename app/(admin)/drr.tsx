import React, { useCallback, useState, useMemo } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput,
  RefreshControl, ActivityIndicator, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";
import { useCompanyFilter } from "@/context/CompanyFilterContext";

// ─── Milestone definitions ────────────────────────────────────────────────────
const MILESTONES = [
  { day: 10, label: "1st",  targets: { bkt1: 28, bkt2: 22, bkt3: 18 } },
  { day: 15, label: "2nd",  targets: { bkt1: 60, bkt2: 48, bkt3: 40 } },
  { day: 20, label: "3rd",  targets: { bkt1: 80, bkt2: 65, bkt3: 45 } },
  { day: 25, label: "4th",  targets: { bkt1: 85, bkt2: 68, bkt3: 60 } },
];

function getNextMilestone(today: number) {
  return MILESTONES.find((m) => m.day >= today) || MILESTONES[MILESTONES.length - 1];
}

function fmt(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  if (n >= 1000)   return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}
function pct(n: number) { return `${n.toFixed(1)}%`; }

function buildAgentDRR(rows: any[], today: number) {
  const agentMap: Record<string, { fosName: string; bkts: Record<string, { paid: number; total: number }> }> = {};
  for (const row of rows) {
    const name = row.fos_name || "Unknown";
    if (!agentMap[name]) agentMap[name] = { fosName: name, bkts: { bkt1: { paid: 0, total: 0 }, bkt2: { paid: 0, total: 0 }, bkt3: { paid: 0, total: 0 } } };
    const bkt = (row.bkt || "").toLowerCase();
    if (!agentMap[name].bkts[bkt]) agentMap[name].bkts[bkt] = { paid: 0, total: 0 };
    agentMap[name].bkts[bkt].paid  += parseFloat(row.pos_paid || 0);
    agentMap[name].bkts[bkt].total += parseFloat(row.pos_grand_total || 0);
  }
  const next = getNextMilestone(today);
  return Object.values(agentMap).map((agent) => {
    let totalPaid = 0, totalPos = 0;
    const bktDetails: Record<string, { paid: number; total: number; currentPct: number; targetPct: number; requiredPos: number; achieved: boolean; }> = {};
    for (const [bkt, data] of Object.entries(agent.bkts)) {
      const currentPct  = data.total > 0 ? (data.paid / data.total) * 100 : 0;
      const targetPct   = next.targets[bkt as keyof typeof next.targets] ?? 0;
      const requiredPos = Math.max(0, (targetPct / 100) * data.total - data.paid);
      bktDetails[bkt] = { ...data, currentPct, targetPct, requiredPos, achieved: currentPct >= targetPct };
      totalPaid += data.paid;
      totalPos  += data.total;
    }
    const overallPct  = totalPos > 0 ? (totalPaid / totalPos) * 100 : 0;
    const allAchieved = Object.values(bktDetails).filter(d => d.total > 0).every(d => d.achieved);
    return { fosName: agent.fosName, bktDetails, totalPaid, totalPos, overallPct, allAchieved, nextMilestone: next };
  }).sort((a, b) => b.overallPct - a.overallPct);
}

function MiniBar({ current, target, color }: { current: number; target: number; color: string }) {
  const fill = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const over = current >= target;
  return (
    <View style={{ height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: "hidden", marginTop: 3 }}>
      <View style={{ height: "100%", width: `${fill}%` as any, backgroundColor: over ? Colors.success : color, borderRadius: 3 }} />
    </View>
  );
}

function AgentDRRCard({ item, today }: { item: ReturnType<typeof buildAgentDRR>[0]; today: number }) {
  const [expanded, setExpanded] = useState(false);
  const daysLeft = Math.max(0, item.nextMilestone.day - today);

  return (
    <View style={ac.card}>
      <Pressable style={ac.header} onPress={() => setExpanded(!expanded)}>
        <View style={ac.nameCol}>
          <Text style={ac.name} numberOfLines={1}>{item.fosName}</Text>
          <View style={ac.tagRow}>
            <View style={[ac.overallTag, { backgroundColor: item.allAchieved ? Colors.success + "20" : Colors.warning + "15" }]}>
              <Text style={[ac.overallTagText, { color: item.allAchieved ? Colors.success : Colors.warning }]}>
                {pct(item.overallPct)} overall
              </Text>
            </View>
            {item.allAchieved && (
              <View style={[ac.overallTag, { backgroundColor: Colors.success + "20" }]}>
                <Ionicons name="checkmark-circle" size={11} color={Colors.success} />
                <Text style={[ac.overallTagText, { color: Colors.success }]}>On Target</Text>
              </View>
            )}
          </View>
        </View>
        <View style={ac.rightCol}>
          <Text style={ac.collectedText}>{fmt(item.totalPaid)}</Text>
          <Text style={ac.collectedLabel}>collected</Text>
        </View>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={Colors.textMuted} style={{ marginLeft: 4 }} />
      </Pressable>

      <View style={ac.bktMiniRow}>
        {(["bkt1", "bkt2", "bkt3"] as const).map((bkt) => {
          const d = item.bktDetails[bkt];
          if (!d || d.total === 0) return null;
          const bktColor = bkt === "bkt1" ? Colors.info : bkt === "bkt2" ? Colors.warning : Colors.danger;
          const bktLabel = bkt === "bkt1" ? "B1" : bkt === "bkt2" ? "B2" : "B3";
          return (
            <View key={bkt} style={[ac.bktMini, { borderColor: bktColor + "40" }]}>
              <View style={ac.bktMiniHeader}>
                <Text style={[ac.bktMiniLabel, { color: bktColor }]}>{bktLabel}</Text>
                <Text style={[ac.bktMiniPct, { color: d.achieved ? Colors.success : Colors.text }]}>{pct(d.currentPct)}</Text>
              </View>
              <MiniBar current={d.currentPct} target={d.targetPct} color={bktColor} />
              <Text style={ac.bktMiniTarget}>Target: {d.targetPct}%</Text>
            </View>
          );
        })}
      </View>

      {expanded && (
        <View style={ac.expandedWrap}>
          <View style={ac.expandedDivider} />
          <View style={ac.milestoneInfo}>
            <Ionicons name="flag-outline" size={13} color={Colors.accent} />
            <Text style={ac.milestoneInfoText}>
              Next: {item.nextMilestone.label} Milestone — Day {item.nextMilestone.day} ({daysLeft}d left)
            </Text>
          </View>
          {(["bkt1", "bkt2", "bkt3"] as const).map((bkt) => {
            const d = item.bktDetails[bkt];
            if (!d || d.total === 0) return null;
            const bktColor = bkt === "bkt1" ? Colors.info : bkt === "bkt2" ? Colors.warning : Colors.danger;
            const bktLabel = bkt === "bkt1" ? "BKT 1" : bkt === "bkt2" ? "BKT 2" : "BKT 3";
            return (
              <View key={bkt} style={[ac.bktDetail, { borderLeftColor: bktColor }]}>
                <View style={ac.bktDetailHeader}>
                  <Text style={[ac.bktDetailLabel, { color: bktColor }]}>{bktLabel}</Text>
                  <Text style={[ac.bktDetailPct, { color: d.achieved ? Colors.success : Colors.danger }]}>
                    {pct(d.currentPct)} / {d.targetPct}%
                  </Text>
                </View>
                <View style={ac.bktDetailStats}>
                  <View style={ac.bktDetailStat}><Text style={ac.bktDetailStatLabel}>COLLECTED</Text><Text style={[ac.bktDetailStatValue, { color: Colors.success }]}>{fmt(d.paid)}</Text></View>
                  <View style={ac.bktDetailStat}><Text style={ac.bktDetailStatLabel}>TOTAL POS</Text><Text style={ac.bktDetailStatValue}>{fmt(d.total)}</Text></View>
                  <View style={ac.bktDetailStat}><Text style={ac.bktDetailStatLabel}>STILL NEED</Text><Text style={[ac.bktDetailStatValue, { color: d.achieved ? Colors.success : Colors.danger }]}>{d.achieved ? "✓ Done" : fmt(d.requiredPos)}</Text></View>
                </View>
                <MiniBar current={d.currentPct} target={d.targetPct} color={bktColor} />
              </View>
            );
          })}
          <View style={ac.allMSRow}>
            {MILESTONES.map((m) => {
              const isPast    = m.day < today;
              const isCurrent = m.day >= today && getNextMilestone(today).day === m.day;
              const totalTarget = ((m.targets.bkt1 * (item.bktDetails.bkt1?.total || 0)) + (m.targets.bkt2 * (item.bktDetails.bkt2?.total || 0)) + (m.targets.bkt3 * (item.bktDetails.bkt3?.total || 0))) / 100;
              const achieved = item.totalPos > 0 && item.totalPaid >= totalTarget;
              return (
                <View key={m.day} style={[ac.msChip, isCurrent && { backgroundColor: Colors.accent + "20", borderColor: Colors.accent }, isPast && { opacity: 0.4 }, achieved && { backgroundColor: Colors.success + "15", borderColor: Colors.success }]}>
                  <Text style={[ac.msChipDay, isCurrent && { color: Colors.accent }, achieved && { color: Colors.success }]}>D{m.day}</Text>
                  <Text style={[ac.msChipLabel, isCurrent && { color: Colors.accent }, achieved && { color: Colors.success }]}>{m.label}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function AdminDRRScreen() {
  const insets  = useSafeAreaInsets();
  const today   = new Date().getDate();
  const [search, setSearch] = useState("");
  const next    = getNextMilestone(today);
  const daysLeft = Math.max(0, next.day - today);
  const { selectedCompany } = useCompanyFilter();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/admin/bkt-perf-summary", selectedCompany],
    queryFn:  () => api.admin.getBktPerfSummary(selectedCompany ?? undefined),
    refetchInterval: 30000,
  });

  const onRefresh = useCallback(() => { refetch(); }, [refetch]);

  const agents = useMemo(() => {
    const rows: any[] = data?.rows || [];
    const built = buildAgentDRR(rows, today);
    if (!search.trim()) return built;
    const q = search.toLowerCase();
    return built.filter((a) => a.fosName.toLowerCase().includes(q));
  }, [data, today, search]);

  const teamPaid  = agents.reduce((a, b) => a + b.totalPaid, 0);
  const teamPos   = agents.reduce((a, b) => a + b.totalPos, 0);
  const teamPct   = teamPos > 0 ? (teamPaid / teamPos) * 100 : 0;
  const onTarget  = agents.filter((a) => a.allAchieved).length;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={[s.topBar, { paddingTop: Platform.OS === "web" ? 67 : 12 }]}>

        {/* Company indicator */}
        {selectedCompany && (
          <View style={s.companyBanner}>
            <Ionicons name="business" size={13} color={Colors.primary} />
            <Text style={s.companyBannerText}>{selectedCompany}</Text>
          </View>
        )}

        {/* Team summary */}
        <View style={s.teamCard}>
          <View style={s.teamLeft}>
            <Text style={s.teamTitle}>Team DRR — Day {today}</Text>
            <Text style={s.teamSub}>{daysLeft}d to {next.label} Milestone (Day {next.day})</Text>
          </View>
          <View style={s.teamRight}>
            <Text style={s.teamPct}>{pct(teamPct)}</Text>
            <Text style={s.teamPctLabel}>Team Avg</Text>
          </View>
        </View>

        {/* Team stats */}
        <View style={s.teamStatsRow}>
          <View style={s.teamStat}><Text style={s.teamStatLabel}>COLLECTED</Text><Text style={[s.teamStatValue, { color: Colors.success }]}>{fmt(teamPaid)}</Text></View>
          <View style={s.teamStat}><Text style={s.teamStatLabel}>TOTAL POS</Text><Text style={s.teamStatValue}>{fmt(teamPos)}</Text></View>
          <View style={s.teamStat}><Text style={s.teamStatLabel}>ON TARGET</Text><Text style={[s.teamStatValue, { color: Colors.success }]}>{onTarget}/{agents.length}</Text></View>
        </View>

        {/* Milestone ref */}
        <View style={s.msRefRow}>
          {MILESTONES.map((m) => {
            const isPast    = m.day < today;
            const isCurrent = getNextMilestone(today).day === m.day;
            return (
              <View key={m.day} style={[s.msRef, isCurrent && { backgroundColor: Colors.accent + "20", borderColor: Colors.accent + "60" }, isPast && { opacity: 0.4 }]}>
                <Text style={[s.msRefDay, isCurrent && { color: Colors.accent }]}>D{m.day}</Text>
                <Text style={[s.msRefBkt, { color: Colors.info    }]}>{m.targets.bkt1}%</Text>
                <Text style={[s.msRefBkt, { color: Colors.warning }]}>{m.targets.bkt2}%</Text>
                <Text style={[s.msRefBkt, { color: Colors.danger  }]}>{m.targets.bkt3}%</Text>
              </View>
            );
          })}
        </View>

        {/* Search */}
        <View style={s.searchBox}>
          <Ionicons name="search" size={16} color={Colors.textMuted} />
          <TextInput style={s.searchInput} placeholder="Search FOS agent..." placeholderTextColor={Colors.textMuted} value={search} onChangeText={setSearch} />
          {search.length > 0 && <Pressable onPress={() => setSearch("")}><Ionicons name="close-circle" size={17} color={Colors.textMuted} /></Pressable>}
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={agents}
          keyExtractor={(item) => item.fosName}
          contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 32 }]}
          refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={Colors.primary} />}
          ListHeaderComponent={<Text style={s.count}>{agents.length} agent{agents.length !== 1 ? "s" : ""}{selectedCompany ? ` · ${selectedCompany}` : ""}</Text>}
          renderItem={({ item }) => <AgentDRRCard item={item} today={today} />}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="bar-chart-outline" size={48} color={Colors.textMuted} />
              <Text style={s.emptyText}>
                {selectedCompany ? `No DRR data for ${selectedCompany}` : "No DRR data available yet"}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  topBar:         { backgroundColor: Colors.surface, paddingHorizontal: 12, paddingBottom: 10, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  companyBanner:  { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.primary + "12", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: Colors.primary + "25" },
  companyBannerText: { fontSize: 12, fontWeight: "700", color: Colors.primary },
  teamCard:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  teamLeft:       { gap: 2 },
  teamTitle:      { fontSize: 15, fontWeight: "800", color: Colors.text },
  teamSub:        { fontSize: 11, color: Colors.textSecondary },
  teamRight:      { alignItems: "flex-end" },
  teamPct:        { fontSize: 26, fontWeight: "900", color: Colors.primary, letterSpacing: -1 },
  teamPctLabel:   { fontSize: 10, color: Colors.textSecondary, textTransform: "uppercase" },
  teamStatsRow:   { flexDirection: "row", gap: 8 },
  teamStat:       { flex: 1, backgroundColor: Colors.surfaceAlt, borderRadius: 10, padding: 10, gap: 2 },
  teamStatLabel:  { fontSize: 9, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase" },
  teamStatValue:  { fontSize: 13, fontWeight: "800", color: Colors.text },
  msRefRow:       { flexDirection: "row", gap: 6 },
  msRef:          { flex: 1, backgroundColor: Colors.surfaceAlt, borderRadius: 8, padding: 6, gap: 2, alignItems: "center", borderWidth: 1, borderColor: Colors.border },
  msRefDay:       { fontSize: 11, fontWeight: "800", color: Colors.text },
  msRefBkt:       { fontSize: 10, fontWeight: "700" },
  searchBox:      { flexDirection: "row", alignItems: "center", backgroundColor: Colors.surfaceAlt, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, gap: 8, borderWidth: 1, borderColor: Colors.border },
  searchInput:    { flex: 1, fontSize: 14, color: Colors.text },
  list:           { padding: 12, gap: 10 },
  count:          { fontSize: 12, color: Colors.textSecondary, fontWeight: "600", marginBottom: 4 },
  empty:          { flex: 1, alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText:      { fontSize: 14, color: Colors.textMuted, textAlign: "center" },
});

const ac = StyleSheet.create({
  card:              { backgroundColor: Colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.border, gap: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  header:            { flexDirection: "row", alignItems: "center", gap: 8 },
  nameCol:           { flex: 1, gap: 4 },
  name:              { fontSize: 14, fontWeight: "700", color: Colors.text, textTransform: "uppercase" },
  tagRow:            { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  overallTag:        { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  overallTagText:    { fontSize: 11, fontWeight: "700" },
  rightCol:          { alignItems: "flex-end" },
  collectedText:     { fontSize: 14, fontWeight: "800", color: Colors.success },
  collectedLabel:    { fontSize: 10, color: Colors.textMuted },
  bktMiniRow:        { flexDirection: "row", gap: 6 },
  bktMini:           { flex: 1, backgroundColor: Colors.surfaceAlt, borderRadius: 8, padding: 8, gap: 2, borderWidth: 1 },
  bktMiniHeader:     { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  bktMiniLabel:      { fontSize: 10, fontWeight: "800" },
  bktMiniPct:        { fontSize: 11, fontWeight: "800" },
  bktMiniTarget:     { fontSize: 9, color: Colors.textMuted, marginTop: 2 },
  expandedWrap:      { gap: 10 },
  expandedDivider:   { height: 1, backgroundColor: Colors.border },
  milestoneInfo:     { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.accent + "10", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  milestoneInfoText: { flex: 1, fontSize: 12, color: Colors.accent, fontWeight: "600" },
  bktDetail:         { borderLeftWidth: 3, borderRadius: 10, padding: 10, gap: 6, backgroundColor: Colors.surfaceAlt },
  bktDetailHeader:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  bktDetailLabel:    { fontSize: 12, fontWeight: "800" },
  bktDetailPct:      { fontSize: 12, fontWeight: "800" },
  bktDetailStats:    { flexDirection: "row", gap: 6 },
  bktDetailStat:     { flex: 1, gap: 2 },
  bktDetailStatLabel: { fontSize: 9, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase" },
  bktDetailStatValue: { fontSize: 12, fontWeight: "700", color: Colors.text },
  allMSRow:          { flexDirection: "row", gap: 6 },
  msChip:            { flex: 1, borderRadius: 8, padding: 7, alignItems: "center", gap: 2, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt },
  msChipDay:         { fontSize: 11, fontWeight: "800", color: Colors.text },
  msChipLabel:       { fontSize: 9, color: Colors.textMuted, fontWeight: "600" },
});

import React, { useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  ActivityIndicator, Platform, Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";
import { useCompany } from "@/context/CompanyContext";
import { CompanyFilterBar } from "@/components/CompanyFilterBar";

const MILESTONES = [
  { day: 10, label: "1st Milestone", targets: { bkt1: 28, bkt2: 22, bkt3: 18 } },
  { day: 15, label: "2nd Milestone", targets: { bkt1: 60, bkt2: 48, bkt3: 40 } },
  { day: 20, label: "3rd Milestone", targets: { bkt1: 80, bkt2: 65, bkt3: 45 } },
  { day: 25, label: "4th Milestone", targets: { bkt1: 85, bkt2: 68, bkt3: 60 } },
];

function getNextMilestone(today: number) {
  return MILESTONES.find((m) => m.day >= today) ?? MILESTONES[MILESTONES.length - 1];
}

function fmt(n: number) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function Bar({ current, target, color }: { current: number; target: number; color: string }) {
  const fill = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const done = current >= target;
  return (
    <View style={pb.track}>
      <View style={[pb.fill, { width: `${fill}%` as any, backgroundColor: done ? Colors.success : color }]} />
      <View style={pb.marker} />
    </View>
  );
}

const pb = StyleSheet.create({
  track:  { height: 12, backgroundColor: Colors.border, borderRadius: 6, overflow: "hidden", marginVertical: 6 },
  fill:   { height: "100%", borderRadius: 6, position: "absolute", left: 0, top: 0 },
  marker: { position: "absolute", right: 0, top: -2, width: 2, height: 16, backgroundColor: Colors.primary + "60" },
});

function BktCard({ bkt, paid, total, today }: {
  bkt: string; paid: number; total: number; today: number;
}) {
  const next         = getNextMilestone(today);
  const daysLeft     = Math.max(0, next.day - today);
  const effectDays   = Math.max(1, daysLeft);
  const targetPct    = next.targets[bkt as keyof typeof next.targets] ?? 0;
  const currentPct   = total > 0 ? (paid / total) * 100 : 0;
  const targetAmt    = (targetPct / 100) * total;
  const remaining    = Math.max(0, targetAmt - paid);
  const dailyNeed    = remaining / effectDays;
  const achieved     = currentPct >= targetPct;
  const noData       = total === 0;

  const color  = bkt === "bkt1" ? Colors.info : bkt === "bkt2" ? Colors.warning : Colors.danger;
  const label  = bkt === "bkt1" ? "BKT 1" : bkt === "bkt2" ? "BKT 2" : "BKT 3";

  if (noData) return null;

  return (
    <View style={[s.bktCard, { borderLeftColor: color }]}>
      <View style={s.bktHead}>
        <View style={[s.bktBadge, { backgroundColor: color + "20" }]}>
          <Text style={[s.bktBadgeText, { color }]}>{label}</Text>
        </View>
        <View style={[s.statusPill, { backgroundColor: achieved ? Colors.success + "20" : Colors.warning + "20" }]}>
          <Ionicons name={achieved ? "checkmark-circle" : "time-outline"} size={13} color={achieved ? Colors.success : Colors.warning} />
          <Text style={[s.statusPillText, { color: achieved ? Colors.success : Colors.warning }]}>
            {achieved ? "Target Reached!" : `${currentPct.toFixed(0)}% of ${targetPct}%`}
          </Text>
        </View>
      </View>

      <Bar current={currentPct} target={targetPct} color={color} />

      <View style={s.row3}>
        <View style={s.cell}>
          <Text style={s.cellLabel}>Collected</Text>
          <Text style={[s.cellVal, { color: Colors.success }]}>{fmt(paid)}</Text>
        </View>
        <View style={s.cell}>
          <Text style={s.cellLabel}>Target Amt</Text>
          <Text style={[s.cellVal, { color }]}>{fmt(targetAmt)}</Text>
        </View>
        <View style={s.cell}>
          <Text style={s.cellLabel}>Still Need</Text>
          <Text style={[s.cellVal, { color: achieved ? Colors.success : Colors.danger }]}>
            {achieved ? "✓ Done" : fmt(remaining)}
          </Text>
        </View>
      </View>

      {!achieved && (
        <View style={[s.dailyBox, { backgroundColor: color + "12", borderColor: color + "30" }]}>
          <Ionicons name="flash" size={16} color={color} />
          <View style={{ flex: 1 }}>
            <Text style={[s.dailyAmt, { color }]}>{fmt(dailyNeed)} per day</Text>
            <Text style={s.dailySub}>
              {daysLeft === 0
                ? `Collect today to reach ${next.label}!`
                : `Collect daily for next ${daysLeft} day${daysLeft !== 1 ? "s" : ""} to reach ${next.label}`}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

export default function FosDRRScreen() {
  const insets              = useSafeAreaInsets();
  const today               = new Date().getDate();
  const next                = getNextMilestone(today);
  const daysLeft            = Math.max(0, next.day - today);
  const { selectedCompany } = useCompany();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/bkt-perf-summary", selectedCompany],
    queryFn:  () => api.getBktPerfSummary({ company: selectedCompany }),
  });

  const onRefresh = useCallback(() => { refetch(); }, [refetch]);

  const rows: any[] = data?.rows ?? [];

  const bktMap: Record<string, { paid: number; total: number }> = {
    bkt1: { paid: 0, total: 0 },
    bkt2: { paid: 0, total: 0 },
    bkt3: { paid: 0, total: 0 },
  };
  for (const row of rows) {
    const bkt = (row.bkt || "").toLowerCase();
    if (!bktMap[bkt]) continue;
    bktMap[bkt].paid  += parseFloat(row.pos_paid || 0);
    bktMap[bkt].total += parseFloat(row.pos_grand_total || 0);
  }

  const totalPaid  = Object.values(bktMap).reduce((a, b) => a + b.paid,  0);
  const totalPos   = Object.values(bktMap).reduce((a, b) => a + b.total, 0);
  const overallPct = totalPos > 0 ? (totalPaid / totalPos) * 100 : 0;

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background }}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <CompanyFilterBar onSelect={() => refetch()} />

      <ScrollView
        contentContainerStyle={[s.container, {
          paddingBottom: insets.bottom + 32,
          paddingTop: Platform.OS === "web" ? 16 : 12,
        }]}
        refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* Company context indicator */}
        {selectedCompany && (
          <View style={s.companyBanner}>
            <Ionicons name="business" size={13} color={Colors.primary} />
            <Text style={s.companyBannerText}>DRR for: {selectedCompany}</Text>
          </View>
        )}

        {/* Overall summary card */}
        <View style={s.summaryCard}>
          <View style={s.summaryTop}>
            <View>
              <Text style={s.summaryTitle}>Recovery Today</Text>
              <Text style={s.summaryDate}>Day {today} of the month</Text>
            </View>
            <View style={[s.overallPctWrap, {
              backgroundColor: overallPct >= 60 ? Colors.success + "20"
                : overallPct >= 30 ? Colors.warning + "20" : Colors.danger + "20"
            }]}>
              <Text style={[s.overallPct, {
                color: overallPct >= 60 ? Colors.success
                  : overallPct >= 30 ? Colors.warning : Colors.danger
              }]}>{overallPct.toFixed(0)}%</Text>
            </View>
          </View>

          <View style={s.bigTrack}>
            <View style={[s.bigFill, {
              width: `${Math.min(100, overallPct)}%` as any,
              backgroundColor: overallPct >= 60 ? Colors.success
                : overallPct >= 30 ? Colors.warning : Colors.danger,
            }]} />
          </View>
          <Text style={s.summaryAmt}>{fmt(totalPaid)} collected out of {fmt(totalPos)}</Text>

          <View style={[s.milestoneBanner, { backgroundColor: Colors.accent + "15" }]}>
            <Ionicons name="flag-outline" size={16} color={Colors.accent} />
            <Text style={s.milestoneBannerText}>
              {daysLeft === 0
                ? `${next.label} is TODAY — collect as much as possible!`
                : `${next.label} (Day ${next.day}) — ${daysLeft} day${daysLeft !== 1 ? "s" : ""} left`}
            </Text>
          </View>
        </View>

        {/* Milestone target table */}
        <View style={s.tableCard}>
          <Text style={s.tableTitle}>Milestone Targets</Text>
          <View style={s.tableHead}>
            <Text style={[s.thCell, { flex: 1.6 }]}>Milestone</Text>
            <Text style={s.thCell}>BKT 1</Text>
            <Text style={s.thCell}>BKT 2</Text>
            <Text style={s.thCell}>BKT 3</Text>
          </View>
          {MILESTONES.map((m) => {
            const isPast    = m.day < today;
            const isCurrent = getNextMilestone(today).day === m.day;
            return (
              <View key={m.day} style={[s.tableRow, isCurrent && { backgroundColor: Colors.accent + "12" }, isPast && { opacity: 0.4 }]}>
                <View style={[s.tdCell, { flex: 1.6, flexDirection: "row", alignItems: "center", gap: 5 }]}>
                  {isCurrent && <View style={s.activeDot} />}
                  <Text style={[s.tdText, isCurrent && { color: Colors.accent, fontWeight: "800" }]}>Day {m.day}</Text>
                </View>
                <Text style={[s.tdCell, s.tdText, { color: Colors.info }]}>{m.targets.bkt1}%</Text>
                <Text style={[s.tdCell, s.tdText, { color: Colors.warning }]}>{m.targets.bkt2}%</Text>
                <Text style={[s.tdCell, s.tdText, { color: Colors.danger }]}>{m.targets.bkt3}%</Text>
              </View>
            );
          })}
        </View>

        <Text style={s.sectionHead}>Your Target vs Progress</Text>
        {(["bkt1", "bkt2", "bkt3"] as const).map((bkt) => (
          <BktCard key={bkt} bkt={bkt} paid={bktMap[bkt].paid} total={bktMap[bkt].total} today={today} />
        ))}

        {totalPos === 0 && (
          <View style={s.empty}>
            <Ionicons name="bar-chart-outline" size={48} color={Colors.textMuted} />
            <Text style={s.emptyText}>No data yet</Text>
            <Text style={s.emptySub}>Your recovery data will appear here</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container:           { padding: 14, gap: 14 },
  sectionHead:         { fontSize: 15, fontWeight: "800", color: Colors.text, marginTop: 2 },
  companyBanner:       { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.primary + "10", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: Colors.primary + "25" },
  companyBannerText:   { fontSize: 12, fontWeight: "700", color: Colors.primary, flex: 1 },
  summaryCard:         { backgroundColor: Colors.surface, borderRadius: 16, padding: 18, gap: 12, borderWidth: 1, borderColor: Colors.border, shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 4 },
  summaryTop:          { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryTitle:        { fontSize: 17, fontWeight: "800", color: Colors.text },
  summaryDate:         { fontSize: 12, color: Colors.textSecondary },
  overallPctWrap:      { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
  overallPct:          { fontSize: 28, fontWeight: "900" },
  bigTrack:            { height: 16, backgroundColor: Colors.border, borderRadius: 8, overflow: "hidden" },
  bigFill:             { height: 16, borderRadius: 8, position: "absolute", left: 0, top: 0 },
  summaryAmt:          { fontSize: 12, color: Colors.textSecondary },
  milestoneBanner:     { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  milestoneBannerText: { flex: 1, fontSize: 13, color: Colors.accent, fontWeight: "600" },
  tableCard:           { backgroundColor: Colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.border },
  tableTitle:          { fontSize: 14, fontWeight: "700", color: Colors.text, marginBottom: 8 },
  tableHead:           { flexDirection: "row", paddingVertical: 8, paddingHorizontal: 4, backgroundColor: Colors.surfaceAlt, borderRadius: 8, marginBottom: 2 },
  thCell:              { flex: 1, fontSize: 11, fontWeight: "800", color: Colors.textMuted, textTransform: "uppercase", textAlign: "center" as any },
  tableRow:            { flexDirection: "row", paddingVertical: 10, paddingHorizontal: 4, borderRadius: 8 },
  tdCell:              { flex: 1, alignItems: "center" as any, justifyContent: "center" as any },
  tdText:              { fontSize: 13, fontWeight: "700", color: Colors.text, textAlign: "center" as any },
  activeDot:           { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.accent },
  bktCard:             { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, borderLeftWidth: 4, borderWidth: 1, borderColor: Colors.border, gap: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 5, elevation: 2 },
  bktHead:             { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  bktBadge:            { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 },
  bktBadgeText:        { fontSize: 14, fontWeight: "800" },
  statusPill:          { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusPillText:      { fontSize: 12, fontWeight: "700" },
  row3:                { flexDirection: "row", gap: 8 },
  cell:                { flex: 1, backgroundColor: Colors.surfaceAlt, borderRadius: 10, padding: 10, alignItems: "center", gap: 3 },
  cellLabel:           { fontSize: 10, fontWeight: "600", color: Colors.textMuted, textTransform: "uppercase", textAlign: "center" as any },
  cellVal:             { fontSize: 13, fontWeight: "800", color: Colors.text, textAlign: "center" as any },
  dailyBox:            { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1 },
  dailyAmt:            { fontSize: 16, fontWeight: "900" },
  dailySub:            { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  empty:               { alignItems: "center", paddingVertical: 60, gap: 10 },
  emptyText:           { fontSize: 16, fontWeight: "700", color: Colors.textMuted },
  emptySub:            { fontSize: 13, color: Colors.textMuted, textAlign: "center" as any },
});

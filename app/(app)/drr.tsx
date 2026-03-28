import React, { useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  ActivityIndicator, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";

// ─── Milestone definitions (TW = Two Wheeler only) ───────────────────────────
const MILESTONES = [
  { day: 10, label: "1st Milestone", targets: { bkt1: 28, bkt2: 22, bkt3: 18 } },
  { day: 15, label: "2nd Milestone", targets: { bkt1: 60, bkt2: 48, bkt3: 40 } },
  { day: 20, label: "3rd Milestone", targets: { bkt1: 80, bkt2: 65, bkt3: 45 } },
  { day: 25, label: "4th Milestone", targets: { bkt1: 85, bkt2: 68, bkt3: 60 } },
];

// Returns the next upcoming (or current) milestone based on today's date
function getNextMilestone(today: number) {
  return MILESTONES.find((m) => m.day >= today) || MILESTONES[MILESTONES.length - 1];
}

// Returns all milestones that are still upcoming (including today)
function getUpcomingMilestones(today: number) {
  return MILESTONES.filter((m) => m.day >= today);
}

function getDaysRemaining(milestoneDay: number, today: number) {
  return Math.max(0, milestoneDay - today);
}

// ─── Calculate DRR metrics from bkt-perf-summary rows ────────────────────────
function calcDRR(rows: any[], todayDate: number) {
  const bktMap: Record<string, { paid: number; total: number }> = {
    bkt1: { paid: 0, total: 0 },
    bkt2: { paid: 0, total: 0 },
    bkt3: { paid: 0, total: 0 },
  };

  for (const row of rows) {
    const bkt = (row.bkt || "").toLowerCase();
    if (!bktMap[bkt]) continue;
    bktMap[bkt].paid  += parseFloat(row.pos_paid  || 0);
    bktMap[bkt].total += parseFloat(row.pos_grand_total || 0);
  }

  const result: Record<string, {
    paid: number; total: number; currentPct: number;
    nextMilestone: typeof MILESTONES[0] | null;
    requiredPct: number; requiredPos: number; daysLeft: number;
    upcomingMilestones: typeof MILESTONES;
  }> = {};

  for (const [bkt, data] of Object.entries(bktMap)) {
    const currentPct = data.total > 0 ? (data.paid / data.total) * 100 : 0;
    const next = getNextMilestone(todayDate);
    const upcoming = getUpcomingMilestones(todayDate);
    const targetPct = next.targets[bkt as keyof typeof next.targets] ?? 0;
    const requiredPos = data.total > 0
      ? Math.max(0, (targetPct / 100) * data.total - data.paid)
      : 0;

    result[bkt] = {
      paid: data.paid,
      total: data.total,
      currentPct,
      nextMilestone: next,
      requiredPct: targetPct,
      requiredPos,
      daysLeft: getDaysRemaining(next.day, todayDate),
      upcomingMilestones: upcoming,
    };
  }

  return result;
}

function fmt(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  if (n >= 1000)   return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function pct(n: number) {
  return `${n.toFixed(1)}%`;
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────
function ProgressBar({ current, target, color }: { current: number; target: number; color: string }) {
  const fill = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const overAchieved = current >= target;
  return (
    <View style={pb.wrap}>
      <View style={[pb.track]}>
        <View style={[pb.fill, { width: `${fill}%` as any, backgroundColor: overAchieved ? Colors.success : color }]} />
        {target > 0 && (
          <View style={[pb.marker, { left: "100%" as any }]} />
        )}
      </View>
    </View>
  );
}
const pb = StyleSheet.create({
  wrap:   { marginVertical: 6 },
  track:  { height: 10, backgroundColor: Colors.border, borderRadius: 5, overflow: "hidden", position: "relative" },
  fill:   { height: "100%", borderRadius: 5, position: "absolute", left: 0, top: 0 },
  marker: { position: "absolute", top: -2, width: 2, height: 14, backgroundColor: Colors.danger },
});

// ─── BKT Card ─────────────────────────────────────────────────────────────────
function BktDRRCard({
  bkt, data, todayDate,
}: {
  bkt: string;
  data: ReturnType<typeof calcDRR>[string];
  todayDate: number;
}) {
  const bktLabel = bkt === "bkt1" ? "BKT 1" : bkt === "bkt2" ? "BKT 2" : "BKT 3";
  const bktColor = bkt === "bkt1" ? Colors.info : bkt === "bkt2" ? Colors.warning : Colors.danger;
  const isAchieved = data.currentPct >= data.requiredPct;
  const noData = data.total === 0;

  return (
    <View style={[s.bktCard, { borderLeftColor: bktColor }]}>
      {/* Header */}
      <View style={s.bktCardHeader}>
        <View style={[s.bktBadge, { backgroundColor: bktColor + "20" }]}>
          <Text style={[s.bktBadgeText, { color: bktColor }]}>{bktLabel}</Text>
        </View>
        <View style={[s.drrBadge, { backgroundColor: isAchieved ? Colors.success + "20" : Colors.warning + "20" }]}>
          <Text style={[s.drrBadgeText, { color: isAchieved ? Colors.success : Colors.warning }]}>
            {noData ? "No Data" : `DRR ${pct(data.currentPct)}`}
          </Text>
        </View>
      </View>

      {noData ? (
        <Text style={s.noDataText}>No {bktLabel} allocation found</Text>
      ) : (
        <>
          {/* Current progress */}
          <View style={s.statsRow}>
            <View style={s.statBox}>
              <Text style={s.statLabel}>COLLECTED</Text>
              <Text style={[s.statValue, { color: Colors.success }]}>{fmt(data.paid)}</Text>
            </View>
            <View style={s.statBox}>
              <Text style={s.statLabel}>TOTAL POS</Text>
              <Text style={s.statValue}>{fmt(data.total)}</Text>
            </View>
            <View style={s.statBox}>
              <Text style={s.statLabel}>CURRENT %</Text>
              <Text style={[s.statValue, { color: bktColor }]}>{pct(data.currentPct)}</Text>
            </View>
          </View>

          {/* Progress bar */}
          <ProgressBar current={data.currentPct} target={data.requiredPct} color={bktColor} />

          {/* Next milestone */}
          {data.nextMilestone && (
            <View style={[s.milestoneBox, { backgroundColor: isAchieved ? Colors.success + "10" : Colors.surfaceAlt }]}>
              <View style={s.milestoneHeader}>
                <Ionicons
                  name={isAchieved ? "checkmark-circle" : "flag"}
                  size={14}
                  color={isAchieved ? Colors.success : Colors.accent}
                />
                <Text style={[s.milestoneTitle, { color: isAchieved ? Colors.success : Colors.accent }]}>
                  {isAchieved ? "✅ Target Achieved!" : `${data.nextMilestone.label} — Day ${data.nextMilestone.day}`}
                </Text>
                {!isAchieved && (
                  <View style={s.daysBadge}>
                    <Text style={s.daysBadgeText}>{data.daysLeft}d left</Text>
                  </View>
                )}
              </View>
              {!isAchieved && (
                <View style={s.milestoneStats}>
                  <View style={s.milestoneStatItem}>
                    <Text style={s.milestoneStatLabel}>TARGET</Text>
                    <Text style={[s.milestoneStatValue, { color: Colors.accent }]}>{pct(data.requiredPct)}</Text>
                  </View>
                  <View style={s.milestoneStatDivider} />
                  <View style={s.milestoneStatItem}>
                    <Text style={s.milestoneStatLabel}>STILL NEED</Text>
                    <Text style={[s.milestoneStatValue, { color: Colors.danger }]}>{fmt(data.requiredPos)}</Text>
                  </View>
                  <View style={s.milestoneStatDivider} />
                  <View style={s.milestoneStatItem}>
                    <Text style={s.milestoneStatLabel}>GAP %</Text>
                    <Text style={[s.milestoneStatValue, { color: Colors.danger }]}>
                      {pct(Math.max(0, data.requiredPct - data.currentPct))}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* All upcoming milestones */}
          {data.upcomingMilestones.length > 1 && (
            <View style={s.allMilestones}>
              <Text style={s.allMilestonesTitle}>UPCOMING TARGETS</Text>
              {data.upcomingMilestones.map((m) => {
                const mTarget = m.targets[bkt as keyof typeof m.targets] ?? 0;
                const mRequiredPos = Math.max(0, (mTarget / 100) * data.total - data.paid);
                const mAchieved = data.currentPct >= mTarget;
                return (
                  <View key={m.day} style={s.milestoneRow}>
                    <Ionicons
                      name={mAchieved ? "checkmark-circle" : "ellipse-outline"}
                      size={13}
                      color={mAchieved ? Colors.success : Colors.textMuted}
                    />
                    <Text style={[s.milestoneRowText, mAchieved && { color: Colors.success, textDecorationLine: "line-through" }]}>
                      Day {m.day} ({m.label})
                    </Text>
                    <Text style={[s.milestoneRowTarget, { color: mAchieved ? Colors.success : bktColor }]}>
                      {mTarget}%
                    </Text>
                    {!mAchieved && (
                      <Text style={s.milestoneRowNeed}>
                        Need {fmt(mRequiredPos)}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function FosDRRScreen() {
  const insets = useSafeAreaInsets();
  const today = new Date().getDate();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/bkt-perf-summary"],
    queryFn:  () => api.getBktPerfSummary(),
  });

  const onRefresh = useCallback(() => { refetch(); }, [refetch]);

  const rows: any[] = data?.rows || [];
  const drr = calcDRR(rows, today);

  // Overall summary
  const totalPaid  = Object.values(drr).reduce((a, b) => a + b.paid, 0);
  const totalPos   = Object.values(drr).reduce((a, b) => a + b.total, 0);
  const overallPct = totalPos > 0 ? (totalPaid / totalPos) * 100 : 0;
  const nextMS     = getNextMilestone(today);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background }}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={[
        s.container,
        {
          paddingBottom: insets.bottom + 32,
          paddingTop: Platform.OS === "web" ? 67 : 12,
        },
      ]}
      refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      {/* Header summary card */}
      <View style={s.summaryCard}>
        <View style={s.summaryRow}>
          <View style={s.summaryLeft}>
            <Text style={s.summaryTitle}>Today's DRR</Text>
            <Text style={s.summaryDate}>Day {today} of Month</Text>
          </View>
          <View style={s.summaryRight}>
            <Text style={s.summaryPct}>{pct(overallPct)}</Text>
            <Text style={s.summaryPctLabel}>Overall Recovery</Text>
          </View>
        </View>

        <View style={s.summaryDivider} />

        <View style={s.summaryStatsRow}>
          <View style={s.summaryStat}>
            <Text style={s.summaryStatLabel}>TOTAL COLLECTED</Text>
            <Text style={[s.summaryStatValue, { color: Colors.success }]}>{fmt(totalPaid)}</Text>
          </View>
          <View style={s.summaryStat}>
            <Text style={s.summaryStatLabel}>TOTAL POS</Text>
            <Text style={s.summaryStatValue}>{fmt(totalPos)}</Text>
          </View>
          <View style={s.summaryStat}>
            <Text style={s.summaryStatLabel}>NEXT MILESTONE</Text>
            <Text style={[s.summaryStatValue, { color: Colors.accent }]}>Day {nextMS.day}</Text>
          </View>
        </View>

        {/* Milestone countdown */}
        <View style={[s.countdownBanner, { backgroundColor: Colors.accent + "15", borderColor: Colors.accent + "40" }]}>
          <Ionicons name="flag-outline" size={16} color={Colors.accent} />
          <Text style={s.countdownText}>
            {nextMS.label} on Day {nextMS.day} — {getDaysRemaining(nextMS.day, today)} day{getDaysRemaining(nextMS.day, today) !== 1 ? "s" : ""} remaining
          </Text>
        </View>
      </View>

      {/* Milestone reference card */}
      <View style={s.referenceCard}>
        <Text style={s.referenceTitle}>📊 Milestone Targets (TW)</Text>
        <View style={s.referenceTable}>
          <View style={[s.refRow, s.refHeaderRow]}>
            <Text style={[s.refCell, s.refHeader, { flex: 1.5 }]}>Milestone</Text>
            <Text style={[s.refCell, s.refHeader]}>BKT 1</Text>
            <Text style={[s.refCell, s.refHeader]}>BKT 2</Text>
            <Text style={[s.refCell, s.refHeader]}>BKT 3</Text>
          </View>
          {MILESTONES.map((m) => {
            const isPast    = m.day < today;
            const isCurrent = m.day >= today && (MILESTONES.find(x => x.day >= today)?.day === m.day);
            return (
              <View
                key={m.day}
                style={[
                  s.refRow,
                  isCurrent && { backgroundColor: Colors.accent + "15" },
                  isPast    && { opacity: 0.45 },
                ]}
              >
                <View style={[s.refCell, { flex: 1.5, flexDirection: "row", alignItems: "center", gap: 4 }]}>
                  {isCurrent && <View style={s.activeIndicator} />}
                  <Text style={[s.refCellText, isCurrent && { color: Colors.accent, fontWeight: "700" }]}>
                    Day {m.day}
                  </Text>
                </View>
                <Text style={[s.refCell, s.refCellText, { color: Colors.info }]}>{m.targets.bkt1}%</Text>
                <Text style={[s.refCell, s.refCellText, { color: Colors.warning }]}>{m.targets.bkt2}%</Text>
                <Text style={[s.refCell, s.refCellText, { color: Colors.danger }]}>{m.targets.bkt3}%</Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* BKT cards */}
      <Text style={s.sectionHeading}>Recovery by BKT</Text>
      {(["bkt1", "bkt2", "bkt3"] as const).map((bkt) => (
        <BktDRRCard key={bkt} bkt={bkt} data={drr[bkt]} todayDate={today} />
      ))}
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:           { padding: 14, gap: 14 },
  sectionHeading:      { fontSize: 16, fontWeight: "800", color: Colors.text, marginTop: 4 },

  // Summary card
  summaryCard:         { backgroundColor: Colors.surface, borderRadius: 18, padding: 18, gap: 12, borderWidth: 1, borderColor: Colors.border, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 5 },
  summaryRow:          { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryLeft:         { gap: 4 },
  summaryTitle:        { fontSize: 18, fontWeight: "800", color: Colors.text },
  summaryDate:         { fontSize: 12, color: Colors.textSecondary },
  summaryRight:        { alignItems: "flex-end" },
  summaryPct:          { fontSize: 32, fontWeight: "900", color: Colors.primary, letterSpacing: -1 },
  summaryPctLabel:     { fontSize: 11, color: Colors.textSecondary, textTransform: "uppercase" },
  summaryDivider:      { height: 1, backgroundColor: Colors.border },
  summaryStatsRow:     { flexDirection: "row", gap: 6 },
  summaryStat:         { flex: 1, gap: 3 },
  summaryStatLabel:    { fontSize: 9, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase" },
  summaryStatValue:    { fontSize: 13, fontWeight: "800", color: Colors.text },
  countdownBanner:     { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1 },
  countdownText:       { flex: 1, fontSize: 13, color: Colors.accent, fontWeight: "600" },

  // Reference table
  referenceCard:       { backgroundColor: Colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.border },
  referenceTitle:      { fontSize: 14, fontWeight: "700", color: Colors.text, marginBottom: 10 },
  referenceTable:      { gap: 0 },
  refRow:              { flexDirection: "row", paddingVertical: 8, paddingHorizontal: 4, borderRadius: 8 },
  refHeaderRow:        { backgroundColor: Colors.surfaceAlt, marginBottom: 2 },
  refCell:             { flex: 1, alignItems: "center" as any, justifyContent: "center" as any },
  refHeader:           { fontSize: 10, fontWeight: "800", color: Colors.textMuted, textTransform: "uppercase", textAlign: "center" as any },
  refCellText:         { fontSize: 13, fontWeight: "700", color: Colors.text, textAlign: "center" as any },
  activeIndicator:     { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.accent },

  // BKT cards
  bktCard:             { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, borderLeftWidth: 4, borderWidth: 1, borderColor: Colors.border, gap: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 3 },
  bktCardHeader:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  bktBadge:            { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  bktBadgeText:        { fontSize: 13, fontWeight: "800" },
  drrBadge:            { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  drrBadgeText:        { fontSize: 13, fontWeight: "800" },
  noDataText:          { fontSize: 13, color: Colors.textMuted, textAlign: "center", paddingVertical: 12 },

  statsRow:            { flexDirection: "row", gap: 8 },
  statBox:             { flex: 1, backgroundColor: Colors.surfaceAlt, borderRadius: 10, padding: 10, gap: 4 },
  statLabel:           { fontSize: 9, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase" },
  statValue:           { fontSize: 14, fontWeight: "800", color: Colors.text },

  milestoneBox:        { borderRadius: 12, padding: 12, gap: 8 },
  milestoneHeader:     { flexDirection: "row", alignItems: "center", gap: 7 },
  milestoneTitle:      { flex: 1, fontSize: 13, fontWeight: "700" },
  daysBadge:           { backgroundColor: Colors.accent + "20", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  daysBadgeText:       { fontSize: 11, fontWeight: "700", color: Colors.accent },
  milestoneStats:      { flexDirection: "row", gap: 6 },
  milestoneStatItem:   { flex: 1, gap: 3 },
  milestoneStatDivider:{ width: 1, backgroundColor: Colors.border },
  milestoneStatLabel:  { fontSize: 9, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase" },
  milestoneStatValue:  { fontSize: 13, fontWeight: "800" },

  allMilestones:       { gap: 6 },
  allMilestonesTitle:  { fontSize: 10, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  milestoneRow:        { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  milestoneRowText:    { flex: 1, fontSize: 12, color: Colors.text, fontWeight: "600" },
  milestoneRowTarget:  { fontSize: 12, fontWeight: "800", minWidth: 38, textAlign: "right" as any },
  milestoneRowNeed:    { fontSize: 11, color: Colors.textSecondary, minWidth: 70, textAlign: "right" as any },
});

import React, { useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  ActivityIndicator, Platform, Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";
import { getApiUrl } from "@/lib/query-client";
import { useCompany } from "@/context/CompanyContext";
import { CompanyFilterBar } from "@/components/CompanyFilterBar";

// ─── Milestone config ─────────────────────────────────────────────────────────
const MILESTONES = [
  { day: 10, label: "1st Milestone", targets: { bkt1: 28, bkt2: 22, bkt3: 18 } },
  { day: 15, label: "2nd Milestone", targets: { bkt1: 60, bkt2: 48, bkt3: 40 } },
  { day: 20, label: "3rd Milestone", targets: { bkt1: 80, bkt2: 65, bkt3: 45 } },
  { day: 25, label: "4th Milestone", targets: { bkt1: 85, bkt2: 68, bkt3: 60 } },
];

function getNextMilestone(today: number) {
  return MILESTONES.find((m) => m.day >= today) ?? MILESTONES[MILESTONES.length - 1];
}

function fmt(v: number) {
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000)   return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
function StatCard({
  label, value, icon, color,
}: {
  label: string; value: string | number;
  icon: React.ComponentProps<typeof Ionicons>["name"]; color: string;
}) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <View style={[styles.statIconWrap, { backgroundColor: color + "20" }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ─── DRR Widget ───────────────────────────────────────────────────────────────
function DRRWidget({ rows }: { rows: any[] }) {
  const today    = new Date().getDate();
  const next     = getNextMilestone(today);
  const daysLeft = Math.max(0, next.day - today);

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
  if (totalPos === 0) return null;

  const effectiveDays = Math.max(1, daysLeft);
  const bktMeta = [
    { key: "bkt1" as const, label: "BKT 1", color: Colors.info },
    { key: "bkt2" as const, label: "BKT 2", color: Colors.warning },
    { key: "bkt3" as const, label: "BKT 3", color: Colors.danger },
  ];
  const requiredRows = bktMeta.map(({ key, label, color }) => {
    const d = bktMap[key];
    if (!d || d.total === 0) return null;
    const targetPct    = next.targets[key];
    const targetAmount = (targetPct / 100) * d.total;
    const remaining    = Math.max(0, targetAmount - d.paid);
    const dailyNeeded  = remaining / effectiveDays;
    const currentPct   = (d.paid / d.total) * 100;
    const achieved     = currentPct >= targetPct;
    return { key, label, color, dailyNeeded, remaining, achieved, currentPct, targetPct };
  }).filter(Boolean) as any[];

  const totalRemaining   = requiredRows.reduce((s: number, r: any) => s + r.remaining, 0);
  const overallDailyNeed = totalRemaining / effectiveDays;

  return (
    <Pressable style={drrW.card} onPress={() => router.push("/(app)/drr" as any)}>
      <View style={drrW.header}>
        <View style={drrW.headerLeft}>
          <View style={drrW.iconWrap}>
            <Ionicons name="trending-up" size={16} color={Colors.primary} />
          </View>
          <View>
            <Text style={drrW.title}>Today's DRR</Text>
            <Text style={drrW.sub}>Day {today} · {daysLeft}d to {next.label}</Text>
          </View>
        </View>
        <View style={drrW.pctWrap}>
          <Text style={drrW.pct}>{overallPct.toFixed(1)}%</Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
        </View>
      </View>

      <View style={drrW.barTrack}>
        <View style={[drrW.barFill, {
          width: `${Math.min(100, overallPct)}%` as any,
          backgroundColor: overallPct >= 60 ? Colors.success : overallPct >= 30 ? Colors.warning : Colors.danger,
        }]} />
      </View>

      <View style={drrW.bktRow}>
        {(["bkt1", "bkt2", "bkt3"] as const).map((bkt) => {
          const d = bktMap[bkt];
          if (!d || d.total === 0) return null;
          const bktColor  = bkt === "bkt1" ? Colors.info : bkt === "bkt2" ? Colors.warning : Colors.danger;
          const bktLabel  = bkt === "bkt1" ? "BKT 1" : bkt === "bkt2" ? "BKT 2" : "BKT 3";
          const currentPct = (d.paid / d.total) * 100;
          const targetPct  = next.targets[bkt];
          const achieved   = currentPct >= targetPct;
          return (
            <View key={bkt} style={[drrW.bktChip, { borderColor: bktColor + "50" }]}>
              <Text style={[drrW.bktChipLabel, { color: bktColor }]}>{bktLabel}</Text>
              <Text style={[drrW.bktChipPct, { color: achieved ? Colors.success : Colors.text }]}>
                {currentPct.toFixed(1)}%
              </Text>
              <Text style={drrW.bktChipTarget}>/{targetPct}%</Text>
            </View>
          );
        })}
      </View>

      {requiredRows.length > 0 && (
        <View style={drrW.reqSection}>
          <View style={drrW.reqHeader}>
            <Ionicons name="flash" size={13} color={Colors.warning} />
            <Text style={drrW.reqHeaderText}>
              {daysLeft === 0 ? `Collect today for ${next.label}` : `Daily POS to reach ${next.label}`}
            </Text>
            <View style={drrW.reqDaysBadge}>
              <Text style={drrW.reqDaysBadgeText}>{daysLeft === 0 ? "Today!" : `${daysLeft}d left`}</Text>
            </View>
          </View>
          {requiredRows.map((r: any) => (
            <View key={r.key} style={drrW.reqRow}>
              <View style={[drrW.reqBktDot, { backgroundColor: r.color }]} />
              <Text style={[drrW.reqBktLabel, { color: r.color }]}>{r.label}</Text>
              {r.achieved ? (
                <View style={drrW.reqAchievedWrap}>
                  <Ionicons name="checkmark-circle" size={13} color={Colors.success} />
                  <Text style={drrW.reqAchievedText}>Target reached!</Text>
                </View>
              ) : (
                <View style={drrW.reqAmtWrap}>
                  <Text style={drrW.reqDailyAmt}>{fmt(r.dailyNeeded)}/day</Text>
                  <Text style={drrW.reqRemainingAmt}>({fmt(r.remaining)} left)</Text>
                </View>
              )}
            </View>
          ))}
          {totalRemaining > 0 && (
            <View style={drrW.reqTotalRow}>
              <Text style={drrW.reqTotalLabel}>Total needed/day</Text>
              <Text style={drrW.reqTotalAmt}>{fmt(overallDailyNeed)}</Text>
            </View>
          )}
        </View>
      )}

      <View style={drrW.footer}>
        <Text style={drrW.footerText}>
          {fmt(totalPaid)} collected of {fmt(totalPos)} total · Tap for details
        </Text>
      </View>
    </Pressable>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const insets              = useSafeAreaInsets();
 const { selectedCompany, setSelectedCompany } = useCompany();
const company = selectedCompany === "All" ? null : selectedCompany;
  
  const { data: stats, isLoading, refetch: refetchStats } = useQuery({
    queryKey:  ["/api/stats", company],
    queryFn:   () => api.getStats({ company }),
  });

  const { data: ptpData, isLoading: ptpLoading, refetch: refetchPtp } = useQuery({
    queryKey: ["/api/today-ptp", company],
    queryFn:  () => api.getTodayPtp({ company }),
  });

  const { data: drrData, refetch: refetchDrr } = useQuery({
    queryKey: ["/api/bkt-perf-summary", company],
    queryFn:  () => api.getBktPerfSummary({ company }),
  });

  const { data: twSummaryData, refetch: refetchTw } = useQuery({
    queryKey: ["/api/bkt-tw-collection-summary", company],
    queryFn:  () => api.getBktTwCollectionSummary({ company }),
  });

  const { data: companiesData } = useQuery({
  queryKey: ["/api/companies"],
  queryFn:  () => api.getCompanies(),
});

  const refetch = useCallback(() => {
    refetchStats(); refetchPtp(); refetchDrr(); refetchTw();
  }, [refetchStats, refetchPtp, refetchDrr, refetchTw]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background }}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  const ptpCases: any[] = ptpData?.cases ?? [];
  const ptpCount:  number = ptpData?.count ?? 0;
  const drrRows:   any[]  = drrData?.rows  ?? [];

  const twSummary: Record<string, any> = {};
  (twSummaryData?.summary ?? []).forEach((row: any) => { twSummary[row.case_category] = row; });
  const hasTwData = !!twSummaryData;

  const fmtNum = (v: number) =>
    v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {/* Company Filter Bar */}
      <CompanyFilterBar
  companies={companiesData?.companies ?? []}
  selected={selectedCompany}
  onSelect={(company) => {
    setSelectedCompany(company);
    refetch();
  }}
/>
      <ScrollView
        contentContainerStyle={[styles.container, {
          paddingBottom: insets.bottom + 24,
          paddingTop: Platform.OS === "web" ? 16 : 12,
        }]}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={Colors.primary} />}
      >
        {/* Company context indicator */}
        {company && (
          <View style={styles.companyBanner}>
            <Ionicons name="business" size={13} color={Colors.primary} />
            <Text style={styles.companyBannerText}>Showing: {company}</Text>
          </View>
        )}

        <Text style={styles.sectionHeading}>Overview</Text>

        <View style={styles.statsGrid}>
          <StatCard label="Total Cases" value={stats?.total      ?? 0} icon="briefcase"      color={Colors.info}    />
          <StatCard label="Paid"        value={stats?.paid       ?? 0} icon="checkmark-circle" color={Colors.success} />
          <StatCard label="PTP"         value={stats?.ptp        ?? 0} icon="calendar"        color={Colors.accent}  />
          <StatCard label="Not Process" value={stats?.notProcess ?? 0} icon="close-circle"   color={Colors.danger}  />
        </View>

        {/* DRR Widget */}
        {drrRows.length > 0 && <DRRWidget rows={drrRows} />}

        {/* TW Collection Summary */}
        {hasTwData && (
          <View style={styles.twCard}>
            <View style={styles.twHeader}>
              <View style={[styles.twIconWrap, { backgroundColor: Colors.warning + "20" }]}>
                <Ionicons name="bicycle" size={18} color={Colors.warning} />
              </View>
              <Text style={styles.twTitle}>TW Collected (BKT-wise)</Text>
            </View>
            <View style={styles.twGrid}>
              {[
                { key: "bkt1", label: "BKT 1", color: Colors.info    },
                { key: "bkt2", label: "BKT 2", color: Colors.warning  },
                { key: "bkt3", label: "BKT 3", color: Colors.danger   },
              ].map(({ key, label, color }) => {
                const s = twSummary[key];
                return (
                  <View key={key} style={[styles.twBox, { borderTopColor: color }]}>
                    <Text style={[styles.twBoxLabel, { color }]}>{label}</Text>
                    <Text style={styles.twBoxAmount}>{s ? fmt(parseFloat(s.amount_collected)) : "₹0"}</Text>
                    <Text style={styles.twBoxSub}>{s ? `${s.count_paid}/${s.count_total} cases` : "0 cases"}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* PTP Card */}
        <View style={styles.ptpCard}>
          <View style={styles.ptpHeader}>
            <View style={[styles.ptpBadge, { backgroundColor: Colors.accent + "20" }]}>
              <Ionicons name="calendar-outline" size={16} color={Colors.accent} />
            </View>
            <Text style={styles.ptpTitle}>Today's PTP</Text>
            <View style={[styles.countBadge, { backgroundColor: ptpCount > 0 ? Colors.accent : Colors.border }]}>
              <Text style={[styles.countBadgeText, { color: ptpCount > 0 ? "#fff" : Colors.textMuted }]}>
                {ptpLoading ? "…" : ptpCount}
              </Text>
            </View>
          </View>

          {ptpLoading ? (
            <ActivityIndicator color={Colors.accent} size="small" style={{ marginTop: 12 }} />
          ) : ptpCases.length === 0 ? (
            <Text style={styles.emptyText}>No PTP cases due today</Text>
          ) : (
            <View style={styles.ptpList}>
              {ptpCases.map((c: any, i: number) => {
                const teleDate = c.telecaller_ptp_date ? String(c.telecaller_ptp_date).slice(0, 10) : null;
                const fosDate  = c.ptp_date ? String(c.ptp_date).slice(0, 10) : null;
                return (
                  <View key={`${c.source}-${c.id}`} style={[styles.ptpRow, i > 0 && styles.ptpRowBorder]}>
                    <View style={styles.ptpRowLeft}>
                      <Text style={styles.ptpName}>{c.customer_name}</Text>
                      <Text style={styles.ptpLoan}>{c.loan_no}</Text>
                      <View style={styles.ptpDatesRow}>
                        {teleDate && (
                          <View style={[styles.ptpDateTag, { backgroundColor: Colors.info + "22" }]}>
                            <Text style={[styles.ptpDateLabel, { color: Colors.info }]}>TC: {teleDate}</Text>
                          </View>
                        )}
                        {fosDate && (
                          <View style={[styles.ptpDateTag, { backgroundColor: Colors.accent + "22" }]}>
                            <Text style={[styles.ptpDateLabel, { color: Colors.accent }]}>FOS: {fosDate}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <Text style={[styles.ptpPos, { color: Colors.accent }]}>
                      {fmtNum(parseFloat(c.pos) || 0)}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:       { padding: 16, gap: 16 },
  sectionHeading:  { fontSize: 20, fontWeight: "800", color: Colors.text, letterSpacing: -0.5, marginBottom: 4 },
  companyBanner:   { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.primary + "10", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: Colors.primary + "25", marginBottom: -4 },
  companyBannerText: { fontSize: 12, fontWeight: "700", color: Colors.primary },
  statsGrid:       { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard:        { width: "47%", backgroundColor: Colors.surface, borderRadius: 16, padding: 16, borderLeftWidth: 3, gap: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4, borderWidth: 1, borderColor: Colors.border },
  statIconWrap:    { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  statValue:       { fontSize: 30, fontWeight: "900", color: Colors.text, letterSpacing: -1 },
  statLabel:       { fontSize: 12, color: Colors.textSecondary, fontWeight: "600", letterSpacing: 0.3 },
  ptpCard:         { backgroundColor: Colors.surface, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: Colors.border, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4 },
  ptpHeader:       { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  ptpBadge:        { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  ptpTitle:        { flex: 1, fontSize: 15, fontWeight: "700", color: Colors.text },
  countBadge:      { minWidth: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  countBadgeText:  { fontSize: 13, fontWeight: "800" },
  emptyText:       { fontSize: 13, color: Colors.textMuted, textAlign: "center", paddingVertical: 12 },
  ptpList:         { gap: 0 },
  ptpRow:          { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  ptpRowBorder:    { borderTopWidth: 1, borderTopColor: Colors.border },
  ptpRowLeft:      { flex: 1, gap: 2 },
  ptpName:         { fontSize: 14, fontWeight: "600", color: Colors.text },
  ptpLoan:         { fontSize: 12, color: Colors.textMuted },
  ptpPos:          { fontSize: 14, fontWeight: "700" },
  ptpDatesRow:     { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },
  ptpDateTag:      { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  ptpDateLabel:    { fontSize: 11, fontWeight: "600" },
  twCard:          { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: Colors.border, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  twHeader:        { flexDirection: "row", alignItems: "center", gap: 10 },
  twIconWrap:      { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  twTitle:         { fontSize: 14, fontWeight: "800", color: Colors.text },
  twGrid:          { flexDirection: "row", gap: 8 },
  twBox:           { flex: 1, backgroundColor: Colors.surfaceAlt, borderRadius: 10, padding: 10, alignItems: "center", borderTopWidth: 3 },
  twBoxLabel:      { fontSize: 11, fontWeight: "700", marginBottom: 4 },
  twBoxAmount:     { fontSize: 14, fontWeight: "900", color: Colors.text },
  twBoxSub:        { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
});

const drrW = StyleSheet.create({
  card:             { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, borderColor: Colors.primary + "40", shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 3 },
  header:           { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerLeft:       { flexDirection: "row", alignItems: "center", gap: 10 },
  iconWrap:         { width: 32, height: 32, borderRadius: 10, backgroundColor: Colors.primary + "18", alignItems: "center", justifyContent: "center" },
  title:            { fontSize: 14, fontWeight: "800", color: Colors.text },
  sub:              { fontSize: 11, color: Colors.textSecondary },
  pctWrap:          { flexDirection: "row", alignItems: "center", gap: 4 },
  pct:              { fontSize: 22, fontWeight: "900", color: Colors.primary },
  barTrack:         { height: 8, backgroundColor: Colors.border, borderRadius: 4, overflow: "hidden" },
  barFill:          { height: "100%", borderRadius: 4 },
  bktRow:           { flexDirection: "row", gap: 8 },
  bktChip:          { flex: 1, backgroundColor: Colors.surfaceAlt, borderRadius: 8, padding: 8, alignItems: "center", gap: 1, borderWidth: 1 },
  bktChipLabel:     { fontSize: 9, fontWeight: "700", textTransform: "uppercase" },
  bktChipPct:       { fontSize: 13, fontWeight: "800" },
  bktChipTarget:    { fontSize: 9, color: Colors.textMuted },
  footer:           { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 8 },
  footerText:       { fontSize: 11, color: Colors.textSecondary, textAlign: "center" as any },
  reqSection:       { backgroundColor: Colors.surfaceAlt, borderRadius: 10, padding: 10, gap: 8, borderWidth: 1, borderColor: Colors.warning + "30" },
  reqHeader:        { flexDirection: "row", alignItems: "center", gap: 6 },
  reqHeaderText:    { flex: 1, fontSize: 11, fontWeight: "700", color: Colors.textSecondary },
  reqDaysBadge:     { backgroundColor: Colors.warning + "25", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  reqDaysBadgeText: { fontSize: 10, fontWeight: "800", color: Colors.warning },
  reqRow:           { flexDirection: "row", alignItems: "center", gap: 6 },
  reqBktDot:        { width: 7, height: 7, borderRadius: 4 },
  reqBktLabel:      { fontSize: 11, fontWeight: "700", width: 38 },
  reqAmtWrap:       { flex: 1, flexDirection: "row", alignItems: "baseline", gap: 4 },
  reqDailyAmt:      { fontSize: 13, fontWeight: "800", color: Colors.text },
  reqRemainingAmt:  { fontSize: 10, color: Colors.textMuted },
  reqAchievedWrap:  { flex: 1, flexDirection: "row", alignItems: "center", gap: 4 },
  reqAchievedText:  { fontSize: 11, fontWeight: "600", color: Colors.success },
  reqTotalRow:      { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 6, marginTop: 2 },
  reqTotalLabel:    { fontSize: 11, fontWeight: "600", color: Colors.textSecondary },
  reqTotalAmt:      { fontSize: 14, fontWeight: "900", color: Colors.warning },
});

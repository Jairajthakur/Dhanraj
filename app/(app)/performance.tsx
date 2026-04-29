import React from "react";
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";
import { useCompany } from "@/context/CompanyContext";
import { CompanyFilterBar } from "@/components/CompanyFilterBar";

const BKT_TARGETS: Record<string, { resolution: number; rollback?: number }> = {
  bkt1:  { resolution: 92, rollback: 22 },
  bkt2:  { resolution: 80, rollback: 18 },
  bkt3:  { resolution: 75, rollback: 17 },
  penal: { resolution: 3.5 },
};

const BKT_COLORS: Record<string, string> = {
  bkt1:  Colors.info,
  bkt2:  Colors.warning,
  bkt3:  Colors.danger,
  penal: Colors.primaryLight,
};

function getBktColor(bkt: string) {
  const k = String(bkt || "").toLowerCase().replace(/\s/g, "");
  return BKT_COLORS[k] || Colors.primary;
}

function getBktTargets(bkt: string) {
  const k = String(bkt || "").toLowerCase().replace(/\s/g, "");
  return BKT_TARGETS[k] || null;
}

function fmtAmt(n: number) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function pctOf(paid: number, total: number) {
  return total > 0 ? (paid / total) * 100 : 0;
}

function ProgressBar({ pct, color, targetPct }: { pct: number; color: string; targetPct?: number }) {
  return (
    <View style={styles.trackWrap}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.min(pct, 100)}%`, backgroundColor: color }]} />
        {targetPct != null && (
          <View style={[styles.targetMark, { left: `${Math.min(targetPct, 100)}%` as any }]} />
        )}
      </View>
    </View>
  );
}

function SummaryCard({ row }: { row: any }) {
  const color   = getBktColor(row.bkt);
  const targets = getBktTargets(row.bkt);
  const rawBkt  = String(row.bkt || "").toLowerCase();
  const isPenal = rawBkt === "penal";

  const posPaid       = parseFloat(row.pos_paid        || 0);
  const posUnpaid     = parseFloat(row.pos_unpaid      || 0);
  const posGrandTotal = parseFloat(row.pos_grand_total || 0);
  const resPct        = pctOf(posPaid, posGrandTotal);
  const rbPaid        = parseFloat(row.rollback_paid        || 0);
  const rbGrandTotal  = parseFloat(row.rollback_grand_total || 0);
  const rbPct         = pctOf(rbPaid, rbGrandTotal);

  const requiredRes = targets && posGrandTotal > 0
    ? Math.max(0, (targets.resolution / 100) * posGrandTotal - posPaid)
    : null;
  const requiredRb  = targets?.rollback != null && rbGrandTotal > 0
    ? Math.max(0, (targets.rollback / 100) * rbGrandTotal - rbPaid)
    : null;

  const bktLabel = isPenal ? "PENAL" : rawBkt.replace("bkt", "BKT ");

  if (isPenal) {
    const penalCbcPaid    = parseFloat(row.count_paid  || 0);
    const penalMoneyPaid  = parseFloat(row.pos_paid    || 0);
    const penalMoneyTotal = penalMoneyPaid + parseFloat(row.pos_unpaid || 0);
    const penalTarget     = penalMoneyTotal > 0 ? 0.035 * penalMoneyTotal : null;
    const penalRequired   = penalTarget !== null ? penalTarget - penalCbcPaid : null;
    return (
      <View style={[styles.card, { borderLeftColor: color }]}>
        <View style={styles.cardTop}>
          <View style={[styles.badge, { backgroundColor: color + "22" }]}>
            <Text style={[styles.badgeText, { color }]}>PENAL</Text>
          </View>
          <View style={[styles.targetChip, { backgroundColor: color + "18" }]}>
            <Text style={[styles.badgeText, { color }]}>Target 3.5%</Text>
          </View>
        </View>
        <View style={styles.divider} />
        <View style={styles.triRow}>
          <View style={styles.triCell}>
            <Text style={styles.triLabel}>Paid (Col CBC)</Text>
            <Text style={[styles.triVal, { color: Colors.success }]}>{Math.round(penalCbcPaid).toLocaleString()}</Text>
          </View>
          <View style={styles.triCell}>
            <Text style={styles.triLabel}>Target Amt (3.5%)</Text>
            <Text style={[styles.triVal, { color: Colors.primary, fontSize: 14 }]}>
              {penalTarget === null ? "—" : fmtAmt(penalTarget)}
            </Text>
          </View>
          <View style={styles.triCell}>
            <Text style={styles.triLabel}>Required</Text>
            <Text style={[styles.triVal, { color: penalRequired !== null && penalRequired <= 0 ? Colors.success : Colors.danger, fontSize: 14 }]}>
              {penalRequired === null ? "—" : penalRequired <= 0 ? "✓ Met" : fmtAmt(penalRequired)}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.card, { borderLeftColor: color }]}>
      <View style={styles.cardTop}>
        <View style={[styles.badge, { backgroundColor: color + "22" }]}>
          <Text style={[styles.badgeText, { color }]}>{bktLabel}</Text>
        </View>
        <Text style={[styles.bigPct, { color }]}>{resPct.toFixed(1)}%</Text>
      </View>
      <View style={styles.divider} />

      <Text style={styles.sectionTitle}>POS</Text>
      <View style={styles.triRow}>
        <View style={styles.triCell}>
          <Text style={styles.triLabel}>Paid</Text>
          <Text style={[styles.triVal, { color: Colors.success }]}>{fmtAmt(posPaid)}</Text>
        </View>
        <View style={styles.triCell}>
          <Text style={styles.triLabel}>Unpaid</Text>
          <Text style={[styles.triVal, { color: Colors.danger }]}>{fmtAmt(posUnpaid)}</Text>
        </View>
        <View style={styles.triCell}>
          <Text style={styles.triLabel}>Total</Text>
          <Text style={[styles.triVal, { color }]}>{fmtAmt(posGrandTotal)}</Text>
        </View>
      </View>
      <View style={styles.divider} />

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Resolution</Text>
        {targets && (
          <Text style={[styles.targetChip, { backgroundColor: Colors.success + "18", color: Colors.success }]}>
            Target {targets.resolution}%
          </Text>
        )}
      </View>
      <ProgressBar pct={resPct} color={color} targetPct={targets?.resolution} />
      <View style={styles.triRow}>
        <View style={styles.triCell}>
          <Text style={styles.triLabel}>Paid POS</Text>
          <Text style={[styles.triVal, { color: Colors.success }]}>{fmtAmt(posPaid)}</Text>
        </View>
        <View style={styles.triCell}>
          <Text style={styles.triLabel}>Res %</Text>
          <Text style={[styles.triVal, { color }]}>{resPct.toFixed(1)}%</Text>
        </View>
        <View style={styles.triCell}>
          <Text style={styles.triLabel}>Req to Target</Text>
          <Text style={[styles.triVal, { color: requiredRes === 0 ? Colors.success : Colors.danger }]}>
            {requiredRes === null ? "—" : requiredRes === 0 ? "✓ Met" : fmtAmt(requiredRes)}
          </Text>
        </View>
      </View>

      {targets?.rollback != null && (
        <>
          <View style={styles.divider} />
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Rollback</Text>
            <Text style={[styles.targetChip, { backgroundColor: Colors.info + "18", color: Colors.info }]}>
              Target {targets.rollback}%
            </Text>
          </View>
          <ProgressBar pct={rbPct} color={Colors.info} targetPct={targets.rollback} />
          <View style={styles.triRow}>
            <View style={styles.triCell}>
              <Text style={styles.triLabel}>Marked Yes POS</Text>
              <Text style={[styles.triVal, { color: Colors.success }]}>{fmtAmt(rbPaid)}</Text>
            </View>
            <View style={styles.triCell}>
              <Text style={styles.triLabel}>RB %</Text>
              <Text style={[styles.triVal, { color: Colors.info }]}>{rbPct.toFixed(1)}%</Text>
            </View>
            <View style={styles.triCell}>
              <Text style={styles.triLabel}>Req to Target</Text>
              <Text style={[styles.triVal, { color: requiredRb === 0 ? Colors.success : Colors.danger }]}>
                {requiredRb === null ? "—" : requiredRb === 0 ? "✓ Met" : fmtAmt(requiredRb)}
              </Text>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

export default function PerformanceScreen() {
  const insets              = useSafeAreaInsets();
  const { selectedCompany } = useCompany();

  const { data: summaryData, isLoading, refetch } = useQuery({
    queryKey: ["/api/bkt-perf-summary", selectedCompany],
    queryFn:  () => api.getBktPerfSummary({ company: selectedCompany }),
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background }}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  const summaryRows: any[] = (summaryData?.rows ?? [])
    .filter((r: any) =>
      String(r.bkt).startsWith("bkt") ||
      String(r.bkt).startsWith("BKT") ||
      r.bkt === "penal"
    )
    .sort((a: any, b: any) => String(a.bkt).localeCompare(String(b.bkt)));

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <CompanyFilterBar onSelect={() => refetch()} />

      <ScrollView
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: Platform.OS === "web" ? 16 : 16,
            paddingBottom: insets.bottom + 24,
          },
        ]}
      >
        {selectedCompany && (
          <View style={styles.companyBanner}>
            <Text style={styles.companyBannerText}>📊 Performance for: {selectedCompany}</Text>
          </View>
        )}

        {summaryRows.length > 0 ? (
          summaryRows.map((r, i) => <SummaryCard key={`sum-${i}`} row={r} />)
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No BKT cases yet</Text>
            <Text style={styles.emptySubText}>
              Performance will appear here once cases are assigned to you
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { padding: 16, gap: 14 },
  companyBanner:   { backgroundColor: Colors.primary + "10", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: Colors.primary + "25", marginBottom: -2 },
  companyBannerText: { fontSize: 13, fontWeight: "700", color: Colors.primary },
  card:            { backgroundColor: Colors.surface, borderRadius: 16, borderLeftWidth: 4, padding: 16, gap: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  cardTop:         { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  badge:           { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  badgeText:       { fontSize: 13, fontWeight: "800", textTransform: "uppercase" },
  bigPct:          { fontSize: 32, fontWeight: "900" },
  divider:         { height: 1, backgroundColor: Colors.border, marginVertical: 2 },
  sectionHeader:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle:    { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6, color: Colors.textMuted },
  targetChip:      { fontSize: 10, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  trackWrap:       { marginVertical: 4 },
  track:           { height: 8, backgroundColor: Colors.border, borderRadius: 4, overflow: "visible", position: "relative" },
  fill:            { height: 8, borderRadius: 4, position: "absolute", left: 0, top: 0 },
  targetMark:      { position: "absolute", top: -3, width: 2, height: 14, backgroundColor: Colors.primary, borderRadius: 1 },
  triRow:          { flexDirection: "row", gap: 4 },
  triCell:         { flex: 1, alignItems: "center", gap: 2 },
  triLabel:        { fontSize: 9, color: Colors.textMuted, fontWeight: "600", textTransform: "uppercase", textAlign: "center" },
  triVal:          { fontSize: 13, fontWeight: "800", textAlign: "center" },
  empty:           { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 80, gap: 8 },
  emptyText:       { fontSize: 16, fontWeight: "700", color: Colors.textMuted },
  emptySubText:    { fontSize: 13, color: Colors.textMuted, textAlign: "center" },
});

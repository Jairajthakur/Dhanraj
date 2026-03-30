import React from "react";
import {
  View, Text, StyleSheet, ScrollView,
  ActivityIndicator, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

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
  penal: Colors.primaryLight ?? Colors.primary,
};

function getBktColor(bkt: string) {
  return BKT_COLORS[String(bkt || "").toLowerCase().replace(/\s/g, "")] || Colors.primary;
}
function getBktTargets(bkt: string) {
  return BKT_TARGETS[String(bkt || "").toLowerCase().replace(/\s/g, "")] || null;
}
function fmtAmt(n: number) {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
  if (n >= 100000)   return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000)     return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}
function pctOf(paid: number, total: number) {
  return total > 0 ? (paid / total) * 100 : 0;
}

// ─── Simple horizontal bar ────────────────────────────────────────────────────
function Bar({ pct, color, target }: { pct: number; color: string; target?: number }) {
  const filled = Math.min(pct, 100);
  const achieved = target != null && pct >= target;
  return (
    <View style={b.track}>
      <View style={[b.fill, {
        width: `${filled}%` as any,
        backgroundColor: achieved ? Colors.success : color,
      }]} />
      {target != null && (
        <View style={[b.marker, { left: `${Math.min(target, 100)}%` as any }]} />
      )}
    </View>
  );
}
const b = StyleSheet.create({
  track:  { height: 12, backgroundColor: Colors.border, borderRadius: 6, overflow: "visible", position: "relative", marginVertical: 6 },
  fill:   { position: "absolute", left: 0, top: 0, height: 12, borderRadius: 6 },
  marker: { position: "absolute", top: -3, width: 2, height: 18, backgroundColor: Colors.primary, borderRadius: 1 },
});

// ─── Single BKT Card ─────────────────────────────────────────────────────────
function BktCard({ row }: { row: any }) {
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

  const countPaid   = parseInt(row.count_paid   || 0);
  const countUnpaid = parseInt(row.count_unpaid || 0);
  const countTotal  = parseInt(row.count_total  || 0);

  const bktLabel = isPenal ? "PENAL" : rawBkt.replace("bkt", "BKT ");

  // How much more needed to hit target
  const needRes = targets && posGrandTotal > 0
    ? Math.max(0, (targets.resolution / 100) * posGrandTotal - posPaid)
    : null;
  const needRb = targets?.rollback != null && rbGrandTotal > 0
    ? Math.max(0, (targets.rollback / 100) * rbGrandTotal - rbPaid)
    : null;

  const resAchieved = targets ? resPct >= targets.resolution : false;
  const rbAchieved  = targets?.rollback != null ? rbPct >= targets.rollback : false;

  if (isPenal) {
    const penalTarget = posGrandTotal > 0 ? 0.035 * posGrandTotal : null;
    const penalNeed   = penalTarget !== null ? Math.max(0, penalTarget - posPaid) : null;
    return (
      <View style={[c.card, { borderLeftColor: color }]}>
        <View style={c.cardHead}>
          <View style={[c.badge, { backgroundColor: color + "22" }]}>
            <Text style={[c.badgeText, { color }]}>PENAL</Text>
          </View>
          <Text style={[c.targetLabel, { color }]}>Target: 3.5%</Text>
        </View>
        <View style={c.row3}>
          <View style={c.cell}>
            <Text style={c.cellLabel}>Collected</Text>
            <Text style={[c.cellVal, { color: Colors.success }]}>{Math.round(posPaid).toLocaleString()}</Text>
          </View>
          <View style={c.cell}>
            <Text style={c.cellLabel}>Target Amt</Text>
            <Text style={[c.cellVal, { color: Colors.primary }]}>{penalTarget === null ? "—" : fmtAmt(penalTarget)}</Text>
          </View>
          <View style={c.cell}>
            <Text style={c.cellLabel}>Still Need</Text>
            <Text style={[c.cellVal, { color: penalNeed !== null && penalNeed <= 0 ? Colors.success : Colors.danger }]}>
              {penalNeed === null ? "—" : penalNeed <= 0 ? "✓ Done" : fmtAmt(penalNeed)}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[c.card, { borderLeftColor: color }]}>
      {/* Title row */}
      <View style={c.cardHead}>
        <View style={[c.badge, { backgroundColor: color + "22" }]}>
          <Text style={[c.badgeText, { color }]}>{bktLabel}</Text>
        </View>
        <Text style={[c.bigPct, { color }]}>{resPct.toFixed(1)}%</Text>
      </View>

      {/* Cases count */}
      <View style={c.casesRow}>
        <View style={[c.caseChip, { backgroundColor: Colors.success + "18" }]}>
          <Ionicons name="checkmark-circle" size={13} color={Colors.success} />
          <Text style={[c.caseChipText, { color: Colors.success }]}>{countPaid} Paid</Text>
        </View>
        <View style={[c.caseChip, { backgroundColor: Colors.danger + "18" }]}>
          <Ionicons name="close-circle" size={13} color={Colors.danger} />
          <Text style={[c.caseChipText, { color: Colors.danger }]}>{countUnpaid} Unpaid</Text>
        </View>
        <View style={[c.caseChip, { backgroundColor: Colors.border }]}>
          <Ionicons name="layers-outline" size={13} color={Colors.textSecondary} />
          <Text style={[c.caseChipText, { color: Colors.textSecondary }]}>{countTotal} Total</Text>
        </View>
      </View>

      <View style={c.divider} />

      {/* ── POS / Collection ── */}
      <Text style={c.sectionTitle}>💰 Money Collection (POS)</Text>
      <View style={c.row3}>
        <View style={c.cell}>
          <Text style={c.cellLabel}>Collected</Text>
          <Text style={[c.cellVal, { color: Colors.success }]}>{fmtAmt(posPaid)}</Text>
        </View>
        <View style={c.cell}>
          <Text style={c.cellLabel}>Remaining</Text>
          <Text style={[c.cellVal, { color: Colors.danger }]}>{fmtAmt(posUnpaid)}</Text>
        </View>
        <View style={c.cell}>
          <Text style={c.cellLabel}>Total</Text>
          <Text style={[c.cellVal, { color }]}>{fmtAmt(posGrandTotal)}</Text>
        </View>
      </View>

      {/* Progress bar with target marker */}
      <Bar pct={resPct} color={color} target={targets?.resolution} />

      {/* Target status */}
      <View style={[c.statusBox, { backgroundColor: resAchieved ? Colors.success + "12" : Colors.warning + "12" }]}>
        <Ionicons
          name={resAchieved ? "checkmark-circle" : "alert-circle-outline"}
          size={16}
          color={resAchieved ? Colors.success : Colors.warning}
        />
        <Text style={[c.statusText, { color: resAchieved ? Colors.success : Colors.warning }]}>
          {resAchieved
            ? `✓ Target ${targets?.resolution}% achieved!`
            : `Need ${fmtAmt(needRes!)} more to reach ${targets?.resolution}% target`}
        </Text>
      </View>

      {/* ── Rollback ── */}
      {targets?.rollback != null && (
        <>
          <View style={c.divider} />
          <Text style={c.sectionTitle}>🔄 Rollback Collection</Text>
          <View style={c.row3}>
            <View style={c.cell}>
              <Text style={c.cellLabel}>Marked Yes</Text>
              <Text style={[c.cellVal, { color: Colors.success }]}>{fmtAmt(rbPaid)}</Text>
            </View>
            <View style={c.cell}>
              <Text style={c.cellLabel}>Rollback %</Text>
              <Text style={[c.cellVal, { color: Colors.info }]}>{rbPct.toFixed(1)}%</Text>
            </View>
            <View style={c.cell}>
              <Text style={c.cellLabel}>Total</Text>
              <Text style={c.cellVal}>{fmtAmt(rbGrandTotal)}</Text>
            </View>
          </View>
          <Bar pct={rbPct} color={Colors.info} target={targets.rollback} />
          <View style={[c.statusBox, { backgroundColor: rbAchieved ? Colors.success + "12" : Colors.info + "12" }]}>
            <Ionicons
              name={rbAchieved ? "checkmark-circle" : "information-circle-outline"}
              size={16}
              color={rbAchieved ? Colors.success : Colors.info}
            />
            <Text style={[c.statusText, { color: rbAchieved ? Colors.success : Colors.info }]}>
              {rbAchieved
                ? `✓ Rollback target ${targets.rollback}% achieved!`
                : `Need ${fmtAmt(needRb!)} more to reach ${targets.rollback}% rollback target`}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function PerformanceScreen() {
  const insets = useSafeAreaInsets();

  const { data: summaryData, isLoading } = useQuery({
    queryKey: ["/api/bkt-perf-summary"],
    queryFn: async () => {
      const url = new URL("/api/bkt-perf-summary", getApiUrl());
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
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

  const rows: any[] = (summaryData?.rows || [])
    .filter((r: any) =>
      String(r.bkt).startsWith("bkt") ||
      String(r.bkt).startsWith("BKT") ||
      r.bkt === "penal"
    )
    .sort((a: any, b: any) => String(a.bkt).localeCompare(String(b.bkt)));

  // Overall summary numbers
  const totalPaid  = rows.filter(r => !String(r.bkt).includes("penal"))
    .reduce((s, r) => s + parseFloat(r.pos_paid || 0), 0);
  const totalPos   = rows.filter(r => !String(r.bkt).includes("penal"))
    .reduce((s, r) => s + parseFloat(r.pos_grand_total || 0), 0);
  const overallPct = totalPos > 0 ? (totalPaid / totalPos) * 100 : 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={[styles.container, {
        paddingTop: Platform.OS === "web" ? 67 : 16,
        paddingBottom: insets.bottom + 24,
      }]}
    >
      {/* Overall summary banner */}
      {rows.length > 0 && (
        <View style={styles.overallCard}>
          <View style={styles.overallLeft}>
            <Text style={styles.overallTitle}>Overall Recovery</Text>
            <Text style={styles.overallSub}>{fmtAmt(totalPaid)} collected of {fmtAmt(totalPos)}</Text>
          </View>
          <View style={[styles.overallPctWrap, {
            backgroundColor: overallPct >= 60 ? Colors.success + "20" : overallPct >= 30 ? Colors.warning + "20" : Colors.danger + "20"
          }]}>
            <Text style={[styles.overallPct, {
              color: overallPct >= 60 ? Colors.success : overallPct >= 30 ? Colors.warning : Colors.danger
            }]}>{overallPct.toFixed(1)}%</Text>
          </View>
        </View>
      )}

      {rows.length > 0 ? (
        rows.map((r, i) => <BktCard key={i} row={r} />)
      ) : (
        <View style={styles.empty}>
          <Ionicons name="bar-chart-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyText}>No data yet</Text>
          <Text style={styles.emptySub}>Your performance will appear here once cases are assigned</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:      { padding: 14, gap: 12 },
  overallCard:    { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: Colors.border },
  overallLeft:    { gap: 3 },
  overallTitle:   { fontSize: 15, fontWeight: "800", color: Colors.text },
  overallSub:     { fontSize: 12, color: Colors.textSecondary },
  overallPctWrap: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
  overallPct:     { fontSize: 24, fontWeight: "900" },
  empty:          { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 80, gap: 10 },
  emptyText:      { fontSize: 16, fontWeight: "700", color: Colors.textMuted },
  emptySub:       { fontSize: 13, color: Colors.textMuted, textAlign: "center" },
});

const c = StyleSheet.create({
  card:        { backgroundColor: Colors.surface, borderRadius: 16, borderLeftWidth: 4, padding: 16, gap: 10, borderWidth: 1, borderColor: Colors.border, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  cardHead:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  badge:       { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  badgeText:   { fontSize: 14, fontWeight: "800", textTransform: "uppercase" },
  bigPct:      { fontSize: 30, fontWeight: "900" },
  targetLabel: { fontSize: 13, fontWeight: "700" },
  casesRow:    { flexDirection: "row", gap: 8 },
  caseChip:    { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  caseChipText:{ fontSize: 12, fontWeight: "700" },
  divider:     { height: 1, backgroundColor: Colors.border },
  sectionTitle:{ fontSize: 13, fontWeight: "700", color: Colors.textSecondary },
  row3:        { flexDirection: "row", gap: 6 },
  cell:        { flex: 1, backgroundColor: Colors.surfaceAlt, borderRadius: 10, padding: 10, gap: 3, alignItems: "center" },
  cellLabel:   { fontSize: 10, fontWeight: "600", color: Colors.textMuted, textTransform: "uppercase", textAlign: "center" },
  cellVal:     { fontSize: 13, fontWeight: "800", color: Colors.text, textAlign: "center" },
  statusBox:   { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  statusText:  { flex: 1, fontSize: 13, fontWeight: "600" },
});

import React, { useState, useMemo } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput,
  Platform, ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

const n = (v: any) => parseFloat(v) || 0;

const fmt = (v: number) =>
  v >= 10000000 ? `₹${(v / 10000000).toFixed(2)}Cr`
  : v >= 100000 ? `₹${(v / 100000).toFixed(2)}L`
  : `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const BKT_TARGETS: Record<string, { resolution: number; rollback?: number }> = {
  bkt1:  { resolution: 92,  rollback: 22 },
  bkt2:  { resolution: 80,  rollback: 18 },
  bkt3:  { resolution: 75,  rollback: 17 },
  penal: { resolution: 3.5 },
};

const BKT_COLORS: Record<string, string> = {
  bkt1: Colors.info, bkt2: Colors.warning, bkt3: Colors.danger,
  penal: Colors.primaryLight,
};

function normalizeBkt(bkt: string) {
  return String(bkt || "").toLowerCase().replace(/[\s_]/g, "");
}

function getBktColor(bkt: string) {
  return BKT_COLORS[normalizeBkt(bkt)] || Colors.primary;
}

function getBktLabel(bkt: string) {
  const k = normalizeBkt(bkt);
  if (k === "penal") return "PENAL";
  return k.replace("bkt", "BKT ");
}

// ✅ Returns true only for valid BKT rows (bkt1/bkt2/bkt3/penal), excludes "all"
function isValidBktRow(bkt: string) {
  const k = normalizeBkt(bkt);
  return (k.startsWith("bkt") || k === "penal") && k !== "all";
}

function MiniBar({ pct, color, targetPct }: { pct: number; color: string; targetPct?: number }) {
  return (
    <View style={{ height: 5, backgroundColor: Colors.border, borderRadius: 3, overflow: "visible", position: "relative", marginVertical: 2 }}>
      <View style={{ height: 5, borderRadius: 3, width: `${Math.min(pct, 100)}%`, backgroundColor: color, position: "absolute" }} />
      {targetPct != null && (
        <View style={{ position: "absolute", left: `${Math.min(targetPct, 100)}%` as any, top: -2, width: 2, height: 9, backgroundColor: Colors.primary, borderRadius: 1 }} />
      )}
    </View>
  );
}

function PenalCard({ row }: { row: any }) {
  const color = getBktColor("penal");
  const penalCbcPaid    = n(row.count_paid  ?? 0);
  const penalMoneyPaid  = n(row.pos_paid    ?? 0);
  const penalMoneyTotal = penalMoneyPaid + n(row.pos_unpaid ?? 0);
  const penalTarget     = penalMoneyTotal > 0 ? 0.035 * penalMoneyTotal : null;
  const penalRequired   = penalTarget !== null ? penalTarget - penalCbcPaid : null;

  return (
    <View style={[pc.card, { borderLeftColor: color }]}>
      <View style={pc.header}>
        <View style={[pc.badge, { backgroundColor: color + "22" }]}>
          <Text style={[pc.badgeText, { color }]}>PENAL</Text>
        </View>
        <View style={[pc.chip, { backgroundColor: color + "18" }]}>
          <Text style={[pc.badgeText, { color }]}>Target 3.5%</Text>
        </View>
      </View>
      <View style={pc.divider} />
      <View style={pc.triRow}>
        <View style={pc.triCell}>
          <Text style={pc.triLabel}>Paid (Col CBC)</Text>
          <Text style={[pc.triVal, { color: Colors.success }]}>
            {Math.round(penalCbcPaid).toLocaleString()}
          </Text>
        </View>
        <View style={pc.triCell}>
          <Text style={pc.triLabel}>Target Amt</Text>
          <Text style={[pc.triVal, { color: Colors.primary }]}>
            {penalTarget === null ? "—" : fmt(penalTarget)}
          </Text>
        </View>
        <View style={pc.triCell}>
          <Text style={pc.triLabel}>Required</Text>
          <Text style={[pc.triVal, { color: penalRequired !== null && penalRequired <= 0 ? Colors.success : Colors.danger }]}>
            {penalRequired === null ? "—" : penalRequired <= 0 ? "✓ Met" : fmt(penalRequired)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const pc = StyleSheet.create({
  card: { backgroundColor: Colors.surface, borderRadius: 14, padding: 12, borderLeftWidth: 4, gap: 8, marginTop: 6 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  chip:  { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border },
  triRow: { flexDirection: "row" },
  triCell: { flex: 1, alignItems: "center", gap: 3 },
  triLabel: { fontSize: 9, color: Colors.textMuted, fontWeight: "600", textAlign: "center" },
  triVal: { fontSize: 15, fontWeight: "900", textAlign: "center" },
});

function SummaryBktBlock({ row }: { row: any }) {
  const rawBkt   = normalizeBkt(row.bkt);
  const color    = getBktColor(rawBkt);
  const label    = getBktLabel(rawBkt);
  const targets  = BKT_TARGETS[rawBkt] || null;

  const posPaid       = n(row.pos_paid        ?? 0);
  const posGrandTotal = n(row.pos_grand_total ?? 0);
  const posUnpaid     = n(row.pos_unpaid      ?? 0);
  const resPct        = posGrandTotal > 0 ? (posPaid / posGrandTotal) * 100 : 0;
  const reqRes        = targets && posGrandTotal > 0
    ? Math.max(0, (targets.resolution / 100) * posGrandTotal - posPaid) : null;

  const rbPaid       = n(row.rollback_paid        ?? 0);
  const rbGrandTotal = n(row.rollback_grand_total ?? 0);
  const rbPct        = rbGrandTotal > 0 ? (rbPaid / rbGrandTotal) * 100 : 0;
  const reqRb        = targets?.rollback != null && rbGrandTotal > 0
    ? Math.max(0, (targets.rollback / 100) * rbGrandTotal - rbPaid) : null;

  return (
    <View style={[sb.block, { borderTopColor: color }]}>
      <Text style={[sb.cat, { color }]}>{label}</Text>
      <Text style={[sb.pct, { color }]}>{resPct.toFixed(1)}%</Text>
      <MiniBar pct={resPct} color={color} targetPct={targets?.resolution} />

      <Text style={[sb.sectionLbl, { color: Colors.primary }]}>POS</Text>
      <View style={sb.row}>
        <Text style={sb.lbl}>Paid</Text>
        <Text style={[sb.amt, { color: Colors.success }]}>{fmt(posPaid)}</Text>
      </View>
      <View style={sb.row}>
        <Text style={sb.lbl}>Unpaid</Text>
        <Text style={[sb.amt, { color: Colors.danger }]}>{fmt(posUnpaid)}</Text>
      </View>
      <View style={sb.row}>
        <Text style={sb.lbl}>Total</Text>
        <Text style={[sb.amt, { color }]}>{fmt(posGrandTotal)}</Text>
      </View>

      <Text style={[sb.sectionLbl, { color: Colors.success }]}>
        Resolution{targets ? ` (T:${targets.resolution}%)` : ""}
      </Text>
      <View style={sb.row}>
        <Text style={sb.lbl}>Res %</Text>
        <Text style={[sb.amt, { color: Colors.success }]}>{resPct.toFixed(1)}%</Text>
      </View>
      <View style={sb.row}>
        <Text style={sb.lbl}>Req</Text>
        <Text style={[sb.amt, { color: reqRes === 0 ? Colors.success : Colors.danger }]}>
          {reqRes === null ? "—" : reqRes === 0 ? "✓" : fmt(reqRes)}
        </Text>
      </View>

      {targets?.rollback != null && (
        <>
          <Text style={[sb.sectionLbl, { color: Colors.info }]}>
            Rollback (T:{targets.rollback}%)
          </Text>
          <MiniBar pct={rbPct} color={Colors.info} targetPct={targets.rollback} />
          <View style={sb.row}>
            <Text style={sb.lbl}>RB %</Text>
            <Text style={[sb.amt, { color: Colors.info }]}>{rbPct.toFixed(1)}%</Text>
          </View>
          <View style={sb.row}>
            <Text style={sb.lbl}>Req</Text>
            <Text style={[sb.amt, { color: reqRb === 0 ? Colors.success : Colors.danger }]}>
              {reqRb === null ? "—" : reqRb === 0 ? "✓" : fmt(reqRb)}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

const sb = StyleSheet.create({
  block: { flex: 1, minWidth: "22%", backgroundColor: Colors.background, borderRadius: 10, borderTopWidth: 3, padding: 8, gap: 3 },
  cat: { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  lbl: { fontSize: 9, color: Colors.textMuted, fontWeight: "600" },
  amt: { fontSize: 10, fontWeight: "800" },
  pct: { fontSize: 15, fontWeight: "900", textAlign: "center" },
  sectionLbl: { fontSize: 8, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.3, marginTop: 2 },
});

export default function AdminBktPerformance() {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");

  const { data: summaryData, isLoading } = useQuery({
    queryKey: ["/api/admin/bkt-perf-summary"],
    queryFn: async () => {
      const url = new URL("/api/admin/bkt-perf-summary", getApiUrl());
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  // ✅ Filter out "ALL" aggregate rows before any processing
  const allSummaryRows: any[] = useMemo(
    () => (summaryData?.rows || []).filter((r: any) => isValidBktRow(r.bkt)),
    [summaryData]
  );

  const summaryByFos = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const row of allSummaryRows) {
      const key = row.fos_name?.toLowerCase() || "unknown";
      if (!map[key]) map[key] = [];
      map[key].push(row);
    }
    return map;
  }, [allSummaryRows]);

  const summaryFosNames = useMemo(() => {
    const names = Object.keys(summaryByFos).sort();
    if (!search.trim()) return names;
    const q = search.toLowerCase();
    return names.filter(k => k.includes(q));
  }, [summaryByFos, search]);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={[styles.topBar, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search FOS agent..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </Pressable>
          )}
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{allSummaryRows.length} records · {summaryFosNames.length} agents</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          keyboardShouldPersistTaps="handled"
          data={summaryFosNames}
          keyExtractor={(item) => item}
          contentContainerStyle={{ padding: 12, gap: 12, paddingBottom: insets.bottom + 32 }}
          scrollEnabled={!!summaryFosNames.length}
          renderItem={({ item: fosKey }) => {
            const rows: any[] = summaryByFos[fosKey] || [];
            const displayName = rows[0]?.fos_name || fosKey;
            const allRows = [...rows].sort((a, b) => String(a.bkt).localeCompare(String(b.bkt)));
            const bktRows  = allRows.filter(r => normalizeBkt(r.bkt) !== "penal");
            const penalRow = allRows.find(r => normalizeBkt(r.bkt) === "penal");

            return (
              <View style={styles.agentCard}>
                <View style={styles.agentHeader}>
                  <View style={styles.agentAvatar}>
                    <Text style={styles.agentAvatarText}>{(displayName || "?")[0].toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.agentName}>{displayName}</Text>
                    <Text style={styles.empId}>{allRows.length} BKT record{allRows.length !== 1 ? "s" : ""}</Text>
                  </View>
                </View>
                {bktRows.length > 0 && (
                  <View style={styles.blocksRow}>
                    {bktRows.map((r, i) => (
                      <SummaryBktBlock key={i} row={r} />
                    ))}
                  </View>
                )}
                {penalRow && <PenalCard row={penalRow} />}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="bar-chart-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>
                No BKT cases found.{"\n"}Import BKT case data to see performance here.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { backgroundColor: Colors.surface, paddingHorizontal: 14, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border, gap: 8 },
  searchWrap: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.surfaceAlt, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, gap: 8 },
  searchInput: { flex: 1, fontSize: 14, color: Colors.text, paddingVertical: 0 },
  countBadge: { alignSelf: "flex-start" },
  countText: { fontSize: 11, color: Colors.textMuted, fontWeight: "600" },

  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  blocksRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },

  agentCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 14, gap: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  agentHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  agentAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.primary, justifyContent: "center", alignItems: "center" },
  agentAvatarText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  agentName: { fontSize: 14, fontWeight: "700", color: Colors.text },
  empId: { fontSize: 11, color: Colors.textMuted },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 80, gap: 12 },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: "center", lineHeight: 22 },

  subSectionLabel: { fontSize: 10, fontWeight: "800", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  noData: { fontSize: 12, color: Colors.textMuted, textAlign: "center", paddingVertical: 8 },
});

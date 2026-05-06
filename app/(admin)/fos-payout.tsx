import React, { useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Modal,
  ScrollView,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { useCompanyFilter } from "@/context/CompanyFilterContext";

// ─── Agency Targets (shared with agency-target screen) ────────────────────────
const TARGETS_STORAGE_KEY = "agency_bkt_targets_v1";
interface BktTargets { resTarget: number; rbTarget: number; }
type AllTargets = Record<string, BktTargets>;
const DEFAULT_AGENCY_TARGETS: AllTargets = {
  "1": { resTarget: 92, rbTarget: 22 },
  "2": { resTarget: 80, rbTarget: 18 },
  "3": { resTarget: 75, rbTarget: 17 },
};

function useAgencyTargets(): AllTargets {
  const [targets, setTargets] = useState<AllTargets>(DEFAULT_AGENCY_TARGETS);
  useEffect(() => {
    AsyncStorage.getItem(TARGETS_STORAGE_KEY).then((raw) => {
      if (raw) {
        try { setTargets(JSON.parse(raw)); } catch {}
      }
    });
  }, []);
  return targets;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface BktRow {
  fos_name: string;
  bkt: string;
  pos_paid: string | number;
  pos_grand_total: string | number;
  pos_unpaid: string | number;
  rollback_paid: string | number;
  rollback_grand_total: string | number;
  count_paid: string | number;
  company?: string;
}

interface PayoutSlab {
  resMin: number;
  resMax: number;
  rbMin: number;
  penalMin: number;
  payout: number;
  label: string;
}

// ─── Payout Structure (from image) ───────────────────────────────────────────
const BKT1_SLABS: PayoutSlab[] = [
  { resMin: 92,  resMax: Infinity, rbMin: 22, penalMin: 3.5, payout: 13, label: ">92%" },
  { resMin: 90,  resMax: 92,       rbMin: 20, penalMin: 1.5, payout: 12, label: "90–92%" },
  { resMin: 85,  resMax: 90,       rbMin: 19, penalMin: 1.0, payout: 11, label: "85–90%" },
  { resMin: 80,  resMax: 85,       rbMin: 16, penalMin: 0,   payout:  9, label: "80–85%" },
  { resMin: 75,  resMax: 80,       rbMin: 11, penalMin: 0.5, payout:  7, label: "75–80%" },
  { resMin: 0,   resMax: 75,       rbMin: 0,  penalMin: 0,   payout:  5, label: "<75%" },
];

const BKT2_SLABS: PayoutSlab[] = [
  { resMin: 80,  resMax: Infinity, rbMin: 18, penalMin: 10, payout: 13, label: ">80%" },
  { resMin: 75,  resMax: 80,       rbMin: 15, penalMin: 10, payout: 10, label: "75–80%" },
  { resMin: 70,  resMax: 75,       rbMin: 12, penalMin: 10, payout:  7, label: "70–75%" },
  { resMin: 65,  resMax: 70,       rbMin:  8, penalMin: 10, payout:  5, label: "65–70%" },
  { resMin: 0,   resMax: 65,       rbMin:  0, penalMin: 10, payout:  4, label: "<65%" },
];

const BKT3_SLABS: PayoutSlab[] = [
  { resMin: 75,  resMax: Infinity, rbMin: 17, penalMin: 10, payout: 13, label: ">75%" },
  { resMin: 70,  resMax: 75,       rbMin: 14, penalMin: 10, payout: 10, label: "70–75%" },
  { resMin: 65,  resMax: 70,       rbMin: 11, penalMin: 10, payout:  8, label: "65–70%" },
  { resMin: 60,  resMax: 65,       rbMin:  8, penalMin: 10, payout:  6, label: "60–65%" },
  { resMin: 0,   resMax: 60,       rbMin:  0, penalMin: 10, payout:  5, label: "<60%" },
];

const BKT_SLABS: Record<string, PayoutSlab[]> = {
  bkt1: BKT1_SLABS,
  bkt2: BKT2_SLABS,
  bkt3: BKT3_SLABS,
};

// ─── Colors per BKT ──────────────────────────────────────────────────────────
const BKT_COLORS: Record<string, string> = {
  bkt1: Colors.info,
  bkt2: Colors.warning,
  bkt3: Colors.danger,
};

const n = (v: any) => parseFloat(String(v)) || 0;

function fmtAmt(v: number) {
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}
function fmtPct(v: number) {
  return `${v.toFixed(1)}%`;
}
function normBkt(bkt: string) {
  return String(bkt || "").toLowerCase().replace(/[\s_]/g, "");
}

// ─── Payout Calculation Logic ─────────────────────────────────────────────────
function getPayoutSlab(bkt: string, resPct: number, rbPct: number, penalPct: number): PayoutSlab | null {
  const slabs = BKT_SLABS[normBkt(bkt)];
  if (!slabs) return null;
  for (const slab of slabs) {
    if (resPct >= slab.resMin && resPct < slab.resMax) {
      return slab;
    }
  }
  return slabs[slabs.length - 1];
}

// ─── Agent Payout Aggregation ─────────────────────────────────────────────────
interface AgentBktPayout {
  bkt: string;
  resPct: number;
  rbPct: number;
  penalPct: number;
  posPaid: number;
  posTotal: number;
  rbPaid: number;
  rbTotal: number;
  slab: PayoutSlab | null;
  payoutAmt: number;
  ucCases: number;
  // Target tracking
  resTarget: number;
  rbTarget: number;
  resMetTarget: boolean;
  rbMetTarget: boolean;
}

interface AgentPayout {
  fosName: string;
  bkts: AgentBktPayout[];
  totalPayout: number;
  totalPosPaid: number;
}

function buildAgentPayouts(rows: BktRow[], agencyTargets: AllTargets): AgentPayout[] {
  const map: Record<string, { fosName: string; bktMap: Record<string, BktRow[]> }> = {};

  for (const row of rows) {
    const key = (row.fos_name || "Unknown").toLowerCase();
    if (!map[key]) map[key] = { fosName: row.fos_name || "Unknown", bktMap: {} };
    const bkt = normBkt(row.bkt);
    if (!map[key].bktMap[bkt]) map[key].bktMap[bkt] = [];
    map[key].bktMap[bkt].push(row);
  }

  return Object.values(map).map((agent) => {
    const bkts: AgentBktPayout[] = [];
    let totalPayout = 0;
    let totalPosPaid = 0;

    for (const [bkt, bktRows] of Object.entries(agent.bktMap)) {
      if (!["bkt1", "bkt2", "bkt3"].includes(bkt)) continue;

      const posPaid  = bktRows.reduce((s, r) => s + n(r.pos_paid), 0);
      const posTotal = bktRows.reduce((s, r) => s + n(r.pos_grand_total), 0);
      const rbPaid   = bktRows.reduce((s, r) => s + n(r.rollback_paid), 0);
      const rbTotal  = bktRows.reduce((s, r) => s + n(r.rollback_grand_total), 0);

      const resPct  = posTotal > 0 ? (posPaid / posTotal) * 100 : 0;
      const rbPct   = rbTotal  > 0 ? (rbPaid  / rbTotal)  * 100 : 0;

      // Penal: for BKT1 it's linked; for BKT2/3 flat 10%
      const penalPct = bkt === "bkt1"
        ? (posTotal > 0 ? (n(bktRows[0]?.count_paid) / posTotal) * 100 : 0)
        : 10;

      const slab = getPayoutSlab(bkt, resPct, rbPct, penalPct);
      const payoutAmt = slab ? (slab.payout / 100) * posPaid : 0;

      // Resolve target for this bkt (bkt1 → key "1", bkt2 → "2", bkt3 → "3")
      const bktNum = bkt.replace("bkt", "");
      const tgt = agencyTargets[bktNum] ?? DEFAULT_AGENCY_TARGETS[bktNum] ?? { resTarget: 0, rbTarget: 0 };
      const resMetTarget = resPct >= tgt.resTarget;
      const rbMetTarget  = rbPct  >= tgt.rbTarget;

      totalPayout  += payoutAmt;
      totalPosPaid += posPaid;

      bkts.push({ bkt, resPct, rbPct, penalPct, posPaid, posTotal, rbPaid, rbTotal, slab, payoutAmt, ucCases: 0, resTarget: tgt.resTarget, rbTarget: tgt.rbTarget, resMetTarget, rbMetTarget });
    }

    bkts.sort((a, b) => {
      const order: Record<string, number> = { bkt1: 0, bkt2: 1, bkt3: 2 };
      return (order[a.bkt] ?? 9) - (order[b.bkt] ?? 9);
    });

    return { fosName: agent.fosName, bkts, totalPayout, totalPosPaid };
  }).sort((a, b) => b.totalPayout - a.totalPayout);
}

// ─── Payout Reference Sheet Modal ─────────────────────────────────────────────
function PayoutReferenceModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const sections = [
    { bkt: "BKT 1", color: Colors.info,    slabs: BKT1_SLABS, note: "Penal Collection linked with BKT 1 Payout" },
    { bkt: "BKT 2", color: Colors.warning,  slabs: BKT2_SLABS, note: "Flat 10% Penal Collection" },
    { bkt: "BKT 3", color: Colors.danger,   slabs: BKT3_SLABS, note: "Flat 10% Penal Collection" },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" }}>
        <View style={[ref.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={ref.header}>
            <View>
              <Text style={ref.title}>FOS Payout Structure</Text>
              <Text style={ref.subtitle}>Jan-2025 — NEW FOS PAYOUT</Text>
            </View>
            <Pressable onPress={onClose} style={ref.closeBtn}>
              <Ionicons name="close" size={20} color={Colors.text} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {sections.map((sec) => (
              <View key={sec.bkt} style={[ref.section, { borderLeftColor: sec.color }]}>
                <View style={[ref.bktBadge, { backgroundColor: sec.color + "20" }]}>
                  <Text style={[ref.bktBadgeText, { color: sec.color }]}>{sec.bkt}</Text>
                </View>
                <Text style={ref.note}>{sec.note}</Text>
                {/* Table header */}
                <View style={ref.tableHeader}>
                  <Text style={[ref.thCell, { flex: 1.2 }]}>Reso %</Text>
                  <Text style={[ref.thCell, { flex: 1.2 }]}>RB/NM %</Text>
                  <Text style={[ref.thCell, { flex: 1 }]}>Penal %</Text>
                  <Text style={[ref.thCell, ref.thRight]}>Payout</Text>
                </View>
                {sec.slabs.map((slab, i) => (
                  <View key={i} style={[ref.tableRow, i % 2 === 0 && ref.tableRowAlt]}>
                    <Text style={[ref.tdCell, { flex: 1.2 }]}>{slab.label}</Text>
                    <Text style={[ref.tdCell, { flex: 1.2 }]}>{slab.rbMin > 0 ? `>${slab.rbMin}%` : "—"}</Text>
                    <Text style={[ref.tdCell, { flex: 1 }]}>{slab.penalMin > 0 ? `>${slab.penalMin}%` : "—"}</Text>
                    <View style={[ref.payoutChip, { backgroundColor: sec.color + "20" }]}>
                      <Text style={[ref.payoutChipText, { color: sec.color }]}>{slab.payout}%</Text>
                    </View>
                  </View>
                ))}
              </View>
            ))}

            <View style={ref.notesBox}>
              <Text style={ref.notesTitle}>📌 Notes</Text>
              <Text style={ref.notesLine}>• UC Cases Payout: ₹500 per EMI</Text>
              <Text style={ref.notesLine}>• BKT 1 Penal Collection linked with BKT 1 Payout</Text>
              <Text style={ref.notesLine}>• Flat 10% Payout on Penal Collection (BKT 2 & 3)</Text>
              <Text style={ref.notesLine}>• Entire Payout linked with Resolution / RB and NM</Text>
              <Text style={ref.notesLine}>• Clearance considered for Resolution only, not Payout</Text>
              <Text style={ref.notesLine}>• BKT X Payout structure remains the same</Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const ref = StyleSheet.create({
  sheet:         { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "90%", gap: 12 },
  header:        { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  title:         { fontSize: 18, fontWeight: "800", color: Colors.text },
  subtitle:      { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  closeBtn:      { width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  section:       { backgroundColor: Colors.surfaceAlt, borderRadius: 12, padding: 12, marginBottom: 12, borderLeftWidth: 3, gap: 8 },
  bktBadge:      { alignSelf: "flex-start", borderRadius: 7, paddingHorizontal: 10, paddingVertical: 4 },
  bktBadgeText:  { fontSize: 13, fontWeight: "800" },
  note:          { fontSize: 11, color: Colors.textMuted, fontStyle: "italic" },
  tableHeader:   { flexDirection: "row", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
  thCell:        { flex: 1, fontSize: 10, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.4 },
  thRight:       { flex: 0.9, textAlign: "right" },
  tableRow:      { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  tableRowAlt:   { backgroundColor: Colors.surface + "80", borderRadius: 6 },
  tdCell:        { flex: 1, fontSize: 12, color: Colors.text, fontWeight: "500" },
  payoutChip:    { flex: 0.9, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignItems: "center" },
  payoutChipText:{ fontSize: 12, fontWeight: "800" },
  notesBox:      { backgroundColor: Colors.surfaceAlt, borderRadius: 12, padding: 14, gap: 5, marginBottom: 8 },
  notesTitle:    { fontSize: 13, fontWeight: "800", color: Colors.text, marginBottom: 4 },
  notesLine:     { fontSize: 11, color: Colors.textSecondary, lineHeight: 18 },
});

// ─── Agent Payout Card ─────────────────────────────────────────────────────────
function AgentPayoutCard({ agent }: { agent: AgentPayout }) {
  const [expanded, setExpanded] = useState(false);

  const topPayout = agent.bkts.reduce<AgentBktPayout | null>((best, b) =>
    !best || b.payoutAmt > best.payoutAmt ? b : best, null);

  return (
    <View style={ac.card}>
      <Pressable style={ac.header} onPress={() => setExpanded(!expanded)}>
        <View style={ac.avatarCircle}>
          <Text style={ac.avatarText}>{(agent.fosName[0] || "?").toUpperCase()}</Text>
        </View>
        <View style={ac.info}>
          <Text style={ac.name} numberOfLines={1}>{agent.fosName}</Text>
          <Text style={ac.subText}>{agent.bkts.length} bucket{agent.bkts.length !== 1 ? "s" : ""}</Text>
        </View>
        <View style={ac.payoutBox}>
          <Text style={ac.payoutAmt}>{fmtAmt(agent.totalPayout)}</Text>
          <Text style={ac.payoutLabel}>est. payout</Text>
        </View>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={Colors.textMuted} style={{ marginLeft: 4 }} />
      </Pressable>

      {/* BKT mini summary strip */}
      <View style={ac.bktStrip}>
        {agent.bkts.map((b) => {
          const color = BKT_COLORS[b.bkt] || Colors.primary;
          const label = b.bkt.replace("bkt", "B");
          const allMet = b.resMetTarget && b.rbMetTarget;
          return (
            <View key={b.bkt} style={[ac.bktChip, { borderColor: allMet ? Colors.success + "70" : color + "50" }]}>
              <Text style={[ac.bktChipLabel, { color }]}>{label}</Text>
              <Text style={[ac.bktChipPct, { color: allMet ? Colors.success : color }]}>{fmtPct(b.resPct)}</Text>
              <View style={[ac.bktSlabBadge, { backgroundColor: (allMet ? Colors.success : color) + "20" }]}>
                <Text style={[ac.bktSlabBadgeText, { color: allMet ? Colors.success : color }]}>{b.slab?.payout ?? 0}%</Text>
              </View>
            </View>
          );
        })}
      </View>

      {expanded && (
        <View style={ac.expandedWrap}>
          <View style={ac.expandedDivider} />
          {agent.bkts.map((b) => {
            const color = BKT_COLORS[b.bkt] || Colors.primary;
            const bktLabel = b.bkt.replace("bkt", "BKT ");
            const resFill = Math.min(100, b.resPct);
            const rbFill  = Math.min(100, b.rbPct);
            const slab = b.slab;

            return (
              <View key={b.bkt} style={[ac.bktDetail, { borderLeftColor: color }]}>
                <View style={ac.bktDetailTop}>
                  <Text style={[ac.bktDetailLabel, { color }]}>{bktLabel.toUpperCase()}</Text>
                  {slab && (
                    <View style={[ac.slabBadge, { backgroundColor: color + "18" }]}>
                      <Text style={[ac.slabBadgeText, { color }]}>Slab: {slab.label}</Text>
                    </View>
                  )}
                  {/* Target status badge */}
                  {(b.resMetTarget && b.rbMetTarget) ? (
                    <View style={[ac.targetBadge, { backgroundColor: Colors.success + "20" }]}>
                      <Ionicons name="checkmark-circle" size={11} color={Colors.success} />
                      <Text style={[ac.targetBadgeText, { color: Colors.success }]}>Target Met</Text>
                    </View>
                  ) : (
                    <View style={[ac.targetBadge, { backgroundColor: Colors.warning + "20" }]}>
                      <Ionicons name="alert-circle" size={11} color={Colors.warning} />
                      <Text style={[ac.targetBadgeText, { color: Colors.warning }]}>Below Target</Text>
                    </View>
                  )}
                  <View style={[ac.payoutSlabChip, { backgroundColor: color + "20" }]}>
                    <Text style={[ac.payoutSlabChipText, { color }]}>{slab?.payout ?? 0}%</Text>
                  </View>
                </View>

                {/* Resolution % bar */}
                <View style={ac.metricRow}>
                  <Text style={ac.metricLabel}>POS Reso</Text>
                  <View style={ac.barWrap}>
                    <View style={[ac.barFill, { width: `${resFill}%` as any, backgroundColor: b.resMetTarget ? Colors.success : color }]} />
                    {/* Target marker */}
                    <View style={[ac.targetMarker, { left: `${Math.min(b.resTarget, 100)}%` as any }]} />
                  </View>
                  <View style={ac.metricPctWrap}>
                    <Text style={[ac.metricPct, { color: b.resMetTarget ? Colors.success : color }]}>{fmtPct(b.resPct)}</Text>
                    {b.resMetTarget
                      ? <Ionicons name="checkmark-circle" size={11} color={Colors.success} />
                      : <Text style={ac.targetHint}>/{b.resTarget}%</Text>}
                  </View>
                </View>

                {/* RB/NM % bar */}
                <View style={ac.metricRow}>
                  <Text style={ac.metricLabel}>RB/NM</Text>
                  <View style={ac.barWrap}>
                    <View style={[ac.barFill, { width: `${rbFill}%` as any, backgroundColor: b.rbMetTarget ? Colors.success : Colors.info }]} />
                    <View style={[ac.targetMarker, { left: `${Math.min(b.rbTarget, 100)}%` as any }]} />
                  </View>
                  <View style={ac.metricPctWrap}>
                    <Text style={[ac.metricPct, { color: b.rbMetTarget ? Colors.success : Colors.info }]}>{fmtPct(b.rbPct)}</Text>
                    {b.rbMetTarget
                      ? <Ionicons name="checkmark-circle" size={11} color={Colors.success} />
                      : <Text style={ac.targetHint}>/{b.rbTarget}%</Text>}
                  </View>
                </View>

                {/* Stats row */}
                <View style={ac.statsRow}>
                  <View style={ac.statCell}>
                    <Text style={ac.statLabel}>POS Paid</Text>
                    <Text style={[ac.statVal, { color: Colors.success }]}>{fmtAmt(b.posPaid)}</Text>
                  </View>
                  <View style={ac.statCell}>
                    <Text style={ac.statLabel}>Total POS</Text>
                    <Text style={ac.statVal}>{fmtAmt(b.posTotal)}</Text>
                  </View>
                  <View style={ac.statCell}>
                    <Text style={ac.statLabel}>Est. Payout</Text>
                    <Text style={[ac.statVal, { color }]}>{fmtAmt(b.payoutAmt)}</Text>
                  </View>
                </View>
              </View>
            );
          })}

          {/* Total payout summary */}
          <View style={ac.totalRow}>
            <Ionicons name="wallet-outline" size={16} color={Colors.primary} />
            <Text style={ac.totalLabel}>Total Estimated Payout</Text>
            <Text style={ac.totalAmt}>{fmtAmt(agent.totalPayout)}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const ac = StyleSheet.create({
  card:              { backgroundColor: Colors.surface, borderRadius: 16, marginHorizontal: 14, marginBottom: 10, overflow: "hidden", borderWidth: 1, borderColor: Colors.border, ...Platform.select({ ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 }, android: { elevation: 1 } }) },
  header:            { flexDirection: "row", alignItems: "center", padding: 14, gap: 10 },
  avatarCircle:      { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary + "18", alignItems: "center", justifyContent: "center" },
  avatarText:        { fontSize: 16, fontWeight: "800", color: Colors.primary },
  info:              { flex: 1 },
  name:              { fontSize: 14, fontWeight: "700", color: Colors.text },
  subText:           { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  payoutBox:         { alignItems: "flex-end" },
  payoutAmt:         { fontSize: 15, fontWeight: "800", color: Colors.success },
  payoutLabel:       { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  bktStrip:          { flexDirection: "row", gap: 8, paddingHorizontal: 14, paddingBottom: 12 },
  bktChip:           { flex: 1, borderRadius: 10, borderWidth: 1, padding: 8, alignItems: "center", gap: 3 },
  bktChipLabel:      { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  bktChipPct:        { fontSize: 13, fontWeight: "900" },
  bktSlabBadge:      { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  bktSlabBadgeText:  { fontSize: 11, fontWeight: "800" },
  expandedWrap:      { paddingHorizontal: 14, paddingBottom: 14 },
  expandedDivider:   { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border, marginBottom: 12 },
  bktDetail:         { backgroundColor: Colors.surfaceAlt, borderRadius: 12, padding: 12, marginBottom: 10, borderLeftWidth: 3, gap: 8 },
  bktDetailTop:      { flexDirection: "row", alignItems: "center", gap: 8 },
  bktDetailLabel:    { fontSize: 12, fontWeight: "800", flex: 1 },
  slabBadge:         { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  slabBadgeText:     { fontSize: 11, fontWeight: "600" },
  payoutSlabChip:    { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  payoutSlabChipText:{ fontSize: 14, fontWeight: "900" },
  metricRow:         { flexDirection: "row", alignItems: "center", gap: 8 },
  metricLabel:       { fontSize: 10, fontWeight: "700", color: Colors.textMuted, width: 56, textTransform: "uppercase" },
  barWrap:           { flex: 1, height: 7, backgroundColor: Colors.border, borderRadius: 4, overflow: "hidden" },
  barFill:           { height: "100%", borderRadius: 4 },
  metricPct:         { fontSize: 12, fontWeight: "800", width: 46, textAlign: "right" },
  metricPctWrap:     { width: 58, alignItems: "flex-end", flexDirection: "row", justifyContent: "flex-end", gap: 2 },
  targetMarker:      { position: "absolute", top: -3, width: 2, height: 13, backgroundColor: Colors.primary + "90", borderRadius: 1 },
  targetHint:        { fontSize: 9, fontWeight: "700", color: Colors.textMuted },
  targetBadge:       { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  targetBadgeText:   { fontSize: 10, fontWeight: "700" },
  statsRow:          { flexDirection: "row", marginTop: 4 },
  statCell:          { flex: 1, gap: 2 },
  statLabel:         { fontSize: 9, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.3 },
  statVal:           { fontSize: 12, fontWeight: "700", color: Colors.text },
  totalRow:          { flexDirection: "row", alignItems: "center", backgroundColor: Colors.primary + "10", borderRadius: 12, padding: 12, gap: 8, marginTop: 2 },
  totalLabel:        { flex: 1, fontSize: 13, fontWeight: "700", color: Colors.text },
  totalAmt:          { fontSize: 16, fontWeight: "900", color: Colors.success },
});

// ─── Summary Banner ───────────────────────────────────────────────────────────
function SummaryBanner({ agents }: { agents: AgentPayout[] }) {
  const totalPayout = agents.reduce((s, a) => s + a.totalPayout, 0);
  const totalPosPaid = agents.reduce((s, a) => s + a.totalPosPaid, 0);
  const avgPayout = totalPosPaid > 0 ? (totalPayout / totalPosPaid) * 100 : 0;
  const topAgent = agents[0];

  return (
    <View style={sb.wrap}>
      <View style={sb.card}>
        <Ionicons name="wallet" size={18} color={Colors.success} />
        <View>
          <Text style={sb.label}>Total Payout</Text>
          <Text style={sb.val}>{fmtAmt(totalPayout)}</Text>
        </View>
      </View>
      <View style={sb.card}>
        <Ionicons name="people" size={18} color={Colors.info} />
        <View>
          <Text style={sb.label}>FOS Agents</Text>
          <Text style={sb.val}>{agents.length}</Text>
        </View>
      </View>
      <View style={sb.card}>
        <Ionicons name="trending-up" size={18} color={Colors.warning} />
        <View>
          <Text style={sb.label}>Avg Payout %</Text>
          <Text style={sb.val}>{fmtPct(avgPayout)}</Text>
        </View>
      </View>
    </View>
  );
}

const sb = StyleSheet.create({
  wrap:  { flexDirection: "row", gap: 10, paddingHorizontal: 14, marginBottom: 10 },
  card:  { flex: 1, backgroundColor: Colors.surface, borderRadius: 12, padding: 10, alignItems: "center", gap: 4, borderWidth: 1, borderColor: Colors.border },
  label: { fontSize: 9, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase", marginTop: 2 },
  val:   { fontSize: 14, fontWeight: "800", color: Colors.text },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function FosPayoutScreen() {
  const insets = useSafeAreaInsets();
  const { selectedCompany } = useCompanyFilter();
  const [refModalVisible, setRefModalVisible] = useState(false);
  const agencyTargets = useAgencyTargets();

  const { data: rawRows, isLoading, isError, refetch, isRefetching } = useQuery<BktRow[]>({
    queryKey: ["/api/admin/bkt-perf-summary", selectedCompany],
    queryFn: async () => {
      const url = new URL("/api/admin/bkt-perf-summary", getApiUrl());
      if (selectedCompany) url.searchParams.set("company", selectedCompany);
      const res = await fetch(url.toString(), { headers: { "Content-Type": "application/json" } });
      if (!res.ok) throw new Error("Failed to load performance data");
      const json = await res.json();
      return Array.isArray(json) ? json : json.data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const agents = useMemo(() => {
    if (!rawRows?.length) return [];
    return buildAgentPayouts(rawRows, agencyTargets);
  }, [rawRows, agencyTargets]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ color: Colors.textSecondary, marginTop: 12, fontSize: 14 }}>Loading payout data…</Text>
      </View>
    );
  }

  if (isError || !rawRows) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 32, backgroundColor: Colors.background }}>
        <Ionicons name="cloud-offline-outline" size={48} color={Colors.textMuted} />
        <Text style={{ color: Colors.text, fontSize: 16, fontWeight: "700", marginTop: 14 }}>Couldn't load data</Text>
        <Pressable style={{ marginTop: 16, backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 }} onPress={() => refetch()}>
          <Text style={{ color: "#fff", fontWeight: "700" }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <FlatList
        data={agents}
        keyExtractor={(item) => item.fosName}
        renderItem={({ item }) => <AgentPayoutCard agent={item} />}
        contentContainerStyle={{ paddingTop: 14, paddingBottom: insets.bottom + 20 }}
        refreshing={isRefetching}
        onRefresh={refetch}
        ListHeaderComponent={
          <View style={{ marginBottom: 4 }}>
            {/* Page Header */}
            <View style={pg.headerWrap}>
              <View>
                <Text style={pg.title}>FOS Payout Calculator</Text>
                <Text style={pg.subtitle}>Based on current BKT performance</Text>
              </View>
              <Pressable
                style={pg.infoBtn}
                onPress={() => setRefModalVisible(true)}
              >
                <Ionicons name="information-circle-outline" size={20} color={Colors.primary} />
                <Text style={pg.infoBtnText}>Payout Structure</Text>
              </Pressable>
            </View>

            {/* Summary */}
            {agents.length > 0 && <SummaryBanner agents={agents} />}

            {/* Column hints */}
            <View style={pg.columnHint}>
              <Text style={pg.columnHintText}>AGENT</Text>
              <Text style={[pg.columnHintText, { marginLeft: "auto" as any }]}>RESOLUTION % · SLAB · EST. PAYOUT</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={{ alignItems: "center", padding: 40, gap: 10 }}>
            <Ionicons name="wallet-outline" size={48} color={Colors.textMuted} />
            <Text style={{ fontSize: 15, fontWeight: "700", color: Colors.text }}>No payout data yet</Text>
            <Text style={{ fontSize: 12, color: Colors.textMuted, textAlign: "center" }}>Import BKT performance data to view FOS payouts</Text>
          </View>
        }
      />

      <PayoutReferenceModal visible={refModalVisible} onClose={() => setRefModalVisible(false)} />
    </View>
  );
}

const pg = StyleSheet.create({
  headerWrap:      { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", paddingHorizontal: 14, marginBottom: 14 },
  title:           { fontSize: 20, fontWeight: "900", color: Colors.text },
  subtitle:        { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  infoBtn:         { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: Colors.primary + "12", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: Colors.primary + "25" },
  infoBtnText:     { fontSize: 12, fontWeight: "700", color: Colors.primary },
  columnHint:      { flexDirection: "row", paddingHorizontal: 14, marginBottom: 8 },
  columnHintText:  { fontSize: 9, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
});

import React, { useMemo, useState } from "react";
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
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { useCompanyFilter } from "@/context/CompanyFilterContext";

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

// ─── Payout Structure (Jan-2025) ──────────────────────────────────────────────
// Payout % is applied on AMOUNT COLLECTED (pos_paid) for each bucket.
// BKT 1: Both POS Reso % AND RB/NM % must qualify for the slab.
// BKT 2 & 3: Flat 10% Penal Collection; payout on amount collected.
const BKT1_SLABS: PayoutSlab[] = [
  { resMin: 92, resMax: Infinity, rbMin: 22, penalMin: 3.5, payout: 13, label: ">92%" },
  { resMin: 90, resMax: 92,       rbMin: 20, penalMin: 1.5, payout: 12, label: "90–92%" },
  { resMin: 85, resMax: 90,       rbMin: 19, penalMin: 1.0, payout: 11, label: "85–90%" },
  { resMin: 80, resMax: 85,       rbMin: 16, penalMin: 0,   payout:  9, label: "80–85%" },
  { resMin: 75, resMax: 80,       rbMin: 11, penalMin: 0.5, payout:  7, label: "75–80%" },
  { resMin: 0,  resMax: 75,       rbMin: 0,  penalMin: 0,   payout:  5, label: "<75%" },
];

const BKT2_SLABS: PayoutSlab[] = [
  { resMin: 80, resMax: Infinity, rbMin: 18, penalMin: 10, payout: 13, label: ">80%" },
  { resMin: 75, resMax: 80,       rbMin: 15, penalMin: 10, payout: 10, label: "75–80%" },
  { resMin: 70, resMax: 75,       rbMin: 12, penalMin: 10, payout:  7, label: "70–75%" },
  { resMin: 65, resMax: 70,       rbMin:  8, penalMin: 10, payout:  5, label: "65–70%" },
  { resMin: 0,  resMax: 65,       rbMin:  0, penalMin: 10, payout:  4, label: "<65%" },
];

const BKT3_SLABS: PayoutSlab[] = [
  { resMin: 75, resMax: Infinity, rbMin: 17, penalMin: 10, payout: 13, label: ">75%" },
  { resMin: 70, resMax: 75,       rbMin: 14, penalMin: 10, payout: 10, label: "70–75%" },
  { resMin: 65, resMax: 70,       rbMin: 11, penalMin: 10, payout:  8, label: "65–70%" },
  { resMin: 60, resMax: 65,       rbMin:  8, penalMin: 10, payout:  6, label: "60–65%" },
  { resMin: 0,  resMax: 60,       rbMin:  0, penalMin: 10, payout:  5, label: "<60%" },
];

const BKT_SLABS: Record<string, PayoutSlab[]> = {
  bkt1: BKT1_SLABS,
  bkt2: BKT2_SLABS,
  bkt3: BKT3_SLABS,
};

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

// ─── Payout Slab Matching ─────────────────────────────────────────────────────
// For BKT1: an agent qualifies for a slab only if BOTH resPct AND rbPct meet
// the slab's minimums. We scan from highest to lowest and return the first match.
// For BKT2/3: same approach.
function getPayoutSlab(
  bkt: string,
  resPct: number,
  rbPct: number,
  penalPct: number
): PayoutSlab | null {
  const slabs = BKT_SLABS[normBkt(bkt)];
  if (!slabs) return null;
  for (const slab of slabs) {
    const resOk    = resPct >= slab.resMin && resPct < slab.resMax;
    const rbOk     = rbPct  >= slab.rbMin;
    // penalMin only enforced for BKT1 when penal data is available
    const penalOk  = normBkt(bkt) !== "bkt1" || penalPct >= slab.penalMin;
    if (resOk && rbOk && penalOk) return slab;
  }
  // Fallback: return lowest slab (base payout)
  return slabs[slabs.length - 1];
}

// ─── Agent Payout Aggregation ─────────────────────────────────────────────────
interface AgentBktPayout {
  bkt: string;
  resPct: number;
  rbPct: number;
  penalPct: number;
  posPaid: number;       // Amount collected in this bucket (payout base)
  posTotal: number;
  rbPaid: number;
  rbTotal: number;
  slab: PayoutSlab | null;
  payoutAmt: number;     // slab% × posPaid (amount collected)
  penalCollected: number; // Penal amount collected (from penal rows)
  penalPayoutAmt: number; // Penal payout on amount collected
  penalPayoutPct: number; // Penal payout rate applied
}

interface AgentPayout {
  fosName: string;
  bkts: AgentBktPayout[];
  totalPayout: number;
  totalPosPaid: number;
  totalPenalCollected: number;
  totalPenalPayout: number;
}

function buildAgentPayouts(rows: BktRow[]): AgentPayout[] {
  // Separate regular BKT rows from penal rows
  const regularRows = rows.filter(r => ["bkt1", "bkt2", "bkt3"].includes(normBkt(r.bkt)));
  const penalRows   = rows.filter(r => normBkt(r.bkt) === "penal");

  // Index penal rows by agent name (lower-case) → pos_paid is the penal collected amount
  const penalByAgent: Record<string, number> = {};
  for (const r of penalRows) {
    const key = (r.fos_name || "Unknown").toLowerCase();
    penalByAgent[key] = (penalByAgent[key] || 0) + n(r.pos_paid);
  }

  // Group regular rows by agent → bucket
  const map: Record<string, { fosName: string; bktMap: Record<string, BktRow[]> }> = {};
  for (const row of regularRows) {
    const key = (row.fos_name || "Unknown").toLowerCase();
    if (!map[key]) map[key] = { fosName: row.fos_name || "Unknown", bktMap: {} };
    const bkt = normBkt(row.bkt);
    if (!map[key].bktMap[bkt]) map[key].bktMap[bkt] = [];
    map[key].bktMap[bkt].push(row);
  }

  return Object.values(map).map((agent) => {
    const agentKey = agent.fosName.toLowerCase();
    const penalCollectedTotal = penalByAgent[agentKey] || 0;

    const bkts: AgentBktPayout[] = [];
    let totalPayout       = 0;
    let totalPosPaid      = 0;
    let totalPenalPayout  = 0;
    let bkt1Slab: PayoutSlab | null = null; // stored to use for penal rate

    for (const [bkt, bktRows] of Object.entries(agent.bktMap)) {
      const posPaid  = bktRows.reduce((s, r) => s + n(r.pos_paid), 0);
      const posTotal = bktRows.reduce((s, r) => s + n(r.pos_grand_total), 0);
      const rbPaid   = bktRows.reduce((s, r) => s + n(r.rollback_paid), 0);
      const rbTotal  = bktRows.reduce((s, r) => s + n(r.rollback_grand_total), 0);

      // POS Resolution % = amount collected / total POS × 100
      const resPct = posTotal > 0 ? (posPaid / posTotal) * 100 : 0;
      // RB/NM % = rollback paid / rollback total × 100
      const rbPct  = rbTotal  > 0 ? (rbPaid  / rbTotal)  * 100 : 0;
      // Penal %: For BKT1 — penal collected / POS grand total × 100
      //          For BKT2/3 — flat 10% (per payout structure notes)
      const penalPct =
        bkt === "bkt1"
          ? posTotal > 0 ? (penalCollectedTotal / posTotal) * 100 : 0
          : 10;

      const slab = getPayoutSlab(bkt, resPct, rbPct, penalPct);

      // ─ Core payout: slab% applied ON amount collected (posPaid) ─
      const payoutAmt = slab ? (slab.payout / 100) * posPaid : 0;

      if (bkt === "bkt1") bkt1Slab = slab;

      totalPayout  += payoutAmt;
      totalPosPaid += posPaid;

      bkts.push({
        bkt, resPct, rbPct, penalPct,
        posPaid, posTotal, rbPaid, rbTotal,
        slab, payoutAmt,
        penalCollected: 0,  // assigned to BKT1 row below
        penalPayoutAmt: 0,
        penalPayoutPct: 0,
      });
    }

    // ─── Penal Payout ────────────────────────────────────────────────────────
    // "BKT 1 Penal Collection Link With BKT 1 Payout" →
    //   penal payout rate = BKT1 slab payout %
    // "Flat Payout 10% Penal Collection" (BKT 2 & 3) →
    //   10% applied on penal collected amount
    //
    // Penal amount is applied once per agent (not per bucket).
    // We attach it to the BKT1 row if present, otherwise first row.
    if (penalCollectedTotal > 0) {
      const penalRate = bkt1Slab ? bkt1Slab.payout : 10;
      const penalPayoutAmt = (penalRate / 100) * penalCollectedTotal;
      totalPenalPayout += penalPayoutAmt;
      totalPayout      += penalPayoutAmt;

      const targetBkt = bkts.find(b => b.bkt === "bkt1") || bkts[0];
      if (targetBkt) {
        targetBkt.penalCollected = penalCollectedTotal;
        targetBkt.penalPayoutAmt = penalPayoutAmt;
        targetBkt.penalPayoutPct = penalRate;
      }
    }

    bkts.sort((a, b) => {
      const order: Record<string, number> = { bkt1: 0, bkt2: 1, bkt3: 2 };
      return (order[a.bkt] ?? 9) - (order[b.bkt] ?? 9);
    });

    return {
      fosName: agent.fosName,
      bkts,
      totalPayout,
      totalPosPaid,
      totalPenalCollected: penalCollectedTotal,
      totalPenalPayout,
    };
  }).sort((a, b) => b.totalPayout - a.totalPayout);
}

// ─── Payout Reference Sheet Modal ─────────────────────────────────────────────
function PayoutReferenceModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const sections = [
    { bkt: "BKT 1", color: Colors.info,    slabs: BKT1_SLABS, note: "Penal Collection rate = BKT 1 slab payout %" },
    { bkt: "BKT 2", color: Colors.warning,  slabs: BKT2_SLABS, note: "Flat 10% on Penal Collection amount" },
    { bkt: "BKT 3", color: Colors.danger,   slabs: BKT3_SLABS, note: "Flat 10% on Penal Collection amount" },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" }}>
        <View style={[ref.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={ref.header}>
            <View>
              <Text style={ref.title}>FOS Payout Structure</Text>
              <Text style={ref.subtitle}>Jan-2025 · Payout % applied on Amount Collected</Text>
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
                  <Text style={[ref.thCell, { flex: 1.3 }]}>POS Reso %</Text>
                  <Text style={[ref.thCell, { flex: 1.1 }]}>RB/NM %</Text>
                  <Text style={[ref.thCell, { flex: 1 }]}>Penal %</Text>
                  <Text style={[ref.thCell, ref.thRight]}>Payout</Text>
                </View>
                {sec.slabs.map((slab, i) => (
                  <View
                    key={i}
                    style={[ref.tableRow, i % 2 === 0 && ref.tableRowAlt]}
                  >
                    <Text style={[ref.tdCell, { flex: 1.3 }]}>{slab.label}</Text>
                    <Text style={[ref.tdCell, { flex: 1.1 }]}>
                      {slab.rbMin > 0 ? `≥${slab.rbMin}%` : "—"}
                    </Text>
                    <Text style={[ref.tdCell, { flex: 1 }]}>
                      {slab.penalMin > 0 ? `≥${slab.penalMin}%` : "—"}
                    </Text>
                    <View
                      style={[ref.payoutChip, { backgroundColor: sec.color + "20" }]}
                    >
                      <Text style={[ref.payoutChipText, { color: sec.color }]}>
                        {slab.payout}%
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ))}

            <View style={ref.notesBox}>
              <Text style={ref.notesTitle}>📌 Rules</Text>
              <Text style={ref.notesLine}>• Payout % × Amount Collected = FOS Payout</Text>
              <Text style={ref.notesLine}>• UC Cases Payout: ₹500 per EMI</Text>
              <Text style={ref.notesLine}>• BKT 1 Penal rate = BKT 1 slab payout %</Text>
              <Text style={ref.notesLine}>• BKT 2 & 3 Penal: Flat 10% on penal collected</Text>
              <Text style={ref.notesLine}>• Both POS Reso % & RB/NM % must qualify for slab</Text>
              <Text style={ref.notesLine}>• Clearance counts for Resolution only, not Payout</Text>
              <Text style={ref.notesLine}>• BKT X Payout structure remains the same</Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const ref = StyleSheet.create({
  sheet:          { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "90%", gap: 12 },
  header:         { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  title:          { fontSize: 18, fontWeight: "800", color: Colors.text },
  subtitle:       { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  closeBtn:       { width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  section:        { backgroundColor: Colors.surfaceAlt, borderRadius: 12, padding: 12, marginBottom: 12, borderLeftWidth: 3, gap: 8 },
  bktBadge:       { alignSelf: "flex-start", borderRadius: 7, paddingHorizontal: 10, paddingVertical: 4 },
  bktBadgeText:   { fontSize: 13, fontWeight: "800" },
  note:           { fontSize: 11, color: Colors.textMuted, fontStyle: "italic" },
  tableHeader:    { flexDirection: "row", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
  thCell:         { flex: 1, fontSize: 10, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.4 },
  thRight:        { flex: 0.9, textAlign: "right" },
  tableRow:       { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  tableRowAlt:    { backgroundColor: Colors.surface + "80", borderRadius: 6 },
  tdCell:         { flex: 1, fontSize: 12, color: Colors.text, fontWeight: "500" },
  payoutChip:     { flex: 0.9, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignItems: "center" },
  payoutChipText: { fontSize: 12, fontWeight: "800" },
  notesBox:       { backgroundColor: Colors.surfaceAlt, borderRadius: 12, padding: 14, gap: 5, marginBottom: 8 },
  notesTitle:     { fontSize: 13, fontWeight: "800", color: Colors.text, marginBottom: 4 },
  notesLine:      { fontSize: 11, color: Colors.textSecondary, lineHeight: 18 },
});

// ─── Agent Payout Card ─────────────────────────────────────────────────────────
function AgentPayoutCard({ agent }: { agent: AgentPayout }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={ac.card}>
      <Pressable style={ac.header} onPress={() => setExpanded(!expanded)}>
        <View style={ac.avatarCircle}>
          <Text style={ac.avatarText}>
            {(agent.fosName[0] || "?").toUpperCase()}
          </Text>
        </View>
        <View style={ac.info}>
          <Text style={ac.name} numberOfLines={1}>{agent.fosName}</Text>
          <Text style={ac.subText}>
            {agent.bkts.length} bucket{agent.bkts.length !== 1 ? "s" : ""}
            {agent.totalPenalCollected > 0
              ? ` · Penal ${fmtAmt(agent.totalPenalCollected)}`
              : ""}
          </Text>
        </View>
        <View style={ac.payoutBox}>
          <Text style={ac.payoutAmt}>{fmtAmt(agent.totalPayout)}</Text>
          <Text style={ac.payoutLabel}>est. payout</Text>
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={16}
          color={Colors.textMuted}
          style={{ marginLeft: 4 }}
        />
      </Pressable>

      {/* BKT mini summary strip */}
      <View style={ac.bktStrip}>
        {agent.bkts.map((b) => {
          const color = BKT_COLORS[b.bkt] || Colors.primary;
          const label = b.bkt.replace("bkt", "B");
          return (
            <View key={b.bkt} style={[ac.bktChip, { borderColor: color + "50" }]}>
              <Text style={[ac.bktChipLabel, { color }]}>{label}</Text>
              <Text style={[ac.bktChipPct, { color }]}>{fmtPct(b.resPct)}</Text>
              <View style={[ac.bktSlabBadge, { backgroundColor: color + "20" }]}>
                <Text style={[ac.bktSlabBadgeText, { color }]}>
                  {b.slab?.payout ?? 0}%
                </Text>
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
            const slab    = b.slab;

            return (
              <View key={b.bkt} style={[ac.bktDetail, { borderLeftColor: color }]}>
                <View style={ac.bktDetailTop}>
                  <Text style={[ac.bktDetailLabel, { color }]}>{bktLabel.toUpperCase()}</Text>
                  {slab && (
                    <View style={[ac.slabBadge, { backgroundColor: color + "18" }]}>
                      <Text style={[ac.slabBadgeText, { color }]}>
                        Slab: {slab.label}
                      </Text>
                    </View>
                  )}
                  <View style={[ac.payoutSlabChip, { backgroundColor: color + "20" }]}>
                    <Text style={[ac.payoutSlabChipText, { color }]}>
                      {slab?.payout ?? 0}%
                    </Text>
                  </View>
                </View>

                {/* POS Resolution % bar */}
                <View style={ac.metricRow}>
                  <Text style={ac.metricLabel}>POS Reso</Text>
                  <View style={ac.barWrap}>
                    <View
                      style={[
                        ac.barFill,
                        { width: `${resFill}%` as any, backgroundColor: color },
                      ]}
                    />
                  </View>
                  <Text style={[ac.metricPct, { color }]}>{fmtPct(b.resPct)}</Text>
                </View>

                {/* RB/NM % bar */}
                <View style={ac.metricRow}>
                  <Text style={ac.metricLabel}>RB/NM</Text>
                  <View style={ac.barWrap}>
                    <View
                      style={[
                        ac.barFill,
                        { width: `${rbFill}%` as any, backgroundColor: Colors.info },
                      ]}
                    />
                  </View>
                  <Text style={[ac.metricPct, { color: Colors.info }]}>
                    {fmtPct(b.rbPct)}
                  </Text>
                </View>

                {/* Stats row — payout is slab% × amount collected */}
                <View style={ac.statsRow}>
                  <View style={ac.statCell}>
                    <Text style={ac.statLabel}>Amt Collected</Text>
                    <Text style={[ac.statVal, { color: Colors.success }]}>
                      {fmtAmt(b.posPaid)}
                    </Text>
                  </View>
                  <View style={ac.statCell}>
                    <Text style={ac.statLabel}>Total POS</Text>
                    <Text style={ac.statVal}>{fmtAmt(b.posTotal)}</Text>
                  </View>
                  <View style={ac.statCell}>
                    <Text style={ac.statLabel}>
                      Payout ({slab?.payout ?? 0}%)
                    </Text>
                    <Text style={[ac.statVal, { color }]}>
                      {fmtAmt(b.payoutAmt)}
                    </Text>
                  </View>
                </View>

                {/* Penal payout row — shown only when penal data exists */}
                {b.penalCollected > 0 && (
                  <View style={ac.penalRow}>
                    <Ionicons name="alert-circle-outline" size={13} color={Colors.warning} />
                    <Text style={ac.penalLabel}>Penal Collected</Text>
                    <Text style={ac.penalAmt}>{fmtAmt(b.penalCollected)}</Text>
                    <View style={ac.penalChip}>
                      <Text style={ac.penalChipText}>
                        {b.penalPayoutPct}% → {fmtAmt(b.penalPayoutAmt)}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            );
          })}

          {/* Total payout summary */}
          <View style={ac.totalBlock}>
            {/* Breakdown row */}
            <View style={ac.totalBreakRow}>
              <View style={ac.totalBreakCell}>
                <Text style={ac.totalBreakLabel}>Regular Payout</Text>
                <Text style={ac.totalBreakVal}>
                  {fmtAmt(agent.totalPayout - agent.totalPenalPayout)}
                </Text>
              </View>
              {agent.totalPenalPayout > 0 && (
                <View style={ac.totalBreakCell}>
                  <Text style={ac.totalBreakLabel}>Penal Payout</Text>
                  <Text style={[ac.totalBreakVal, { color: Colors.warning }]}>
                    {fmtAmt(agent.totalPenalPayout)}
                  </Text>
                </View>
              )}
            </View>
            <View style={ac.totalRow}>
              <Ionicons name="wallet-outline" size={16} color={Colors.primary} />
              <Text style={ac.totalLabel}>Total Estimated Payout</Text>
              <Text style={ac.totalAmt}>{fmtAmt(agent.totalPayout)}</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const ac = StyleSheet.create({
  card:               { backgroundColor: Colors.surface, borderRadius: 16, marginHorizontal: 14, marginBottom: 10, overflow: "hidden", borderWidth: 1, borderColor: Colors.border, ...Platform.select({ ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 }, android: { elevation: 1 } }) },
  header:             { flexDirection: "row", alignItems: "center", padding: 14, gap: 10 },
  avatarCircle:       { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary + "18", alignItems: "center", justifyContent: "center" },
  avatarText:         { fontSize: 16, fontWeight: "800", color: Colors.primary },
  info:               { flex: 1 },
  name:               { fontSize: 14, fontWeight: "700", color: Colors.text },
  subText:            { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  payoutBox:          { alignItems: "flex-end" },
  payoutAmt:          { fontSize: 15, fontWeight: "800", color: Colors.success },
  payoutLabel:        { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  bktStrip:           { flexDirection: "row", gap: 8, paddingHorizontal: 14, paddingBottom: 12 },
  bktChip:            { flex: 1, borderRadius: 10, borderWidth: 1, padding: 8, alignItems: "center", gap: 3 },
  bktChipLabel:       { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  bktChipPct:         { fontSize: 13, fontWeight: "900" },
  bktSlabBadge:       { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  bktSlabBadgeText:   { fontSize: 11, fontWeight: "800" },
  expandedWrap:       { paddingHorizontal: 14, paddingBottom: 14 },
  expandedDivider:    { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border, marginBottom: 12 },
  bktDetail:          { backgroundColor: Colors.surfaceAlt, borderRadius: 12, padding: 12, marginBottom: 10, borderLeftWidth: 3, gap: 8 },
  bktDetailTop:       { flexDirection: "row", alignItems: "center", gap: 8 },
  bktDetailLabel:     { fontSize: 12, fontWeight: "800", flex: 1 },
  slabBadge:          { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  slabBadgeText:      { fontSize: 11, fontWeight: "600" },
  payoutSlabChip:     { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  payoutSlabChipText: { fontSize: 14, fontWeight: "900" },
  metricRow:          { flexDirection: "row", alignItems: "center", gap: 8 },
  metricLabel:        { fontSize: 10, fontWeight: "700", color: Colors.textMuted, width: 56, textTransform: "uppercase" },
  barWrap:            { flex: 1, height: 7, backgroundColor: Colors.border, borderRadius: 4, overflow: "hidden" },
  barFill:            { height: "100%", borderRadius: 4 },
  metricPct:          { fontSize: 12, fontWeight: "800", width: 46, textAlign: "right" },
  statsRow:           { flexDirection: "row", marginTop: 4 },
  statCell:           { flex: 1, gap: 2 },
  statLabel:          { fontSize: 9, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.3 },
  statVal:            { fontSize: 12, fontWeight: "700", color: Colors.text },
  // Penal row
  penalRow:           { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.warning + "12", borderRadius: 8, padding: 8, marginTop: 4 },
  penalLabel:         { fontSize: 11, color: Colors.textSecondary, flex: 1 },
  penalAmt:           { fontSize: 11, fontWeight: "700", color: Colors.text },
  penalChip:          { backgroundColor: Colors.warning + "25", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  penalChipText:      { fontSize: 11, fontWeight: "800", color: Colors.warning },
  // Total block
  totalBlock:         { backgroundColor: Colors.primary + "08", borderRadius: 12, overflow: "hidden", marginTop: 2 },
  totalBreakRow:      { flexDirection: "row", paddingHorizontal: 12, paddingTop: 10, gap: 8 },
  totalBreakCell:     { flex: 1 },
  totalBreakLabel:    { fontSize: 10, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase" },
  totalBreakVal:      { fontSize: 13, fontWeight: "700", color: Colors.text, marginTop: 2 },
  totalRow:           { flexDirection: "row", alignItems: "center", padding: 12, gap: 8 },
  totalLabel:         { flex: 1, fontSize: 13, fontWeight: "700", color: Colors.text },
  totalAmt:           { fontSize: 16, fontWeight: "900", color: Colors.success },
});

// ─── Summary Banner ────────────────────────────────────────────────────────────
function SummaryBanner({ agents }: { agents: AgentPayout[] }) {
  const totalPayout      = agents.reduce((s, a) => s + a.totalPayout, 0);
  const totalPosPaid     = agents.reduce((s, a) => s + a.totalPosPaid, 0);
  const totalPenal       = agents.reduce((s, a) => s + a.totalPenalPayout, 0);
  const avgPct           = totalPosPaid > 0 ? (totalPayout / totalPosPaid) * 100 : 0;

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
      {totalPenal > 0 ? (
        <View style={sb.card}>
          <Ionicons name="alert-circle" size={18} color={Colors.warning} />
          <View>
            <Text style={sb.label}>Penal Payout</Text>
            <Text style={sb.val}>{fmtAmt(totalPenal)}</Text>
          </View>
        </View>
      ) : (
        <View style={sb.card}>
          <Ionicons name="trending-up" size={18} color={Colors.warning} />
          <View>
            <Text style={sb.label}>Avg Payout %</Text>
            <Text style={sb.val}>{fmtPct(avgPct)}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const sb = StyleSheet.create({
  wrap:  { flexDirection: "row", gap: 10, paddingHorizontal: 14, marginBottom: 10 },
  card:  { flex: 1, backgroundColor: Colors.surface, borderRadius: 12, padding: 10, alignItems: "center", gap: 4, borderWidth: 1, borderColor: Colors.border },
  label: { fontSize: 9, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase", marginTop: 2 },
  val:   { fontSize: 14, fontWeight: "800", color: Colors.text },
});

// ─── Main Screen ───────────────────────────────────────────────────────────────
export default function FosPayoutScreen() {
  const insets = useSafeAreaInsets();
  const { selectedCompany } = useCompanyFilter();
  const [refModalVisible, setRefModalVisible] = useState(false);

  const {
    data: rawRows,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery<BktRow[]>({
    queryKey: ["/api/admin/bkt-perf-summary", selectedCompany],
    queryFn: async () => {
      const url = new URL("/api/admin/bkt-perf-summary", getApiUrl());
      if (selectedCompany) url.searchParams.set("company", selectedCompany);
      const res = await fetch(url.toString(), {
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Failed to load performance data");
      const json = await res.json();
      return Array.isArray(json) ? json : json.rows ?? json.data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const agents = useMemo(() => {
    if (!rawRows?.length) return [];
    return buildAgentPayouts(rawRows);
  }, [rawRows]);

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: Colors.background,
        }}
      >
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text
          style={{ color: Colors.textSecondary, marginTop: 12, fontSize: 14 }}
        >
          Loading payout data…
        </Text>
      </View>
    );
  }

  if (isError || !rawRows) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: 32,
          backgroundColor: Colors.background,
        }}
      >
        <Ionicons name="cloud-offline-outline" size={48} color={Colors.textMuted} />
        <Text
          style={{
            color: Colors.text,
            fontSize: 16,
            fontWeight: "700",
            marginTop: 14,
          }}
        >
          Couldn't load data
        </Text>
        <Pressable
          style={{
            marginTop: 16,
            backgroundColor: Colors.primary,
            borderRadius: 12,
            paddingHorizontal: 20,
            paddingVertical: 10,
          }}
          onPress={() => refetch()}
        >
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
        contentContainerStyle={{
          paddingTop: 14,
          paddingBottom: insets.bottom + 20,
        }}
        refreshing={isRefetching}
        onRefresh={refetch}
        ListHeaderComponent={
          <View style={{ marginBottom: 4 }}>
            {/* Page Header */}
            <View style={pg.headerWrap}>
              <View>
                <Text style={pg.title}>FOS Payout Calculator</Text>
                <Text style={pg.subtitle}>
                  Payout % on amount collected per bucket
                </Text>
              </View>
              <Pressable
                style={pg.infoBtn}
                onPress={() => setRefModalVisible(true)}
              >
                <Ionicons
                  name="information-circle-outline"
                  size={20}
                  color={Colors.primary}
                />
                <Text style={pg.infoBtnText}>Payout Structure</Text>
              </Pressable>
            </View>

            {/* Summary */}
            {agents.length > 0 && <SummaryBanner agents={agents} />}

            {/* Column hints */}
            <View style={pg.columnHint}>
              <Text style={pg.columnHintText}>AGENT</Text>
              <Text style={[pg.columnHintText, { marginLeft: "auto" as any }]}>
                RESO % · SLAB · EST. PAYOUT
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={{ alignItems: "center", padding: 40, gap: 10 }}>
            <Ionicons name="wallet-outline" size={48} color={Colors.textMuted} />
            <Text
              style={{ fontSize: 15, fontWeight: "700", color: Colors.text }}
            >
              No payout data yet
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: Colors.textMuted,
                textAlign: "center",
              }}
            >
              Import BKT performance data to view FOS payouts
            </Text>
          </View>
        }
      />

      <PayoutReferenceModal
        visible={refModalVisible}
        onClose={() => setRefModalVisible(false)}
      />
    </View>
  );
}

const pg = StyleSheet.create({
  headerWrap:     { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", paddingHorizontal: 14, marginBottom: 14 },
  title:          { fontSize: 20, fontWeight: "900", color: Colors.text },
  subtitle:       { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  infoBtn:        { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: Colors.primary + "12", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: Colors.primary + "25" },
  infoBtnText:    { fontSize: 12, fontWeight: "700", color: Colors.primary },
  columnHint:     { flexDirection: "row", paddingHorizontal: 14, marginBottom: 8 },
  columnHintText: { fontSize: 9, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
});

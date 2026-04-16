/**
 * Admin — Daily Agent Report (Redesigned)
 * Route: /(admin)/daily-report
 *
 * Improvements:
 *  • Cleaner card layout with better visual hierarchy
 *  • Tab-based view: Agent Report | BKT Performance
 *  • BKT-wise performance table (BKT1/BKT2/BKT3/PENAL) per agent
 *  • Color-coded resolution targets with progress bars
 *  • Summary header with key metrics at a glance
 */

import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Alert,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentDayReport {
  agentId: number;
  agentName: string;
  attendanceStatus: "Present" | "Checked-In" | "Absent";
  checkIn: string | null;
  checkOut: string | null;
  durationMinutes: number | null;
  fieldVisits: number;
  ptpCount: number;
  paidCount: number;
  paidAmount: number;
  depositionCount: number;
  depositionAmount: number;
  breakCount: number;
  breakMinutes: number;
  perfTotal: number;
  perfPaid: number;
  perfUnpaid: number;
  perfPtp: number;
}

interface AgentPerformance {
  id: number;
  name: string;
  total: number;
  paid: number;
  notProcess: number;
  ptp: number;
}

interface BktPerfRow {
  fos_name: string;
  bkt: string;
  count_total: number;
  count_paid: number;
  count_unpaid: number;
  count_ptp: number;
  pos_paid: number;
  pos_unpaid: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BKT_CONFIG: Record<string, { label: string; color: string; target: number; rollback?: number }> = {
  bkt1:  { label: "BKT 1", color: Colors.info,         target: 92, rollback: 22 },
  bkt2:  { label: "BKT 2", color: Colors.warning,      target: 80, rollback: 18 },
  bkt3:  { label: "BKT 3", color: Colors.danger,       target: 75, rollback: 17 },
  penal: { label: "PENAL", color: Colors.primaryLight,  target: 3.5 },
};

const BKT_ORDER = ["bkt1", "bkt2", "bkt3", "penal"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO(): string {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().split("T")[0];
}

function shiftDate(iso: string, delta: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + delta);
  return d.toISOString().split("T")[0];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDuration(minutes: number | null): string {
  if (minutes === null || minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatAmount(n: number): string {
  if (n === 0) return "₹0";
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function normalizeBkt(bkt: string): string {
  return String(bkt || "").toLowerCase().replace(/[\s_]/g, "");
}

function pctStr(a: number, b: number): string {
  if (b === 0) return "0%";
  return ((a / b) * 100).toFixed(1) + "%";
}

function getInitials(name: string): string {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

// ─── PDF Generator ────────────────────────────────────────────────────────────

function generateReportHTML(
  report: AgentDayReport[],
  perfMap: Map<number, AgentPerformance>,
  date: string
): string {
  const dateLabel = formatDate(date);
  const present = report.filter((r) => r.attendanceStatus !== "Absent").length;
  const totalVisits = report.reduce((s, r) => s + r.fieldVisits, 0);
  const totalPaid = report.reduce((s, r) => s + Number(r.paidAmount), 0);
  const totalDep = report.reduce((s, r) => s + Number(r.depositionAmount), 0);
  const totalPaidCases = report.reduce((s, r) => s + r.paidCount, 0);

  const rows = report.map((r) => {
    const perf = perfMap.get(r.agentId);
    const resolution = perf && perf.total > 0 ? pctStr(perf.paid, perf.total) : "—";
    const attClass = r.attendanceStatus === "Present" ? "present" : r.attendanceStatus === "Checked-In" ? "checkin" : "absent";

    return `
    <tr>
      <td class="name-col">${r.agentName}</td>
      <td><span class="badge ${attClass}">${r.attendanceStatus}</span></td>
      <td>${formatTime(r.checkIn)}</td>
      <td>${formatTime(r.checkOut)}</td>
      <td>${formatDuration(r.durationMinutes)}</td>
      <td class="num">${r.fieldVisits}</td>
      <td class="num">${r.ptpCount}</td>
      <td class="num">${r.paidCount}${r.paidAmount > 0 ? `<br/><span class="sub">${formatAmount(Number(r.paidAmount))}</span>` : ""}</td>
      <td class="num">${r.depositionCount}${r.depositionAmount > 0 ? `<br/><span class="sub">${formatAmount(Number(r.depositionAmount))}</span>` : ""}</td>
      <td class="num">${perf ? perf.total : "—"}</td>
      <td class="num perf-paid">${perf ? perf.paid : "—"}</td>
      <td class="num perf-unpaid">${perf ? perf.notProcess : "—"}</td>
      <td class="num perf-ptp">${perf ? perf.ptp : "—"}</td>
      <td class="num">${resolution}</td>
    </tr>`;
  }).join("");

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #111; background: #fff; padding: 20px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 14px; }
  .header h1 { font-size: 18px; font-weight: 800; }
  .header p { font-size: 11px; color: #555; margin-top: 2px; }
  .header-meta { text-align: right; font-size: 9px; color: #888; line-height: 1.7; }
  .summary { display: flex; gap: 8px; margin-bottom: 14px; }
  .pill { flex: 1; border-radius: 6px; padding: 8px 10px; text-align: center; }
  .pill-val { font-size: 14px; font-weight: 800; }
  .pill-lbl { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; margin-top: 2px; }
  .p-green { background: #f0fdf4; border: 1px solid #bbf7d0; color: #15803d; }
  .p-blue { background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; }
  .p-teal { background: #f0fdfa; border: 1px solid #99f6e4; color: #0f766e; }
  .p-amber { background: #fffbeb; border: 1px solid #fde68a; color: #b45309; }
  .p-indigo { background: #eef2ff; border: 1px solid #c7d2fe; color: #4338ca; }
  .section-label { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5px; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th { background: #111; color: #fff; padding: 6px 5px; text-align: left; font-size: 8.5px; font-weight: 700; letter-spacing: 0.2px; white-space: nowrap; }
  th.perf-head { background: #333; }
  th.num, td.num { text-align: center; }
  td { padding: 6px 5px; border-bottom: 1px solid #e5e7eb; vertical-align: middle; }
  tr:nth-child(even) td { background: #f9fafb; }
  .name-col { font-weight: 700; min-width: 100px; }
  .sub { font-size: 8.5px; color: #6b7280; }
  .badge { display: inline-block; font-size: 8px; font-weight: 700; padding: 2px 6px; border-radius: 20px; white-space: nowrap; }
  .present { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
  .checkin { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
  .absent { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
  .perf-paid { color: #15803d; font-weight: 700; }
  .perf-unpaid { color: #dc2626; font-weight: 700; }
  .perf-ptp { color: #7c3aed; font-weight: 700; }
  .footer { margin-top: 14px; padding-top: 8px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 8px; color: #9ca3af; }
</style></head><body>
  <div class="header">
    <div><h1>Daily Agent Report</h1><p>${dateLabel}</p></div>
    <div class="header-meta">Generated: ${new Date().toLocaleString("en-IN")}<br/>Total Agents: ${report.length} &nbsp;|&nbsp; Present: ${present}/${report.length}</div>
  </div>
  <div class="summary">
    <div class="pill p-green"><div class="pill-val">${present}/${report.length}</div><div class="pill-lbl">Present</div></div>
    <div class="pill p-blue"><div class="pill-val">${totalVisits}</div><div class="pill-lbl">Field Visits</div></div>
    <div class="pill p-teal"><div class="pill-val">${totalPaidCases}</div><div class="pill-lbl">Cases Paid Today</div></div>
    <div class="pill p-amber"><div class="pill-val">${formatAmount(totalPaid)}</div><div class="pill-lbl">Collected Today</div></div>
    <div class="pill p-indigo"><div class="pill-val">${formatAmount(totalDep)}</div><div class="pill-lbl">Deposited Today</div></div>
  </div>
  <p class="section-label">Agent-wise Breakdown — Daily + Overall Performance</p>
  <table>
    <thead><tr>
      <th>Agent Name</th><th>Attendance</th><th>Check-In</th><th>Check-Out</th><th>Duration</th>
      <th class="num">Visits</th><th class="num">PTP Today</th><th class="num">Paid Today</th><th class="num">Depositions</th>
      <th class="num perf-head">Total</th><th class="num perf-head">Paid</th><th class="num perf-head">Unpaid</th>
      <th class="num perf-head">PTP</th><th class="num perf-head">Resolution</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer"><span>Dhanraj Daily Report — ${dateLabel}</span><span>Confidential — Internal Use Only</span></div>
</body></html>`;
}

async function exportAndShare(
  report: AgentDayReport[],
  perfMap: Map<number, AgentPerformance>,
  date: string
): Promise<void> {
  const html = generateReportHTML(report, perfMap, date);
  const { uri } = await Print.printToFileAsync({ html, base64: false, width: 842, height: 595 });
  const dest = `${FileSystem.cacheDirectory}DailyReport_${date}.pdf`;
  await FileSystem.moveAsync({ from: uri, to: dest });
  await Sharing.shareAsync(dest, {
    mimeType: "application/pdf",
    dialogTitle: `Daily Report — ${formatDate(date)}`,
    UTI: "com.adobe.pdf",
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <View style={[sc.card, { borderTopColor: color }]}>
      <View style={[sc.iconWrap, { backgroundColor: color + "18" }]}>
        <Ionicons name={icon as any} size={16} color={color} />
      </View>
      <Text style={[sc.value, { color }]}>{value}</Text>
      <Text style={sc.label}>{label}</Text>
    </View>
  );
}

const sc = StyleSheet.create({
  card: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: 12,
    padding: 10, alignItems: "center", gap: 4,
    borderTopWidth: 3, borderWidth: 1, borderColor: Colors.border,
    ...Platform.select({ ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3 }, android: { elevation: 2 } }),
  },
  iconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  value: { fontSize: 15, fontWeight: "800" },
  label: { fontSize: 9, color: Colors.textMuted, fontWeight: "600", letterSpacing: 0.4, textTransform: "uppercase", textAlign: "center" },
});

function AttBadge({ status }: { status: AgentDayReport["attendanceStatus"] }) {
  const cfg = {
    Present:      { color: Colors.success, icon: "checkmark-circle" as const },
    "Checked-In": { color: Colors.info,    icon: "time" as const },
    Absent:       { color: Colors.danger,  icon: "close-circle" as const },
  }[status];
  return (
    <View style={[styles.attBadge, { backgroundColor: cfg.color + "18", borderColor: cfg.color + "30" }]}>
      <Ionicons name={cfg.icon} size={11} color={cfg.color} />
      <Text style={[styles.attBadgeText, { color: cfg.color }]}>{status}</Text>
    </View>
  );
}

function ProgressBar({ pct, color, height = 6 }: { pct: number; color: string; height?: number }) {
  return (
    <View style={[styles.barBg, { height }]}>
      <View style={[styles.barFill, { width: `${Math.min(Math.max(pct, 0), 100)}%` as any, backgroundColor: color, height }]} />
    </View>
  );
}

// ─── BKT Bucket Mini Card ─────────────────────────────────────────────────────

function BktMiniCard({ bktKey, rows }: { bktKey: string; rows: BktPerfRow[] }) {
  const cfg = BKT_CONFIG[bktKey];
  if (!cfg || rows.length === 0) return null;

  const total   = rows.reduce((s, r) => s + (r.count_total ?? 0), 0);
  const paid    = rows.reduce((s, r) => s + (r.count_paid ?? 0), 0);
  const unpaid  = rows.reduce((s, r) => s + (r.count_unpaid ?? 0), 0);
  const ptp     = rows.reduce((s, r) => s + (r.count_ptp ?? 0), 0);
  const resPct  = total > 0 ? (paid / total) * 100 : 0;
  const meetsTarget = resPct >= cfg.target;

  return (
    <View style={[bkt.card, { borderLeftColor: cfg.color }]}>
      <View style={bkt.header}>
        <View style={[bkt.badge, { backgroundColor: cfg.color + "20" }]}>
          <Text style={[bkt.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
        <View style={[bkt.targetChip, { borderColor: (meetsTarget ? Colors.success : Colors.danger) + "50", backgroundColor: (meetsTarget ? Colors.success : Colors.danger) + "12" }]}>
          <Ionicons name={meetsTarget ? "checkmark" : "flag"} size={10} color={meetsTarget ? Colors.success : Colors.danger} />
          <Text style={[bkt.targetText, { color: meetsTarget ? Colors.success : Colors.danger }]}>
            Target {cfg.target}%
          </Text>
        </View>
      </View>

      <View style={bkt.statsRow}>
        <View style={bkt.stat}>
          <Text style={bkt.statVal}>{total}</Text>
          <Text style={bkt.statLbl}>Total</Text>
        </View>
        <View style={bkt.stat}>
          <Text style={[bkt.statVal, { color: Colors.success }]}>{paid}</Text>
          <Text style={bkt.statLbl}>Paid</Text>
        </View>
        <View style={bkt.stat}>
          <Text style={[bkt.statVal, { color: Colors.danger }]}>{unpaid}</Text>
          <Text style={bkt.statLbl}>Unpaid</Text>
        </View>
        <View style={bkt.stat}>
          <Text style={[bkt.statVal, { color: Colors.statusPTP }]}>{ptp}</Text>
          <Text style={bkt.statLbl}>PTP</Text>
        </View>
        <View style={[bkt.stat, bkt.resStat, { borderColor: (meetsTarget ? Colors.success : Colors.danger) + "40", backgroundColor: (meetsTarget ? Colors.success : Colors.danger) + "10" }]}>
          <Text style={[bkt.statVal, { color: meetsTarget ? Colors.success : Colors.danger, fontSize: 15 }]}>{resPct.toFixed(1)}%</Text>
          <Text style={[bkt.statLbl, { color: meetsTarget ? Colors.success : Colors.danger }]}>Res%</Text>
        </View>
      </View>

      <View style={{ gap: 3 }}>
        <ProgressBar pct={resPct} color={meetsTarget ? Colors.success : Colors.danger} height={5} />
        <View style={bkt.barLabels}>
          <Text style={bkt.barLabelLeft}>0%</Text>
          <Text style={[bkt.barLabelRight, { color: meetsTarget ? Colors.success : Colors.danger }]}>{resPct.toFixed(1)}% / {cfg.target}% target</Text>
        </View>
      </View>
    </View>
  );
}

const bkt = StyleSheet.create({
  card: { backgroundColor: Colors.surface, borderRadius: 14, padding: 12, borderLeftWidth: 4, borderWidth: 1, borderColor: Colors.border, gap: 10 },
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  targetChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  targetText: { fontSize: 10, fontWeight: "700" },
  statsRow: { flexDirection: "row", gap: 6 },
  stat: { flex: 1, alignItems: "center", backgroundColor: Colors.background, borderRadius: 10, paddingVertical: 8, borderWidth: 1, borderColor: Colors.border },
  resStat: { flex: 1.2, borderWidth: 1 },
  statVal: { fontSize: 13, fontWeight: "800", color: Colors.text },
  statLbl: { fontSize: 9, color: Colors.textMuted, fontWeight: "600", letterSpacing: 0.3, marginTop: 2 },
  barLabels: { flexDirection: "row", justifyContent: "space-between" },
  barLabelLeft: { fontSize: 9, color: Colors.textMuted },
  barLabelRight: { fontSize: 9, fontWeight: "600" },
});

// ─── Agent-wise BKT Row ───────────────────────────────────────────────────────

function AgentBktRow({ agentName, bktRows }: { agentName: string; bktRows: BktPerfRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const initials = getInitials(agentName);

  // Group rows by bkt key
  const byBkt: Record<string, BktPerfRow> = {};
  for (const r of bktRows) {
    const key = normalizeBkt(r.bkt);
    byBkt[key] = r;
  }

  const totalCases = bktRows.reduce((s, r) => s + (r.count_total ?? 0), 0);
  const totalPaid  = bktRows.reduce((s, r) => s + (r.count_paid ?? 0), 0);
  const overallRes = totalCases > 0 ? (totalPaid / totalCases) * 100 : 0;
  const resColor = overallRes >= 70 ? Colors.success : overallRes >= 40 ? Colors.warning : Colors.danger;

  return (
    <Pressable onPress={() => setExpanded(e => !e)} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.agentName} numberOfLines={1}>{agentName}</Text>
          <Text style={styles.agentSub}>{totalCases} total cases</Text>
        </View>
        {/* BKT chips */}
        <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
          {BKT_ORDER.filter(k => byBkt[k]).map(k => {
            const cfg = BKT_CONFIG[k];
            const r = byBkt[k];
            const res = r.count_total > 0 ? (r.count_paid / r.count_total) * 100 : 0;
            const met = res >= cfg.target;
            return (
              <View key={k} style={[styles.bktChip, { backgroundColor: cfg.color + "18", borderColor: cfg.color + "40" }]}>
                <Text style={[styles.bktChipText, { color: cfg.color }]}>{cfg.label.replace("BKT ", "B")}</Text>
                <Ionicons name={met ? "checkmark" : "close"} size={8} color={met ? Colors.success : Colors.danger} />
              </View>
            );
          })}
        </View>
        <View style={[styles.resBadge, { borderColor: resColor + "40", backgroundColor: resColor + "12" }]}>
          <Text style={[styles.resBadgeText, { color: resColor }]}>{overallRes.toFixed(0)}%</Text>
        </View>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={Colors.textMuted} style={{ marginLeft: 4 }} />
      </View>

      {/* Expanded BKT details */}
      {expanded && (
        <View style={styles.detail}>
          <View style={styles.bktGrid}>
            {BKT_ORDER.map(k => {
              const cfg = BKT_CONFIG[k];
              const r = byBkt[k];
              if (!r) return null;
              const res = r.count_total > 0 ? (r.count_paid / r.count_total) * 100 : 0;
              const met = res >= cfg.target;
              const resColor = met ? Colors.success : Colors.danger;
              return (
                <View key={k} style={[styles.bktDetailCard, { borderTopColor: cfg.color }]}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <Text style={[styles.bktDetailLabel, { color: cfg.color }]}>{cfg.label}</Text>
                    <View style={[styles.targetPill, { backgroundColor: resColor + "15", borderColor: resColor + "40" }]}>
                      <Ionicons name={met ? "checkmark" : "close"} size={9} color={resColor} />
                      <Text style={[styles.targetPillText, { color: resColor }]}>{cfg.target}%</Text>
                    </View>
                  </View>
                  <View style={styles.bktDetailStats}>
                    <View style={styles.bktDetailStat}>
                      <Text style={[styles.bktDetailVal, { color: Colors.text }]}>{r.count_total}</Text>
                      <Text style={styles.bktDetailSub}>Total</Text>
                    </View>
                    <View style={styles.bktDetailStat}>
                      <Text style={[styles.bktDetailVal, { color: Colors.success }]}>{r.count_paid}</Text>
                      <Text style={styles.bktDetailSub}>Paid</Text>
                    </View>
                    <View style={styles.bktDetailStat}>
                      <Text style={[styles.bktDetailVal, { color: Colors.danger }]}>{r.count_unpaid}</Text>
                      <Text style={styles.bktDetailSub}>Unpaid</Text>
                    </View>
                    <View style={styles.bktDetailStat}>
                      <Text style={[styles.bktDetailVal, { color: Colors.statusPTP }]}>{r.count_ptp}</Text>
                      <Text style={styles.bktDetailSub}>PTP</Text>
                    </View>
                  </View>
                  <ProgressBar pct={res} color={resColor} height={4} />
                  <Text style={[styles.resText, { color: resColor }]}>{res.toFixed(1)}% resolution</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </Pressable>
  );
}

// ─── Agent Daily Card ─────────────────────────────────────────────────────────

function AgentCard({ item, perf }: { item: AgentDayReport; perf: AgentPerformance | undefined }) {
  const [expanded, setExpanded] = useState(false);
  const isAbsent = item.attendanceStatus === "Absent";
  const initials = getInitials(item.agentName);
  const resolution = perf && perf.total > 0 ? Math.round((perf.paid / perf.total) * 100) : null;
  const barColor =
    resolution === null ? Colors.textMuted
    : resolution >= 70 ? Colors.success
    : resolution >= 40 ? Colors.warning
    : Colors.danger;

  return (
    <Pressable
      onPress={() => setExpanded((e) => !e)}
      style={({ pressed }) => [styles.card, isAbsent && styles.cardAbsent, pressed && styles.cardPressed]}
    >
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={[styles.avatar, isAbsent && styles.avatarAbsent]}>
          <Text style={[styles.avatarText, isAbsent && styles.avatarTextAbsent]}>{initials}</Text>
        </View>
        <View style={styles.cardMeta}>
          <Text style={styles.agentName} numberOfLines={1}>{item.agentName}</Text>
          <AttBadge status={item.attendanceStatus} />
        </View>
        {/* Quick metrics */}
        {!isAbsent && (
          <View style={styles.quickRow}>
            <View style={styles.quickChip}>
              <Ionicons name="location" size={10} color={Colors.info} />
              <Text style={[styles.quickVal, { color: Colors.info }]}>{item.fieldVisits}</Text>
            </View>
            <View style={styles.quickChip}>
              <Ionicons name="cash" size={10} color={Colors.success} />
              <Text style={[styles.quickVal, { color: Colors.success }]}>{item.paidCount}</Text>
            </View>
            <View style={styles.quickChip}>
              <Ionicons name="time-outline" size={10} color={Colors.statusPTP} />
              <Text style={[styles.quickVal, { color: Colors.statusPTP }]}>{item.ptpCount}</Text>
            </View>
          </View>
        )}
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={16}
          color={Colors.textMuted}
          style={{ marginLeft: 6 }}
        />
      </View>

      {/* Performance strip */}
      {perf && perf.total > 0 && (
        <View style={styles.perfStrip}>
          <View style={styles.perfStripRow}>
            {[
              { label: "Total",  value: String(perf.total),      color: Colors.text },
              { label: "Paid",   value: String(perf.paid),       color: Colors.statusPaid },
              { label: "Unpaid", value: String(perf.notProcess), color: Colors.danger },
              { label: "PTP",    value: String(perf.ptp),        color: Colors.statusPTP },
            ].map((s) => (
              <View key={s.label} style={styles.perfPill}>
                <Text style={[styles.perfPillVal, { color: s.color }]}>{s.value}</Text>
                <Text style={styles.perfPillLabel}>{s.label}</Text>
              </View>
            ))}
            <View style={[styles.perfPill, styles.resPill, { borderColor: barColor + "44", backgroundColor: barColor + "12" }]}>
              <Text style={[styles.perfPillVal, { color: barColor, fontSize: 14 }]}>{resolution}%</Text>
              <Text style={[styles.perfPillLabel, { color: barColor }]}>Res%</Text>
            </View>
          </View>
          <ProgressBar pct={resolution ?? 0} color={barColor} />
        </View>
      )}

      {/* Expanded */}
      {expanded && (
        <View style={styles.detail}>
          {/* Timing */}
          <Text style={styles.sectionTitle}>Attendance</Text>
          <View style={styles.timingRow}>
            {[
              { label: "Check-In",  value: formatTime(item.checkIn) },
              { label: "Check-Out", value: formatTime(item.checkOut) },
              { label: "Duration",  value: formatDuration(item.durationMinutes) },
            ].map((t) => (
              <View key={t.label} style={styles.timingCell}>
                <Text style={styles.timingLabel}>{t.label}</Text>
                <Text style={styles.timingValue}>{t.value}</Text>
              </View>
            ))}
          </View>

          {/* Activity */}
          <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Field Activity</Text>
          <View style={styles.activityRow}>
            {[
              { icon: "location", label: "Visits", value: item.fieldVisits, color: Colors.info },
              { icon: "time-outline", label: "PTP Today", value: item.ptpCount, color: Colors.statusPTP },
              { icon: "walk-outline", label: "Breaks", value: item.breakCount, color: Colors.warning },
            ].map(a => (
              <View key={a.label} style={[styles.actCell, { borderColor: a.color + "30" }]}>
                <View style={[styles.actIcon, { backgroundColor: a.color + "18" }]}>
                  <Ionicons name={a.icon as any} size={14} color={a.color} />
                </View>
                <Text style={[styles.actVal, { color: a.color }]}>{a.value}</Text>
                <Text style={styles.actLabel}>{a.label}</Text>
              </View>
            ))}
          </View>

          {/* Collections */}
          <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Collections</Text>
          <View style={styles.collRow}>
            <View style={[styles.collCard, { borderColor: Colors.success + "40" }]}>
              <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
              <View>
                <Text style={[styles.collVal, { color: Colors.success }]}>{item.paidCount} cases</Text>
                {item.paidAmount > 0 && <Text style={styles.collSub}>{formatAmount(Number(item.paidAmount))}</Text>}
              </View>
              <Text style={styles.collTag}>Paid</Text>
            </View>
            <View style={[styles.collCard, { borderColor: Colors.warning + "40" }]}>
              <Ionicons name="wallet" size={16} color={Colors.warning} />
              <View>
                <Text style={[styles.collVal, { color: Colors.warning }]}>{item.depositionCount} deps</Text>
                {item.depositionAmount > 0 && <Text style={styles.collSub}>{formatAmount(Number(item.depositionAmount))}</Text>}
              </View>
              <Text style={styles.collTag}>Deposited</Text>
            </View>
          </View>
        </View>
      )}
    </Pressable>
  );
}

// ─── Tab Bar ──────────────────────────────────────────────────────────────────

function TabBar({ active, onChange }: { active: number; onChange: (i: number) => void }) {
  const tabs = ["Agent Report", "BKT Performance"];
  return (
    <View style={styles.tabBar}>
      {tabs.map((tab, i) => (
        <Pressable key={tab} onPress={() => onChange(i)} style={[styles.tabItem, active === i && styles.tabItemActive]}>
          <Ionicons
            name={i === 0 ? "people" : "bar-chart"}
            size={14}
            color={active === i ? Colors.primary : Colors.textMuted}
          />
          <Text style={[styles.tabText, active === i && styles.tabTextActive]}>{tab}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function AdminDailyReportScreen() {
  const insets = useSafeAreaInsets();
  const [date, setDate]         = useState(todayISO());
  const [activeTab, setActiveTab] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["/api/admin/daily-report", date],
    queryFn: () => (api.admin as any).getDailyReport(date),
    refetchInterval: 60_000,
    retry: 2,
  });

  const bktQuery = useQuery({
    queryKey: ["/api/admin/bkt-perf-summary"],
    queryFn: () => (api.admin as any).getBktPerfSummary(),
    retry: 2,
  });

  const report: AgentDayReport[] = useMemo(() => data?.report ?? [], [data]);

  const perfMap = useMemo(() => {
    const map = new Map<number, AgentPerformance>();
    for (const r of report) {
      map.set(r.agentId, {
        id:         r.agentId,
        name:       r.agentName,
        total:      r.perfTotal   ?? 0,
        paid:       r.perfPaid    ?? 0,
        notProcess: r.perfUnpaid  ?? 0,
        ptp:        r.perfPtp     ?? 0,
      });
    }
    return map;
  }, [report]);

  // BKT: group rows by bkt key (overall summary)
  const bktSummaryRows: BktPerfRow[] = useMemo(() => {
    const rows = bktQuery.data?.rows ?? [];
    return rows.filter((r: any) => {
      const k = normalizeBkt(r.bkt);
      return (k.startsWith("bkt") || k === "penal") && k !== "all";
    });
  }, [bktQuery.data]);

  // Group bkt rows by bkt category
  const bktByCategory: Record<string, BktPerfRow[]> = useMemo(() => {
    const map: Record<string, BktPerfRow[]> = {};
    for (const r of bktSummaryRows) {
      const k = normalizeBkt(r.bkt);
      if (!map[k]) map[k] = [];
      map[k].push(r);
    }
    return map;
  }, [bktSummaryRows]);

  // Group bkt rows by agent
  const bktByAgent: Record<string, BktPerfRow[]> = useMemo(() => {
    const map: Record<string, BktPerfRow[]> = {};
    for (const r of bktSummaryRows) {
      const name = r.fos_name || "Unknown";
      if (!map[name]) map[name] = [];
      map[name].push(r);
    }
    return map;
  }, [bktSummaryRows]);

  const agentBktNames = useMemo(() => Object.keys(bktByAgent).sort(), [bktByAgent]);

  const onRefresh = useCallback(() => { refetch(); bktQuery.refetch(); }, [refetch, bktQuery]);
  const isToday   = date === todayISO();

  const handleExport = useCallback(async () => {
    if (report.length === 0) { Alert.alert("No Data", "Nothing to export for this date."); return; }
    const ok = await Sharing.isAvailableAsync();
    if (!ok) { Alert.alert("Not Supported", "Sharing not available."); return; }
    setIsExporting(true);
    try { await exportAndShare(report, perfMap, date); }
    catch (e: any) { Alert.alert("Export Failed", e?.message ?? "Could not generate PDF."); }
    finally { setIsExporting(false); }
  }, [report, perfMap, date]);

  // Summary metrics
  const present    = report.filter(r => r.attendanceStatus !== "Absent").length;
  const totalPaid  = report.reduce((s, r) => s + Number(r.paidAmount), 0);
  const totalDep   = report.reduce((s, r) => s + Number(r.depositionAmount), 0);
  const totalVisit = report.reduce((s, r) => s + r.fieldVisits, 0);

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom }]}>
      {/* ── Date navigator ── */}
      <View style={styles.dateNav}>
        <Pressable
          style={({ pressed }) => [styles.dateBtn, pressed && styles.dateBtnPressed]}
          onPress={() => setDate(d => shiftDate(d, -1))}
        >
          <Ionicons name="chevron-back" size={20} color={Colors.primary} />
        </Pressable>
        <View style={styles.dateLabelWrap}>
          <Text style={styles.dateLabel}>{formatDate(date)}</Text>
          {isToday && (
            <View style={styles.todayBadge}><Text style={styles.todayBadgeText}>TODAY</Text></View>
          )}
        </View>
        <Pressable
          style={({ pressed }) => [styles.dateBtn, pressed && styles.dateBtnPressed, isToday && styles.dateBtnDisabled]}
          onPress={() => { if (!isToday) setDate(d => shiftDate(d, 1)); }}
          disabled={isToday}
        >
          <Ionicons name="chevron-forward" size={20} color={isToday ? Colors.textMuted : Colors.primary} />
        </Pressable>
      </View>

      {/* ── Summary metrics ── */}
      {report.length > 0 && (
        <View style={styles.summaryRow}>
          <SummaryCard icon="people"   label="Present"   value={`${present}/${report.length}`} color={Colors.success} />
          <SummaryCard icon="location" label="Visits"    value={String(totalVisit)}             color={Colors.info} />
          <SummaryCard icon="cash"     label="Collected" value={formatAmount(totalPaid)}        color={Colors.statusPaid} />
          <SummaryCard icon="wallet"   label="Deposited" value={formatAmount(totalDep)}         color={Colors.warning} />
        </View>
      )}

      {/* ── Export row ── */}
      {report.length > 0 && (
        <View style={styles.exportBar}>
          <Pressable
            style={({ pressed }) => [styles.exportBtn, pressed && { opacity: 0.75 }, isExporting && { opacity: 0.6 }]}
            onPress={handleExport}
            disabled={isExporting}
          >
            {isExporting
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="document-text-outline" size={15} color="#fff" />}
            <Text style={styles.exportBtnText}>{isExporting ? "Generating…" : "Export PDF"}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.waBtn, pressed && { opacity: 0.75 }, isExporting && { opacity: 0.6 }]}
            onPress={handleExport}
            disabled={isExporting}
          >
            <Ionicons name="logo-whatsapp" size={16} color="#fff" />
            <Text style={styles.exportBtnText}>Share</Text>
          </Pressable>
        </View>
      )}

      {/* ── Tabs ── */}
      <TabBar active={activeTab} onChange={setActiveTab} />

      {/* ── Loading / Error / Empty ── */}
      {isLoading && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading report…</Text>
        </View>
      )}
      {isError && !isLoading && (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color={Colors.danger} />
          <Text style={styles.errorText}>{(error as any)?.message ?? "Failed to load report"}</Text>
          <Pressable style={styles.retryBtn} onPress={() => refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {/* ── Tab 0: Agent Report ── */}
      {!isLoading && !isError && activeTab === 0 && (
        <>
          {report.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="document-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No agents found for this date</Text>
            </View>
          ) : (
            <FlatList
              data={report}
              keyExtractor={(item) => String(item.agentId)}
              renderItem={({ item }) => <AgentCard item={item} perf={perfMap.get(item.agentId)} />}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={isFetching && !isLoading}
                  onRefresh={onRefresh}
                  tintColor={Colors.primary}
                />
              }
            />
          )}
        </>
      )}

      {/* ── Tab 1: BKT Performance ── */}
      {!isLoading && !isError && activeTab === 1 && (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={bktQuery.isFetching}
              onRefresh={() => bktQuery.refetch()}
              tintColor={Colors.primary}
            />
          }
        >
          {bktQuery.isLoading && (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>Loading BKT data…</Text>
            </View>
          )}
          {!bktQuery.isLoading && bktSummaryRows.length === 0 && (
            <View style={styles.center}>
              <Ionicons name="bar-chart-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No BKT data available</Text>
            </View>
          )}

          {!bktQuery.isLoading && bktSummaryRows.length > 0 && (
            <>
              {/* Overall BKT summary cards */}
              <Text style={styles.sectionHeader}>Overall BKT Performance</Text>
              <View style={styles.bktSummaryGrid}>
                {BKT_ORDER.filter(k => bktByCategory[k]?.length > 0).map(k => (
                  <BktMiniCard key={k} bktKey={k} rows={bktByCategory[k]} />
                ))}
              </View>

              {/* Agent-wise BKT breakdown */}
              {agentBktNames.length > 0 && (
                <>
                  <Text style={[styles.sectionHeader, { marginTop: 20 }]}>Agent-wise BKT Breakdown</Text>
                  {agentBktNames.map(name => (
                    <AgentBktRow key={name} agentName={name} bktRows={bktByAgent[name]} />
                  ))}
                </>
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  // Date Navigator
  dateNav: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: Colors.surface,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  dateBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
    backgroundColor: Colors.background,
    borderWidth: 1, borderColor: Colors.border,
  },
  dateBtnPressed: { opacity: 0.6 },
  dateBtnDisabled: { opacity: 0.35 },
  dateLabelWrap: { alignItems: "center", gap: 4 },
  dateLabel: { fontSize: 15, fontWeight: "700", color: Colors.text },
  todayBadge: {
    backgroundColor: Colors.primary + "15", borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  todayBadgeText: { fontSize: 10, fontWeight: "800", color: Colors.primary, letterSpacing: 1 },

  // Summary Row
  summaryRow: {
    flexDirection: "row", gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },

  // Export Bar
  exportBar: {
    flexDirection: "row", gap: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  exportBtn: {
    flex: 1, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: 10, paddingVertical: 10,
  },
  waBtn: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 6,
    paddingHorizontal: 16,
    backgroundColor: "#25D366",
    borderRadius: 10, paddingVertical: 10,
  },
  exportBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  // Tab bar
  tabBar: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  tabItem: {
    flex: 1, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 6,
    paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: "transparent",
  },
  tabItemActive: { borderBottomColor: Colors.primary },
  tabText: { fontSize: 13, fontWeight: "600", color: Colors.textMuted },
  tabTextActive: { color: Colors.primary },

  list: { padding: 12, gap: 10, paddingBottom: 32 },

  sectionHeader: {
    fontSize: 11, fontWeight: "800", color: Colors.textMuted,
    letterSpacing: 1, textTransform: "uppercase", marginBottom: 8,
  },

  bktSummaryGrid: { gap: 10 },

  // Agent card
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14, overflow: "hidden",
    borderWidth: 1, borderColor: Colors.border,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  cardAbsent: { opacity: 0.7 },
  cardPressed: { opacity: 0.85 },
  cardHeader: {
    flexDirection: "row", alignItems: "center",
    padding: 12, gap: 10,
  },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Colors.primary,
    alignItems: "center", justifyContent: "center",
  },
  avatarAbsent: { backgroundColor: Colors.surfaceElevated },
  avatarText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  avatarTextAbsent: { color: Colors.textMuted },
  cardMeta: { flex: 1, gap: 3 },
  agentName: { fontSize: 14, fontWeight: "700", color: Colors.text },
  agentSub: { fontSize: 11, color: Colors.textMuted },

  attBadge: {
    flexDirection: "row", alignItems: "center",
    alignSelf: "flex-start", gap: 4,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8,
    borderWidth: 1,
  },
  attBadgeText: { fontSize: 10, fontWeight: "700" },

  quickRow: { flexDirection: "row", gap: 4 },
  quickChip: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: Colors.background, borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 4,
    borderWidth: 1, borderColor: Colors.border,
  },
  quickVal: { fontSize: 11, fontWeight: "700" },

  resBadge: {
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 10, borderWidth: 1, minWidth: 44, alignItems: "center",
  },
  resBadgeText: { fontSize: 12, fontWeight: "800" },

  bktChip: {
    flexDirection: "row", alignItems: "center", gap: 2,
    paddingHorizontal: 5, paddingVertical: 3, borderRadius: 6, borderWidth: 1,
  },
  bktChipText: { fontSize: 9, fontWeight: "800" },

  // Performance strip
  perfStrip: {
    borderTopWidth: 1, borderTopColor: Colors.border,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: Colors.background + "80", gap: 8,
  },
  perfStripRow: { flexDirection: "row", gap: 5 },
  perfPill: {
    flex: 1, alignItems: "center",
    backgroundColor: Colors.surface, borderRadius: 10,
    paddingVertical: 6, borderWidth: 1, borderColor: Colors.border,
  },
  resPill: { flex: 1.1 },
  perfPillVal: { fontSize: 13, fontWeight: "800" },
  perfPillLabel: { fontSize: 9, color: Colors.textMuted, fontWeight: "600", marginTop: 1 },

  barBg: { backgroundColor: Colors.surfaceElevated, borderRadius: 3, overflow: "hidden" },
  barFill: { borderRadius: 3 },

  // Detail expanded
  detail: {
    borderTopWidth: 1, borderTopColor: Colors.border,
    paddingHorizontal: 12, paddingBottom: 12, paddingTop: 4,
  },
  sectionTitle: {
    fontSize: 10, fontWeight: "800", color: Colors.textMuted,
    letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6, marginTop: 10,
  },
  timingRow: { flexDirection: "row", gap: 8 },
  timingCell: {
    flex: 1, backgroundColor: Colors.background,
    borderRadius: 10, padding: 10, alignItems: "center",
    borderWidth: 1, borderColor: Colors.border,
  },
  timingLabel: { fontSize: 9, color: Colors.textMuted, fontWeight: "600", marginBottom: 2 },
  timingValue: { fontSize: 13, fontWeight: "700", color: Colors.text },

  activityRow: { flexDirection: "row", gap: 8 },
  actCell: {
    flex: 1, alignItems: "center", gap: 4,
    backgroundColor: Colors.background, borderRadius: 10,
    paddingVertical: 10, borderWidth: 1,
  },
  actIcon: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  actVal: { fontSize: 15, fontWeight: "800" },
  actLabel: { fontSize: 9, color: Colors.textMuted, fontWeight: "600" },

  collRow: { flexDirection: "row", gap: 8 },
  collCard: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.background, borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 10,
    borderWidth: 1,
  },
  collVal: { fontSize: 13, fontWeight: "700" },
  collSub: { fontSize: 10, color: Colors.textMuted, fontWeight: "500" },
  collTag: { marginLeft: "auto", fontSize: 9, color: Colors.textMuted, fontWeight: "700" },

  // BKT detail in agent BKT card
  bktGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  bktDetailCard: {
    width: "47%", backgroundColor: Colors.background,
    borderRadius: 12, padding: 10, gap: 6,
    borderWidth: 1, borderColor: Colors.border, borderTopWidth: 3,
  },
  bktDetailLabel: { fontSize: 11, fontWeight: "800" },
  targetPill: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 5, paddingVertical: 2,
    borderRadius: 6, borderWidth: 1,
  },
  targetPillText: { fontSize: 9, fontWeight: "700" },
  bktDetailStats: { flexDirection: "row", justifyContent: "space-between" },
  bktDetailStat: { alignItems: "center" },
  bktDetailVal: { fontSize: 13, fontWeight: "800" },
  bktDetailSub: { fontSize: 9, color: Colors.textMuted, fontWeight: "600" },
  resText: { fontSize: 10, fontWeight: "700", textAlign: "right" },

  // States
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  loadingText: { fontSize: 14, color: Colors.textSecondary },
  errorText: { fontSize: 14, color: Colors.danger, textAlign: "center" },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: "center" },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: Colors.primary, borderRadius: 10 },
  retryText: { color: "#fff", fontWeight: "600", fontSize: 14 },
});

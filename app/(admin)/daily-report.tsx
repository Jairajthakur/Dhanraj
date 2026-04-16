/**
 * Admin — Daily Agent Report
 * Route: /(admin)/daily-report
 *
 * Shows a full-day summary for every FOS agent:
 *  • Attendance  – status (Present / Checked-In / Absent), check-in/out, duration
 *  • Field Visits – GPS check-ins during the day
 *  • PTP         – Promise-to-Pay cases targeted for this date
 *  • Paid        – cases marked Paid + total collected amount
 *  • Depositions – deposits submitted + total amount
 *  • Performance – overall all-time stats (total, paid, unpaid, PTP, resolution%)
 *
 * PDF is generated as real selectable text (not a screenshot image).
 * Share sheet opens natively — works with WhatsApp, email, etc.
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
}

interface AgentPerformance {
  id: number;
  name: string;
  total: number;
  paid: number;
  notProcess: number;
  ptp: number;
}

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
  if (n === 0) return "Rs.0";
  return "Rs." + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function pctStr(a: number, b: number): string {
  if (b === 0) return "0%";
  return ((a / b) * 100).toFixed(1) + "%";
}

// ─── PDF HTML Generator ───────────────────────────────────────────────────────

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

  const rows = report
    .map((r) => {
      const perf = perfMap.get(r.agentId);
      const resolution = perf && perf.total > 0 ? pctStr(perf.paid, perf.total) : "—";
      const attClass =
        r.attendanceStatus === "Present"
          ? "present"
          : r.attendanceStatus === "Checked-In"
          ? "checkin"
          : "absent";

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
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Arial, sans-serif;
    font-size: 11px;
    color: #111;
    background: #fff;
    padding: 20px;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #111;
    padding-bottom: 10px;
    margin-bottom: 14px;
  }
  .header h1  { font-size: 18px; font-weight: 800; }
  .header p   { font-size: 11px; color: #555; margin-top: 2px; }
  .header-meta { text-align: right; font-size: 9px; color: #888; line-height: 1.7; }

  .summary {
    display: flex;
    gap: 8px;
    margin-bottom: 14px;
  }
  .pill {
    flex: 1;
    border-radius: 6px;
    padding: 8px 10px;
    text-align: center;
  }
  .pill-val   { font-size: 14px; font-weight: 800; }
  .pill-lbl   { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; margin-top: 2px; }
  .p-green  { background: #f0fdf4; border: 1px solid #bbf7d0; color: #15803d; }
  .p-blue   { background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; }
  .p-teal   { background: #f0fdfa; border: 1px solid #99f6e4; color: #0f766e; }
  .p-amber  { background: #fffbeb; border: 1px solid #fde68a; color: #b45309; }
  .p-indigo { background: #eef2ff; border: 1px solid #c7d2fe; color: #4338ca; }

  .section-label {
    font-size: 9px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #888;
    margin-bottom: 6px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 9.5px;
  }
  thead { display: table-header-group; }
  tr    { page-break-inside: avoid; }

  th {
    background: #111;
    color: #fff;
    padding: 6px 5px;
    text-align: left;
    font-size: 8.5px;
    font-weight: 700;
    letter-spacing: 0.2px;
    white-space: nowrap;
  }
  th.perf-head { background: #333; }
  th.num, td.num { text-align: center; }

  td {
    padding: 6px 5px;
    border-bottom: 1px solid #e5e7eb;
    vertical-align: middle;
  }
  tr:nth-child(even) td { background: #f9fafb; }

  .name-col { font-weight: 700; min-width: 100px; }
  .sub      { font-size: 8.5px; color: #6b7280; }

  .badge {
    display: inline-block;
    font-size: 8px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 20px;
    white-space: nowrap;
  }
  .present { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
  .checkin { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
  .absent  { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }

  .perf-paid   { color: #15803d; font-weight: 700; }
  .perf-unpaid { color: #dc2626; font-weight: 700; }
  .perf-ptp    { color: #7c3aed; font-weight: 700; }

  .footer {
    margin-top: 14px;
    padding-top: 8px;
    border-top: 1px solid #e5e7eb;
    display: flex;
    justify-content: space-between;
    font-size: 8px;
    color: #9ca3af;
  }
</style>
</head>
<body>

  <div class="header">
    <div>
      <h1>Daily Agent Report</h1>
      <p>${dateLabel}</p>
    </div>
    <div class="header-meta">
      Generated: ${new Date().toLocaleString("en-IN")}<br/>
      Total Agents: ${report.length} &nbsp;|&nbsp; Present: ${present}/${report.length}
    </div>
  </div>

  <div class="summary">
    <div class="pill p-green">
      <div class="pill-val">${present}/${report.length}</div>
      <div class="pill-lbl">Present</div>
    </div>
    <div class="pill p-blue">
      <div class="pill-val">${totalVisits}</div>
      <div class="pill-lbl">Field Visits</div>
    </div>
    <div class="pill p-teal">
      <div class="pill-val">${totalPaidCases}</div>
      <div class="pill-lbl">Cases Paid Today</div>
    </div>
    <div class="pill p-amber">
      <div class="pill-val">${formatAmount(totalPaid)}</div>
      <div class="pill-lbl">Collected Today</div>
    </div>
    <div class="pill p-indigo">
      <div class="pill-val">${formatAmount(totalDep)}</div>
      <div class="pill-lbl">Deposited Today</div>
    </div>
  </div>

  <p class="section-label">Agent-wise Breakdown &mdash; Daily + Overall Performance</p>

  <table>
    <thead>
      <tr>
        <th>Agent Name</th>
        <th>Attendance</th>
        <th>Check-In</th>
        <th>Check-Out</th>
        <th>Duration</th>
        <th class="num">Visits</th>
        <th class="num">PTP Today</th>
        <th class="num">Paid Today</th>
        <th class="num">Depositions</th>
        <th class="num perf-head">Total Cases</th>
        <th class="num perf-head">Paid</th>
        <th class="num perf-head">Unpaid</th>
        <th class="num perf-head">PTP</th>
        <th class="num perf-head">Resolution</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <div class="footer">
    <span>Dhanraj Daily Report &mdash; ${dateLabel}</span>
    <span>Confidential &mdash; Internal Use Only</span>
  </div>

</body>
</html>`;
}

// ─── PDF Export + Share ───────────────────────────────────────────────────────

async function exportAndShare(
  report: AgentDayReport[],
  perfMap: Map<number, AgentPerformance>,
  date: string
): Promise<void> {
  const html = generateReportHTML(report, perfMap, date);

  // printToFileAsync with explicit width/height renders as vector text PDF
  const { uri } = await Print.printToFileAsync({
    html,
    base64: false,
    width: 842,   // A4 landscape pts
    height: 595,
  });

  // Move to a named file so WhatsApp shows a proper filename
  const dest = `${FileSystem.cacheDirectory}DailyReport_${date}.pdf`;
  await FileSystem.moveAsync({ from: uri, to: dest });

  await Sharing.shareAsync(dest, {
    mimeType: "application/pdf",
    dialogTitle: `Daily Report — ${formatDate(date)}`,
    UTI: "com.adobe.pdf",
  });
}

// ─── Summary Totals Bar ───────────────────────────────────────────────────────

function TotalsBar({ report }: { report: AgentDayReport[] }) {
  const present = report.filter((r) => r.attendanceStatus !== "Absent").length;
  const visits  = report.reduce((s, r) => s + r.fieldVisits, 0);
  const paidAmt = report.reduce((s, r) => s + Number(r.paidAmount), 0);
  const depAmt  = report.reduce((s, r) => s + Number(r.depositionAmount), 0);

  const pills = [
    { label: "Present",   value: `${present}/${report.length}`, icon: "people",   color: Colors.success },
    { label: "Visits",    value: String(visits),                 icon: "location", color: Colors.info },
    { label: "Collected", value: formatAmount(paidAmt),          icon: "cash",     color: Colors.statusPaid },
    { label: "Deposited", value: formatAmount(depAmt),           icon: "wallet",   color: Colors.warning },
  ] as const;

  return (
    <View style={styles.totalsBar}>
      {pills.map((p) => (
        <View key={p.label} style={[styles.totalsPill, { borderColor: p.color + "33" }]}>
          <Ionicons name={p.icon as any} size={14} color={p.color} />
          <Text style={[styles.totalsValue, { color: p.color }]}>{p.value}</Text>
          <Text style={styles.totalsLabel}>{p.label}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Attendance Badge ─────────────────────────────────────────────────────────

function AttBadge({ status }: { status: AgentDayReport["attendanceStatus"] }) {
  const cfg = {
    Present:      { color: Colors.success, icon: "checkmark-circle" as const },
    "Checked-In": { color: Colors.info,    icon: "time"             as const },
    Absent:       { color: Colors.danger,  icon: "close-circle"     as const },
  }[status];

  return (
    <View style={[styles.attBadge, { backgroundColor: cfg.color + "18" }]}>
      <Ionicons name={cfg.icon} size={12} color={cfg.color} />
      <Text style={[styles.attBadgeText, { color: cfg.color }]}>{status}</Text>
    </View>
  );
}

// ─── Metric Row ───────────────────────────────────────────────────────────────

function MetricRow({
  icon, label, value, sub, color,
}: {
  icon: string; label: string; value: string; sub?: string; color: string;
}) {
  return (
    <View style={styles.metricRow}>
      <View style={[styles.metricIcon, { backgroundColor: color + "18" }]}>
        <Ionicons name={icon as any} size={14} color={color} />
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={styles.metricRight}>
        <Text style={[styles.metricValue, { color }]}>{value}</Text>
        {sub ? <Text style={styles.metricSub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

// ─── Performance Panel ────────────────────────────────────────────────────────

function PerfPanel({ perf }: { perf: AgentPerformance | undefined }) {
  if (!perf || perf.total === 0) return null;
  const resolution = Math.round((perf.paid / perf.total) * 100);
  const barColor =
    resolution >= 70 ? Colors.success : resolution >= 40 ? Colors.warning : Colors.danger;

  return (
    <View style={styles.perfSection}>
      <Text style={styles.detailSectionTitle}>Overall Performance</Text>

      <View style={styles.perfStats}>
        {[
          { label: "Total",   value: String(perf.total),      color: Colors.text },
          { label: "Paid",    value: String(perf.paid),       color: Colors.statusPaid },
          { label: "Unpaid",  value: String(perf.notProcess), color: Colors.danger },
          { label: "PTP",     value: String(perf.ptp),        color: Colors.statusPTP },
          { label: "Res%",    value: `${resolution}%`,        color: barColor },
        ].map((s) => (
          <View key={s.label} style={styles.perfStat}>
            <Text style={[styles.perfStatVal, { color: s.color }]}>{s.value}</Text>
            <Text style={styles.perfStatLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.resBarWrap}>
        <View style={styles.resBarBg}>
          <View
            style={[
              styles.resBarFill,
              { width: `${Math.min(resolution, 100)}%` as any, backgroundColor: barColor },
            ]}
          />
        </View>
        <Text style={[styles.resBarLabel, { color: barColor }]}>{resolution}% resolved</Text>
      </View>
    </View>
  );
}

// ─── Agent Card ───────────────────────────────────────────────────────────────

function AgentCard({
  item,
  perf,
}: {
  item: AgentDayReport;
  perf: AgentPerformance | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const isAbsent = item.attendanceStatus === "Absent";
  const initials = item.agentName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const resolution = perf && perf.total > 0 ? Math.round((perf.paid / perf.total) * 100) : null;
  const barColor =
    resolution === null ? Colors.textMuted
    : resolution >= 70 ? Colors.success
    : resolution >= 40 ? Colors.warning
    : Colors.danger;

  return (
    <Pressable
      onPress={() => setExpanded((e) => !e)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      {/* ── Card Header: avatar + name + attendance + today quick stats ── */}
      <View style={styles.cardHeader}>
        <View style={[styles.avatar, isAbsent && styles.avatarAbsent]}>
          <Text style={[styles.avatarText, isAbsent && styles.avatarTextAbsent]}>{initials}</Text>
        </View>

        <View style={styles.cardMeta}>
          <Text style={styles.agentName} numberOfLines={1}>{item.agentName}</Text>
          <AttBadge status={item.attendanceStatus} />
        </View>

        {/* Today's activity quick chips */}
        <View style={styles.quickStats}>
          <View style={styles.quickStat}>
            <Ionicons name="location" size={11} color={Colors.info} />
            <Text style={[styles.quickStatVal, { color: Colors.info }]}>{item.fieldVisits}</Text>
          </View>
          <View style={styles.quickStat}>
            <Ionicons name="cash" size={11} color={Colors.success} />
            <Text style={[styles.quickStatVal, { color: Colors.success }]}>{item.paidCount}</Text>
          </View>
          <View style={styles.quickStat}>
            <Ionicons name="time-outline" size={11} color={Colors.statusPTP} />
            <Text style={[styles.quickStatVal, { color: Colors.statusPTP }]}>{item.ptpCount}</Text>
          </View>
        </View>

        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={16}
          color={Colors.textMuted}
          style={{ marginLeft: 6 }}
        />
      </View>

      {/* ── Always-visible Performance Summary Strip ── */}
      {perf && perf.total > 0 && (
        <View style={styles.perfStrip}>
          {/* Stat pills row */}
          <View style={styles.perfStripRow}>
            {[
              { label: "Total",  value: String(perf.total),      color: Colors.text },
              { label: "Paid",   value: String(perf.paid),       color: Colors.statusPaid },
              { label: "Unpaid", value: String(perf.notProcess), color: Colors.danger },
              { label: "PTP",    value: String(perf.ptp),        color: Colors.statusPTP },
            ].map((s) => (
              <View key={s.label} style={styles.perfStripPill}>
                <Text style={[styles.perfStripVal, { color: s.color }]}>{s.value}</Text>
                <Text style={styles.perfStripLabel}>{s.label}</Text>
              </View>
            ))}

            {/* Resolution badge */}
            <View style={[styles.perfStripPill, styles.perfStripResBadge, { borderColor: barColor + "44", backgroundColor: barColor + "12" }]}>
              <Text style={[styles.perfStripVal, { color: barColor, fontSize: 13 }]}>{resolution}%</Text>
              <Text style={[styles.perfStripLabel, { color: barColor }]}>Res%</Text>
            </View>
          </View>

          {/* Resolution progress bar */}
          <View style={styles.perfStripBarWrap}>
            <View style={styles.perfStripBarBg}>
              <View style={[styles.perfStripBarFill, { width: `${Math.min(resolution ?? 0, 100)}%` as any, backgroundColor: barColor }]} />
            </View>
            <Text style={[styles.perfStripBarLabel, { color: barColor }]}>{resolution}% resolved</Text>
          </View>
        </View>
      )}

      {/* ── Expanded Detail ── */}
      {expanded && (
        <View style={styles.detail}>
          {/* Attendance timing */}
          <View style={styles.detailSection}>
            <Text style={styles.detailSectionTitle}>Attendance</Text>
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
          </View>

          {/* Field Activity */}
          <View style={styles.detailSection}>
            <Text style={styles.detailSectionTitle}>Field Activity</Text>
            <MetricRow icon="location"     label="Field Visits"    value={String(item.fieldVisits)} color={Colors.info} />
            <MetricRow icon="time-outline" label="PTP Cases Today" value={String(item.ptpCount)}    color={Colors.statusPTP} />
            <MetricRow
              icon="walk-outline"
              label="Break Sessions"
              value={item.breakCount === 0 ? "—" : String(item.breakCount)}
              sub={item.breakMinutes > 0 ? formatDuration(item.breakMinutes) : undefined}
              color={Colors.warning}
            />
          </View>

          {/* Collections */}
          <View style={styles.detailSection}>
            <Text style={styles.detailSectionTitle}>Collections Today</Text>
            <MetricRow
              icon="checkmark-circle"
              label="Cases Paid"
              value={String(item.paidCount)}
              sub={item.paidAmount > 0 ? formatAmount(Number(item.paidAmount)) : undefined}
              color={Colors.statusPaid}
            />
            <MetricRow
              icon="wallet"
              label="Depositions"
              value={String(item.depositionCount)}
              sub={item.depositionAmount > 0 ? formatAmount(Number(item.depositionAmount)) : undefined}
              color={Colors.warning}
            />
          </View>

          {/* Overall Performance (full panel, already shown above as strip) */}
          <PerfPanel perf={perf} />
        </View>
      )}
    </Pressable>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function AdminDailyReportScreen() {
  const insets = useSafeAreaInsets();
  const [date, setDate] = useState(todayISO());
  const [isExporting, setIsExporting] = useState(false);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["/api/admin/daily-report", date],
    queryFn: () => (api.admin as any).getDailyReport(date),
    refetchInterval: 60_000,
    retry: 2,
  });

  const { data: agentsData } = useQuery({
    queryKey: ["/api/admin/agents"],
    queryFn: () => api.admin.getAgents(),
    staleTime: 5 * 60 * 1000,
  });

  const report: AgentDayReport[] = useMemo(() => data?.report ?? [], [data]);

  const perfMap = useMemo(() => {
    const map = new Map<number, AgentPerformance>();
    const stats: AgentPerformance[] = (agentsData as any)?.stats ?? [];
    for (const s of stats) map.set(s.id, s);
    return map;
  }, [agentsData]);

  const onRefresh = useCallback(() => { refetch(); }, [refetch]);
  const isToday = date === todayISO();

  const handleExport = useCallback(async () => {
    if (report.length === 0) {
      Alert.alert("No Data", "Nothing to export for this date.");
      return;
    }
    const ok = await Sharing.isAvailableAsync();
    if (!ok) {
      Alert.alert("Not Supported", "File sharing is not available on this device.");
      return;
    }
    setIsExporting(true);
    try {
      await exportAndShare(report, perfMap, date);
    } catch (e: any) {
      Alert.alert("Export Failed", e?.message ?? "Could not generate PDF.");
    } finally {
      setIsExporting(false);
    }
  }, [report, perfMap, date]);

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom }]}>
      {/* Date Navigator */}
      <View style={styles.dateNav}>
        <Pressable
          style={({ pressed }) => [styles.dateBtn, pressed && styles.dateBtnPressed]}
          onPress={() => setDate((d) => shiftDate(d, -1))}
        >
          <Ionicons name="chevron-back" size={20} color={Colors.primary} />
        </Pressable>

        <View style={styles.dateLabelWrap}>
          <Text style={styles.dateLabel}>{formatDate(date)}</Text>
          {isToday && (
            <View style={styles.todayBadge}>
              <Text style={styles.todayBadgeText}>Today</Text>
            </View>
          )}
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.dateBtn,
            pressed && styles.dateBtnPressed,
            isToday && styles.dateBtnDisabled,
          ]}
          onPress={() => { if (!isToday) setDate((d) => shiftDate(d, 1)); }}
          disabled={isToday}
        >
          <Ionicons
            name="chevron-forward"
            size={20}
            color={isToday ? Colors.textMuted : Colors.primary}
          />
        </Pressable>
      </View>

      {/* Summary totals */}
      {report.length > 0 && <TotalsBar report={report} />}

      {/* Export bar */}
      {report.length > 0 && (
        <View style={styles.exportBar}>
          <Pressable
            style={({ pressed }) => [
              styles.exportBtn,
              pressed && styles.exportBtnPressed,
              isExporting && { opacity: 0.6 },
            ]}
            onPress={handleExport}
            disabled={isExporting}
          >
            {isExporting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="document-text-outline" size={16} color="#fff" />
            )}
            <Text style={styles.exportBtnText}>
              {isExporting ? "Generating…" : "Download PDF"}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.waBtn,
              pressed && styles.exportBtnPressed,
              isExporting && { opacity: 0.6 },
            ]}
            onPress={handleExport}
            disabled={isExporting}
          >
            <Ionicons name="logo-whatsapp" size={20} color="#fff" />
            <Text style={styles.exportBtnText}>WhatsApp</Text>
          </Pressable>
        </View>
      )}

      {isLoading && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading report…</Text>
        </View>
      )}

      {isError && !isLoading && (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color={Colors.danger} />
          <Text style={styles.errorText}>
            {(error as any)?.message ?? "Failed to load report"}
          </Text>
          <Pressable style={styles.retryBtn} onPress={() => refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {!isLoading && !isError && report.length === 0 && (
        <View style={styles.center}>
          <Ionicons name="document-outline" size={40} color={Colors.textMuted} />
          <Text style={styles.emptyText}>No agents found for this date</Text>
        </View>
      )}

      {!isLoading && !isError && report.length > 0 && (
        <FlatList
          data={report}
          keyExtractor={(item) => String(item.agentId)}
          renderItem={({ item }) => (
            <AgentCard item={item} perf={perfMap.get(item.agentId)} />
          )}
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
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  dateNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
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
  dateLabel: { fontSize: 15, fontWeight: "600", color: Colors.text },
  todayBadge: {
    backgroundColor: Colors.primary + "15", borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  todayBadgeText: {
    fontSize: 10, fontWeight: "700", color: Colors.primary, letterSpacing: 0.5,
  },

  totalsBar: {
    flexDirection: "row", gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  totalsPill: {
    flex: 1, alignItems: "center", gap: 2,
    paddingVertical: 8, borderRadius: 10,
    borderWidth: 1, backgroundColor: Colors.background,
  },
  totalsValue: { fontSize: 13, fontWeight: "700" },
  totalsLabel: {
    fontSize: 9, color: Colors.textMuted, fontWeight: "500", letterSpacing: 0.3,
  },

  exportBar: {
    flexDirection: "row", gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  exportBtn: {
    flex: 1, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 10, paddingVertical: 11,
  },
  waBtn: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 6,
    paddingHorizontal: 14,
    backgroundColor: "#25D366",
    borderRadius: 10, paddingVertical: 11,
  },
  exportBtnPressed: { opacity: 0.7 },
  exportBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  list: { padding: 16, gap: 10, paddingBottom: 32 },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14, overflow: "hidden",
    borderWidth: 1, borderColor: Colors.border,
    ...Platform.select({
      ios: {
        shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06, shadowRadius: 4,
      },
      android: { elevation: 2 },
    }),
  },
  cardPressed: { opacity: 0.85 },
  cardHeader: {
    flexDirection: "row", alignItems: "center",
    padding: 14, gap: 10,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: "center", justifyContent: "center",
  },
  avatarAbsent: { backgroundColor: Colors.surfaceElevated },
  avatarText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  avatarTextAbsent: { color: Colors.textMuted },
  cardMeta: { flex: 1, gap: 4 },
  agentName: { fontSize: 14, fontWeight: "600", color: Colors.text },
  attBadge: {
    flexDirection: "row", alignItems: "center",
    alignSelf: "flex-start", gap: 4,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8,
  },
  attBadgeText: { fontSize: 10, fontWeight: "600" },

  quickStats: { flexDirection: "row", gap: 5 },
  quickStat: {
    alignItems: "center", justifyContent: "center", gap: 1,
    backgroundColor: Colors.background, borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 5,
    borderWidth: 1, borderColor: Colors.border,
  },
  quickStatPerf: {
    backgroundColor: Colors.primary + "10",
    borderColor: Colors.primary + "30",
  },
  quickStatVal: { fontSize: 11, fontWeight: "700" },

  detail: {
    borderTopWidth: 1, borderTopColor: Colors.border,
    paddingHorizontal: 14, paddingBottom: 14,
  },
  detailSection: { marginTop: 12, gap: 6 },
  detailSectionTitle: {
    fontSize: 11, fontWeight: "700", color: Colors.textMuted,
    letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 2,
  },

  timingRow: { flexDirection: "row", gap: 8 },
  timingCell: {
    flex: 1, backgroundColor: Colors.background,
    borderRadius: 10, padding: 10,
    alignItems: "center", borderWidth: 1, borderColor: Colors.border,
  },
  timingLabel: {
    fontSize: 10, color: Colors.textMuted, fontWeight: "500", marginBottom: 2,
  },
  timingValue: { fontSize: 13, fontWeight: "700", color: Colors.text },

  metricRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.background, borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  metricIcon: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
  },
  metricLabel: { flex: 1, fontSize: 12, color: Colors.textSecondary, fontWeight: "500" },
  metricRight: { alignItems: "flex-end", gap: 1 },
  metricValue: { fontSize: 13, fontWeight: "700" },
  metricSub: { fontSize: 10, color: Colors.textMuted, fontWeight: "500" },

  perfSection: { marginTop: 12, gap: 8 },
  perfStats: { flexDirection: "row", gap: 6 },
  perfStat: {
    flex: 1, alignItems: "center",
    backgroundColor: Colors.background, borderRadius: 10,
    paddingVertical: 8, borderWidth: 1, borderColor: Colors.border,
  },
  perfStatVal: { fontSize: 14, fontWeight: "800" },
  perfStatLabel: {
    fontSize: 9, color: Colors.textMuted,
    fontWeight: "600", letterSpacing: 0.3, marginTop: 2,
  },
  resBarWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  resBarBg: {
    flex: 1, height: 6,
    backgroundColor: Colors.surfaceElevated, borderRadius: 3, overflow: "hidden",
  },
  resBarFill: { height: 6, borderRadius: 3 },
  resBarLabel: { fontSize: 10, fontWeight: "600", minWidth: 80, textAlign: "right" },

  // ── Always-visible performance strip ──
  perfStrip: {
    borderTopWidth: 1, borderTopColor: Colors.border,
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12,
    gap: 8,
    backgroundColor: Colors.background + "80",
  },
  perfStripRow: { flexDirection: "row", gap: 6, alignItems: "center" },
  perfStripPill: {
    flex: 1, alignItems: "center",
    backgroundColor: Colors.surface, borderRadius: 10,
    paddingVertical: 7, borderWidth: 1, borderColor: Colors.border,
  },
  perfStripResBadge: {
    flex: 1.2,
  },
  perfStripVal: { fontSize: 14, fontWeight: "800" },
  perfStripLabel: {
    fontSize: 9, color: Colors.textMuted,
    fontWeight: "600", letterSpacing: 0.3, marginTop: 1,
  },
  perfStripBarWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  perfStripBarBg: {
    flex: 1, height: 5,
    backgroundColor: Colors.surfaceElevated, borderRadius: 3, overflow: "hidden",
  },
  perfStripBarFill: { height: 5, borderRadius: 3 },
  perfStripBarLabel: { fontSize: 10, fontWeight: "600", minWidth: 80, textAlign: "right" },

  center: {
    flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32,
  },
  loadingText: { fontSize: 14, color: Colors.textSecondary },
  errorText: { fontSize: 14, color: Colors.danger, textAlign: "center" },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: "center" },
  retryBtn: {
    paddingHorizontal: 20, paddingVertical: 10,
    backgroundColor: Colors.primary, borderRadius: 10,
  },
  retryText: { color: "#fff", fontWeight: "600", fontSize: 14 },
});

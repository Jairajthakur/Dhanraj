/**
 * Admin — Daily Agent Report
 * Route: /(admin)/daily-report
 *
 * Shows a full-day summary for every FOS agent:
 *  • Attendance  – status (Present / Checked-In / Absent), check-in time,
 *                  check-out time, total working hours
 *  • Field Visits – GPS check-ins recorded during the day
 *  • PTP         – Promise-to-Pay cases targeted for this date
 *  • Paid        – cases marked Paid on this date + total collected amount
 *  • Depositions – deposits submitted on this date + total amount
 *  • Break       – placeholder (ready for future break-tracking feature)
 *
 * Usage:
 *  - Admin picks a date with the ◀ / ▶ navigator (defaults to today)
 *  - Tap a card to expand the full metric breakdown for that agent
 *  - Pull to refresh; auto-refreshes every 60 s while screen is open
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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
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
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

// ─── Summary Totals Bar ───────────────────────────────────────────────────────

function TotalsBar({ report }: { report: AgentDayReport[] }) {
  const present    = report.filter((r) => r.attendanceStatus !== "Absent").length;
  const visits     = report.reduce((s, r) => s + r.fieldVisits, 0);
  const paidAmt    = report.reduce((s, r) => s + Number(r.paidAmount), 0);
  const depAmt     = report.reduce((s, r) => s + Number(r.depositionAmount), 0);

  const pills = [
    { label: "Present",    value: `${present}/${report.length}`, icon: "people",         color: Colors.success },
    { label: "Visits",     value: String(visits),                icon: "location",        color: Colors.info    },
    { label: "Collected",  value: formatAmount(paidAmt),         icon: "cash",            color: Colors.statusPaid },
    { label: "Deposited",  value: formatAmount(depAmt),          icon: "wallet",          color: Colors.warning },
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
    Present:    { color: Colors.success, icon: "checkmark-circle" as const },
    "Checked-In": { color: Colors.info,  icon: "time"             as const },
    Absent:     { color: Colors.danger,  icon: "close-circle"     as const },
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
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  color: string;
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

// ─── Agent Card ───────────────────────────────────────────────────────────────

function AgentCard({ item }: { item: AgentDayReport }) {
  const [expanded, setExpanded] = useState(false);

  const initials = item.agentName
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const isAbsent = item.attendanceStatus === "Absent";

  return (
    <Pressable
      onPress={() => setExpanded((e) => !e)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      {/* ── Header row ── */}
      <View style={styles.cardHeader}>
        <View style={[styles.avatar, isAbsent && styles.avatarAbsent]}>
          <Text style={[styles.avatarText, isAbsent && styles.avatarTextAbsent]}>
            {initials}
          </Text>
        </View>

        <View style={styles.cardMeta}>
          <Text style={styles.agentName} numberOfLines={1}>
            {item.agentName}
          </Text>
          <AttBadge status={item.attendanceStatus} />
        </View>

        {/* Quick stats strip */}
        <View style={styles.quickStats}>
          <View style={styles.quickStat}>
            <Ionicons name="location" size={11} color={Colors.info} />
            <Text style={[styles.quickStatVal, { color: Colors.info }]}>
              {item.fieldVisits}
            </Text>
          </View>
          <View style={styles.quickStat}>
            <Ionicons name="cash" size={11} color={Colors.success} />
            <Text style={[styles.quickStatVal, { color: Colors.success }]}>
              {item.paidCount}
            </Text>
          </View>
          <View style={styles.quickStat}>
            <Ionicons name="time-outline" size={11} color={Colors.statusPTP} />
            <Text style={[styles.quickStatVal, { color: Colors.statusPTP }]}>
              {item.ptpCount}
            </Text>
          </View>
        </View>

        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={16}
          color={Colors.textMuted}
          style={{ marginLeft: 6 }}
        />
      </View>

      {/* ── Expanded detail ── */}
      {expanded && (
        <View style={styles.detail}>
          {/* Attendance timing */}
          <View style={styles.detailSection}>
            <Text style={styles.detailSectionTitle}>Attendance</Text>
            <View style={styles.timingRow}>
              <View style={styles.timingCell}>
                <Text style={styles.timingLabel}>Check-In</Text>
                <Text style={styles.timingValue}>{formatTime(item.checkIn)}</Text>
              </View>
              <View style={[styles.timingCell, styles.timingCellMid]}>
                <Text style={styles.timingLabel}>Check-Out</Text>
                <Text style={styles.timingValue}>{formatTime(item.checkOut)}</Text>
              </View>
              <View style={styles.timingCell}>
                <Text style={styles.timingLabel}>Duration</Text>
                <Text style={styles.timingValue}>
                  {formatDuration(item.durationMinutes)}
                </Text>
              </View>
            </View>
          </View>

          {/* Field Activity */}
          <View style={styles.detailSection}>
            <Text style={styles.detailSectionTitle}>Field Activity</Text>
            <MetricRow
              icon="location"
              label="Field Visits"
              value={String(item.fieldVisits)}
              color={Colors.info}
            />
            <MetricRow
              icon="time-outline"
              label="PTP Cases Today"
              value={String(item.ptpCount)}
              color={Colors.statusPTP}
            />
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
            <Text style={styles.detailSectionTitle}>Collections</Text>
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
              sub={
                item.depositionAmount > 0
                  ? formatAmount(Number(item.depositionAmount))
                  : undefined
              }
              color={Colors.warning}
            />
          </View>
        </View>
      )}
    </Pressable>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function AdminDailyReportScreen() {
  const insets = useSafeAreaInsets();
  const [date, setDate] = useState(todayISO());

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["/api/admin/daily-report", date],
    queryFn: () => (api.admin as any).getDailyReport(date),
    refetchInterval: 60_000,
    retry: 2,
  });

  const report: AgentDayReport[] = useMemo(
    () => data?.report ?? [],
    [data]
  );

  const onRefresh = useCallback(() => { refetch(); }, [refetch]);

  const isToday = date === todayISO();

  // ── Render ──
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

      {/* Loading */}
      {isLoading && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading report…</Text>
        </View>
      )}

      {/* Error */}
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

      {/* Empty */}
      {!isLoading && !isError && report.length === 0 && (
        <View style={styles.center}>
          <Ionicons name="document-outline" size={40} color={Colors.textMuted} />
          <Text style={styles.emptyText}>No agents found</Text>
        </View>
      )}

      {/* Agent list */}
      {!isLoading && !isError && report.length > 0 && (
        <FlatList
          data={report}
          keyExtractor={(item) => String(item.agentId)}
          renderItem={({ item }) => <AgentCard item={item} />}
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
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Date navigator
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
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dateBtnPressed: { opacity: 0.6 },
  dateBtnDisabled: { opacity: 0.35 },
  dateLabelWrap: {
    alignItems: "center",
    gap: 4,
  },
  dateLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.text,
  },
  todayBadge: {
    backgroundColor: Colors.primary + "15",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  todayBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.primary,
    letterSpacing: 0.5,
  },

  // Totals bar
  totalsBar: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  totalsPill: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: Colors.background,
  },
  totalsValue: {
    fontSize: 13,
    fontWeight: "700",
  },
  totalsLabel: {
    fontSize: 9,
    color: Colors.textMuted,
    fontWeight: "500",
    letterSpacing: 0.3,
  },

  // List
  list: {
    padding: 16,
    gap: 10,
    paddingBottom: 32,
  },

  // Agent card
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
    }),
  },
  cardPressed: { opacity: 0.85 },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarAbsent: {
    backgroundColor: Colors.surfaceElevated,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
  avatarTextAbsent: {
    color: Colors.textMuted,
  },
  cardMeta: {
    flex: 1,
    gap: 4,
  },
  agentName: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.text,
  },
  attBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  attBadgeText: {
    fontSize: 10,
    fontWeight: "600",
  },

  // Quick stats
  quickStats: {
    flexDirection: "row",
    gap: 6,
  },
  quickStat: {
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    backgroundColor: Colors.background,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickStatVal: {
    fontSize: 11,
    fontWeight: "700",
  },

  // Expanded detail
  detail: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  detailSection: {
    marginTop: 12,
    gap: 6,
  },
  detailSectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 2,
  },

  // Timing row
  timingRow: {
    flexDirection: "row",
    gap: 8,
  },
  timingCell: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  timingCellMid: {},
  timingLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: "500",
    marginBottom: 2,
  },
  timingValue: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.text,
  },

  // Metric rows
  metricRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.background,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  metricIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  metricLabel: {
    flex: 1,
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: "500",
  },
  metricRight: {
    alignItems: "flex-end",
    gap: 1,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: "700",
  },
  metricSub: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: "500",
  },

  // States
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 32,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  errorText: {
    fontSize: 14,
    color: Colors.danger,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: "center",
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Colors.primary,
    borderRadius: 10,
  },
  retryText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
});

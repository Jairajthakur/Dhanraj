import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";

// ─── Helpers ────────────────────────────────────────────────────────────────
const toDateStr = (d: Date) => d.toISOString().slice(0, 10); // "YYYY-MM-DD"

const fmtDate = (s: string) => {
  const [y, m, day] = s.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day} ${months[+m - 1]} ${y}`;
};

const rupee = (n?: number) => (n != null ? `₹${Number(n).toLocaleString("en-IN")}` : "₹0");

interface DailyReportRow {
  agentId: number;
  agentName: string;
  attendanceStatus: string;
  fieldVisits: number;
  ptpCount: number;
  paidCount: number;
  paidAmount: number;
  depositionCount: number;
  depositionAmount: number;
  receiptsBkt1: number;
  receiptsBkt2: number;
  receiptsBkt3: number;
  receiptsTotal: number;
}

// ─── Date navigator ───────────────────────────────────────────────────────
function DateNavigator({
  dateStr,
  onPrev,
  onNext,
  onToday,
}: {
  dateStr: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  const today = toDateStr(new Date());
  const isToday = dateStr === today;

  return (
    <View style={dn.row}>
      <Pressable onPress={onPrev} style={dn.arrow} hitSlop={6}>
        <Ionicons name="chevron-back" size={20} color={Colors.text} />
      </Pressable>

      <Pressable style={dn.center} onPress={onToday} disabled={isToday}>
        <Ionicons name="calendar-outline" size={14} color={Colors.textSecondary} />
        <Text style={dn.dateLabel}>{fmtDate(dateStr)}</Text>
        {!isToday && <Text style={dn.todayLink}>Jump to today</Text>}
      </Pressable>

      <Pressable
        onPress={onNext}
        style={[dn.arrow, isToday && dn.arrowDisabled]}
        disabled={isToday}
        hitSlop={6}
      >
        <Ionicons name="chevron-forward" size={20} color={isToday ? Colors.textMuted : Colors.text} />
      </Pressable>
    </View>
  );
}

const dn = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  arrow: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  arrowDisabled: { opacity: 0.35 },
  center: { flex: 1, alignItems: "center", gap: 2 },
  dateLabel: { fontSize: 15, fontWeight: "700", color: Colors.text },
  todayLink: { fontSize: 11, color: Colors.info, fontWeight: "600" },
});

// ─── Table config ───────────────────────────────────────────────────────────
const COL = {
  agent: 150,
  status: 90,
  visits: 66,
  ptp: 60,
  paid: 96,
  dep: 96,
  bkt: 64,
  total: 76,
};

function HeaderCell({ label, width, sub }: { label: string; width: number; sub?: string }) {
  return (
    <View style={[tbl.headCell, { width }]}>
      <Text style={tbl.headCellText} numberOfLines={1}>{label}</Text>
      {sub ? <Text style={tbl.headCellSub}>{sub}</Text> : null}
    </View>
  );
}

function Cell({ children, width, align = "center", bold = false, color }: {
  children: React.ReactNode; width: number; align?: "left" | "center"; bold?: boolean; color?: string;
}) {
  return (
    <View style={[tbl.cell, { width, alignItems: align === "left" ? "flex-start" : "center" }]}>
      <Text style={[tbl.cellText, bold && tbl.cellTextBold, color ? { color } : null]} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

const attendanceColor = (status: string) => {
  if (status === "Present") return Colors.success;
  if (status === "Checked-In") return Colors.warning;
  return Colors.danger;
};

export default function DailyReportScreen() {
  const insets = useSafeAreaInsets();
  const [dateStr, setDateStr] = useState(toDateStr(new Date()));

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["/api/admin/daily-report", dateStr],
    queryFn: () => api.admin.getDailyReport(dateStr),
  });

  const report: DailyReportRow[] = data?.report ?? [];
  const totals = data?.receiptTotals ?? { bkt1: 0, bkt2: 0, bkt3: 0, total: 0 };

  const shiftDate = useCallback((days: number) => {
    setDateStr((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + days);
      const next = toDateStr(d);
      return next > toDateStr(new Date()) ? prev : next;
    });
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={{ paddingTop: Platform.OS === "web" ? 67 : 12, backgroundColor: Colors.surface }}>
        <DateNavigator
          dateStr={dateStr}
          onPrev={() => shiftDate(-1)}
          onNext={() => shiftDate(1)}
          onToday={() => setDateStr(toDateStr(new Date()))}
        />

        {/* Receipts summary chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
          <View style={styles.chipRow}>
            <View style={[styles.chip, { backgroundColor: Colors.info + "18" }]}>
              <Text style={[styles.chipText, { color: Colors.info }]}>BKT1: {totals.bkt1}</Text>
            </View>
            <View style={[styles.chip, { backgroundColor: Colors.warning + "18" }]}>
              <Text style={[styles.chipText, { color: Colors.warning }]}>BKT2: {totals.bkt2}</Text>
            </View>
            <View style={[styles.chip, { backgroundColor: Colors.statusPTP + "18" }]}>
              <Text style={[styles.chipText, { color: Colors.statusPTP }]}>BKT3: {totals.bkt3}</Text>
            </View>
            <View style={[styles.chip, { backgroundColor: Colors.success + "18" }]}>
              <Text style={[styles.chipText, { color: Colors.success }]}>
                Total Receipts: {totals.total}
              </Text>
            </View>
            <Pressable
              style={[styles.chip, { backgroundColor: Colors.primary + "18" }]}
              onPress={() => refetch()}
            >
              <Ionicons name="refresh-outline" size={13} color={Colors.primary} />
              <Text style={[styles.chipText, { color: Colors.primary }]}>Refresh</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={styles.loadingText}>Loading report…</Text>
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={44} color={Colors.textMuted} />
          <Text style={styles.errorText}>Failed to load — check your login session</Text>
          <Pressable style={styles.retryBtn} onPress={() => refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : report.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="bar-chart-outline" size={44} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No Data</Text>
          <Text style={styles.emptyText}>No agent activity found for {fmtDate(dateStr)}.</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        >
          <View>
            {/* Header row */}
            <View style={tbl.headRow}>
              <HeaderCell label="Agent" width={COL.agent} />
              <HeaderCell label="Status" width={COL.status} />
              <HeaderCell label="Visits" width={COL.visits} />
              <HeaderCell label="PTP" width={COL.ptp} />
              <HeaderCell label="Paid" width={COL.paid} />
              <HeaderCell label="Deposit" width={COL.dep} />
              <HeaderCell label="BKT1" width={COL.bkt} sub="Receipts" />
              <HeaderCell label="BKT2" width={COL.bkt} sub="Receipts" />
              <HeaderCell label="BKT3" width={COL.bkt} sub="Receipts" />
              <HeaderCell label="Total" width={COL.total} sub="Receipts" />
            </View>

            {/* Data rows */}
            {report.map((row, i) => (
              <View
                key={row.agentId}
                style={[tbl.row, i % 2 === 1 && { backgroundColor: Colors.surfaceAlt }]}
              >
                <Cell width={COL.agent} align="left" bold>{row.agentName}</Cell>
                <Cell width={COL.status} color={attendanceColor(row.attendanceStatus)}>
                  {row.attendanceStatus}
                </Cell>
                <Cell width={COL.visits}>{row.fieldVisits}</Cell>
                <Cell width={COL.ptp} color={Colors.statusPTP}>{row.ptpCount}</Cell>
                <Cell width={COL.paid} color={Colors.success}>
                  {row.paidCount} / {rupee(row.paidAmount)}
                </Cell>
                <Cell width={COL.dep}>{row.depositionCount} / {rupee(row.depositionAmount)}</Cell>
                <Cell width={COL.bkt} color={Colors.info} bold={row.receiptsBkt1 > 0}>
                  {row.receiptsBkt1}
                </Cell>
                <Cell width={COL.bkt} color={Colors.warning} bold={row.receiptsBkt2 > 0}>
                  {row.receiptsBkt2}
                </Cell>
                <Cell width={COL.bkt} color={Colors.statusPTP} bold={row.receiptsBkt3 > 0}>
                  {row.receiptsBkt3}
                </Cell>
                <Cell width={COL.total} bold color={Colors.success}>{row.receiptsTotal}</Cell>
              </View>
            ))}

            {/* Totals row */}
            <View style={[tbl.row, tbl.totalsRow]}>
              <Cell width={COL.agent} align="left" bold>All Agents</Cell>
              <Cell width={COL.status}>—</Cell>
              <Cell width={COL.visits}>
                {report.reduce((a, r) => a + r.fieldVisits, 0)}
              </Cell>
              <Cell width={COL.ptp}>{report.reduce((a, r) => a + r.ptpCount, 0)}</Cell>
              <Cell width={COL.paid}>{report.reduce((a, r) => a + r.paidCount, 0)}</Cell>
              <Cell width={COL.dep}>{report.reduce((a, r) => a + r.depositionCount, 0)}</Cell>
              <Cell width={COL.bkt} bold color={Colors.info}>{totals.bkt1}</Cell>
              <Cell width={COL.bkt} bold color={Colors.warning}>{totals.bkt2}</Cell>
              <Cell width={COL.bkt} bold color={Colors.statusPTP}>{totals.bkt3}</Cell>
              <Cell width={COL.total} bold color={Colors.success}>{totals.total}</Cell>
            </View>
          </View>
        </ScrollView>
      )}

      {isRefetching && !isLoading && (
        <View style={styles.refetchBanner}>
          <ActivityIndicator size="small" color={Colors.primary} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 32 },
  loadingText: { fontSize: 13, color: Colors.textMuted, marginTop: 4 },
  errorText: { fontSize: 14, color: Colors.danger, textAlign: "center" },
  retryBtn: { marginTop: 8, backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 22, paddingVertical: 9 },
  retryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: Colors.text },
  emptyText: { fontSize: 13, color: Colors.textSecondary, textAlign: "center", lineHeight: 20 },
  chipRow: { flexDirection: "row", gap: 8, paddingHorizontal: 14 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  chipText: { fontSize: 12, fontWeight: "700" },
  refetchBanner: {
    position: "absolute",
    top: 8,
    right: 12,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
});

const tbl = StyleSheet.create({
  headRow: {
    flexDirection: "row",
    backgroundColor: Colors.primaryDeep ?? Colors.primary,
    paddingVertical: 10,
  },
  headCell: { paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  headCellText: { color: "#fff", fontSize: 12, fontWeight: "700", textAlign: "center" },
  headCellSub: { color: "#ffffffb0", fontSize: 9, fontWeight: "600", textAlign: "center" },
  row: {
    flexDirection: "row",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    backgroundColor: Colors.surface,
  },
  totalsRow: {
    backgroundColor: Colors.surfaceElevated,
    borderTopWidth: 2,
    borderTopColor: Colors.border,
  },
  cell: { paddingHorizontal: 6, justifyContent: "center" },
  cellText: { fontSize: 12.5, color: Colors.text },
  cellTextBold: { fontWeight: "700" },
});

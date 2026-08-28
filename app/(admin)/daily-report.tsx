import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";

const WHATSAPP_GREEN = "#25D366";

// ─── Helpers ────────────────────────────────────────────────────────────────
const toDateStr = (d: Date) => d.toISOString().slice(0, 10); // "YYYY-MM-DD"

const fmtDate = (s: string) => {
  const [y, m, day] = s.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day} ${months[+m - 1]} ${y}`;
};

const fmtMonth = (s: string) => {
  const [y, m] = s.split("-");
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${months[+m - 1]} ${y}`;
};

interface DailyReportRow {
  agentId: number;
  agentName: string;
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

// ─── Month navigator (whole-month receipts view) ───────────────────────────
function MonthNavigator({
  monthStr,
  onPrev,
  onNext,
  onThisMonth,
}: {
  monthStr: string;
  onPrev: () => void;
  onNext: () => void;
  onThisMonth: () => void;
}) {
  const thisMonth = toDateStr(new Date()).slice(0, 7);
  const isThisMonth = monthStr === thisMonth;

  return (
    <View style={dn.row}>
      <Pressable onPress={onPrev} style={dn.arrow} hitSlop={6}>
        <Ionicons name="chevron-back" size={20} color={Colors.text} />
      </Pressable>

      <Pressable style={dn.center} onPress={onThisMonth} disabled={isThisMonth}>
        <Ionicons name="calendar-outline" size={14} color={Colors.textSecondary} />
        <Text style={dn.dateLabel}>{fmtMonth(`${monthStr}-01`)}</Text>
        {!isThisMonth && <Text style={dn.todayLink}>Jump to this month</Text>}
      </Pressable>

      <Pressable
        onPress={onNext}
        style={[dn.arrow, isThisMonth && dn.arrowDisabled]}
        disabled={isThisMonth}
        hitSlop={6}
      >
        <Ionicons name="chevron-forward" size={20} color={isThisMonth ? Colors.textMuted : Colors.text} />
      </Pressable>
    </View>
  );
}

// ─── Day / Month view toggle ────────────────────────────────────────────────
function ViewModeToggle({
  mode,
  onChange,
}: {
  mode: "day" | "month";
  onChange: (m: "day" | "month") => void;
}) {
  return (
    <View style={vm.wrap}>
      <Pressable
        style={[vm.btn, mode === "day" && vm.btnActive]}
        onPress={() => onChange("day")}
      >
        <Text style={[vm.text, mode === "day" && vm.textActive]}>Day</Text>
      </Pressable>
      <Pressable
        style={[vm.btn, mode === "month" && vm.btnActive]}
        onPress={() => onChange("month")}
      >
        <Text style={[vm.text, mode === "month" && vm.textActive]}>Month</Text>
      </Pressable>
    </View>
  );
}

const vm = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignSelf: "center",
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 10,
    padding: 3,
    marginTop: 2,
    marginBottom: 4,
  },
  btn: {
    paddingHorizontal: 18,
    paddingVertical: 6,
    borderRadius: 8,
  },
  btnActive: {
    backgroundColor: Colors.surface,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  text: { fontSize: 12.5, fontWeight: "700", color: Colors.textSecondary },
  textActive: { color: Colors.text },
});

// ─── Table config ───────────────────────────────────────────────────────────
const COL = {
  agent: 170,
  bkt: 90,
  total: 100,
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

export default function DailyReportScreen() {
  const insets = useSafeAreaInsets();
  const [viewMode, setViewMode] = useState<"day" | "month">("day");
  const [dateStr, setDateStr] = useState(toDateStr(new Date()));
  const [monthStr, setMonthStr] = useState(toDateStr(new Date()).slice(0, 7)); // "YYYY-MM"
  const [isSharing, setIsSharing] = useState(false);
  const tableRef = useRef<View>(null);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["/api/admin/daily-report", viewMode, viewMode === "day" ? dateStr : monthStr],
    queryFn: () =>
      api.admin.getDailyReport(viewMode === "day" ? dateStr : `${monthStr}-01`, viewMode),
  });

  const report: DailyReportRow[] = data?.report ?? [];
  const totals = data?.receiptTotals ?? { bkt1: 0, bkt2: 0, bkt3: 0, total: 0 };
  const periodLabel = viewMode === "day" ? fmtDate(dateStr) : fmtMonth(`${monthStr}-01`);

  const shiftDate = useCallback((days: number) => {
    setDateStr((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + days);
      const next = toDateStr(d);
      return next > toDateStr(new Date()) ? prev : next;
    });
  }, []);

  const shiftMonth = useCallback((months: number) => {
    setMonthStr((prev) => {
      const [y, m] = prev.split("-").map(Number);
      const d = new Date(y, m - 1 + months, 1);
      const next = toDateStr(d).slice(0, 7);
      const thisMonth = toDateStr(new Date()).slice(0, 7);
      return next > thisMonth ? prev : next;
    });
  }, []);

  // ─── Capture the table exactly as rendered and send it to WhatsApp ────────
  const shareReportToWhatsApp = useCallback(async () => {
    if (isSharing || !tableRef.current) return;
    setIsSharing(true);

    const caption =
      `*RECEIPT COUNT — ${periodLabel}${viewMode === "month" ? " (Monthly)" : ""}*\n\n` +
      `BKT1: ${totals.bkt1}\n` +
      `BKT2: ${totals.bkt2}\n` +
      `BKT3: ${totals.bkt3}\n` +
      `Total Receipts: ${totals.total}\n\n` +
      `Agents reporting: ${report.length}`;

    // ── Web: react-native's Alert.alert() and expo-sharing are no-ops on
    // web, and react-native-view-shot's captureRef() is broken on web
    // entirely — its universal wrapper unconditionally calls RN's
    // findNodeHandle() before handing off to the web implementation, and
    // current react-native-web throws on that call ("findNodeHandle is
    // not supported on web"). So we skip that package on web and call
    // html2canvas directly on the underlying DOM node instead (which is
    // what react-native-view-shot itself does internally on web).
    if (Platform.OS === "web") {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const html2canvas = (await import("html2canvas")).default;
        const node = tableRef.current as unknown as HTMLElement;
        if (!node) throw new Error("Report view is not mounted");

        const canvas = await html2canvas(node);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.95);

        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const fileName = `receipt-count-${viewMode === "day" ? dateStr : monthStr}.jpg`;
        const file = new File([blob], fileName, { type: "image/jpeg" });

        // Prefer the native share sheet (lets the user pick WhatsApp)
        // where the browser supports sharing files.
        const nav: any = typeof navigator !== "undefined" ? navigator : null;
        if (nav?.canShare?.({ files: [file] }) && nav?.share) {
          await nav.share({ files: [file], title: "Receipt Count", text: caption });
          return;
        }

        // Fallback: download the image, then open WhatsApp with the
        // caption pre-filled so the user can attach the saved image.
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        window.open(`https://wa.me/?text=${encodeURIComponent(caption)}`, "_blank");
        window.alert(
          `The report image "${fileName}" was downloaded. Attach it in the WhatsApp chat that just opened.`
        );
      } catch (e: any) {
        console.error("[shareReportToWhatsApp] web share failed:", e);
        window.alert("Failed to share the report. Please try again.");
      } finally {
        setIsSharing(false);
      }
      return;
    }

    try {
      // Snapshot the table view (header + rows + totals) as a jpg file.
      const uri = await captureRef(tableRef, {
        format: "jpg",
        quality: 0.95,
        result: "tmpfile",
      });

      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const RNShare = require("react-native-share").default;
        await RNShare.shareSingle({
          social: RNShare.Social.WHATSAPP,
          url: uri,           // file:// URI → WhatsApp shows it as an image
          type: "image/jpeg",
          message: caption,   // caption shown below the image
          title: "Receipt Count",
        });
        return;
      } catch (e: any) {
        if (e?.error === "ECANCELLED" || e?.message?.includes("cancel")) return;
        console.warn("[shareReportToWhatsApp] WhatsApp share failed, falling back:", e);
      }

      // Fallback (WhatsApp not installed): generic share sheet.
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "image/jpeg",
          dialogTitle: "Share Receipt Count",
        });
      } else {
        Alert.alert("Sharing unavailable", "Could not share the report image on this device.");
      }
    } catch (e: any) {
      console.error("[shareReportToWhatsApp] capture failed:", e);
      Alert.alert("Error", "Failed to capture the report as an image. Please try again.");
    } finally {
      setIsSharing(false);
    }
  }, [dateStr, monthStr, viewMode, periodLabel, totals, report.length, isSharing]);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={{ paddingTop: Platform.OS === "web" ? 67 : 12, backgroundColor: Colors.surface }}>
        <ViewModeToggle mode={viewMode} onChange={setViewMode} />

        {viewMode === "day" ? (
          <DateNavigator
            dateStr={dateStr}
            onPrev={() => shiftDate(-1)}
            onNext={() => shiftDate(1)}
            onToday={() => setDateStr(toDateStr(new Date()))}
          />
        ) : (
          <MonthNavigator
            monthStr={monthStr}
            onPrev={() => shiftMonth(-1)}
            onNext={() => shiftMonth(1)}
            onThisMonth={() => setMonthStr(toDateStr(new Date()).slice(0, 7))}
          />
        )}

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
            <Pressable
              style={[
                styles.chip,
                { backgroundColor: WHATSAPP_GREEN + "18" },
                (isSharing || report.length === 0) && { opacity: 0.5 },
              ]}
              onPress={shareReportToWhatsApp}
              disabled={isSharing || report.length === 0}
            >
              {isSharing ? (
                <ActivityIndicator size="small" color={WHATSAPP_GREEN} />
              ) : (
                <Ionicons name="logo-whatsapp" size={14} color={WHATSAPP_GREEN} />
              )}
              <Text style={[styles.chipText, { color: WHATSAPP_GREEN }]}>
                {isSharing ? "Preparing…" : "Share"}
              </Text>
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
          <Text style={styles.emptyText}>No agent activity found for {periodLabel}.</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <ScrollView
            showsVerticalScrollIndicator
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            style={{ flex: 1 }}
          >
            {/* Everything inside this View is what gets captured & shared to WhatsApp */}
            <View ref={tableRef} collapsable={false} style={tbl.captureWrap}>
              <View style={tbl.captureHeader}>
                <Text style={tbl.captureTitle}>Receipt Count</Text>
                <Text style={tbl.captureDate}>{periodLabel}</Text>
              </View>
              <View style={tbl.captureDivider} />

              {/* Header row */}
              <View style={tbl.headRow}>
                <HeaderCell label="Agent" width={COL.agent} />
                <HeaderCell label="BKT1" width={COL.bkt} sub="COLL Receipts" />
                <HeaderCell label="BKT2" width={COL.bkt} sub="COLL Receipts" />
                <HeaderCell label="BKT3" width={COL.bkt} sub="COLL Receipts" />
                <HeaderCell label="Total" width={COL.total} sub="COLL Receipts" />
              </View>

              {/* Data rows */}
              {report.map((row, i) => (
                <View
                  key={row.agentId}
                  style={[tbl.row, i % 2 === 1 && { backgroundColor: Colors.surfaceAlt }]}
                >
                  <Cell width={COL.agent} align="left" bold>{row.agentName}</Cell>
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
                <Cell width={COL.bkt} bold color={Colors.info}>{totals.bkt1}</Cell>
                <Cell width={COL.bkt} bold color={Colors.warning}>{totals.bkt2}</Cell>
                <Cell width={COL.bkt} bold color={Colors.statusPTP}>{totals.bkt3}</Cell>
                <Cell width={COL.total} bold color={Colors.success}>{totals.total}</Cell>
              </View>

              <View style={tbl.captureFooter}>
                <Text style={tbl.captureFooterText}>{report.length} Agents Reporting</Text>
                <Text style={tbl.captureFooterText}>
                  Generated {new Date().toLocaleString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
            </View>
          </ScrollView>
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
  captureWrap: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    overflow: "hidden",
  },
  captureHeader: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: "center",
    backgroundColor: Colors.surface,
  },
  captureTitle: { fontSize: 17, fontWeight: "800", color: Colors.text, letterSpacing: 0.3 },
  captureDate: { fontSize: 12, color: Colors.textSecondary, fontWeight: "600", marginTop: 2 },
  captureDivider: { height: 1, backgroundColor: Colors.border },
  captureFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: Colors.surfaceAlt,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  captureFooterText: { fontSize: 10.5, color: Colors.textMuted, fontWeight: "600" },
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

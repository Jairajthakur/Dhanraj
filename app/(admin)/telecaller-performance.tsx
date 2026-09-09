import React, { useMemo, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator,
  Modal, Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";

interface TodayCase {
  id: number;
  caseType: "loan" | "bkt";
  customerName: string;
  loanNo: string;
  appId: string | null;
  mobileNo: string | null;
  status?: string;
  pos?: number | null;
  feedback: string | null;
  feedbackCode: string | null;
  feedbackDate: string | null;
  fosName: string | null;
}

interface TelecallerStat {
  id: number;
  name: string;
  username: string;
  phone: string | null;
  fosCount: number;
  totalCases: number;
  unpaidCases: number;
  ptpCases: number;
  paidCases: number;
  todayCalledCount: number;
  todayPaidCount: number;
  todayPtpCount: number;
  todayPaidCases: TodayCase[];
  todayCalledCases: TodayCase[];
  attendance: { checkedIn: boolean; checkIn: string | null; checkOut: string | null };
}

function fmtTime(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function fmtMoney(v: any) {
  if (v === null || v === undefined || v === "") return "";
  const n = parseFloat(v);
  if (isNaN(n)) return "";
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

// ── Drill-down list modal (today's paid cases OR today's called cases) ─────
function CaseListModal({
  visible, title, cases, accentColor, onClose,
}: { visible: boolean; title: string; cases: TodayCase[]; accentColor: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <View style={[modalStyles.sheet, { paddingBottom: insets.bottom + 16, maxHeight: "80%" }]}>
          <View style={modalStyles.handle} />
          <View style={modalStyles.header}>
            <Text style={modalStyles.title}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={Colors.text} />
            </Pressable>
          </View>
          <FlatList
            data={cases}
            keyExtractor={(c) => `${c.caseType}-${c.id}`}
            contentContainerStyle={{ padding: 14, gap: 8 }}
            renderItem={({ item }) => (
              <View style={modalStyles.caseRow}>
                <View style={{ flex: 1 }}>
                  <Text style={modalStyles.caseName} numberOfLines={1}>{item.customerName}</Text>
                  <Text style={modalStyles.caseMeta} numberOfLines={1}>
                    {item.loanNo} {item.fosName ? `· FOS: ${item.fosName}` : ""}
                  </Text>
                  {!!item.feedback && (
                    <Text style={modalStyles.caseFeedback} numberOfLines={2}>
                      {item.feedbackCode ? `[${item.feedbackCode}] ` : ""}{item.feedback}
                    </Text>
                  )}
                  <Text style={modalStyles.caseTime}>{fmtTime(item.feedbackDate)}</Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  {item.status && (
                    <View style={[modalStyles.statusPill, { backgroundColor: accentColor + "1E" }]}>
                      <Text style={[modalStyles.statusPillText, { color: accentColor }]}>{item.status}</Text>
                    </View>
                  )}
                  {!!item.mobileNo && (
                    <Pressable
                      style={modalStyles.callBtn}
                      onPress={() => Linking.openURL(`tel:${item.mobileNo!.split(",")[0].trim()}`)}
                    >
                      <Ionicons name="call" size={13} color={Colors.info} />
                    </Pressable>
                  )}
                </View>
              </View>
            )}
            ListEmptyComponent={
              <Text style={modalStyles.emptyText}>No cases here yet today.</Text>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

function TelecallerCard({ tc }: { tc: TelecallerStat }) {
  const [listModal, setListModal] = useState<"paid" | "called" | null>(null);
  const recoveredPct = tc.totalCases ? Math.round((tc.paidCases / tc.totalCases) * 100) : 0;

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.avatar}>
          <Ionicons name="headset" size={18} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{tc.name}</Text>
          <Text style={styles.sub}>
            {tc.fosCount} FOS agent{tc.fosCount !== 1 ? "s" : ""} · {tc.totalCases} case{tc.totalCases !== 1 ? "s" : ""}
          </Text>
        </View>
        <View style={[styles.attendanceBadge, tc.attendance.checkedIn ? styles.attendanceIn : styles.attendanceOut]}>
          <Ionicons
            name={tc.attendance.checkedIn ? "checkmark-circle" : "close-circle-outline"}
            size={12}
            color={tc.attendance.checkedIn ? Colors.success : Colors.textMuted}
          />
          <Text style={[styles.attendanceText, { color: tc.attendance.checkedIn ? Colors.success : Colors.textMuted }]}>
            {tc.attendance.checkedIn ? `In ${fmtTime(tc.attendance.checkIn)}` : "Not checked in"}
          </Text>
        </View>
      </View>

      {/* Today's activity — the main ask: paid today & called today */}
      <View style={styles.todayRow}>
        <Pressable
          style={[styles.todayBox, { borderColor: Colors.success + "50", backgroundColor: Colors.success + "0D" }]}
          onPress={() => tc.todayPaidCount > 0 && setListModal("paid")}
        >
          <Text style={[styles.todayNum, { color: Colors.success }]}>{tc.todayPaidCount}</Text>
          <Text style={styles.todayLabel}>Paid Today</Text>
        </Pressable>
        <Pressable
          style={[styles.todayBox, { borderColor: Colors.primary + "40", backgroundColor: Colors.primary + "08" }]}
          onPress={() => tc.todayCalledCount > 0 && setListModal("called")}
        >
          <Text style={styles.todayNum}>{tc.todayCalledCount}</Text>
          <Text style={styles.todayLabel}>Called Today</Text>
        </Pressable>
        <View style={[styles.todayBox, { borderColor: Colors.statusPTP + "50", backgroundColor: Colors.statusPTP + "0D" }]}>
          <Text style={[styles.todayNum, { color: Colors.statusPTP }]}>{tc.todayPtpCount}</Text>
          <Text style={styles.todayLabel}>PTP Today</Text>
        </View>
      </View>

      {/* Overall split */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${recoveredPct}%` }]} />
      </View>
      <View style={styles.overallRow}>
        <View style={styles.overallItem}>
          <Text style={[styles.overallNum, { color: Colors.statusUnpaid }]}>{tc.unpaidCases}</Text>
          <Text style={styles.overallLabel}>Unpaid</Text>
        </View>
        <View style={styles.overallDivider} />
        <View style={styles.overallItem}>
          <Text style={[styles.overallNum, { color: Colors.statusPTP }]}>{tc.ptpCases}</Text>
          <Text style={styles.overallLabel}>PTP</Text>
        </View>
        <View style={styles.overallDivider} />
        <View style={styles.overallItem}>
          <Text style={[styles.overallNum, { color: Colors.statusPaid }]}>{tc.paidCases}</Text>
          <Text style={styles.overallLabel}>Paid</Text>
        </View>
        <View style={styles.overallDivider} />
        <View style={styles.overallItem}>
          <Text style={styles.overallNum}>{recoveredPct}%</Text>
          <Text style={styles.overallLabel}>Recovered</Text>
        </View>
      </View>

      <CaseListModal
        visible={listModal === "paid"}
        title={`${tc.name} — Paid Today`}
        cases={tc.todayPaidCases}
        accentColor={Colors.success}
        onClose={() => setListModal(null)}
      />
      <CaseListModal
        visible={listModal === "called"}
        title={`${tc.name} — Called Today`}
        cases={tc.todayCalledCases}
        accentColor={Colors.primary}
        onClose={() => setListModal(null)}
      />
    </View>
  );
}

export default function TelecallerPerformanceScreen() {
  const insets = useSafeAreaInsets();

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ["/api/admin/telecaller-stats"],
    queryFn: () => api.admin.getTelecallerStats(),
    refetchInterval: 60000, // keep "today" numbers fresh
  });

  const telecallers: TelecallerStat[] = data?.telecallers || [];

  const totals = useMemo(() => {
    return telecallers.reduce(
      (acc, tc) => {
        acc.paidToday += tc.todayPaidCount;
        acc.calledToday += tc.todayCalledCount;
        acc.totalCases += tc.totalCases;
        return acc;
      },
      { paidToday: 0, calledToday: 0, totalCases: 0 }
    );
  }, [telecallers]);

  if (isLoading) {
    return (
      <View style={styles.centerFill}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top === 0 ? 12 : 0 }]}>
      <View style={styles.summaryRow}>
        <View style={styles.summaryBox}>
          <Text style={[styles.summaryNum, { color: Colors.success }]}>{totals.paidToday}</Text>
          <Text style={styles.summaryLabel}>Paid Today</Text>
        </View>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryNum}>{totals.calledToday}</Text>
          <Text style={styles.summaryLabel}>Called Today</Text>
        </View>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryNum}>{telecallers.length}</Text>
          <Text style={styles.summaryLabel}>Telecallers</Text>
        </View>
      </View>

      <FlatList
        data={telecallers}
        keyExtractor={(tc) => String(tc.id)}
        contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: insets.bottom + 20 }}
        renderItem={({ item }) => <TelecallerCard tc={item} />}
        refreshing={isRefetching}
        onRefresh={refetch}
        ListEmptyComponent={
          <View style={styles.centerFill}>
            <Ionicons name="headset-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No telecallers found.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 60 },
  emptyText: { color: Colors.textMuted, fontSize: 13 },

  summaryRow: { flexDirection: "row", gap: 10, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  summaryBox: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    alignItems: "center", paddingVertical: 12,
  },
  summaryNum: { fontSize: 20, fontWeight: "800", color: Colors.text },
  summaryLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: "600", marginTop: 2 },

  card: {
    backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border,
    padding: 14, gap: 10,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.primary,
    alignItems: "center", justifyContent: "center",
  },
  name: { fontSize: 15, fontWeight: "800", color: Colors.text },
  sub: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  attendanceBadge: {
    flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 5,
    borderRadius: 8, borderWidth: 1,
  },
  attendanceIn: { borderColor: Colors.success + "40", backgroundColor: Colors.success + "10" },
  attendanceOut: { borderColor: Colors.border, backgroundColor: Colors.surfaceAlt },
  attendanceText: { fontSize: 10, fontWeight: "700" },

  todayRow: { flexDirection: "row", gap: 8 },
  todayBox: { flex: 1, borderRadius: 12, borderWidth: 1.5, paddingVertical: 10, alignItems: "center" },
  todayNum: { fontSize: 18, fontWeight: "800", color: Colors.text },
  todayLabel: { fontSize: 10, fontWeight: "700", color: Colors.textSecondary, marginTop: 2, textTransform: "uppercase" },

  progressTrack: { height: 5, borderRadius: 3, backgroundColor: Colors.surfaceAlt, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: Colors.success, borderRadius: 3 },

  overallRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  overallItem: { flex: 1, alignItems: "center" },
  overallDivider: { width: StyleSheet.hairlineWidth, height: 24, backgroundColor: Colors.border },
  overallNum: { fontSize: 15, fontWeight: "800", color: Colors.text },
  overallLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: "600", marginTop: 1 },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: "center", marginTop: 10 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  title: { fontSize: 15, fontWeight: "800", color: Colors.text },
  caseRow: {
    flexDirection: "row", gap: 10, backgroundColor: Colors.surfaceAlt, borderRadius: 12,
    padding: 12, borderWidth: 1, borderColor: Colors.border,
  },
  caseName: { fontSize: 13, fontWeight: "700", color: Colors.text },
  caseMeta: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  caseFeedback: { fontSize: 11, color: Colors.textSecondary, marginTop: 4, lineHeight: 15 },
  caseTime: { fontSize: 10, color: Colors.textMuted, marginTop: 4, fontWeight: "600" },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusPillText: { fontSize: 10, fontWeight: "700" },
  callBtn: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.info + "14",
    alignItems: "center", justifyContent: "center",
  },
  emptyText: { textAlign: "center", color: Colors.textMuted, fontSize: 12, marginTop: 24 },
});

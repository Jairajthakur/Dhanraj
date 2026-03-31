import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  Linking, Alert, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { caseStore } from "@/lib/caseStore";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(v: any, prefix = "") {
  if (v === null || v === undefined || v === "" || v === "0" || Number(v) === 0) return "—";
  const n = parseFloat(String(v).replace(/,/g, ""));
  if (!isNaN(n)) return prefix + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return String(v);
}
function fmtStr(v: any) {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}
function fmtDate(v: any) {
  if (!v) return "—";
  return String(v).slice(0, 10);
}
function yn(v: any) {
  if (v === true  || v === "true"  || v === "t") return "Yes";
  if (v === false || v === "false" || v === "f") return "No";
  return "—";
}

const STATUS_COLORS: Record<string, string> = {
  Unpaid: Colors.statusUnpaid ?? "#EF4444",
  PTP:    Colors.statusPTP    ?? "#F59E0B",
  Paid:   Colors.statusPaid   ?? "#22C55E",
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function SectionCard({ title, icon, children }: {
  title: string; icon: string; children: React.ReactNode;
}) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon as any} size={16} color={Colors.primary} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Row({ label, value, valueColor }: {
  label: string; value: string; valueColor?: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function CustomerDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams();

  // Pull the case from the in-memory store set by navigateToDetail()
  const item = caseStore.get();

  if (!item) {
    return (
      <View style={styles.empty}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.textMuted} />
        <Text style={styles.emptyText}>Case not found.</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const statusColor = STATUS_COLORS[item.status] ?? Colors.textMuted;

  const call = (number: string) => {
    const num = number.trim();
    if (!num) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Linking.openURL(`tel:${num}`);
  };

  const phones: string[] = (item.mobile_no ?? "")
    .split(",")
    .map((p: string) => p.trim())
    .filter(Boolean);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={[
        styles.container,
        { paddingBottom: insets.bottom + 32, paddingTop: Platform.OS === "web" ? 72 : 12 },
      ]}
    >
      {/* ── Header ── */}
      <View style={styles.heroCard}>
        <View style={styles.heroTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.customerName}>{fmtStr(item.customer_name)}</Text>
            <Text style={styles.loanNo}>{fmtStr(item.loan_no)}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + "22" }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{item.status}</Text>
          </View>
        </View>

        {/* Quick amounts */}
        <View style={styles.amountRow}>
          {[
            { label: "EMI DUE", value: fmt(item.emi_due, "₹"), color: Colors.danger },
            { label: "POS",     value: fmt(item.pos,     "₹"), color: Colors.text  },
            { label: "CBC+LPP", value: fmt(item.cbc_lpp, "₹"), color: Colors.warning ?? "#F59E0B" },
          ].map((a) => (
            <View key={a.label} style={styles.amountCell}>
              <Text style={styles.amountLabel}>{a.label}</Text>
              <Text style={[styles.amountValue, { color: a.color }]}>{a.value}</Text>
            </View>
          ))}
        </View>

        {/* Call buttons */}
        {phones.length > 0 && (
          <View style={styles.callBtnRow}>
            {phones.map((ph, i) => (
              <Pressable key={i} style={styles.callBtn} onPress={() => call(ph)}>
                <Ionicons name="call" size={14} color="#fff" />
                <Text style={styles.callBtnText}>{ph}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* ── Loan / Case Info ── */}
      <SectionCard title="Loan Details" icon="document-text-outline">
        <Row label="Loan No"    value={fmtStr(item.loan_no)} />
        <Row label="App ID"     value={fmtStr(item.app_id)} />
        <Row label="BKT"        value={fmtStr(item.bkt)} valueColor={Colors.primary} />
        <Row label="Product"    value={fmtStr(item.pro)} />
        <Row label="Tenor"      value={fmtStr(item.tenor)} />
        <Row label="EMI Amount" value={fmt(item.emi_amount, "₹")} />
        <Row label="EMI Due"    value={fmt(item.emi_due,    "₹")} valueColor={Colors.danger} />
        <Row label="POS"        value={fmt(item.pos,        "₹")} />
        <Row label="CBC"        value={fmt(item.cbc,        "₹")} />
        <Row label="LPP"        value={fmt(item.lpp,        "₹")} />
        <Row label="CBC + LPP"  value={fmt(item.cbc_lpp,   "₹")} valueColor={Colors.warning ?? "#F59E0B"} />
        {(item.rollback && Number(item.rollback) > 0) && (
          <Row label="Rollback"  value={fmt(item.rollback,  "₹")} valueColor={Colors.info ?? "#3B82F6"} />
        )}
        {(item.clearance && Number(item.clearance) > 0) && (
          <Row label="Clearance" value={fmt(item.clearance, "₹")} valueColor={Colors.success ?? "#22C55E"} />
        )}
        <Row label="First EMI Date"    value={fmtDate(item.first_emi_due_date)} />
        <Row label="Loan Maturity Date" value={fmtDate(item.loan_maturity_date)} />
      </SectionCard>

      {/* ── Contact Details ── */}
      <SectionCard title="Contact Details" icon="call-outline">
        <Row label="Mobile" value={fmtStr(item.mobile_no)} />
        <Row label="Address" value={fmtStr(item.address)} />
        <Row label="Reference Address" value={fmtStr(item.reference_address)} />
        {item.ref1_name && <Row label="Ref 1 Name"   value={fmtStr(item.ref1_name)} />}
        {item.ref1_mobile && <Row label="Ref 1 Mobile" value={fmtStr(item.ref1_mobile)} />}
        {item.ref2_name && <Row label="Ref 2 Name"   value={fmtStr(item.ref2_name)} />}
        {item.ref2_mobile && <Row label="Ref 2 Mobile" value={fmtStr(item.ref2_mobile)} />}
      </SectionCard>

      {/* ── Vehicle Details ── */}
      <SectionCard title="Vehicle Details" icon="car-outline">
        <Row label="Asset / Make"    value={fmtStr(item.asset_make ?? item.asset_name)} />
        <Row label="Registration No" value={fmtStr(item.registration_no)} />
        <Row label="Engine No"       value={fmtStr(item.engine_no)} />
        <Row label="Chassis No"      value={fmtStr(item.chassis_no)} />
      </SectionCard>

      {/* ── Feedback History ── */}
      <SectionCard title="Feedback History" icon="chatbox-outline">
        <Row label="Status"          value={fmtStr(item.status)} valueColor={statusColor} />
        <Row label="Feedback Code"   value={fmtStr(item.feedback_code)} valueColor={Colors.accent ?? Colors.primary} />
        <Row label="Detail Feedback" value={fmtStr(item.latest_feedback)} />
        <Row label="Monthly Feedback" value={
          item.monthly_feedback && item.monthly_feedback !== "SUBMITTED"
            ? item.monthly_feedback
            : item.monthly_feedback === "SUBMITTED" ? "Submitted" : "—"
        } />
        <Row label="PTP Date"           value={fmtDate(item.ptp_date)} valueColor={STATUS_COLORS.PTP} />
        <Row label="Telecaller PTP Date" value={fmtDate(item.telecaller_ptp_date)} valueColor={Colors.info ?? "#3B82F6"} />
        <Row label="Projection"         value={fmtStr(item.projection)} />
        <Row label="Customer Available" value={yn(item.customer_available)} />
        <Row label="Vehicle Available"  value={yn(item.vehicle_available)} />
        <Row label="Third Party"        value={yn(item.third_party)} />
        {(item.third_party === true || item.third_party === "true") && (
          <>
            <Row label="3rd Party Name"   value={fmtStr(item.third_party_name)} />
            <Row label="3rd Party Number" value={fmtStr(item.third_party_number)} />
          </>
        )}
        <Row label="Non Starter"   value={yn(item.non_starter)} />
        <Row label="KYC Purchase"  value={yn(item.kyc_purchase)} />
        <Row label="Workable"      value={
          item.workable === true || item.workable === "true" ? "Workable"
          : item.workable === false || item.workable === "false" ? "Non Workable"
          : "—"
        } />
        <Row label="Rollback Marked" value={item.rollback_yn === true ? "Yes" : "—"} />
        <Row label="Comments"        value={fmtStr(item.feedback_comments)} />
      </SectionCard>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { padding: 12, gap: 12 },

  empty: {
    flex: 1, justifyContent: "center", alignItems: "center",
    backgroundColor: Colors.background, gap: 12,
  },
  emptyText: { fontSize: 16, color: Colors.textMuted },
  backBtn: {
    marginTop: 8, paddingVertical: 10, paddingHorizontal: 24,
    backgroundColor: Colors.primary, borderRadius: 12,
  },
  backBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  /* Hero card */
  heroCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16, padding: 16, gap: 12,
    borderWidth: 1, borderColor: Colors.border,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 8, elevation: 4,
  },
  heroTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  customerName: {
    fontSize: 17, fontWeight: "800", color: Colors.text,
    textTransform: "uppercase", flexShrink: 1,
  },
  loanNo: { fontSize: 12, color: Colors.textSecondary, marginTop: 2, fontWeight: "500" },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  statusText:  { fontSize: 12, fontWeight: "700" },

  amountRow: { flexDirection: "row", gap: 8 },
  amountCell: {
    flex: 1, backgroundColor: Colors.surfaceAlt ?? Colors.background,
    borderRadius: 10, padding: 10, alignItems: "center",
  },
  amountLabel: { fontSize: 9, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase" },
  amountValue: { fontSize: 13, fontWeight: "800", color: Colors.text, marginTop: 2 },

  callBtnRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  callBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: Colors.primary, borderRadius: 10,
    paddingVertical: 9, paddingHorizontal: 14, flex: 1, justifyContent: "center",
  },
  callBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  /* Section card */
  sectionCard: {
    backgroundColor: Colors.surface, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border, overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.surfaceAlt ?? Colors.background,
  },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: Colors.text, textTransform: "uppercase", letterSpacing: 0.5 },

  /* Row */
  row: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  rowLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: "600", flex: 1 },
  rowValue: { fontSize: 12, color: Colors.text, fontWeight: "700", flex: 1.5, textAlign: "right" },
});

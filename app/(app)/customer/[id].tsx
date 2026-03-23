import React from "react";
import { View, Text, ScrollView, Pressable, Linking, Platform, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { caseStore } from "@/lib/caseStore";

function Row({ label, value, highlight, phone }: any) {
  const display = value !== null && value !== undefined && value !== "" ? String(value) : "—";
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {phone && display !== "—" ? (
        <Pressable onPress={() => Linking.openURL(`tel:${display.split(",")[0].trim()}`)}>
          <Text style={[styles.rowValue, { color: Colors.info, textDecorationLine: "underline" }]}>{display}</Text>
        </Pressable>
      ) : (
        <Text style={[styles.rowValue, highlight ? { color: highlight, fontWeight: "700" } : null]}>{display}</Text>
      )}
    </View>
  );
}

function fmt(v: any, prefix = "") {
  if (v === null || v === undefined || v === "") return "—";
  const n = parseFloat(String(v).replace(/,/g, ""));
  if (!isNaN(n) && prefix) return prefix + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return String(v);
}

function Section({ title, children }: any) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const c = caseStore.get();

  console.log("[Detail] id=", id, "case=", c?.customer_name ?? "NULL");

  if (!c) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background, padding: 32, gap: 12 }}>
        <Ionicons name="document-outline" size={48} color={Colors.textMuted} />
        <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.text }}>No data found</Text>
        <Text style={{ fontSize: 13, color: Colors.textSecondary, textAlign: "center" }}>Case ID: {id}{"\n"}Go back and tap Details again.</Text>
        <Pressable onPress={() => router.back()} style={{ backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginTop: 8 }}>
          <Text style={{ color: "#fff", fontWeight: "700" }}>← Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const STATUS_COLORS: Record<string, string> = { Unpaid: Colors.statusUnpaid, PTP: Colors.statusPTP, Paid: Colors.statusPaid };
  const statusColor = STATUS_COLORS[c.status] || Colors.textSecondary;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 32, paddingTop: Platform.OS === "web" ? 67 : 0 }}
    >
      <View style={[styles.statusBanner, { borderColor: statusColor + "40", backgroundColor: statusColor + "15" }]}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: statusColor }} />
        <Text style={{ fontSize: 15, fontWeight: "700", color: statusColor }}>{c.status}</Text>
        {c.latest_feedback ? <View style={styles.fbBadge}><Text style={styles.fbText}>{c.latest_feedback}</Text></View> : null}
      </View>

      <Section title="Loan Details">
        <Row label="LOAN NO" value={c.loan_no} />
        <Row label="APP ID" value={c.app_id} />
        <Row label="BKT" value={c.bkt} highlight={Colors.primary} />
        <Row label="PRO" value={c.pro} />
        <Row label="TENOR" value={c.tenor ? `${c.tenor} months` : null} />
        <Row label="FOS NAME" value={c.fos_name} />
      </Section>

      <Section title="Customer Info">
        <Row label="CUSTOMER NAME" value={c.customer_name} />
        <Row label="NUMBER" value={c.mobile_no} phone />
        <Row label="ADDRESS" value={c.address} />
      </Section>

      <Section title="Payment Details">
        <Row label="EMI AMOUNT" value={fmt(c.emi_amount, "₹")} />
        <Row label="EMI DUE" value={fmt(c.emi_due, "₹")} highlight={Colors.danger} />
        <Row label="POS" value={fmt(c.pos, "₹")} />
        <Row label="CBC" value={fmt(c.cbc, "₹")} />
        <Row label="LPP" value={fmt(c.lpp, "₹")} />
        <Row label="CBC + LPP" value={fmt(c.cbc_lpp, "₹")} highlight={Colors.warning} />
        <Row label="ROLLBACK" value={fmt(c.rollback, "₹")} />
        <Row label="CLEARANCE" value={fmt(c.clearance, "₹")} highlight={Colors.success} />
      </Section>

      <Section title="Important Dates">
        <Row label="FIRST EMI DUE DATE" value={c.first_emi_due_date} />
        <Row label="LOAN MATURITY DATE" value={c.loan_maturity_date} />
        {c.ptp_date ? <Row label="PTP DATE" value={String(c.ptp_date).slice(0, 10)} highlight={Colors.statusPTP} /> : null}
        {c.telecaller_ptp_date ? <Row label="TELECALLER PTP" value={String(c.telecaller_ptp_date).slice(0, 10)} highlight={Colors.info} /> : null}
      </Section>

      <Section title="Asset Details">
        <Row label="ASSET MAKE" value={c.asset_make} />
        <Row label="REGISTRATION NO" value={c.registration_no} />
        <Row label="ENGINE NO" value={c.engine_no} />
        <Row label="CHASSIS NO" value={c.chassis_no} />
      </Section>

      <Section title="References">
        <Row label="REFERENCE ADDRESS" value={c.reference_address} />
      </Section>

      {c.mobile_no ? (
        <Pressable
          style={{ backgroundColor: Colors.primary, borderRadius: 14, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}
          onPress={() => Linking.openURL(`tel:${c.mobile_no.split(",")[0].trim()}`)}
        >
          <Ionicons name="call" size={20} color="#fff" />
          <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>Call</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  section: { backgroundColor: Colors.surface, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: Colors.border },
  sectionTitle: { fontSize: 11, fontWeight: "700", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.8, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: Colors.surfaceAlt, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  rowLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: "600", flex: 1 },
  rowValue: { fontSize: 13, color: Colors.text, fontWeight: "500", flex: 1.5, textAlign: "right" },
  statusBanner: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  fbBadge: { marginLeft: "auto", backgroundColor: "rgba(0,0,0,0.07)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  fbText: { fontSize: 12, fontWeight: "600", color: Colors.text },
});

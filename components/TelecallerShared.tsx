import React from "react";
import { View, Text, StyleSheet, Pressable, Linking, Alert, Modal, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export const STATUS_COLORS: Record<string, string> = {
  Unpaid: Colors.statusUnpaid,
  PTP: Colors.statusPTP,
  Paid: Colors.statusPaid,
};

export type StatusFilter = "All" | "Unpaid" | "PTP" | "Paid";

export type StatusCounts = { total: number; Unpaid: number; PTP: number; Paid: number; other: number };

export function countByStatus(cases: any[]): StatusCounts {
  const counts: StatusCounts = { total: cases.length, Unpaid: 0, PTP: 0, Paid: 0, other: 0 };
  for (const c of cases) {
    if (c.status === "Unpaid") counts.Unpaid++;
    else if (c.status === "PTP") counts.PTP++;
    else if (c.status === "Paid") counts.Paid++;
    else counts.other++;
  }
  return counts;
}

export function fmt(v: any, prefix = "") {
  if (v === null || v === undefined || v === "") return "";
  const n = parseFloat(v);
  if (!isNaN(n) && prefix) return prefix + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return String(v);
}

export function TableRow({ label, value, phone, even }: { label: string; value?: any; phone?: boolean; even?: boolean }) {
  const display = (value !== null && value !== undefined && value !== "") ? String(value) : "";
  return (
    <View style={[detailStyles.row, even && { backgroundColor: Colors.surfaceAlt }]}>
      <View style={detailStyles.labelCell}>
        <Text style={detailStyles.labelText}>{label}</Text>
      </View>
      <View style={detailStyles.valueCell}>
        {phone && display ? (
          <Pressable onPress={() => Linking.openURL(`tel:${display.split(",")[0].trim()}`)}>
            <Text style={[detailStyles.valueText, { color: Colors.info, textDecorationLine: "underline" }]}>{display}</Text>
          </Pressable>
        ) : (
          <Text style={detailStyles.valueText}>{display}</Text>
        )}
      </View>
    </View>
  );
}

export function CaseDetailModal({ item, onClose }: { item: any; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  if (!item) return null;
  const statusColor = STATUS_COLORS[item.status] || Colors.primary;

  const rows = [
    { label: "Latest Feedback", value: item.latest_feedback },
    { label: "Comments", value: item.feedback_comments },
    { label: "FOS Agent", value: item.agent_name },
    { label: "Status", value: item.status },
    { label: "Customer Name", value: item.customer_name },
    { label: "Loan No", value: item.loan_no },
    { label: "BKT", value: item.bkt },
    { label: "APP ID", value: item.app_id },
    { label: "Address", value: item.address },
    { label: "Mobile No", value: item.mobile_no, phone: true },
    { label: "Ref Address", value: item.reference_address },
    { label: "POS", value: fmt(item.pos, "₹") },
    { label: "EMI", value: fmt(item.emi_amount, "₹") },
    { label: "EMI Due", value: fmt(item.emi_due, "₹") },
    { label: "CBC", value: fmt(item.cbc, "₹") },
    { label: "LPP", value: fmt(item.lpp, "₹") },
    { label: "CBC + LPP", value: fmt(item.cbc_lpp, "₹") },
    { label: "Rollback", value: fmt(item.rollback, "₹") },
    { label: "Clearance", value: fmt(item.clearance, "₹") },
    { label: "Tenor", value: item.tenor },
    { label: "Product", value: item.pro },
    { label: "Asset Name", value: item.asset_make },
    { label: "Reg No", value: item.registration_no },
    { label: "Engine No", value: item.engine_no },
    { label: "Chassis No", value: item.chassis_no },
    { label: "First EMI Date", value: item.first_emi_due_date },
    { label: "Maturity Date", value: item.loan_maturity_date },
  ];

  return (
    <Modal visible={!!item} transparent={false} animationType="slide" onRequestClose={onClose}>
      <View style={[detailStyles.screen, { paddingTop: insets.top }]}>
        <View style={[detailStyles.header, { backgroundColor: statusColor }]}>
          <Pressable onPress={onClose} style={detailStyles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          <Text style={detailStyles.headerTitle}>Details</Text>
          <View style={detailStyles.statusPill}>
            <Text style={[detailStyles.statusPillText, { color: statusColor }]}>{item.status}</Text>
          </View>
        </View>
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {rows.map((r, i) => (
            <TableRow key={r.label} label={r.label} value={r.value} phone={r.phone} even={i % 2 === 1} />
          ))}
          <View style={{ height: insets.bottom + 24 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

export function CaseCard({ item, onDetails }: { item: any; onDetails: (item: any) => void }) {
  const call = () => {
    const phones = item.mobile_no?.split(",") || [];
    const num = phones[0]?.trim();
    if (!num) { Alert.alert("No number available"); return; }
    Linking.openURL(`tel:${num}`);
  };

  const statusColor = STATUS_COLORS[item.status] || Colors.textMuted;

  return (
    <View style={cardStyles.card}>
      <Pressable style={cardStyles.cardTapArea} onPress={() => onDetails(item)}>
        <View style={cardStyles.cardHeader}>
          <View style={cardStyles.cardNameRow}>
            <Ionicons name="person-circle" size={20} color={Colors.primary} />
            <Text style={cardStyles.cardName} numberOfLines={1}>{item.customer_name}</Text>
          </View>
          <View style={[cardStyles.statusBadge, { backgroundColor: statusColor + "22" }]}>
            <Text style={[cardStyles.statusText, { color: statusColor }]}>{item.status}</Text>
          </View>
        </View>

        {item.agent_name ? (
          <View style={cardStyles.agentRow}>
            <Ionicons name="person" size={12} color={Colors.primary} />
            <Text style={cardStyles.agentName}>{item.agent_name}</Text>
          </View>
        ) : null}

        {/* Row 1: Loan No + APP ID + BKT */}
        <View style={cardStyles.infoRow}>
          <View style={cardStyles.infoCell}>
            <Text style={cardStyles.infoLabel}>LOAN NO</Text>
            <Text style={cardStyles.infoValue} numberOfLines={1}>{item.loan_no || "—"}</Text>
          </View>
          <View style={cardStyles.infoCell}>
            <Text style={cardStyles.infoLabel}>APP ID</Text>
            <Text style={cardStyles.infoValue} numberOfLines={1}>{item.app_id || "—"}</Text>
          </View>
          <View style={cardStyles.infoCellSmall}>
            <Text style={cardStyles.infoLabel}>BKT</Text>
            <Text style={[cardStyles.infoValue, { color: Colors.primary }]}>{item.bkt ?? "—"}</Text>
          </View>
        </View>

        {/* Row 2: EMI + EMI Due + POS */}
        <View style={cardStyles.infoRow}>
          <View style={cardStyles.infoCell}>
            <Text style={cardStyles.infoLabel}>EMI</Text>
            <Text style={cardStyles.infoValue}>{fmt(item.emi_amount, "₹")}</Text>
          </View>
          <View style={cardStyles.infoCell}>
            <Text style={cardStyles.infoLabel}>EMI DUE</Text>
            <Text style={[cardStyles.infoValue, { color: Colors.danger }]}>{fmt(item.emi_due, "₹")}</Text>
          </View>
          <View style={cardStyles.infoCell}>
            <Text style={cardStyles.infoLabel}>POS</Text>
            <Text style={cardStyles.infoValue}>{fmt(item.pos, "₹")}</Text>
          </View>
        </View>

        {/* Row 3: CBC + LPP + CBC+LPP */}
        <View style={cardStyles.infoRow}>
          <View style={cardStyles.infoCell}>
            <Text style={cardStyles.infoLabel}>CBC</Text>
            <Text style={cardStyles.infoValue}>{fmt(item.cbc, "₹")}</Text>
          </View>
          <View style={cardStyles.infoCell}>
            <Text style={cardStyles.infoLabel}>LPP</Text>
            <Text style={cardStyles.infoValue}>{fmt(item.lpp, "₹")}</Text>
          </View>
          <View style={cardStyles.infoCell}>
            <Text style={cardStyles.infoLabel}>CBC+LPP</Text>
            <Text style={[cardStyles.infoValue, { color: Colors.warning }]}>{fmt(item.cbc_lpp, "₹")}</Text>
          </View>
        </View>

        {/* Row 4: Rollback + Clearance + Tenor */}
        <View style={cardStyles.infoRow}>
          <View style={cardStyles.infoCell}>
            <Text style={cardStyles.infoLabel}>ROLLBACK</Text>
            <Text style={cardStyles.infoValue}>{fmt(item.rollback, "₹")}</Text>
          </View>
          <View style={cardStyles.infoCell}>
            <Text style={cardStyles.infoLabel}>CLEARANCE</Text>
            <Text style={[cardStyles.infoValue, { color: Colors.success }]}>{fmt(item.clearance, "₹")}</Text>
          </View>
          <View style={cardStyles.infoCellSmall}>
            <Text style={cardStyles.infoLabel}>TEN</Text>
            <Text style={cardStyles.infoValue}>{item.tenor ?? "—"}</Text>
          </View>
        </View>
      </Pressable>

      {item.mobile_no ? (
        <Pressable style={cardStyles.phoneRow} onPress={call}>
          <Ionicons name="call" size={14} color={Colors.info} />
          <Text style={cardStyles.phoneText}>{item.mobile_no}</Text>
        </Pressable>
      ) : null}

      {item.latest_feedback ? (
        <View style={cardStyles.feedbackRow}>
          <Text style={cardStyles.feedbackLabel}>Detail FB: </Text>
          <Text style={cardStyles.feedbackValue}>{item.latest_feedback}</Text>
        </View>
      ) : null}

      <View style={cardStyles.cardActions}>
        <Pressable style={[cardStyles.actionBtn, cardStyles.callBtn]} onPress={call}>
          <Ionicons name="call" size={16} color="#fff" />
          <Text style={cardStyles.actionBtnText}>Call</Text>
        </Pressable>
        <Pressable style={[cardStyles.actionBtn, cardStyles.detailBtn]} onPress={() => onDetails(item)}>
          <Ionicons name="eye" size={16} color={Colors.primary} />
          <Text style={[cardStyles.actionBtnText, { color: Colors.primary }]}>Details</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function StatBox({
  label, count, color, active, onPress,
}: { label: string; count: number; color: string; active: boolean; onPress?: () => void }) {
  const Wrapper: any = onPress ? Pressable : View;
  return (
    <Wrapper
      onPress={onPress}
      style={[
        cardStyles.statBox,
        { borderColor: active ? color : Colors.border },
        active && { backgroundColor: color + "18" },
      ]}
    >
      <Text style={[cardStyles.statCount, { color }]}>{count}</Text>
      <Text style={cardStyles.statLabel} numberOfLines={1}>{label}</Text>
    </Wrapper>
  );
}

const cardStyles = StyleSheet.create({
  statBox: {
    flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 10,
    borderRadius: 12, borderWidth: 1.5, backgroundColor: Colors.surface, gap: 2,
  },
  statCount: { fontSize: 18, fontWeight: "800" },
  statLabel: { fontSize: 10, fontWeight: "700", color: Colors.textSecondary, textTransform: "uppercase" },
  card: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 14, gap: 8,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  cardTapArea: { gap: 8 },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardNameRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  cardName: { flex: 1, fontSize: 15, fontWeight: "700", color: Colors.text, textTransform: "uppercase" },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: "700" },
  agentRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: -2 },
  agentName: { fontSize: 12, color: Colors.primary, fontWeight: "600" },
  infoRow: { flexDirection: "row", gap: 6 },
  infoCell: { flex: 1, backgroundColor: Colors.surfaceAlt, borderRadius: 8, padding: 8 },
  infoCellSmall: { width: 52, backgroundColor: Colors.surfaceAlt, borderRadius: 8, padding: 8 },
  infoLabel: { fontSize: 9, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase", marginBottom: 2 },
  infoValue: { fontSize: 12, fontWeight: "700", color: Colors.text },
  phoneRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 },
  phoneText: { fontSize: 13, color: Colors.info, fontWeight: "500" },
  feedbackRow: { flexDirection: "row", alignItems: "center" },
  feedbackLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: "600" },
  feedbackValue: { fontSize: 12, color: Colors.text, fontWeight: "500" },
  cardActions: { flexDirection: "row", gap: 8, marginTop: 4 },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 10, borderRadius: 10, gap: 5,
  },
  callBtn: { backgroundColor: Colors.primary },
  detailBtn: { backgroundColor: Colors.primary + "15", borderWidth: 1, borderColor: Colors.primary + "40" },
  actionBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
});

const detailStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 14, gap: 10,
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "700", color: Colors.text },
  statusPill: {
    backgroundColor: Colors.surfaceElevated, borderRadius: 16,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  statusPillText: { fontSize: 11, fontWeight: "800" },
  row: {
    flexDirection: "row", borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.surface,
  },
  labelCell: {
    width: "42%", backgroundColor: Colors.surfaceAlt, padding: 12,
    justifyContent: "center", borderRightWidth: 1, borderRightColor: Colors.border,
  },
  labelText: { fontSize: 13, fontWeight: "700", color: Colors.primary },
  valueCell: { flex: 1, padding: 12, justifyContent: "center" },
  valueText: { fontSize: 13, color: Colors.text, fontWeight: "400" },
});

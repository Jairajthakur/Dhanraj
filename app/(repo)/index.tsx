import React, { useState, useMemo } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput,
  Linking, Alert, ActivityIndicator, Modal, ScrollView, Platform
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";

const STATUS_COLORS: Record<string, string> = {
  Unpaid: Colors.statusUnpaid,
  PTP: Colors.statusPTP,
  Paid: Colors.statusPaid,
};

function fmt(v: any, prefix = "") {
  if (v === null || v === undefined || v === "") return "";
  const n = parseFloat(v);
  if (!isNaN(n) && prefix) return prefix + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return String(v);
}

function TableRow({ label, value, phone, even }: { label: string; value?: any; phone?: boolean; even?: boolean }) {
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

function CaseDetailModal({ item, onClose }: { item: any; onClose: () => void }) {
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

function CaseCard({ item, onDetails }: { item: any; onDetails: (item: any) => void }) {
  const call = () => {
    const phones = item.mobile_no?.split(",") || [];
    const num = phones[0]?.trim();
    if (!num) { Alert.alert("No number available"); return; }
    Linking.openURL(`tel:${num}`);
  };

  const statusColor = STATUS_COLORS[item.status] || Colors.textMuted;

  return (
    <View style={styles.card}>
      <Pressable style={styles.cardTapArea} onPress={() => onDetails(item)}>
        <View style={styles.cardHeader}>
          <View style={styles.cardNameRow}>
            <Ionicons name="person-circle" size={20} color={Colors.primary} />
            <Text style={styles.cardName} numberOfLines={1}>{item.customer_name}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + "22" }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{item.status}</Text>
          </View>
        </View>

        {item.agent_name ? (
          <View style={styles.agentRow}>
            <Ionicons name="person" size={12} color={Colors.primary} />
            <Text style={styles.agentName}>{item.agent_name}</Text>
          </View>
        ) : null}

        {/* Row 1: Loan No + APP ID + BKT */}
        <View style={styles.infoRow}>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>LOAN NO</Text>
            <Text style={styles.infoValue} numberOfLines={1}>{item.loan_no || "—"}</Text>
          </View>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>APP ID</Text>
            <Text style={styles.infoValue} numberOfLines={1}>{item.app_id || "—"}</Text>
          </View>
          <View style={styles.infoCellSmall}>
            <Text style={styles.infoLabel}>BKT</Text>
            <Text style={[styles.infoValue, { color: Colors.primary }]}>{item.bkt ?? "—"}</Text>
          </View>
        </View>

        {/* Row 2: EMI + EMI Due + POS */}
        <View style={styles.infoRow}>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>EMI</Text>
            <Text style={styles.infoValue}>{fmt(item.emi_amount, "₹")}</Text>
          </View>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>EMI DUE</Text>
            <Text style={[styles.infoValue, { color: Colors.danger }]}>{fmt(item.emi_due, "₹")}</Text>
          </View>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>POS</Text>
            <Text style={styles.infoValue}>{fmt(item.pos, "₹")}</Text>
          </View>
        </View>

        {/* Row 3: CBC + LPP + CBC+LPP */}
        <View style={styles.infoRow}>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>CBC</Text>
            <Text style={styles.infoValue}>{fmt(item.cbc, "₹")}</Text>
          </View>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>LPP</Text>
            <Text style={styles.infoValue}>{fmt(item.lpp, "₹")}</Text>
          </View>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>CBC+LPP</Text>
            <Text style={[styles.infoValue, { color: Colors.warning }]}>{fmt(item.cbc_lpp, "₹")}</Text>
          </View>
        </View>

        {/* Row 4: Rollback + Clearance + Tenor */}
        <View style={styles.infoRow}>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>ROLLBACK</Text>
            <Text style={styles.infoValue}>{fmt(item.rollback, "₹")}</Text>
          </View>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>CLEARANCE</Text>
            <Text style={[styles.infoValue, { color: Colors.success }]}>{fmt(item.clearance, "₹")}</Text>
          </View>
          <View style={styles.infoCellSmall}>
            <Text style={styles.infoLabel}>TEN</Text>
            <Text style={styles.infoValue}>{item.tenor ?? "—"}</Text>
          </View>
        </View>
      </Pressable>

      {item.mobile_no ? (
        <Pressable style={styles.phoneRow} onPress={call}>
          <Ionicons name="call" size={14} color={Colors.info} />
          <Text style={styles.phoneText}>{item.mobile_no}</Text>
        </Pressable>
      ) : null}

      {item.latest_feedback ? (
        <View style={styles.feedbackRow}>
          <Text style={styles.feedbackLabel}>Detail FB: </Text>
          <Text style={styles.feedbackValue}>{item.latest_feedback}</Text>
        </View>
      ) : null}

      <View style={styles.cardActions}>
        <Pressable style={[styles.actionBtn, styles.callBtn]} onPress={call}>
          <Ionicons name="call" size={16} color="#fff" />
          <Text style={styles.actionBtnText}>Call</Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, styles.detailBtn]} onPress={() => onDetails(item)}>
          <Ionicons name="eye" size={16} color={Colors.primary} />
          <Text style={[styles.actionBtnText, { color: Colors.primary }]}>Details</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function RepoAllCasesScreen() {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [selectedCase, setSelectedCase] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/repo/cases"],
    queryFn: () => api.repo.getCases(),
  });

  const filtered = useMemo(() => {
    const cases = data?.cases || [];
    if (!search) return cases;
    const q = search.toLowerCase();
    return cases.filter((c: any) =>
      c.customer_name?.toLowerCase().includes(q) ||
      c.loan_no?.toLowerCase().includes(q) ||
      c.app_id?.toLowerCase().includes(q) ||
      c.registration_no?.toLowerCase().includes(q) ||
      c.agent_name?.toLowerCase().includes(q)
    );
  }, [data, search]);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={[styles.searchContainer, { marginTop: Platform.OS === "web" ? 67 : 12 }]}>
        <Ionicons name="search" size={18} color={Colors.textMuted} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search name, loan no, app id, reg no, agent..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <Pressable onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <CaseCard item={item} onDetails={setSelectedCase} />}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + 24 },
            filtered.length === 0 && { flex: 1 },
          ]}
          ListHeaderComponent={
            <Text style={styles.countText}>{filtered.length} allocation{filtered.length !== 1 ? "s" : ""}</Text>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No allocations found</Text>
            </View>
          }
          scrollEnabled={!!filtered.length}
        />
      )}

      <CaseDetailModal item={selectedCase} onClose={() => setSelectedCase(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  searchContainer: {
    flexDirection: "row", alignItems: "center", margin: 12,
    backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.text },
  list: { padding: 12, gap: 12 },
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
  countText: { fontSize: 13, color: Colors.textSecondary, fontWeight: "600", marginBottom: 4 },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText: { fontSize: 16, color: Colors.textMuted },
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

import React, { useState, useMemo } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput,
  ActivityIndicator, Modal, ScrollView, Linking, Platform
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

export default function AllCasesScreen() {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedCase, setSelectedCase] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/admin/cases"],
    queryFn: () => api.admin.getCases(),
  });

  const filtered = useMemo(() => {
    const cases = data?.cases || [];
    const q = search.toLowerCase().trim();
    return cases.filter((c: any) => {
      const matchStatus = statusFilter === "All" || c.status === statusFilter;
      const matchSearch = !q ||
        c.registration_no?.toLowerCase().includes(q) ||
        c.app_id?.toLowerCase().includes(q) ||
        c.loan_no?.toLowerCase().includes(q) ||
        c.customer_name?.toLowerCase().includes(q) ||
        c.agent_name?.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [data, search, statusFilter]);

  const FILTERS = ["All", "Unpaid", "PTP", "Paid"];

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={[styles.filterBar, { paddingTop: Platform.OS === "web" ? 67 : 12 }]}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={Colors.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by Reg No, App ID, Loan No..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />
          {search ? (
            <Pressable onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.filters}>
            {FILTERS.map((f) => (
              <Pressable
                key={f}
                style={[
                  styles.filterChip,
                  statusFilter === f && {
                    backgroundColor: f === "All" ? Colors.primary : STATUS_COLORS[f],
                    borderColor: "transparent",
                  },
                ]}
                onPress={() => setStatusFilter(f)}
              >
                <Text style={[styles.filterChipText, statusFilter === f && { color: "#fff" }]}>{f}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + 24 },
            !filtered.length && { flex: 1 },
          ]}
          ListHeaderComponent={
            <Text style={styles.count}>{filtered.length} case{filtered.length !== 1 ? "s" : ""}</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.customerName} numberOfLines={1}>{item.customer_name}</Text>
                <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[item.status] || Colors.textMuted) + "22" }]}>
                  <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] || Colors.textSecondary }]}>{item.status}</Text>
                </View>
              </View>

              <View style={styles.tagRow}>
                {item.loan_no ? (
                  <View style={styles.tag}>
                    <Text style={styles.tagLabel}>LOAN</Text>
                    <Text style={styles.tagValue}>{item.loan_no}</Text>
                  </View>
                ) : null}
                {item.app_id ? (
                  <View style={styles.tag}>
                    <Text style={styles.tagLabel}>APP ID</Text>
                    <Text style={styles.tagValue}>{item.app_id}</Text>
                  </View>
                ) : null}
                {item.bkt != null ? (
                  <View style={[styles.tag, { backgroundColor: Colors.primary + "15" }]}>
                    <Text style={styles.tagLabel}>BKT</Text>
                    <Text style={[styles.tagValue, { color: Colors.primary }]}>{item.bkt}</Text>
                  </View>
                ) : null}
              </View>

              {item.registration_no ? (
                <Text style={styles.regNo}>Reg: {item.registration_no}</Text>
              ) : null}

              {item.agent_name ? (
                <Text style={styles.agentTagText}>{item.agent_name}</Text>
              ) : null}

              {item.latest_feedback ? (
                <Text style={styles.feedback} numberOfLines={1}>{item.latest_feedback}</Text>
              ) : null}

              <Pressable
                style={styles.viewDetail}
                onPress={() => setSelectedCase(item)}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={`View details for ${item.customer_name}`}
                testID="view-case-details"
              >
                <Text style={styles.viewDetailText}>View Full Details</Text>
                <Text style={[styles.viewDetailText, { fontSize: 14 }]}>›</Text>
              </Pressable>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>
                {search ? `No cases matching "${search}"` : "No cases found"}
              </Text>
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
  filterBar: {
    backgroundColor: Colors.surface, padding: 12, gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  searchBox: {
    flexDirection: "row", alignItems: "center", backgroundColor: Colors.surfaceAlt,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.text },
  filters: { flexDirection: "row", gap: 8 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border,
  },
  filterChipText: { fontSize: 12, fontWeight: "600", color: Colors.textSecondary },
  count: { fontSize: 13, color: Colors.textSecondary, marginBottom: 8, fontWeight: "600" },
  list: { padding: 12, gap: 10 },
  card: {
    backgroundColor: Colors.surface, borderRadius: 14, padding: 14, gap: 8,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  customerName: { flex: 1, fontSize: 14, fontWeight: "700", color: Colors.text, textTransform: "uppercase", marginRight: 8 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: "700" },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: Colors.surfaceAlt, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
  },
  tagLabel: { fontSize: 9, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase" },
  tagValue: { fontSize: 11, fontWeight: "700", color: Colors.text },
  regNo: { fontSize: 12, color: Colors.textSecondary },
  regNoLabel: { fontWeight: "700", color: Colors.textMuted },
  agentTagText: { fontSize: 12, fontWeight: "600", color: Colors.primary },
  feedback: { fontSize: 12, color: Colors.textSecondary, fontStyle: "italic" },
  viewDetail: { flexDirection: "row", alignItems: "center", gap: 4, justifyContent: "flex-end", marginTop: 2 },
  viewDetailText: { fontSize: 11, color: Colors.primary, fontWeight: "600" },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText: { fontSize: 15, color: Colors.textMuted, textAlign: "center" },
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

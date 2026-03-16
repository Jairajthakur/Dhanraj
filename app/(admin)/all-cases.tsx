import React, { useState, useMemo } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput,
  ActivityIndicator, Modal, ScrollView, Linking, Platform, Alert
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";
import { getApiUrl } from "@/lib/query-client";
import { fetch as expoFetch } from "expo/fetch";

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
          <Text style={detailStyles.valueText}>{display || "—"}</Text>
        )}
      </View>
    </View>
  );
}

function CaseDetailModal({ item, onClose, onResetCase }: { item: any; onClose: () => void; onResetCase: (id: number) => void }) {
  const insets = useSafeAreaInsets();
  const [resetting, setResetting] = useState(false);
  if (!item) return null;
  const statusColor = STATUS_COLORS[item.status] || Colors.primary;

  const rows = [
    // ✅ Feedback section first
    { label: "Feedback Code",     value: item.feedback_code },
    { label: "Detail Feedback",   value: item.latest_feedback },
    { label: "Comments",          value: item.feedback_comments },
    { label: "Customer Avail.",   value: item.customer_available === true ? "Y" : item.customer_available === false ? "N" : "" },
    { label: "Vehicle Avail.",    value: item.vehicle_available === true ? "Y" : item.vehicle_available === false ? "N" : "" },
    { label: "Third Party",       value: item.third_party === true ? "Y" : item.third_party === false ? "N" : "" },
    // ✅ Third party name/number shown only if third party = Y
    ...(item.third_party === true ? [
      { label: "Third Party Name",   value: item.third_party_name },
      { label: "Third Party Number", value: item.third_party_number, phone: true },
    ] : []),
    { label: "Projection",        value: item.projection },
    { label: "Non Starter",       value: item.non_starter === true ? "Y" : item.non_starter === false ? "N" : "" },
    { label: "KYC Purchase",      value: item.kyc_purchase === true ? "Y" : item.kyc_purchase === false ? "N" : "" },
    { label: "Workable",          value: item.workable === true ? "Workable" : item.workable === false ? "Non Workable" : "" },
    { label: "PTP Date",          value: item.ptp_date ? String(item.ptp_date).slice(0, 10) : "" },
    // Case info
    { label: "FOS Agent",         value: item.agent_name },
    { label: "Status",            value: item.status },
    { label: "Customer Name",     value: item.customer_name },
    { label: "Loan No",           value: item.loan_no },
    { label: "BKT",               value: item.bkt },
    { label: "APP ID",            value: item.app_id },
    { label: "Address",           value: item.address },
    { label: "Mobile No",         value: item.mobile_no, phone: true },
    { label: "Ref Address",       value: item.reference_address },
    { label: "POS",               value: fmt(item.pos, "₹") },
    { label: "EMI",               value: fmt(item.emi_amount, "₹") },
    { label: "EMI Due",           value: fmt(item.emi_due, "₹") },
    { label: "CBC",               value: fmt(item.cbc, "₹") },
    { label: "LPP",               value: fmt(item.lpp, "₹") },
    { label: "CBC + LPP",         value: fmt(item.cbc_lpp, "₹") },
    { label: "Rollback",          value: fmt(item.rollback, "₹") },
    { label: "Clearance",         value: fmt(item.clearance, "₹") },
    { label: "Tenor",             value: item.tenor },
    { label: "Product",           value: item.pro },
    { label: "Asset Make",        value: item.asset_make },
    { label: "Reg No",            value: item.registration_no },
    { label: "Engine No",         value: item.engine_no },
    { label: "Chassis No",        value: item.chassis_no },
    { label: "First EMI Date",    value: item.first_emi_due_date },
    { label: "Maturity Date",     value: item.loan_maturity_date },
  ];

  const handleResetCase = () => {
    Alert.alert(
      "Reset Feedback",
      `Reset feedback for ${item.customer_name}? FOS will be able to give feedback again. Status will be set to Unpaid.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset", style: "destructive",
          onPress: async () => {
            setResetting(true);
            try {
              await onResetCase(item.id);
              onClose();
            } finally {
              setResetting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal visible={!!item} transparent={false} animationType="slide" onRequestClose={onClose}>
      <View style={[detailStyles.screen, { paddingTop: insets.top }]}>
        <View style={[detailStyles.header, { backgroundColor: statusColor }]}>
          <Pressable onPress={onClose} style={detailStyles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          <Text style={detailStyles.headerTitle}>Case Details</Text>
          <View style={detailStyles.statusPill}>
            <Text style={[detailStyles.statusPillText, { color: statusColor }]}>{item.status}</Text>
          </View>
        </View>

        {/* ✅ Reset feedback button at top of detail */}
        {item.latest_feedback || item.feedback_code ? (
          <Pressable
            style={[detailStyles.resetCaseBtn, resetting && { opacity: 0.6 }]}
            onPress={handleResetCase}
            disabled={resetting}
          >
            {resetting
              ? <ActivityIndicator size="small" color={Colors.danger} />
              : <Ionicons name="refresh" size={16} color={Colors.danger} />}
            <Text style={detailStyles.resetCaseBtnText}>
              {resetting ? "Resetting..." : "Reset Feedback — Allow FOS to re-submit"}
            </Text>
          </Pressable>
        ) : (
          <View style={detailStyles.noFeedbackBanner}>
            <Ionicons name="information-circle-outline" size={15} color={Colors.textMuted} />
            <Text style={detailStyles.noFeedbackText}>No feedback given yet</Text>
          </View>
        )}

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
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedCase, setSelectedCase] = useState<any>(null);
  const [resettingAgent, setResettingAgent] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/admin/cases"],
    queryFn: () => api.admin.getCases(),
  });

  const { data: agentsData } = useQuery({
    queryKey: ["/api/admin/agents"],
    queryFn: () => api.admin.getAgents(),
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

  // ✅ Group cases by agent for reset-per-agent feature
  const agentGroups = useMemo(() => {
    const cases = data?.cases || [];
    const groups: Record<string, { agentId: number; agentName: string; count: number; feedbackCount: number }> = {};
    for (const c of cases) {
      const name = c.agent_name || "Unassigned";
      const id = c.agent_id || 0;
      if (!groups[name]) groups[name] = { agentId: id, agentName: name, count: 0, feedbackCount: 0 };
      groups[name].count++;
      if (c.latest_feedback || c.feedback_code) groups[name].feedbackCount++;
    }
    return Object.values(groups).sort((a, b) => a.agentName.localeCompare(b.agentName));
  }, [data]);

  // ✅ Reset all feedback for an agent
  const handleResetAgentFeedback = (agentId: number, agentName: string) => {
    Alert.alert(
      "Reset Agent Feedback",
      `Reset ALL feedback for ${agentName}? This will allow them to re-submit feedback for all their cases. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset All", style: "destructive",
          onPress: async () => {
            setResettingAgent(agentId);
            try {
              const url = new URL(`/api/admin/reset-feedback/agent/${agentId}`, getApiUrl()).toString();
              const res = await expoFetch(url, { method: "POST", credentials: "include" });
              const json: any = await res.json();
              if (!res.ok) throw new Error(json.message || "Reset failed");
              qc.invalidateQueries({ queryKey: ["/api/admin/cases"] });
              Alert.alert("Done", `All feedback reset for ${agentName}`);
            } catch (e: any) {
              Alert.alert("Error", e.message);
            } finally {
              setResettingAgent(null);
            }
          },
        },
      ]
    );
  };

  // ✅ Reset feedback for a single case
  const handleResetCase = async (caseId: number) => {
    try {
      const url = new URL(`/api/admin/reset-feedback/case/${caseId}`, getApiUrl()).toString();
      const res = await expoFetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: "loan" }),
      });
      const json: any = await res.json();
      if (!res.ok) throw new Error(json.message || "Reset failed");
      qc.invalidateQueries({ queryKey: ["/api/admin/cases"] });
      Alert.alert("Done", "Feedback reset. FOS can now re-submit.");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  const FILTERS = ["All", "Unpaid", "PTP", "Paid"];

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={[styles.filterBar, { paddingTop: Platform.OS === "web" ? 67 : 12 }]}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={Colors.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by Reg No, App ID, Loan No, Agent..."
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
            <View style={{ gap: 12, marginBottom: 4 }}>
              <Text style={styles.count}>{filtered.length} case{filtered.length !== 1 ? "s" : ""}</Text>

              {/* ✅ Reset Feedback Per Agent Panel */}
              {agentGroups.length > 0 && (
                <View style={styles.resetPanel}>
                  <View style={styles.resetPanelHeader}>
                    <Ionicons name="refresh-circle" size={18} color={Colors.danger} />
                    <Text style={styles.resetPanelTitle}>Reset FOS Feedback</Text>
                  </View>
                  <Text style={styles.resetPanelSub}>Tap an agent to reset all their feedback so they can re-submit</Text>
                  {agentGroups.map((ag) => (
                    <View key={ag.agentId} style={styles.agentResetRow}>
                      <View style={styles.agentResetInfo}>
                        <Text style={styles.agentResetName}>{ag.agentName}</Text>
                        <Text style={styles.agentResetCount}>
                          {ag.feedbackCount}/{ag.count} feedback given
                        </Text>
                      </View>
                      {ag.feedbackCount > 0 ? (
                        <Pressable
                          style={[
                            styles.resetBtn,
                            resettingAgent === ag.agentId && { opacity: 0.5 },
                          ]}
                          onPress={() => handleResetAgentFeedback(ag.agentId, ag.agentName)}
                          disabled={resettingAgent === ag.agentId}
                        >
                          {resettingAgent === ag.agentId
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <>
                                <Ionicons name="refresh" size={13} color="#fff" />
                                <Text style={styles.resetBtnText}>Reset All</Text>
                              </>
                          }
                        </Pressable>
                      ) : (
                        <View style={styles.noFeedbackBadge}>
                          <Text style={styles.noFeedbackBadgeText}>No feedback</Text>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>
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

              {/* ✅ Show feedback summary on card */}
              {item.feedback_code || item.latest_feedback ? (
                <View style={styles.feedbackRow}>
                  {item.feedback_code ? (
                    <View style={styles.feedbackCodeBadge}>
                      <Text style={styles.feedbackCodeText}>{item.feedback_code}</Text>
                    </View>
                  ) : null}
                  {item.latest_feedback ? (
                    <Text style={styles.feedback} numberOfLines={1}>{item.latest_feedback}</Text>
                  ) : null}
                </View>
              ) : null}

              {/* ✅ Third party info on card if applicable */}
              {item.third_party === true && item.third_party_name ? (
                <Text style={styles.thirdPartyText}>
                  <Text style={{ fontWeight: "700" }}>3P: </Text>
                  {item.third_party_name}
                  {item.third_party_number ? ` · ${item.third_party_number}` : ""}
                </Text>
              ) : null}

              <View style={styles.cardActions}>
                <Pressable
                  style={styles.viewDetail}
                  onPress={() => setSelectedCase(item)}
                >
                  <Ionicons name="eye-outline" size={14} color={Colors.primary} />
                  <Text style={styles.viewDetailText}>View Details</Text>
                </Pressable>
              </View>
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

      <CaseDetailModal
        item={selectedCase}
        onClose={() => setSelectedCase(null)}
        onResetCase={handleResetCase}
      />
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
  count: { fontSize: 13, color: Colors.textSecondary, fontWeight: "600" },
  list: { padding: 12, gap: 10 },

  // ✅ Reset panel styles
  resetPanel: {
    backgroundColor: Colors.surface, borderRadius: 14, padding: 14, gap: 10,
    borderWidth: 1, borderColor: Colors.danger + "30",
  },
  resetPanelHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  resetPanelTitle: { fontSize: 14, fontWeight: "700", color: Colors.danger },
  resetPanelSub: { fontSize: 12, color: Colors.textSecondary },
  agentResetRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border,
  },
  agentResetInfo: { flex: 1 },
  agentResetName: { fontSize: 13, fontWeight: "700", color: Colors.text },
  agentResetCount: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  resetBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: Colors.danger, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  resetBtnText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  noFeedbackBadge: {
    backgroundColor: Colors.surfaceAlt, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  noFeedbackBadgeText: { fontSize: 11, color: Colors.textMuted, fontWeight: "600" },

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
  agentTagText: { fontSize: 12, fontWeight: "600", color: Colors.primary },
  feedbackRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  feedbackCodeBadge: {
    backgroundColor: Colors.accent + "20", borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  feedbackCodeText: { fontSize: 11, fontWeight: "700", color: Colors.accent },
  feedback: { flex: 1, fontSize: 12, color: Colors.textSecondary, fontStyle: "italic" },
  thirdPartyText: { fontSize: 12, color: Colors.warning },
  cardActions: { flexDirection: "row", justifyContent: "flex-end", marginTop: 2 },
  viewDetail: { flexDirection: "row", alignItems: "center", gap: 4 },
  viewDetailText: { fontSize: 11, color: Colors.primary, fontWeight: "600" },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText: { fontSize: 15, color: Colors.textMuted, textAlign: "center" },
});

const detailStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 14, gap: 10,
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "700", color: "#fff" },
  statusPill: {
    backgroundColor: "rgba(255,255,255,0.9)", borderRadius: 16,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  statusPillText: { fontSize: 11, fontWeight: "800" },
  resetCaseBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.danger + "12", borderBottomWidth: 1,
    borderBottomColor: Colors.danger + "30", paddingHorizontal: 16, paddingVertical: 12,
  },
  resetCaseBtnText: { fontSize: 13, fontWeight: "700", color: Colors.danger },
  noFeedbackBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.surfaceAlt, borderBottomWidth: 1,
    borderBottomColor: Colors.border, paddingHorizontal: 16, paddingVertical: 10,
  },
  noFeedbackText: { fontSize: 12, color: Colors.textMuted },
  row: {
    flexDirection: "row", borderBottomWidth: 1,
    borderBottomColor: Colors.border, backgroundColor: Colors.surface,
  },
  labelCell: {
    width: "42%", backgroundColor: Colors.surfaceAlt, padding: 12,
    justifyContent: "center", borderRightWidth: 1, borderRightColor: Colors.border,
  },
  labelText: { fontSize: 13, fontWeight: "700", color: Colors.primary },
  valueCell: { flex: 1, padding: 12, justifyContent: "center" },
  valueText: { fontSize: 13, color: Colors.text, fontWeight: "400" },
});

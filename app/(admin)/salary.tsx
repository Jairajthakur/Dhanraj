import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const CUR_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => String(CUR_YEAR - i));

function AddSalaryModal({ visible, agents, onClose, onSave }: any) {
  const [agentId, setAgentId] = useState("");
  const [month, setMonth]   = useState(MONTHS[new Date().getMonth()]);
  const [year, setYear]     = useState(String(CUR_YEAR));
  const [presentDays, setPresentDays]   = useState("26");
  const [paymentAmount, setPaymentAmount] = useState("0");
  const [incentive, setIncentive]   = useState("0");
  const [petrol, setPetrol]         = useState("0");
  const [mobile, setMobile]         = useState("0");
  const [advance, setAdvance]       = useState("0");
  const [otherDed, setOtherDed]     = useState("0");
  const [loading, setLoading] = useState(false);

  const n = (v: string) => parseFloat(v) || 0;
  const gross = n(paymentAmount) + n(incentive) + n(petrol) + n(mobile);
  const net   = gross - n(advance) - n(otherDed);

  const reset = () => {
    setAgentId(""); setMonth(MONTHS[new Date().getMonth()]);
    setYear(String(CUR_YEAR)); setPresentDays("26");
    setPaymentAmount("0"); setIncentive("0"); setPetrol("0");
    setMobile("0"); setAdvance("0"); setOtherDed("0");
  };

  const save = async () => {
    if (!agentId) { Alert.alert("Error", "Please select an agent"); return; }
    setLoading(true);
    try {
      await api.admin.createSalary({
        agentId: parseInt(agentId),
        month,
        year: parseInt(year),
        presentDays: parseInt(presentDays),
        paymentAmount: n(paymentAmount),
        incentiveAmount: n(incentive),
        petrolExpense: n(petrol),
        mobileExpense: n(mobile),
        grossPayment: gross,
        advance: n(advance),
        otherDeductions: n(otherDed),
        netSalary: net,
      });
      reset();
      onSave();
      onClose();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  const fields = [
    { label: "Payment Amount (₹)",    val: paymentAmount, set: setPaymentAmount },
    { label: "Incentive (₹)",         val: incentive,     set: setIncentive     },
    { label: "Petrol Expense (₹)",    val: petrol,        set: setPetrol        },
    { label: "Mobile Expense (₹)",    val: mobile,        set: setMobile        },
    { label: "Advance Deduction (₹)", val: advance,       set: setAdvance       },
    { label: "Other Deductions (₹)",  val: otherDed,      set: setOtherDed      },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { reset(); onClose(); }}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }}>
        <ScrollView
          style={styles.sheet}
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Add Salary Record</Text>

          {/* Agent */}
          <Text style={styles.fieldLabel}>Select Agent</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(agents || []).map((a: any) => (
                <Pressable
                  key={a.id}
                  style={[styles.chip, agentId === String(a.id) && styles.chipActive]}
                  onPress={() => setAgentId(String(a.id))}
                >
                  <Text style={[styles.chipText, agentId === String(a.id) && { color: "#fff" }]} numberOfLines={1}>
                    {a.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          {/* Month */}
          <Text style={styles.fieldLabel}>Month</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {MONTHS.map((m) => (
                <Pressable
                  key={m}
                  style={[styles.chip, month === m && styles.chipActive]}
                  onPress={() => setMonth(m)}
                >
                  <Text style={[styles.chipText, month === m && { color: "#fff" }]}>{m}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          {/* Year */}
          <Text style={styles.fieldLabel}>Year</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {YEARS.map((y) => (
                <Pressable
                  key={y}
                  style={[styles.chip, year === y && styles.chipActive]}
                  onPress={() => setYear(y)}
                >
                  <Text style={[styles.chipText, year === y && { color: "#fff" }]}>{y}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          {/* Present Days */}
          <View style={{ marginBottom: 14 }}>
            <Text style={styles.fieldLabel}>Present Days</Text>
            <TextInput
              style={styles.input}
              value={presentDays}
              onChangeText={setPresentDays}
              keyboardType="numeric"
              placeholderTextColor={Colors.textMuted}
            />
          </View>

          {/* Amount fields */}
          {fields.map((f) => (
            <View key={f.label} style={{ marginBottom: 14 }}>
              <Text style={styles.fieldLabel}>{f.label}</Text>
              <TextInput
                style={styles.input}
                value={f.val}
                onChangeText={f.set}
                keyboardType="decimal-pad"
                placeholderTextColor={Colors.textMuted}
              />
            </View>
          ))}

          {/* Computed summary */}
          <View style={styles.calcBox}>
            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>Gross Payment</Text>
              <Text style={styles.calcValue}>₹{gross.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</Text>
            </View>
            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>Deductions</Text>
              <Text style={[styles.calcValue, { color: Colors.danger }]}>
                - ₹{(n(advance) + n(otherDed)).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              </Text>
            </View>
            <View style={[styles.calcRow, { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10, marginTop: 4 }]}>
              <Text style={[styles.calcLabel, { fontWeight: "800", color: Colors.text }]}>Net Salary</Text>
              <Text style={[styles.calcValue, { color: Colors.primary, fontSize: 20 }]}>
                ₹{net.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
            <Pressable style={styles.cancelBtn} onPress={() => { reset(); onClose(); }}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.saveBtn, loading && { opacity: 0.6 }]} onPress={save} disabled={loading}>
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.saveBtnText}>Save</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function SalaryDetailModal({ item, visible, onClose }: { item: any; visible: boolean; onClose: () => void }) {
  if (!item) return null;
  const rows = [
    { label: "Agent",          value: item.agent_name },
    { label: "Month / Year",   value: `${item.month} ${item.year}` },
    { label: "Present Days",   value: String(item.present_days ?? "—") },
    { label: "Payment Amount", value: `₹${parseFloat(item.payment_amount || 0).toLocaleString("en-IN")}` },
    { label: "Incentive",      value: `₹${parseFloat(item.incentive_amount || 0).toLocaleString("en-IN")}` },
    { label: "Petrol",         value: `₹${parseFloat(item.petrol_expense || 0).toLocaleString("en-IN")}` },
    { label: "Mobile",         value: `₹${parseFloat(item.mobile_expense || 0).toLocaleString("en-IN")}` },
    { label: "Gross Payment",  value: `₹${parseFloat(item.gross_payment || 0).toLocaleString("en-IN")}` },
    { label: "Advance",        value: `₹${parseFloat(item.advance || 0).toLocaleString("en-IN")}` },
    { label: "Other Deductions", value: `₹${parseFloat(item.other_deductions || 0).toLocaleString("en-IN")}` },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }}>
        <View style={[styles.sheet, { paddingBottom: 40 }]}>
          <View style={styles.handle} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <View style={styles.detailAvatar}>
              <Text style={styles.detailAvatarText}>
                {(item.agent_name || "?").charAt(0).toUpperCase()}
              </Text>
            </View>
            <View>
              <Text style={styles.sheetTitle}>{item.agent_name}</Text>
              <Text style={{ fontSize: 13, color: Colors.textSecondary }}>{item.month} {item.year}</Text>
            </View>
          </View>

          {rows.map((r, i) => (
            <View key={r.label} style={[styles.detailRow, i % 2 === 0 && { backgroundColor: Colors.surfaceAlt }]}>
              <Text style={styles.detailLabel}>{r.label}</Text>
              <Text style={styles.detailValue}>{r.value}</Text>
            </View>
          ))}

          <View style={[styles.netRow]}>
            <Text style={styles.netLabel}>Net Salary</Text>
            <Text style={styles.netValue}>
              ₹{parseFloat(item.net_salary || 0).toLocaleString("en-IN")}
            </Text>
          </View>

          <Pressable style={[styles.saveBtn, { marginTop: 16 }]} onPress={onClose}>
            <Text style={styles.saveBtnText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default function AdminSalaryScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [agentFilter, setAgentFilter] = useState("All");

  const { data, isLoading } = useQuery({
    queryKey: ["/api/admin/salary"],
    queryFn: () => api.admin.getSalary(),
  });
  const { data: agentsData } = useQuery({
    queryKey: ["/api/admin/agents"],
    queryFn: () => api.admin.getAgents(),
  });

  const salary: any[] = data?.salary || [];
  const agents = agentsData?.agents || [];

  const agentNames = ["All", ...Array.from(new Set(salary.map((s: any) => s.agent_name).filter(Boolean))).sort()] as string[];

  const filtered = agentFilter === "All" ? salary : salary.filter((s: any) => s.agent_name === agentFilter);

  const totalNet = filtered.reduce((s: number, r: any) => s + parseFloat(r.net_salary || 0), 0);
  const totalGross = filtered.reduce((s: number, r: any) => s + parseFloat(r.gross_payment || 0), 0);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {/* Summary header */}
      <View style={[styles.headerBox, { paddingTop: Platform.OS === "web" ? 67 : 12 }]}>
        <View style={styles.headerSummaryRow}>
          <View style={[styles.headerSumCard, { borderTopColor: Colors.primary }]}>
            <Text style={styles.headerSumNum}>
              ₹{totalGross.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </Text>
            <Text style={styles.headerSumLabel}>Total Gross</Text>
          </View>
          <View style={[styles.headerSumCard, { borderTopColor: Colors.success }]}>
            <Text style={[styles.headerSumNum, { color: Colors.success }]}>
              ₹{totalNet.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </Text>
            <Text style={styles.headerSumLabel}>Total Net</Text>
          </View>
          <View style={[styles.headerSumCard, { borderTopColor: Colors.info }]}>
            <Text style={[styles.headerSumNum, { color: Colors.info }]}>{filtered.length}</Text>
            <Text style={styles.headerSumLabel}>Records</Text>
          </View>
        </View>

        {/* Agent filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {agentNames.map((name) => (
              <Pressable
                key={name}
                style={[
                  styles.chip,
                  agentFilter === name && styles.chipActive,
                  { maxWidth: 150 },
                ]}
                onPress={() => setAgentFilter(name)}
              >
                <Text
                  style={[styles.chipText, agentFilter === name && { color: "#fff" }]}
                  numberOfLines={1}
                >
                  {name}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + 100 },
          !filtered.length && { flex: 1 },
        ]}
        ListHeaderComponent={
          <Text style={styles.count}>
            {filtered.length} record{filtered.length !== 1 ? "s" : ""}
          </Text>
        }
        renderItem={({ item }) => {
          const netSalary = parseFloat(item.net_salary || 0);
          const grossPayment = parseFloat(item.gross_payment || 0);
          const deductions = parseFloat(item.advance || 0) + parseFloat(item.other_deductions || 0);

          return (
            <Pressable style={styles.salaryCard} onPress={() => setSelectedItem(item)}>
              <View style={styles.salaryCardHeader}>
                <View style={styles.salaryAvatar}>
                  <Text style={styles.salaryAvatarText}>
                    {(item.agent_name || "?").charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.salaryAgent} numberOfLines={1}>{item.agent_name || "Unknown"}</Text>
                  <Text style={styles.salaryPeriod}>{item.month} {item.year}</Text>
                </View>
                <View style={styles.netBadge}>
                  <Text style={styles.netBadgeText}>
                    ₹{netSalary.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </Text>
                  <Text style={styles.netBadgeLabel}>Net</Text>
                </View>
              </View>

              <View style={styles.salaryGrid}>
                <View style={styles.salaryItem}>
                  <Text style={styles.salaryItemLabel}>Days</Text>
                  <Text style={styles.salaryItemValue}>{item.present_days ?? "—"}</Text>
                </View>
                <View style={styles.salaryItem}>
                  <Text style={styles.salaryItemLabel}>Gross</Text>
                  <Text style={styles.salaryItemValue}>
                    ₹{grossPayment.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </Text>
                </View>
                {deductions > 0 && (
                  <View style={[styles.salaryItem, { backgroundColor: Colors.danger + "12" }]}>
                    <Text style={styles.salaryItemLabel}>Deductions</Text>
                    <Text style={[styles.salaryItemValue, { color: Colors.danger }]}>
                      -₹{deductions.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </Text>
                  </View>
                )}
                <View style={[styles.salaryItem, { backgroundColor: Colors.primary + "15" }]}>
                  <Text style={styles.salaryItemLabel}>Net Salary</Text>
                  <Text style={[styles.salaryItemValue, { color: Colors.primary }]}>
                    ₹{netSalary.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </Text>
                </View>
              </View>

              <View style={styles.viewDetailRow}>
                <Ionicons name="eye-outline" size={13} color={Colors.primary} />
                <Text style={styles.viewDetailText}>Tap to view breakdown</Text>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          isLoading ? (
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
              <ActivityIndicator color={Colors.primary} size="large" />
            </View>
          ) : (
            <View style={styles.empty}>
              <Ionicons name="wallet-outline" size={52} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No Salary Records</Text>
              <Text style={styles.emptyText}>Tap the button below to add one</Text>
            </View>
          )
        }
      />

      {/* FAB */}
      <View style={[styles.fab, { bottom: insets.bottom + 24 }]}>
        <Pressable style={styles.fabBtn} onPress={() => setShowAdd(true)}>
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={styles.fabText}>Add Salary Record</Text>
        </Pressable>
      </View>

      <AddSalaryModal
        visible={showAdd}
        agents={agents}
        onClose={() => setShowAdd(false)}
        onSave={() => qc.invalidateQueries({ queryKey: ["/api/admin/salary"] })}
      />

      <SalaryDetailModal
        item={selectedItem}
        visible={!!selectedItem}
        onClose={() => setSelectedItem(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerBox: {
    backgroundColor: Colors.surface,
    padding: 12,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerSummaryRow: { flexDirection: "row", gap: 10 },
  headerSumCard: {
    flex: 1,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 12,
    padding: 12,
    borderTopWidth: 3,
    alignItems: "center",
    gap: 2,
  },
  headerSumNum: { fontSize: 14, fontWeight: "800", color: Colors.text },
  headerSumLabel: { fontSize: 10, color: Colors.textSecondary, fontWeight: "600" },
  list: { padding: 12, gap: 10 },
  count: { fontSize: 13, color: Colors.textSecondary, fontWeight: "600", marginBottom: 2 },
  salaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  salaryCardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  salaryAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  salaryAvatarText: { fontSize: 17, fontWeight: "800", color: "#fff" },
  salaryAgent: { fontSize: 14, fontWeight: "700", color: Colors.text, flex: 1 },
  salaryPeriod: { fontSize: 12, color: Colors.textSecondary, fontWeight: "600", marginTop: 2 },
  netBadge: {
    backgroundColor: Colors.primary + "15",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: "center",
  },
  netBadgeText: { fontSize: 15, fontWeight: "800", color: Colors.primary },
  netBadgeLabel: { fontSize: 9, fontWeight: "700", color: Colors.primary, textTransform: "uppercase" },
  salaryGrid: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  salaryItem: {
    flex: 1,
    minWidth: 70,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
    gap: 4,
  },
  salaryItemLabel: { fontSize: 10, color: Colors.textSecondary, fontWeight: "600" },
  salaryItemValue: { fontSize: 14, fontWeight: "800", color: Colors.text },
  viewDetailRow: { flexDirection: "row", alignItems: "center", gap: 4, justifyContent: "flex-end" },
  viewDetailText: { fontSize: 11, color: Colors.primary, fontWeight: "600" },
  fab: { position: "absolute", left: 16, right: 16 },
  fabBtn: {
    backgroundColor: Colors.primaryDark ?? Colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  fabText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: "92%",
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 12,
  },
  sheetTitle: { fontSize: 20, fontWeight: "700", color: Colors.text, marginBottom: 4 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 13, fontWeight: "600", color: Colors.textSecondary },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: Colors.text,
    backgroundColor: Colors.surfaceAlt,
  },
  calcBox: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 14,
    padding: 14,
    gap: 8,
    marginTop: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  calcRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  calcLabel: { fontSize: 14, color: Colors.textSecondary, fontWeight: "600" },
  calcValue: { fontSize: 15, fontWeight: "700", color: Colors.text },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
  },
  cancelBtnText: { fontSize: 15, fontWeight: "600", color: Colors.textSecondary },
  saveBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  detailLabel: { fontSize: 13, color: Colors.textSecondary, fontWeight: "600" },
  detailValue: { fontSize: 13, color: Colors.text, fontWeight: "700" },
  netRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Colors.primary + "15",
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
  },
  netLabel: { fontSize: 15, fontWeight: "800", color: Colors.primary },
  netValue: { fontSize: 22, fontWeight: "800", color: Colors.primary },
  detailAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  detailAvatarText: { fontSize: 18, fontWeight: "800", color: "#fff" },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingVertical: 60,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: Colors.textMuted },
  emptyText: { fontSize: 13, color: Colors.textMuted },
});

import React, { useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Modal, TextInput, Alert, ActivityIndicator, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";
import { Platform } from "react-native";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function AddSalaryModal({ visible, agents, onClose, onSave }: any) {
  const [agentId, setAgentId] = useState("");
  const [month, setMonth] = useState("June");
  const [year, setYear] = useState("2021");
  const [presentDays, setPresentDays] = useState("30");
  const [paymentAmount, setPaymentAmount] = useState("6000");
  const [incentive, setIncentive] = useState("0");
  const [petrol, setPetrol] = useState("3000");
  const [mobile, setMobile] = useState("150");
  const [advance, setAdvance] = useState("0");
  const [otherDed, setOtherDed] = useState("0");
  const [loading, setLoading] = useState(false);

  const gross = parseFloat(paymentAmount || "0") + parseFloat(incentive || "0") + parseFloat(petrol || "0") + parseFloat(mobile || "0");
  const total = gross - parseFloat(advance || "0") - parseFloat(otherDed || "0");

  const save = async () => {
    if (!agentId) { Alert.alert("Error", "Please select an agent"); return; }
    setLoading(true);
    try {
      await api.admin.createSalary({
        agentId: parseInt(agentId), month, year: parseInt(year),
        presentDays: parseInt(presentDays), paymentAmount: parseFloat(paymentAmount),
        incentiveAmount: parseFloat(incentive), petrolExpense: parseFloat(petrol),
        mobileExpense: parseFloat(mobile), grossPayment: gross,
        advance: parseFloat(advance), otherDeductions: parseFloat(otherDed),
        total, netSalary: total,
      });
      onSave(); onClose();
    } catch (e: any) { Alert.alert("Error", e.message); }
    finally { setLoading(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
        <ScrollView style={styles.sheet} contentContainerStyle={{ paddingBottom: 24 }}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Add Salary</Text>

          <Text style={styles.fieldLabel}>Select Agent</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {agents.map((a: any) => (
                <Pressable key={a.id} style={[styles.chip, agentId === String(a.id) && styles.chipActive]} onPress={() => setAgentId(String(a.id))}>
                  <Text style={[styles.chipText, agentId === String(a.id) && { color: "#fff" }]} numberOfLines={1}>{a.name}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <Text style={styles.fieldLabel}>Month</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {MONTHS.map((m) => (
                <Pressable key={m} style={[styles.chip, month === m && styles.chipActive]} onPress={() => setMonth(m)}>
                  <Text style={[styles.chipText, month === m && { color: "#fff" }]}>{m}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          {[
            { label: "Year", val: year, set: setYear, kb: "numeric" as const },
            { label: "Present Days", val: presentDays, set: setPresentDays, kb: "numeric" as const },
            { label: "Payment Amount (₹)", val: paymentAmount, set: setPaymentAmount, kb: "decimal-pad" as const },
            { label: "Incentive (₹)", val: incentive, set: setIncentive, kb: "decimal-pad" as const },
            { label: "Petrol Expense (₹)", val: petrol, set: setPetrol, kb: "decimal-pad" as const },
            { label: "Mobile Expense (₹)", val: mobile, set: setMobile, kb: "decimal-pad" as const },
            { label: "Advance (₹)", val: advance, set: setAdvance, kb: "decimal-pad" as const },
            { label: "Other Deductions (₹)", val: otherDed, set: setOtherDed, kb: "decimal-pad" as const },
          ].map((f) => (
            <View key={f.label} style={{ marginBottom: 12 }}>
              <Text style={styles.fieldLabel}>{f.label}</Text>
              <TextInput
                style={styles.input}
                value={f.val}
                onChangeText={f.set}
                keyboardType={f.kb}
                placeholderTextColor={Colors.textMuted}
              />
            </View>
          ))}

          <View style={styles.calcRow}>
            <Text style={styles.calcLabel}>Gross Payment:</Text>
            <Text style={styles.calcValue}>₹{gross.toFixed(2)}</Text>
          </View>
          <View style={styles.calcRow}>
            <Text style={[styles.calcLabel, { fontWeight: "800" }]}>Net Salary:</Text>
            <Text style={[styles.calcValue, { color: Colors.primary, fontSize: 18 }]}>₹{total.toFixed(2)}</Text>
          </View>

          <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
            <Pressable style={styles.cancelBtn} onPress={onClose}>
              <Text style={{ color: Colors.textSecondary, fontWeight: "600" }}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.saveBtn} onPress={save} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Save</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function AdminSalaryScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ["/api/admin/salary"], queryFn: () => api.admin.getSalary() });
  const { data: agentsData } = useQuery({ queryKey: ["/api/admin/agents"], queryFn: () => api.admin.getAgents() });

  const salary = data?.salary || [];

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <FlatList
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 100, paddingTop: Platform.OS === "web" ? 67 : 12 }]}
        data={salary}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={<Text style={styles.count}>{salary.length} salary records</Text>}
        renderItem={({ item }) => (
          <View style={styles.salaryCard}>
            <View style={styles.salaryHeader}>
              <Text style={styles.salaryAgent} numberOfLines={1}>{item.agent_name}</Text>
              <Text style={styles.salaryPeriod}>{item.month} {item.year}</Text>
            </View>
            <View style={styles.salaryGrid}>
              <View style={styles.salaryItem}>
                <Text style={styles.salaryItemLabel}>Present Days</Text>
                <Text style={styles.salaryItemValue}>{item.present_days}</Text>
              </View>
              <View style={styles.salaryItem}>
                <Text style={styles.salaryItemLabel}>Gross</Text>
                <Text style={styles.salaryItemValue}>₹{parseFloat(item.gross_payment || 0).toFixed(0)}</Text>
              </View>
              <View style={[styles.salaryItem, { backgroundColor: Colors.primary + "15" }]}>
                <Text style={styles.salaryItemLabel}>Net Salary</Text>
                <Text style={[styles.salaryItemValue, { color: Colors.primary }]}>₹{parseFloat(item.net_salary || 0).toFixed(0)}</Text>
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={
          isLoading ? <View style={{ padding: 60, alignItems: "center" }}><ActivityIndicator color={Colors.primary} /></View> :
          <View style={styles.empty}><Ionicons name="wallet-outline" size={48} color={Colors.textMuted} /><Text style={styles.emptyText}>No salary records</Text></View>
        }
        scrollEnabled={!!salary.length}
      />
      <View style={[styles.fab, { bottom: insets.bottom + 24 }]}>
        <Pressable style={styles.fabBtn} onPress={() => setShowAdd(true)}>
          <Ionicons name="add" size={26} color="#fff" />
          <Text style={styles.fabText}>Add Salary Record</Text>
        </Pressable>
      </View>
      <AddSalaryModal visible={showAdd} agents={agentsData?.agents || []} onClose={() => setShowAdd(false)} onSave={() => qc.invalidateQueries({ queryKey: ["/api/admin/salary"] })} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 12, gap: 10 },
  count: { fontSize: 13, color: Colors.textSecondary, marginBottom: 4, fontWeight: "600" },
  salaryCard: {
    backgroundColor: Colors.surface, borderRadius: 14, padding: 14, gap: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  salaryHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  salaryAgent: { flex: 1, fontSize: 15, fontWeight: "700", color: Colors.text },
  salaryPeriod: { fontSize: 13, color: Colors.textSecondary, fontWeight: "600" },
  salaryGrid: { flexDirection: "row", gap: 8 },
  salaryItem: { flex: 1, backgroundColor: Colors.surfaceAlt, borderRadius: 10, padding: 10, alignItems: "center", gap: 4 },
  salaryItemLabel: { fontSize: 10, color: Colors.textSecondary, fontWeight: "600" },
  salaryItemValue: { fontSize: 16, fontWeight: "800", color: Colors.text },
  fab: { position: "absolute", left: 16, right: 16 },
  fabBtn: { backgroundColor: Colors.primaryDark, borderRadius: 16, paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  fabText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "90%" },
  handle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: "center", marginBottom: 12 },
  sheetTitle: { fontSize: 20, fontWeight: "700", color: Colors.text, marginBottom: 16 },
  fieldLabel: { fontSize: 12, fontWeight: "700", color: Colors.textSecondary, textTransform: "uppercase", marginBottom: 6, letterSpacing: 0.5 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 13, fontWeight: "600", color: Colors.textSecondary },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 14, fontSize: 15, color: Colors.text, backgroundColor: Colors.surfaceAlt },
  calcRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  calcLabel: { fontSize: 14, color: Colors.textSecondary, fontWeight: "600" },
  calcValue: { fontSize: 15, fontWeight: "700", color: Colors.text },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, alignItems: "center" },
  saveBtn: { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: Colors.primary, alignItems: "center" },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText: { fontSize: 16, color: Colors.textMuted },
});

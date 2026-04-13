import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  TextInput, Alert, ActivityIndicator, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

const PAYMENT_TYPES = ["UPI", "NEFT", "IMPS", "RTGS"];

export default function OnlineCollectionScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ loanNo?: string; customerName?: string }>();
  const [loanNo, setLoanNo] = useState(params.loanNo || "");
  const [customerName, setCustomerName] = useState(params.customerName || "");
  const [amount, setAmount] = useState("");
  const [paymentType, setPaymentType] = useState("UPI");
  const [utrNo, setUtrNo] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<any>(null);

  const submit = async () => {
    if (!loanNo.trim()) { Alert.alert("Error", "Please enter Loan No."); return; }
    if (!amount || parseFloat(amount) <= 0) { Alert.alert("Error", "Please enter a valid amount"); return; }
    setLoading(true);
    try {
      const url = new URL("/api/online-collection", getApiUrl()).toString();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          loan_no: loanNo.trim().toUpperCase(),
          customer_name: customerName.trim(),
          amount: parseFloat(amount),
          payment_type: paymentType,
          utr_no: utrNo.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed");
      setSuccess(data);
      qc.invalidateQueries({ queryKey: ["/api/cases"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      qc.invalidateQueries({ queryKey: ["/api/bkt-tw-collection-summary"] });
      qc.invalidateQueries({ queryKey: ["/api/visit-log/today"] });
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally { setLoading(false); }
  };

  if (success) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, justifyContent: "center", alignItems: "center", padding: 24 }}>
        <View style={styles.successCard}>
          <View style={styles.successIconWrap}>
            <Ionicons name="checkmark-circle" size={56} color={Colors.success} />
          </View>
          <Text style={styles.successTitle}>Collection Recorded!</Text>
          <View style={styles.successDetails}>
            {[
              { label: "Loan No", value: loanNo.toUpperCase() },
              { label: "Amount", value: `₹${parseFloat(amount).toLocaleString("en-IN")}` },
              { label: "Method", value: paymentType },
              utrNo ? { label: "UTR", value: utrNo } : null,
              { label: "BKT", value: success.bkt ? `BKT ${success.bkt}` : "Auto-detected" },
            ].filter(Boolean).map((r: any) => (
              <View key={r.label} style={styles.successRow}>
                <Text style={styles.successLabel}>{r.label}</Text>
                <Text style={styles.successValue}>{r.value}</Text>
              </View>
            ))}
          </View>
          <View style={styles.autoActionsBox}>
            <Text style={styles.autoActionsTitle}>Auto-completed</Text>
            {[
              "Case marked as Paid",
              "Deposition created",
              "BKT auto-filled from loan no.",
              "Visit log updated",
            ].map((a) => (
              <View key={a} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
                <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                <Text style={styles.autoActionText}>{a}</Text>
              </View>
            ))}
          </View>
          <Pressable style={styles.doneBtn} onPress={() => { setSuccess(null); setLoanNo(""); setCustomerName(""); setAmount(""); setUtrNo(""); setPaymentType("UPI"); router.back(); }}>
            <Text style={styles.doneBtnText}>Done</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={[styles.container, { paddingTop: Platform.OS === "web" ? 80 : insets.top + 12, paddingBottom: insets.bottom + 32 }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.infoBox}>
        <Ionicons name="information-circle" size={18} color={Colors.info} />
        <Text style={styles.infoText}>Recording an online payment will automatically mark the case as Paid and create a deposition.</Text>
      </View>

      <Text style={styles.label}>Loan No. *</Text>
      <TextInput style={styles.input} placeholder="e.g. HL-20240892" placeholderTextColor={Colors.textMuted} value={loanNo} onChangeText={setLoanNo} autoCapitalize="characters" />

      <Text style={styles.label}>Customer Name</Text>
      <TextInput style={styles.input} placeholder="Enter customer name" placeholderTextColor={Colors.textMuted} value={customerName} onChangeText={setCustomerName} />

      <Text style={styles.label}>Amount Collected (₹) *</Text>
      <TextInput style={styles.input} placeholder="0" placeholderTextColor={Colors.textMuted} value={amount} onChangeText={setAmount} keyboardType="numeric" />

      <Text style={styles.label}>Payment Method</Text>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
        {PAYMENT_TYPES.map((p) => (
          <Pressable key={p} style={[styles.typeChip, paymentType === p && { backgroundColor: Colors.primary, borderColor: Colors.primary }]} onPress={() => setPaymentType(p)}>
            <Text style={[styles.typeChipText, paymentType === p && { color: "#fff" }]}>{p}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>UTR / Reference No.</Text>
      <TextInput style={styles.input} placeholder="Enter UTR or reference number" placeholderTextColor={Colors.textMuted} value={utrNo} onChangeText={setUtrNo} autoCapitalize="characters" />

      <Pressable style={[styles.submitBtn, loading && { opacity: 0.6 }]} onPress={submit} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" size="small" /> : (
          <>
            <Ionicons name="card" size={18} color="#fff" />
            <Text style={styles.submitText}>Confirm Collection</Text>
          </>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:      { padding: 16, gap: 4 },
  infoBox:        { flexDirection: "row", gap: 10, backgroundColor: Colors.info + "15", borderRadius: 12, padding: 12, marginBottom: 20, alignItems: "flex-start" },
  infoText:       { flex: 1, fontSize: 13, color: Colors.info, lineHeight: 18 },
  label:          { fontSize: 11, fontWeight: "700", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, marginTop: 4 },
  input:          { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 14, fontSize: 15, color: Colors.text, backgroundColor: Colors.surface, marginBottom: 8 },
  typeChip:       { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt, alignItems: "center" },
  typeChipText:   { fontSize: 13, fontWeight: "700", color: Colors.text },
  submitBtn:      { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: Colors.success, borderRadius: 14, paddingVertical: 16, marginTop: 16 },
  submitText:     { fontSize: 16, fontWeight: "700", color: "#fff" },
  successCard:    { backgroundColor: Colors.surface, borderRadius: 20, padding: 24, width: "100%", alignItems: "center", gap: 12, borderWidth: 1, borderColor: Colors.border },
  successIconWrap:{ width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.success + "18", alignItems: "center", justifyContent: "center" },
  successTitle:   { fontSize: 20, fontWeight: "800", color: Colors.text },
  successDetails: { width: "100%", backgroundColor: Colors.surfaceAlt, borderRadius: 12, padding: 14, gap: 8 },
  successRow:     { flexDirection: "row", justifyContent: "space-between" },
  successLabel:   { fontSize: 12, color: Colors.textMuted, fontWeight: "600" },
  successValue:   { fontSize: 12, fontWeight: "700", color: Colors.text },
  autoActionsBox: { width: "100%", backgroundColor: Colors.success + "10", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.success + "30" },
  autoActionsTitle: { fontSize: 12, fontWeight: "700", color: Colors.success, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  autoActionText: { fontSize: 12, color: Colors.success },
  doneBtn:        { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40, marginTop: 4 },
  doneBtnText:    { fontSize: 16, fontWeight: "700", color: "#fff" },
});

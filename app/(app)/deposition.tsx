import React, { useState, useMemo, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, Modal, TextInput,
  Alert, ActivityIndicator, ScrollView, Linking, Platform, Image
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";
import { getApiUrl } from "@/lib/query-client";

async function openUpiApp(deepLink: string, fallback: string) {
  try {
    await Linking.openURL(deepLink);
  } catch {
    try { await Linking.openURL(fallback); } catch { Alert.alert("Error", "Could not open payment app."); }
  }
}

function ScreenshotThumb({ uri }: { uri: string }) {
  const src = uri.startsWith("http") ? uri : `${getApiUrl()}${uri}`;
  return (
    <Image
      source={{ uri: src }}
      style={{ width: 80, height: 80, borderRadius: 8, marginTop: 8 }}
      resizeMode="cover"
    />
  );
}

function PendingDepositCard({ item, onScreenshotUploaded }: { item: any; onScreenshotUploaded: () => void }) {
  const [uploading, setUploading] = useState(false);
  const amount = parseFloat(item.amount || 0);
  const amountStr = amount.toFixed(2);
  const note = encodeURIComponent(item.description || "FOS Deposit");
  const hasScreenshot = !!item.screenshot_url;

  const handleUploadScreenshot = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      setUploading(true);
      await api.uploadScreenshot(item.id, result.assets[0].uri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onScreenshotUploaded();
    } catch (e: any) {
      Alert.alert("Upload Failed", e.message);
    } finally {
      setUploading(false);
    }
  };

  const handlePay = (appName: string, deepLink: string, fallback: string) => {
    Alert.alert(
      `Pay via ${appName}`,
      `Amount: ₹${amount.toLocaleString("en-IN")}`,
      [
        { text: "Cancel", style: "cancel" },
        { text: `Open ${appName}`, onPress: () => openUpiApp(deepLink, fallback) },
      ]
    );
  };

  return (
    <View style={pStyles.card}>
      <View style={pStyles.cardHeader}>
        <View style={pStyles.amountRow}>
          <Ionicons name="alert-circle" size={18} color={Colors.warning} />
          <Text style={pStyles.amount}>₹{amount.toLocaleString("en-IN")}</Text>
        </View>
        {hasScreenshot ? (
          <View style={[pStyles.statusTag, { backgroundColor: Colors.success + "20", borderColor: Colors.success + "50" }]}>
            <Ionicons name="checkmark-circle" size={12} color={Colors.success} />
            <Text style={[pStyles.statusText, { color: Colors.success }]}>Uploaded</Text>
          </View>
        ) : (
          <View style={pStyles.pendingTag}>
            <Text style={pStyles.pendingText}>PENDING</Text>
          </View>
        )}
      </View>

      {item.description ? <Text style={pStyles.desc}>{item.description}</Text> : null}
      <Text style={pStyles.addedOn}>
        Assigned: {item.created_at ? new Date(item.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : ""}
      </Text>

      {hasScreenshot ? (
        <ScreenshotThumb uri={item.screenshot_url} />
      ) : (
        <>
          <View style={pStyles.divider} />
          <Text style={pStyles.payLabel}>Pay Now</Text>
          <View style={pStyles.upiRow}>
            <Pressable
              style={[pStyles.upiBtn, { backgroundColor: "#5f259f" }]}
              onPress={() => handlePay("PhonePe", `phonepe://pay?am=${amountStr}&tn=${note}&cu=INR`, "https://phon.pe/store")}
            >
              <Text style={pStyles.upiEmoji}>📱</Text>
              <Text style={pStyles.upiLabel}>PhonePe</Text>
            </Pressable>
            <Pressable
              style={[pStyles.upiBtn, { backgroundColor: "#1a73e8" }]}
              onPress={() => handlePay("Google Pay", `tez://upi/pay?am=${amountStr}&tn=${note}&cu=INR`, "https://pay.google.com")}
            >
              <Text style={pStyles.upiEmoji}>💳</Text>
              <Text style={pStyles.upiLabel}>GPay</Text>
            </Pressable>
            <Pressable
              style={[pStyles.upiBtn, { backgroundColor: "#00BAF2" }]}
              onPress={() => handlePay("Paytm", `paytmmp://pay?am=${amountStr}&tn=${note}&cu=INR`, "https://paytm.com")}
            >
              <Text style={pStyles.upiEmoji}>💰</Text>
              <Text style={pStyles.upiLabel}>Paytm</Text>
            </Pressable>
          </View>
          <Pressable
            style={pStyles.anyUpiBtn}
            onPress={() => Alert.alert("Pay via UPI", `Amount: ₹${amount.toLocaleString("en-IN")}`, [
              { text: "Cancel", style: "cancel" },
              { text: "Pay Now", onPress: () => Linking.openURL(`upi://pay?am=${amountStr}&tn=${note}&cu=INR`) },
            ])}
          >
            <Ionicons name="qr-code-outline" size={16} color={Colors.primary} />
            <Text style={pStyles.anyUpiText}>Any other UPI App</Text>
          </Pressable>
        </>
      )}

      <Pressable
        style={[pStyles.uploadBtn, hasScreenshot && { backgroundColor: Colors.surfaceAlt, borderColor: Colors.border }, uploading && { opacity: 0.6 }]}
        onPress={handleUploadScreenshot}
        disabled={uploading}
      >
        {uploading ? (
          <ActivityIndicator size="small" color={hasScreenshot ? Colors.textSecondary : "#fff"} />
        ) : (
          <>
            <Ionicons name={hasScreenshot ? "refresh-outline" : "camera-outline"} size={16} color={hasScreenshot ? Colors.textSecondary : "#fff"} />
            <Text style={[pStyles.uploadBtnText, hasScreenshot && { color: Colors.textSecondary }]}>
              {hasScreenshot ? "Replace Screenshot" : "Upload Payment Screenshot"}
            </Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

function AddDepositionModal({ visible, cases, onClose, onSave }: any) {
  const [selectedCase, setSelectedCase] = useState<any>(null);
  const [amount, setAmount] = useState("");
  const [receiptNo, setReceiptNo] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const paidCases = useMemo(() => (cases || []).filter((c: any) => c.status === "Paid"), [cases]);
  const reset = () => { setSelectedCase(null); setAmount(""); setReceiptNo(""); setNotes(""); };

  const save = async () => {
    if (!selectedCase) { Alert.alert("Error", "Please select a case"); return; }
    if (!amount || isNaN(parseFloat(amount))) { Alert.alert("Error", "Please enter a valid amount"); return; }
    setLoading(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      await api.createDeposition({ loanCaseId: selectedCase.id, amount: parseFloat(amount), depositionDate: today, receiptNo, notes });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      reset(); onSave(); onClose();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={depStyles.overlay}>
        <View style={depStyles.sheet}>
          <View style={depStyles.handle} />
          <Text style={depStyles.title}>Record Cash Deposition</Text>
          <Text style={depStyles.label}>Select Paid Case</Text>
          <ScrollView style={{ maxHeight: 160 }} showsVerticalScrollIndicator={false}>
            {paidCases.map((c: any) => (
              <Pressable
                key={c.id}
                style={[depStyles.caseItem, selectedCase?.id === c.id && depStyles.caseItemSelected]}
                onPress={() => setSelectedCase(c)}
              >
                <Text style={[depStyles.caseItemText, selectedCase?.id === c.id && { color: "#fff" }]} numberOfLines={1}>
                  {c.customer_name} — BKT {c.bkt}
                </Text>
                {selectedCase?.id === c.id && <Ionicons name="checkmark-circle" size={16} color="#fff" />}
              </Pressable>
            ))}
            {paidCases.length === 0 && <Text style={depStyles.noCases}>No paid cases available</Text>}
          </ScrollView>
          <Text style={depStyles.label}>Amount (₹)</Text>
          <TextInput
            style={depStyles.input}
            placeholder="Enter amount"
            placeholderTextColor={Colors.textMuted}
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
          />
          <Text style={depStyles.label}>Receipt No (Optional)</Text>
          <TextInput
            style={depStyles.input}
            placeholder="Enter receipt number"
            placeholderTextColor={Colors.textMuted}
            value={receiptNo}
            onChangeText={setReceiptNo}
          />
          <Text style={depStyles.label}>Notes (Optional)</Text>
          <TextInput
            style={[depStyles.input, { minHeight: 60, textAlignVertical: "top" }]}
            placeholder="Notes..."
            placeholderTextColor={Colors.textMuted}
            value={notes}
            onChangeText={setNotes}
            multiline
          />
          <View style={depStyles.btnRow}>
            <Pressable style={depStyles.cancelBtn} onPress={() => { reset(); onClose(); }}>
              <Text style={depStyles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={[depStyles.saveBtn, loading && { opacity: 0.6 }]} onPress={save} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={depStyles.saveText}>Submit</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function DepositionScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);

  const { data: depsData, isLoading: depsLoading } = useQuery({
    queryKey: ["/api/depositions"],
    queryFn: () => api.getDepositions(),
  });
  const { data: casesData } = useQuery({
    queryKey: ["/api/cases"],
    queryFn: () => api.getCases(),
  });
  const { data: reqData, isLoading: reqLoading, refetch: refetchReq } = useQuery({
    queryKey: ["/api/required-deposits"],
    queryFn: () => api.getRequiredDeposits(),
    staleTime: 0,
  });

  const depositions = depsData?.depositions || [];
  const pendingDeposits: any[] = reqData?.deposits || [];
  const totalPending = pendingDeposits.reduce((s: number, d: any) => s + parseFloat(d.amount || 0), 0);

  const onScreenshotUploaded = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["/api/required-deposits"] });
  }, [qc]);

  const listHeader = useMemo(() => (
    <View style={{ gap: 12, marginBottom: 8 }}>
      {reqLoading ? (
        <ActivityIndicator color={Colors.primary} size="small" style={{ marginVertical: 8 }} />
      ) : pendingDeposits.length > 0 ? (
        <View>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="alert-circle" size={18} color={Colors.warning} />
              <Text style={styles.sectionTitle}>Pending Deposits</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{pendingDeposits.length}</Text>
              </View>
            </View>
            <Text style={styles.sectionTotal}>Total: ₹{totalPending.toLocaleString("en-IN")}</Text>
          </View>
          {pendingDeposits.map((item: any) => (
            <PendingDepositCard key={item.id} item={item} onScreenshotUploaded={onScreenshotUploaded} />
          ))}
          <View style={styles.dividerSection} />
        </View>
      ) : null}
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="receipt" size={18} color={Colors.primary} />
          <Text style={styles.sectionTitle}>Deposition History</Text>
        </View>
        <Text style={styles.sectionTotal}>{depositions.length} records</Text>
      </View>
    </View>
  ), [reqLoading, pendingDeposits, totalPending, depositions.length, onScreenshotUploaded]);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <FlatList
        contentContainerStyle={[
          styles.container,
          { paddingBottom: insets.bottom + 100, paddingTop: Platform.OS === "web" ? 67 : 12 },
        ]}
        data={depositions}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={listHeader}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.amountBadge}>
                <Text style={styles.amountText}>₹{parseFloat(item.amount).toLocaleString("en-IN")}</Text>
              </View>
              <Text style={styles.date}>{item.deposition_date}</Text>
            </View>
            {item.customer_name && <Text style={styles.customerName} numberOfLines={1}>{item.customer_name}</Text>}
            {item.loan_no && <Text style={styles.loanNo}>Loan: {item.loan_no} | BKT: {item.bkt}</Text>}
            {item.receipt_no && <Text style={styles.receipt}>Receipt: {item.receipt_no}</Text>}
            {item.notes && <Text style={styles.notes}>{item.notes}</Text>}
          </View>
        )}
        ListEmptyComponent={
          depsLoading ? null : (
            <View style={styles.empty}>
              <MaterialIcons name="receipt-long" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No deposition records yet</Text>
            </View>
          )
        }
      />

      <View style={[styles.fab, { bottom: insets.bottom + 24 }]}>
        <Pressable
          style={({ pressed }) => [styles.fabBtn, pressed && { opacity: 0.85 }]}
          onPress={() => setShowAdd(true)}
        >
          <Ionicons name="add" size={24} color="#fff" />
          <Text style={styles.fabText}>Record Deposition</Text>
        </Pressable>
      </View>

      <AddDepositionModal
        visible={showAdd}
        cases={casesData?.cases || []}
        onClose={() => setShowAdd(false)}
        onSave={() => qc.invalidateQueries({ queryKey: ["/api/depositions"] })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: Colors.text },
  sectionTotal: { fontSize: 12, color: Colors.textSecondary, fontWeight: "600" },
  countBadge: { backgroundColor: Colors.warning, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  countText: { fontSize: 11, fontWeight: "800", color: "#fff" },
  dividerSection: { height: 1, backgroundColor: Colors.border, marginVertical: 12 },
  card: {
    backgroundColor: Colors.surface, borderRadius: 14, padding: 14, gap: 6,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
    borderLeftWidth: 4, borderLeftColor: Colors.success,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  amountBadge: { backgroundColor: Colors.success + "15", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  amountText: { fontSize: 16, fontWeight: "800", color: Colors.success },
  date: { fontSize: 12, color: Colors.textSecondary },
  customerName: { fontSize: 14, fontWeight: "700", color: Colors.text, textTransform: "uppercase" },
  loanNo: { fontSize: 12, color: Colors.textMuted },
  receipt: { fontSize: 12, color: Colors.textSecondary },
  notes: { fontSize: 12, color: Colors.textSecondary, fontStyle: "italic" },
  fab: { position: "absolute", left: 16, right: 16 },
  fabBtn: {
    backgroundColor: Colors.primary, borderRadius: 16, paddingVertical: 16, flexDirection: "row",
    alignItems: "center", justifyContent: "center", gap: 10,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  fabText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  empty: { alignItems: "center", gap: 8, paddingVertical: 32 },
  emptyText: { fontSize: 14, color: Colors.textMuted },
});

const pStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface, borderRadius: 14, padding: 14, gap: 10,
    borderLeftWidth: 4, borderLeftColor: Colors.warning, marginBottom: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  amountRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  amount: { fontSize: 22, fontWeight: "800", color: Colors.warning },
  pendingTag: {
    backgroundColor: Colors.warning + "20", paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20, borderWidth: 1, borderColor: Colors.warning + "50",
  },
  statusTag: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1,
  },
  statusText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  pendingText: { fontSize: 10, fontWeight: "800", color: Colors.warning, letterSpacing: 0.5 },
  desc: { fontSize: 13, color: Colors.textSecondary },
  addedOn: { fontSize: 11, color: Colors.textMuted },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border },
  payLabel: { fontSize: 11, fontWeight: "700", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  upiRow: { flexDirection: "row", gap: 8 },
  upiBtn: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center", gap: 4 },
  upiEmoji: { fontSize: 20 },
  upiLabel: { fontSize: 12, fontWeight: "700", color: "#fff" },
  anyUpiBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: Colors.primary + "10", borderRadius: 10, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.primary + "30",
  },
  anyUpiText: { fontSize: 13, fontWeight: "600", color: Colors.primary },
  uploadBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 12,
    borderWidth: 1, borderColor: Colors.primary,
  },
  uploadBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },
});

const depStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, gap: 10, maxHeight: "90%",
  },
  handle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: "center", marginBottom: 8 },
  title: { fontSize: 20, fontWeight: "700", color: Colors.text, marginBottom: 4 },
  label: { fontSize: 12, fontWeight: "700", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  caseItem: {
    padding: 12, borderRadius: 10, backgroundColor: Colors.surfaceAlt,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 6,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  caseItemSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  caseItemText: { fontSize: 13, fontWeight: "600", color: Colors.text, flex: 1 },
  noCases: { fontSize: 13, color: Colors.textMuted, textAlign: "center", padding: 12 },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 14,
    fontSize: 15, color: Colors.text, backgroundColor: Colors.surfaceAlt,
  },
  btnRow: { flexDirection: "row", gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, alignItems: "center" },
  cancelText: { fontSize: 15, fontWeight: "600", color: Colors.textSecondary },
  saveBtn: { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: Colors.primary, alignItems: "center" },
  saveText: { fontSize: 15, fontWeight: "700", color: "#fff" },
});

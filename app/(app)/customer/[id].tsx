import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  Linking, Alert, Platform, TextInput, ActivityIndicator, Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { caseStore } from "@/lib/caseStore";
import { api } from "@/lib/api";

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

// ─── Receipt Request Modal ────────────────────────────────────────────────────
function ReceiptRequestModal({
  visible, item, onClose,
}: {
  visible: boolean;
  item: any;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const insets = useSafeAreaInsets();

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await api.requestReceipt(item.id, {
        loan_no:       item.loan_no,
        customer_name: item.customer_name,
        table_type:    (item as any).case_type || "loan",
        notes:         notes.trim() || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSubmitted(true);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to send request");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSubmitted(false);
    setNotes("");
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={rrStyles.overlay}>
        <View style={[rrStyles.sheet, { paddingBottom: insets.bottom + 24 }]}>
          <View style={rrStyles.handle} />

          {submitted ? (
            // ── Success state ──
            <View style={rrStyles.successContainer}>
              <View style={rrStyles.successIcon}>
                <Ionicons name="checkmark-circle" size={48} color={Colors.success} />
              </View>
              <Text style={rrStyles.successTitle}>Request Sent!</Text>
              <Text style={rrStyles.successMsg}>
                Admin has been notified and will process your receipt request for{" "}
                <Text style={{ fontWeight: "700" }}>{item?.customer_name}</Text>.
              </Text>
              <Pressable style={rrStyles.doneBtn} onPress={handleClose}>
                <Text style={rrStyles.doneBtnText}>Done</Text>
              </Pressable>
            </View>
          ) : (
            // ── Request form ──
            <>
              <View style={rrStyles.headerRow}>
                <View style={rrStyles.receiptIcon}>
                  <Ionicons name="receipt-outline" size={22} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={rrStyles.title}>Request Receipt</Text>
                  <Text style={rrStyles.subtitle} numberOfLines={1}>
                    {item?.customer_name} · {item?.loan_no}
                  </Text>
                </View>
              </View>

              <View style={rrStyles.infoBox}>
                <Ionicons name="information-circle-outline" size={16} color={Colors.info} />
                <Text style={rrStyles.infoText}>
                  Admin will receive a notification and process your receipt request.
                </Text>
              </View>

              <Text style={rrStyles.notesLabel}>Notes (Optional)</Text>
              <TextInput
                style={rrStyles.notesInput}
                placeholder="e.g. Customer paid cash today, needs receipt urgently..."
                placeholderTextColor={Colors.textMuted}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={4}
              />

              <View style={rrStyles.btnRow}>
                <Pressable style={rrStyles.cancelBtn} onPress={handleClose}>
                  <Text style={rrStyles.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[rrStyles.submitBtn, loading && { opacity: 0.6 }]}
                  onPress={handleSubmit}
                  disabled={loading}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <>
                        <Ionicons name="send" size={16} color="#fff" />
                        <Text style={rrStyles.submitText}>Send Request</Text>
                      </>
                  }
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function CustomerDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams();
  const qc = useQueryClient();

  const item = caseStore.get();

  const [extraNumbers, setExtraNumbers] = useState<string[]>((item as any)?.extra_numbers ?? []);
  const [newNumberInput, setNewNumberInput] = useState("");
  const [showAddNumber, setShowAddNumber] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  // Fetch receipt permission for current agent
  const { data: permData } = useQuery({
    queryKey: ["/api/receipt-permission"],
    queryFn:  () => api.getReceiptPermission(),
  });
  const canRequestReceipt = permData?.canRequestReceipt === true;

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
  const caseType = (item as any).case_type === "bkt" ? "bkt" : "loan";

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

  const handleAddNumber = async () => {
    const trimmed = newNumberInput.trim();
    if (!trimmed) { Alert.alert("Enter a valid number"); return; }
    if (trimmed.length < 7) { Alert.alert("Enter a valid phone number"); return; }
    setSaving(true);
    try {
      await api.addExtraNumber(item.id, trimmed, caseType);
      const updated = [...extraNumbers, trimmed];
      setExtraNumbers(updated);
      caseStore.set({ ...item, extra_numbers: updated });
      qc.invalidateQueries({ queryKey: ["/api/cases"] });
      qc.invalidateQueries({ queryKey: ["/api/bkt-cases"] });
      setNewNumberInput("");
      setShowAddNumber(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert("Error", String(e?.message ?? e) || "Failed to save number");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveNumber = async (num: string) => {
    Alert.alert(
      "Remove Number",
      `Remove ${num}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setRemoving(num);
            try {
              await api.removeExtraNumber(item.id, num, caseType);
              const updated = extraNumbers.filter(n => n !== num);
              setExtraNumbers(updated);
              caseStore.set({ ...item, extra_numbers: updated });
              qc.invalidateQueries({ queryKey: ["/api/cases"] });
              qc.invalidateQueries({ queryKey: ["/api/bkt-cases"] });
            } catch {
              Alert.alert("Failed to remove number");
            } finally {
              setRemoving(null);
            }
          },
        },
      ]
    );
  };

  return (
    <>
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

          <View style={styles.amountRow}>
            {[
              { label: "EMI DUE", value: fmt(item.emi_due, "₹"), color: Colors.danger },
              { label: "POS",     value: fmt(item.pos,     "₹"), color: Colors.text  },
              { label: "CBC+LPP", value: fmt(item.cbc_lpp, "₹"), color: (Colors as any).warning ?? "#F59E0B" },
            ].map((a) => (
              <View key={a.label} style={styles.amountCell}>
                <Text style={styles.amountLabel}>{a.label}</Text>
                <Text style={[styles.amountValue, { color: a.color }]}>{a.value}</Text>
              </View>
            ))}
          </View>

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
          <Row label="EMI"        value={fmt(item.emi_amount, "₹")} />
          <Row label="EMI Due"    value={fmt(item.emi_due,    "₹")} valueColor={Colors.danger} />
          <Row label="POS"        value={fmt(item.pos,        "₹")} />
          <Row label="CBC"        value={fmt(item.cbc,        "₹")} />
          <Row label="LPP"        value={fmt(item.lpp,        "₹")} />
          <Row label="CBC + LPP"  value={fmt(item.cbc_lpp,   "₹")} valueColor={(Colors as any).warning ?? "#F59E0B"} />
          {(item.rollback && Number(item.rollback) > 0) && (
            <Row label="Rollback"  value={fmt(item.rollback,  "₹")} valueColor={Colors.info ?? "#3B82F6"} />
          )}
          {(item.clearance && Number(item.clearance) > 0) && (
            <Row label="Clearance" value={fmt(item.clearance, "₹")} valueColor={Colors.success ?? "#22C55E"} />
          )}
          <Row label="First EMI Date"     value={fmtDate(item.first_emi_due_date)} />
          <Row label="Loan Maturity Date" value={fmtDate(item.loan_maturity_date)} />
        </SectionCard>

        {/* ── Contact Details ── */}
        <SectionCard title="Contact Details" icon="call-outline">
          <Row label="Mobile"            value={fmtStr(item.mobile_no)} />
          <Row label="Address"           value={fmtStr(item.address)} />
          <Row label="Reference Address" value={fmtStr(item.reference_address)} />
          {item.ref1_name   && <Row label="Ref 1 Name"   value={fmtStr(item.ref1_name)} />}
          {item.ref1_mobile && <Row label="Ref 1 Mobile" value={fmtStr(item.ref1_mobile)} />}
          {item.ref2_name   && <Row label="Ref 2 Name"   value={fmtStr(item.ref2_name)} />}
          {item.ref2_mobile && <Row label="Ref 2 Mobile" value={fmtStr(item.ref2_mobile)} />}
        </SectionCard>

        {/* ── Vehicle Details ── */}
        <SectionCard title="Vehicle Details" icon="car-outline">
          <Row label="Asset / Make"    value={fmtStr(item.asset_make ?? item.asset_name)} />
          <Row label="Registration No" value={fmtStr(item.registration_no)} />
          <Row label="Engine No"       value={fmtStr(item.engine_no)} />
          <Row label="Chassis No"      value={fmtStr(item.chassis_no)} />
        </SectionCard>

        {/* ── Additional Numbers ── */}
        <SectionCard title="Additional Numbers" icon="phone-portrait-outline">
          {extraNumbers.length === 0 && !showAddNumber && (
            <View style={styles.noNumbersRow}>
              <Ionicons name="information-circle-outline" size={16} color={Colors.textMuted} />
              <Text style={styles.noNumbersText}>No additional numbers added yet</Text>
            </View>
          )}

          {extraNumbers.map((num, i) => (
            <View key={`${num}-${i}`} style={styles.extraNumberRow}>
              <View style={styles.extraNumberLabelWrap}>
                <Text style={styles.extraNumberIndex}>#{phones.length + i + 1}</Text>
                <Text style={styles.extraNumberLabel}>Additional</Text>
              </View>
              <Pressable style={styles.extraNumberCallArea} onPress={() => call(num)}>
                <View style={styles.extraNumberCallIcon}>
                  <Ionicons name="call" size={14} color="#fff" />
                </View>
                <Text style={styles.extraNumberValue}>{num}</Text>
              </Pressable>
              <Pressable
                style={styles.extraNumberDeleteBtn}
                onPress={() => handleRemoveNumber(num)}
                disabled={removing === num}
              >
                {removing === num
                  ? <ActivityIndicator size="small" color={Colors.danger} />
                  : <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                }
              </Pressable>
            </View>
          ))}

          {showAddNumber ? (
            <View style={styles.addNumberForm}>
              <TextInput
                style={styles.addNumberInput}
                placeholder="Enter phone number"
                placeholderTextColor={Colors.textMuted}
                value={newNumberInput}
                onChangeText={setNewNumberInput}
                keyboardType="phone-pad"
                maxLength={15}
                autoFocus
              />
              <View style={styles.addNumberBtns}>
                <Pressable
                  style={styles.addNumberCancelBtn}
                  onPress={() => { setShowAddNumber(false); setNewNumberInput(""); }}
                >
                  <Text style={styles.addNumberCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.addNumberSaveBtn, saving && { opacity: 0.6 }]}
                  onPress={handleAddNumber}
                  disabled={saving}
                >
                  {saving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.addNumberSaveText}>Save</Text>
                  }
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable style={styles.addNumberTrigger} onPress={() => setShowAddNumber(true)}>
              <Ionicons name="add-circle" size={20} color={Colors.primary} />
              <Text style={styles.addNumberTriggerText}>Add New Number</Text>
            </Pressable>
          )}
        </SectionCard>

        {/* ── Request Receipt (only visible if admin granted permission) ── */}
        {canRequestReceipt && (
          <Pressable
            style={styles.receiptRequestBtn}
            onPress={() => setShowReceiptModal(true)}
          >
            <View style={styles.receiptBtnIconWrap}>
              <Ionicons name="receipt-outline" size={22} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.receiptBtnTitle}>Send Receipt</Text>
              <Text style={styles.receiptBtnSubtitle}>Request admin to send a receipt for this case</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.primary} />
          </Pressable>
        )}
      </ScrollView>

      {/* ── Receipt Request Modal ── */}
      <ReceiptRequestModal
        visible={showReceiptModal}
        item={item}
        onClose={() => setShowReceiptModal(false)}
      />
    </>
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
  sectionTitle: {
    fontSize: 13, fontWeight: "700", color: Colors.text,
    textTransform: "uppercase", letterSpacing: 0.5,
  },
  row: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  rowLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: "600", flex: 1 },
  rowValue: { fontSize: 12, color: Colors.text, fontWeight: "700", flex: 1.5, textAlign: "right" },

  noNumbersRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  noNumbersText: { fontSize: 13, color: Colors.textMuted, fontStyle: "italic" },

  extraNumberRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
    gap: 10, minHeight: 58,
  },
  extraNumberLabelWrap: { alignItems: "center", width: 44 },
  extraNumberIndex: { fontSize: 13, fontWeight: "800", color: Colors.primary },
  extraNumberLabel: {
    fontSize: 9, fontWeight: "600", color: Colors.textMuted,
    textTransform: "uppercase", marginTop: 1,
  },
  extraNumberCallArea: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: Colors.primary + "12", borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 12,
  },
  extraNumberCallIcon: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center",
  },
  extraNumberValue: { fontSize: 14, fontWeight: "700", color: Colors.primary, flex: 1, letterSpacing: 0.3 },
  extraNumberDeleteBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.danger + "12", alignItems: "center", justifyContent: "center",
  },

  addNumberForm: {
    padding: 14, gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border,
  },
  addNumberInput: {
    borderWidth: 1.5, borderColor: Colors.primary + "60", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: Colors.text,
    backgroundColor: Colors.surfaceAlt, letterSpacing: 0.5,
  },
  addNumberBtns: { flexDirection: "row", gap: 10 },
  addNumberCancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, alignItems: "center",
  },
  addNumberCancelText: { color: Colors.textSecondary, fontWeight: "600", fontSize: 14 },
  addNumberSaveBtn: {
    flex: 2, paddingVertical: 12, borderRadius: 12,
    backgroundColor: Colors.primary, alignItems: "center",
  },
  addNumberSaveText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  addNumberTrigger: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, margin: 12, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1.5, borderColor: Colors.primary + "50", borderStyle: "dashed",
    backgroundColor: Colors.primary + "06",
  },
  addNumberTriggerText: { color: Colors.primary, fontWeight: "700", fontSize: 14 },

  // ── Request Receipt Button ──
  receiptRequestBtn: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: Colors.surface, borderRadius: 16, padding: 16,
    borderWidth: 1.5, borderColor: Colors.primary + "40",
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
  receiptBtnIconWrap: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.primary + "15", alignItems: "center", justifyContent: "center",
  },
  receiptBtnTitle: { fontSize: 15, fontWeight: "800", color: Colors.primary },
  receiptBtnSubtitle: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
});

const rrStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, gap: 16,
  },
  handle: {
    width: 40, height: 4, backgroundColor: Colors.border,
    borderRadius: 2, alignSelf: "center", marginBottom: 4,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  receiptIcon: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.primary + "15", alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: 18, fontWeight: "800", color: Colors.text },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  infoBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    backgroundColor: Colors.info + "12", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: Colors.info + "30",
  },
  infoText: { flex: 1, fontSize: 13, color: Colors.info, lineHeight: 18 },
  notesLabel: { fontSize: 13, fontWeight: "700", color: Colors.textSecondary, textTransform: "uppercase" },
  notesInput: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 12,
    padding: 12, fontSize: 14, color: Colors.text,
    minHeight: 90, textAlignVertical: "top",
    backgroundColor: Colors.surfaceAlt,
  },
  btnRow: { flexDirection: "row", gap: 12 },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, alignItems: "center",
  },
  cancelText: { fontSize: 15, fontWeight: "600", color: Colors.textSecondary },
  submitBtn: {
    flex: 2, paddingVertical: 14, borderRadius: 12,
    backgroundColor: Colors.primary, alignItems: "center",
    flexDirection: "row", justifyContent: "center", gap: 8,
  },
  submitText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  // Success
  successContainer: { alignItems: "center", gap: 12, paddingVertical: 16 },
  successIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.success + "15", alignItems: "center", justifyContent: "center",
  },
  successTitle: { fontSize: 20, fontWeight: "800", color: Colors.text },
  successMsg: { fontSize: 14, color: Colors.textSecondary, textAlign: "center", lineHeight: 22 },
  doneBtn: {
    marginTop: 8, paddingVertical: 14, paddingHorizontal: 32,
    backgroundColor: Colors.success, borderRadius: 14, alignItems: "center",
  },
  doneBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});

import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Linking, Alert, Modal, ScrollView, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";

// ── Defined feedback codes & full-sentence details ──────────────────────────
// Kept in sync with the FOS feedback codes (see app/(app)/allocation.tsx) so
// telecallers select from the exact same defined statements instead of
// typing free-form feedback.
interface FbCodeMeta {
  code: string;
  desc: string;
  color: string;
}
export const FEEDBACK_CODE_LIST: FbCodeMeta[] = [
  { code: "PTP",   desc: "Promise To Pay",                               color: "#f59e0b" },
  { code: "PAID",  desc: "Customer Already Paid",                         color: "#22c55e" },
  { code: "REPO",  desc: "Vehicle Repossessed",                           color: "#dc2626" },
  { code: "RTP",   desc: "Refuse To Pay",                                 color: "#ef4444" },
  { code: "CAVNA", desc: "Customer Available & Vehicle Not Available",     color: "#8b5cf6" },
  { code: "CNAVA", desc: "Customer Not Available & Vehicle Available",     color: "#f97316" },
  { code: "ANF",   desc: "Address Not Found",                             color: "#64748b" },
  { code: "EXP",   desc: "Expired / Deceased",                            color: "#78716c" },
  { code: "SFT",   desc: "Customer Transferred / Shifted",                color: "#0891b2" },
  { code: "VSL",   desc: "Visit Scheduled / Locked",                      color: "#6366f1" },
  { code: "SKIP",  desc: "Skip Customer",                                 color: "#64748b" },
];

export const DETAIL_SENTENCES: Record<string, string[]> = {
  PTP: [
    "Customer confirmed payment will be made by this week end.",
    "Customer is waiting for salary credit and will pay immediately after.",
    "Customer has promised to arrange funds within 3 days.",
    "Customer agreed to pay EMI amount after getting loan from relative.",
    "Customer requested one more week and gave a firm promise to pay.",
    "Customer needs more time and will call back once funds are ready.",
  ],
  PAID: [
    "Customer has already paid full EMI amount this month.",
    "Customer made a partial payment and remaining will follow shortly.",
    "Customer completed full settlement and loan is now cleared.",
    "Customer paid via UPI transfer and shared payment confirmation.",
    "Customer paid cash directly and receipt has been issued.",
  ],
  REPO: [
    "Vehicle has been peacefully repossessed from customer location.",
    "Vehicle was repossessed with assistance from local police authority.",
    "Customer voluntarily surrendered the vehicle at our office.",
    "Repossession attempt was made but customer managed to take vehicle away.",
  ],
  RTP: [
    "Customer is disputing the loan amount and refusing to pay.",
    "Customer refused to pay without giving any valid reason.",
    "Customer used threatening language and refused to cooperate.",
    "Customer claims they have already paid and showed old receipt.",
    "Customer has filed a complaint and is not responding to calls.",
  ],
  CAVNA: [
    "Customer was present at home but vehicle was not found at the location.",
    "Customer confirmed the vehicle is kept at a different location.",
    "Customer met and spoken to but denies knowing vehicle location.",
    "Customer available but vehicle has been given to a third party.",
  ],
  CNAVA: [
    "Vehicle was found parked at customer address but customer was not home.",
    "Vehicle is confirmed at the location but customer is unreachable on phone.",
    "Vehicle found parked — neighbour confirmed customer will return soon.",
    "Vehicle located near customer home but customer has gone out of town.",
  ],
  ANF: [
    "Address given at time of loan does not exist at the location.",
    "Neighbours are unaware of any such person at this address.",
    "Building/house number does not match any residence in the area.",
    "Area exists but no one at that address recognises the customer.",
  ],
  EXP: [
    "Customer has passed away — confirmed by family members.",
    "Family informed customer is deceased and loan should be closed.",
  ],
  SFT: [
    "Customer has shifted to another city and new address is not known.",
    "Customer confirmed they have relocated and will update new address.",
    "Neighbours confirmed customer has vacated and moved to another state.",
  ],
  VSL: [
    "Visit has been scheduled — customer requested a specific date and time.",
    "Customer will be available for field visit on the agreed date.",
  ],
  SKIP: [
    "Customer is completely untraceable and phone is switched off.",
    "Address given at time of loan is incorrect — no such person found.",
    "Neighbours are unaware of customer and say they never lived here.",
    "Phone number is unreachable and no alternate contact available.",
    "House is vacant and locked — customer appears to have vacated.",
  ],
};

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

// ─── Status action row: Mark Paid / Mark Unpaid / Rollback ─────────────────
function TelecallerStatusBar({
  localItem, caseType, busy, onChange,
}: { localItem: any; caseType: "loan" | "bkt"; busy: string | null; onChange: (status: "Paid" | "Unpaid", rollbackYn?: boolean | null) => void }) {
  const isPaid = localItem.status === "Paid";
  const isRollback = localItem.rollback_yn === true;
  return (
    <View style={manageStyles.statusBar}>
      <Pressable
        style={[manageStyles.statusBtn, isPaid ? manageStyles.statusBtnPaidActive : manageStyles.statusBtnInactive]}
        onPress={() => onChange(isPaid ? "Unpaid" : "Paid")}
        disabled={!!busy}
      >
        {busy === "Paid" ? <ActivityIndicator size="small" color={isPaid ? "#fff" : Colors.success} /> : (
          <>
            <Ionicons name={isPaid ? "checkmark-circle" : "checkmark-circle-outline"} size={16} color={isPaid ? "#fff" : Colors.success} />
            <Text style={[manageStyles.statusBtnText, isPaid && { color: "#fff" }]}>{isPaid ? "Paid ✓" : "Mark Paid"}</Text>
          </>
        )}
      </Pressable>
      {isPaid && (
        <Pressable style={[manageStyles.statusBtn, manageStyles.statusBtnUnpaid]} onPress={() => onChange("Unpaid")} disabled={!!busy}>
          {busy === "Unpaid" ? <ActivityIndicator size="small" color="#fff" /> : (
            <>
              <Ionicons name="close-circle-outline" size={16} color="#fff" />
              <Text style={[manageStyles.statusBtnText, { color: "#fff" }]}>Unpaid</Text>
            </>
          )}
        </Pressable>
      )}
      <Pressable
        style={[manageStyles.statusBtn, isRollback ? manageStyles.statusBtnRollbackActive : manageStyles.statusBtnInactive]}
        onPress={() => onChange(isPaid ? "Paid" : "Unpaid", !isRollback)}
        disabled={!!busy}
      >
        {busy === "rollback" ? <ActivityIndicator size="small" color={isRollback ? "#fff" : Colors.info} /> : (
          <>
            <Ionicons name={isRollback ? "refresh-circle" : "refresh-circle-outline"} size={16} color={isRollback ? "#fff" : Colors.info} />
            <Text style={[manageStyles.statusBtnText, isRollback && { color: "#fff" }]}>{isRollback ? "Rollback ✓" : "Rollback"}</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

export function CaseDetailModal({ item, onClose, onUpdated }: { item: any; onClose: () => void; onUpdated?: () => void }) {
  const insets = useSafeAreaInsets();
  const [localItem, setLocalItem] = useState<any>(item);
  const [statusBusy, setStatusBusy] = useState<string | null>(null);
  const [feedbackCode, setFeedbackCode] = useState("");
  const [feedbackText, setFeedbackText] = useState("");
  const [commentsText, setCommentsText] = useState("");
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [extraNumbers, setExtraNumbers] = useState<string[]>([]);
  const [newNumber, setNewNumber] = useState("");
  const [numberBusy, setNumberBusy] = useState<string | null>(null);

  useEffect(() => {
    setLocalItem(item);
    setFeedbackCode(item?.feedback_code || "");
    setFeedbackText(item?.latest_feedback || "");
    setCommentsText(item?.feedback_comments || "");
    setExtraNumbers(item?.extra_numbers || []);
    setNewNumber("");
  }, [item?.id]);

  if (!item || !localItem) return null;
  const statusColor = STATUS_COLORS[localItem.status] || Colors.primary;
  const caseType: "loan" | "bkt" = localItem.case_type === "bkt" ? "bkt" : "loan";

  const applyUpdate = async (payload: Record<string, unknown>) => {
    if (caseType === "bkt") await api.updateBktFeedback(localItem.id, payload);
    else await api.updateFeedback(localItem.id, payload);
  };

  const handleStatusChange = async (status: "Paid" | "Unpaid", rollbackYn?: boolean | null) => {
    setStatusBusy(rollbackYn !== undefined ? "rollback" : status);
    try {
      await applyUpdate({
        status,
        feedback: localItem.latest_feedback ?? null,
        feedback_code: localItem.feedback_code ?? null,
        comments: localItem.feedback_comments ?? null,
        // Leaving a case in the PTP state clears the PTP date, same as the FOS app.
        ptp_date: localItem.status === "PTP" ? null : (localItem.ptp_date ? String(localItem.ptp_date).slice(0, 10) : null),
        rollback_yn: rollbackYn ?? localItem.rollback_yn ?? null,
      });
      setLocalItem((prev: any) => ({ ...prev, status, rollback_yn: rollbackYn ?? prev.rollback_yn ?? null }));
      onUpdated?.();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to update status");
    } finally {
      setStatusBusy(null);
    }
  };

  const handleSaveFeedback = async () => {
    if (!feedbackCode) {
      Alert.alert("Error", "Please select a Feedback Code");
      return;
    }
    setSavingFeedback(true);
    try {
      await applyUpdate({
        status: localItem.status,
        feedback: feedbackText.trim() || null,
        feedback_code: feedbackCode,
        comments: commentsText.trim() || null,
        ptp_date: localItem.ptp_date ? String(localItem.ptp_date).slice(0, 10) : null,
        rollback_yn: localItem.rollback_yn ?? null,
      });
      setLocalItem((prev: any) => ({
        ...prev,
        latest_feedback: feedbackText.trim(),
        feedback_code: feedbackCode,
        feedback_comments: commentsText.trim(),
      }));
      onUpdated?.();
      Alert.alert("Saved", "Feedback updated.");
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to save feedback");
    } finally {
      setSavingFeedback(false);
    }
  };

  const activeFbMeta = FEEDBACK_CODE_LIST.find((f) => f.code === feedbackCode);
  const detailSentences: string[] = feedbackCode ? (DETAIL_SENTENCES[feedbackCode] ?? []) : [];

  const handleAddNumber = async () => {
    const trimmed = newNumber.trim();
    if (!trimmed) return;
    if (extraNumbers.includes(trimmed)) { setNewNumber(""); return; }
    setNumberBusy("add");
    try {
      await api.addExtraNumber(localItem.id, trimmed, caseType);
      setExtraNumbers((prev) => [...prev, trimmed]);
      setNewNumber("");
      onUpdated?.();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to add number");
    } finally {
      setNumberBusy(null);
    }
  };

  const handleRemoveNumber = async (num: string) => {
    setNumberBusy(num);
    try {
      await api.removeExtraNumber(localItem.id, num, caseType);
      setExtraNumbers((prev) => prev.filter((n) => n !== num));
      onUpdated?.();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to remove number");
    } finally {
      setNumberBusy(null);
    }
  };

  const rows = [
    { label: "FOS Agent", value: localItem.agent_name },
    { label: "Status", value: localItem.status },
    { label: "Customer Name", value: localItem.customer_name },
    { label: "Loan No", value: localItem.loan_no },
    { label: "BKT", value: localItem.bkt },
    { label: "APP ID", value: localItem.app_id },
    { label: "Address", value: localItem.address },
    { label: "Mobile No", value: localItem.mobile_no, phone: true },
    { label: "Ref Address", value: localItem.reference_address },
    { label: "POS", value: fmt(localItem.pos, "₹") },
    { label: "EMI", value: fmt(localItem.emi_amount, "₹") },
    { label: "EMI Due", value: fmt(localItem.emi_due, "₹") },
    { label: "CBC", value: fmt(localItem.cbc, "₹") },
    { label: "LPP", value: fmt(localItem.lpp, "₹") },
    { label: "CBC + LPP", value: fmt(localItem.cbc_lpp, "₹") },
    { label: "Rollback", value: fmt(localItem.rollback, "₹") },
    { label: "Clearance", value: fmt(localItem.clearance, "₹") },
    { label: "Tenor", value: localItem.tenor },
    { label: "Product", value: localItem.pro },
    { label: "Asset Name", value: localItem.asset_make },
    { label: "Reg No", value: localItem.registration_no },
    { label: "Engine No", value: localItem.engine_no },
    { label: "Chassis No", value: localItem.chassis_no },
    { label: "First EMI Date", value: localItem.first_emi_due_date },
    { label: "Maturity Date", value: localItem.loan_maturity_date },
  ];

  return (
    <Modal visible={!!item} transparent={false} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[detailStyles.screen, { paddingTop: insets.top }]}>
          <View style={[detailStyles.header, { backgroundColor: statusColor }]}>
            <Pressable onPress={onClose} style={detailStyles.backBtn}>
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </Pressable>
            <Text style={detailStyles.headerTitle}>Details</Text>
            <View style={detailStyles.statusPill}>
              <Text style={[detailStyles.statusPillText, { color: statusColor }]}>{localItem.status}</Text>
            </View>
          </View>
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* ── Mark Paid / Unpaid / Rollback ─────────────────────────────── */}
            <View style={manageStyles.section}>
              <Text style={manageStyles.sectionTitle}>Update Status</Text>
              <TelecallerStatusBar localItem={localItem} caseType={caseType} busy={statusBusy} onChange={handleStatusChange} />
            </View>

            {/* ── Feedback ───────────────────────────────────────────────────── */}
            <View style={manageStyles.section}>
              <Text style={manageStyles.sectionTitle}>Feedback Code</Text>
              <View style={{ gap: 6, marginBottom: 4 }}>
                {FEEDBACK_CODE_LIST.map(({ code, desc, color }) => {
                  const selected = feedbackCode === code;
                  return (
                    <Pressable
                      key={code}
                      style={[
                        manageStyles.fcRow,
                        selected && { borderColor: color, backgroundColor: color + "0D" },
                      ]}
                      onPress={() => {
                        const newCode = feedbackCode === code ? "" : code;
                        setFeedbackCode(newCode);
                        setFeedbackText(""); // reset detail sentence when code changes
                      }}
                    >
                      <View style={[manageStyles.fcDot, selected && { backgroundColor: color }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={[manageStyles.fcName, selected && { color }]}>{code}</Text>
                        <Text style={manageStyles.fcDesc}>{desc}</Text>
                      </View>
                      {selected && <Ionicons name="checkmark-circle" size={20} color={color} />}
                    </Pressable>
                  );
                })}
              </View>

              {feedbackCode !== "" && (
                <>
                  <Text style={manageStyles.sectionTitle}>Detail Feedback</Text>
                  <View style={{ gap: 6, marginTop: 4, marginBottom: 4 }}>
                    {detailSentences.length === 0 ? (
                      <Text style={manageStyles.noSentenceText}>No pre-defined statements for this code.</Text>
                    ) : (
                      detailSentences.map((sentence) => {
                        const selected = feedbackText === sentence;
                        const color = activeFbMeta?.color || Colors.primary;
                        return (
                          <Pressable
                            key={sentence}
                            style={[
                              manageStyles.sentenceRow,
                              selected && { borderColor: color, backgroundColor: color + "0D" },
                            ]}
                            onPress={() => setFeedbackText(selected ? "" : sentence)}
                          >
                            <View style={[manageStyles.sentenceDot, selected && { backgroundColor: color }]} />
                            <Text style={[manageStyles.sentenceText, selected && { color, fontWeight: "600" }]}>
                              {sentence}
                            </Text>
                            {selected && <Ionicons name="checkmark-circle" size={18} color={color} />}
                          </Pressable>
                        );
                      })
                    )}
                  </View>
                </>
              )}

              <TextInput
                style={[manageStyles.input, manageStyles.inputMultiline]}
                placeholder="Comments"
                placeholderTextColor={Colors.textMuted}
                value={commentsText}
                onChangeText={setCommentsText}
                multiline
              />
              <Pressable style={manageStyles.saveBtn} onPress={handleSaveFeedback} disabled={savingFeedback}>
                {savingFeedback ? <ActivityIndicator size="small" color="#fff" /> : (
                  <>
                    <Ionicons name="save-outline" size={16} color="#fff" />
                    <Text style={manageStyles.saveBtnText}>Save Feedback</Text>
                  </>
                )}
              </Pressable>
            </View>

            {/* ── Extra numbers ──────────────────────────────────────────────── */}
            <View style={manageStyles.section}>
              <Text style={manageStyles.sectionTitle}>Additional Numbers</Text>
              {extraNumbers.map((num) => (
                <View key={num} style={manageStyles.numberRow}>
                  <Pressable style={manageStyles.numberCallArea} onPress={() => Linking.openURL(`tel:${num}`)}>
                    <Ionicons name="call" size={14} color={Colors.info} />
                    <Text style={manageStyles.numberText}>{num}</Text>
                  </Pressable>
                  <Pressable style={manageStyles.numberDeleteBtn} onPress={() => handleRemoveNumber(num)} disabled={numberBusy === num}>
                    {numberBusy === num ? <ActivityIndicator size="small" color={Colors.danger} /> : <Ionicons name="trash-outline" size={16} color={Colors.danger} />}
                  </Pressable>
                </View>
              ))}
              <View style={manageStyles.numberAddRow}>
                <TextInput
                  style={[manageStyles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder="Add a phone number"
                  placeholderTextColor={Colors.textMuted}
                  value={newNumber}
                  onChangeText={setNewNumber}
                  keyboardType="phone-pad"
                  maxLength={15}
                />
                <Pressable style={manageStyles.numberAddBtn} onPress={handleAddNumber} disabled={numberBusy === "add"}>
                  {numberBusy === "add" ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="add" size={20} color="#fff" />}
                </Pressable>
              </View>
            </View>

            {rows.map((r, i) => (
              <TableRow key={r.label} label={r.label} value={r.value} phone={r.phone} even={i % 2 === 1} />
            ))}
            <View style={{ height: insets.bottom + 24 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const manageStyles = StyleSheet.create({
  section: { paddingHorizontal: 12, paddingTop: 14, paddingBottom: 4, gap: 8 },
  sectionTitle: { fontSize: 12, fontWeight: "800", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.4 },
  statusBar: { flexDirection: "row", gap: 8 },
  statusBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 10, borderRadius: 10, gap: 6, borderWidth: 1.5,
  },
  statusBtnInactive: { backgroundColor: Colors.surface, borderColor: Colors.border },
  statusBtnPaidActive: { backgroundColor: Colors.success, borderColor: Colors.success },
  statusBtnUnpaid: { backgroundColor: Colors.danger, borderColor: Colors.danger },
  statusBtnRollbackActive: { backgroundColor: Colors.info, borderColor: Colors.info },
  statusBtnText: { fontSize: 12, fontWeight: "700", color: Colors.text },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 13, color: Colors.text, backgroundColor: Colors.surface, marginBottom: 8,
  },
  inputMultiline: { minHeight: 70, textAlignVertical: "top" },
  saveBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 11,
  },
  saveBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  numberRow: {
    flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6,
  },
  numberCallArea: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.primary + "12", borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12,
  },
  numberText: { fontSize: 13, fontWeight: "700", color: Colors.primary },
  numberDeleteBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.danger + "12",
    alignItems: "center", justifyContent: "center",
  },
  numberAddRow: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 2 },
  numberAddBtn: {
    width: 40, height: 40, borderRadius: 10, backgroundColor: Colors.primary,
    alignItems: "center", justifyContent: "center",
  },
  // Feedback code rows
  fcRow: {
    flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, paddingHorizontal: 12,
    borderRadius: 10, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  fcDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: Colors.border },
  fcName: { fontSize: 13, fontWeight: "700", color: Colors.text },
  fcDesc: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  // Full-sentence detail rows
  sentenceRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 11, paddingHorizontal: 12,
    borderRadius: 10, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  sentenceDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: Colors.border, marginTop: 3, flexShrink: 0 },
  sentenceText: { flex: 1, fontSize: 13, color: Colors.text, lineHeight: 19 },
  noSentenceText: { fontSize: 12, color: Colors.textMuted, fontStyle: "italic", marginBottom: 4 },
});

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

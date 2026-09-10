import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Linking, Alert, Modal, ScrollView, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";

// ── Defined feedback codes ───────────────────────────────────────────────────
// Telecallers only ever pick from this fixed, short set of call outcomes.
interface FbCodeMeta {
  code: string;
  desc: string;
  color: string;
}
export const FEEDBACK_CODE_LIST: FbCodeMeta[] = [
  { code: "PTP", desc: "Promise To Pay",      color: "#f59e0b" },
  { code: "CNR", desc: "Call Not Received",   color: "#64748b" },
  { code: "SWO", desc: "Switched Off",        color: "#78716c" },
  { code: "RTP", desc: "Refuse To Pay",       color: "#ef4444" },
];

const PTP_DATE_REGEX = /^\d{2}-\d{2}-\d{4}$/;

// "DD-MM-YYYY" → "YYYY-MM-DD" for the API; leaves other input untouched.
function toIsoDate(val: string): string {
  const parts = val.trim().split(/[-/]/);
  if (parts.length === 3 && parts[2].length === 4) {
    return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
  }
  return val;
}

// "YYYY-MM-DD" (or a full timestamp) → "DD-MM-YYYY" for display/editing.
function toDisplayDate(val: string | null | undefined): string {
  if (!val) return "";
  const iso = String(val).slice(0, 10);
  const parts = iso.split("-");
  if (parts.length === 3 && parts[0].length === 4) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return "";
}

// ─── PTP reminder (WhatsApp / SMS) ──────────────────────────────────────────
function firstPhone(item: any): string | null {
  const raw = String(item?.mobile_no || "").split(",")[0]?.trim();
  return raw || null;
}

// wa.me needs a country code prefix — assume India (+91) for a bare 10-digit
// number, same assumption the rest of the app makes about local numbers.
function toWhatsAppNumber(num: string): string {
  const digits = num.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

export function buildPtpReminderMessage(item: any): string {
  const name = item?.customer_name || "Customer";
  const dueAmount = Number(item?.emi_due) > 0 ? Number(item.emi_due) : Number(item?.pos) > 0 ? Number(item.pos) : null;
  const amountText = dueAmount ? `₹${dueAmount.toLocaleString("en-IN")}` : "the due amount";
  const dateText = toDisplayDate(item?.ptp_date) || "the promised date";
  return `Dear ${name}, this is a reminder regarding loan ${item?.loan_no || ""}. You had promised to pay ${amountText} on ${dateText}. Kindly complete the payment at the earliest. Thank you.`;
}

export function sendPtpWhatsApp(item: any) {
  const phone = firstPhone(item);
  if (!phone) { Alert.alert("No number available", "This case has no mobile number saved."); return; }
  const url = `https://wa.me/${toWhatsAppNumber(phone)}?text=${encodeURIComponent(buildPtpReminderMessage(item))}`;
  Linking.openURL(url).catch(() => Alert.alert("Error", "Could not open WhatsApp. Is it installed?"));
}

// ── Agent PTP summary (WhatsApp to the FOS agent, not the customer) ────────
// Telecallers also need to hand an agent their own list of tomorrow's PTPs —
// e.g. "Satish has 3 PTPs tomorrow" — as one consolidated WhatsApp message to
// that agent's own number, rather than one reminder per customer.
export function buildAgentPtpSummaryMessage(agentName: string, items: any[]): string {
  const dateText = toDisplayDate(items[0]?.ptp_date) || "tomorrow";
  const lines = items.map((it, i) => {
    const dueAmount = Number(it?.emi_due) > 0 ? Number(it.emi_due) : Number(it?.pos) > 0 ? Number(it.pos) : null;
    const amountText = dueAmount ? `₹${dueAmount.toLocaleString("en-IN")}` : "amount not set";
    return `${i + 1}. ${it.customer_name || "Customer"} — Loan ${it.loan_no || "—"} — ${amountText}`;
  });
  return `Hi ${agentName}, you have ${items.length} PTP${items.length !== 1 ? "s" : ""} due on ${dateText}:\n\n${lines.join("\n")}\n\nPlease follow up with these customers. Thank you.`;
}

export function sendAgentPtpSummaryWhatsApp(items: any[]) {
  if (!items.length) return;
  const agentName = items[0]?.agent_name || "Agent";
  const agentPhone = firstPhone({ mobile_no: items[0]?.agent_phone });
  if (!agentPhone) { Alert.alert("No number available", `${agentName} doesn't have a phone number saved.`); return; }
  const url = `https://wa.me/${toWhatsAppNumber(agentPhone)}?text=${encodeURIComponent(buildAgentPtpSummaryMessage(agentName, items))}`;
  Linking.openURL(url).catch(() => Alert.alert("Error", "Could not open WhatsApp. Is it installed?"));
}

export function sendPtpSms(item: any) {
  const phone = firstPhone(item);
  if (!phone) { Alert.alert("No number available", "This case has no mobile number saved."); return; }
  const sep = Platform.OS === "ios" ? "&" : "?";
  const url = `sms:${phone}${sep}body=${encodeURIComponent(buildPtpReminderMessage(item))}`;
  Linking.openURL(url).catch(() => Alert.alert("Error", "Could not open Messages."));
}

// Group a flat list of cases by their FOS agent — used to show PTP follow-ups
// (and bulk WhatsApp sends) agent-wise instead of one long mixed list.
export function groupCasesByAgent(items: any[]): { agentId: string; agentName: string; items: any[] }[] {
  const order: string[] = [];
  const map = new Map<string, any[]>();
  for (const it of items) {
    const key = String(it?.agent_id ?? it?.agent_name ?? "unassigned");
    if (!map.has(key)) { map.set(key, []); order.push(key); }
    map.get(key)!.push(it);
  }
  return order.map((key) => {
    const list = map.get(key)!;
    return { agentId: key, agentName: list[0]?.agent_name || "Unassigned", items: list };
  });
}

// ── Bulk WhatsApp send ───────────────────────────────────────────────────────
// wa.me links only ever open one chat at a time, so a true "send to everyone
// at once" isn't possible — instead this walks the telecaller through each
// recipient one tap at a time, tracking progress, so a whole agent's (or the
// whole day's) tomorrow-PTP reminders can be fired off in one continuous flow.
export function BulkWhatsAppModal({
  visible, title, items, onClose, mode = "customer",
}: {
  visible: boolean;
  title: string;
  // "customer" mode: array of PTP case rows, one WhatsApp reminder each.
  // "agent" mode: array of { agentId, agentName, items }, one consolidated
  // WhatsApp summary per agent (sent to the agent's own number).
  items: any[];
  onClose: () => void;
  mode?: "customer" | "agent";
}) {
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const [sentCount, setSentCount] = useState(0);

  useEffect(() => {
    if (visible) { setIndex(0); setSentCount(0); }
  }, [visible, items]);

  if (!visible) return null;

  const total = items.length;
  const current = items[index];
  const isDone = index >= total || !current;
  const currentPhone = !current ? null : mode === "agent"
    ? firstPhone({ mobile_no: current.items?.[0]?.agent_phone })
    : firstPhone(current);

  const sendCurrent = () => {
    if (!current) return;
    if (mode === "agent") sendAgentPtpSummaryWhatsApp(current.items);
    else sendPtpWhatsApp(current);
    setSentCount((c) => c + 1);
    setIndex((i) => i + 1);
  };

  const skipCurrent = () => setIndex((i) => i + 1);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={bulkStyles.overlay}>
        <View style={[bulkStyles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={bulkStyles.header}>
            <View style={{ flex: 1 }}>
              <Text style={bulkStyles.title} numberOfLines={1}>{title}</Text>
              <Text style={bulkStyles.subtitle}>
                {isDone ? `Done — sent ${sentCount} of ${total}` : `${index + 1} of ${total} · ${sentCount} sent so far`}
              </Text>
            </View>
            <Pressable onPress={onClose} style={bulkStyles.closeBtn}>
              <Ionicons name="close" size={22} color={Colors.text} />
            </Pressable>
          </View>

          <View style={bulkStyles.progressTrack}>
            <View style={[bulkStyles.progressFill, { width: `${total ? Math.min(100, (index / total) * 100) : 0}%` }]} />
          </View>

          {isDone ? (
            <View style={bulkStyles.doneBox}>
              <Ionicons name="checkmark-done-circle" size={40} color={Colors.success} />
              <Text style={bulkStyles.doneText}>
                {mode === "agent"
                  ? `Sent PTP summaries to ${sentCount} of ${total} agent${total !== 1 ? "s" : ""}.`
                  : `Sent reminders to ${sentCount} of ${total} customer${total !== 1 ? "s" : ""}.`}
              </Text>
              <Pressable style={bulkStyles.primaryBtn} onPress={onClose}>
                <Text style={bulkStyles.primaryBtnText}>Close</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={bulkStyles.currentCard}>
                {mode === "agent" ? (
                  <>
                    <Text style={bulkStyles.currentName} numberOfLines={1}>{current.agentName}</Text>
                    <Text style={bulkStyles.currentMeta}>
                      {current.items.length} PTP{current.items.length !== 1 ? "s" : ""} due · consolidated summary
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={bulkStyles.currentName} numberOfLines={1}>{current.customer_name || "Customer"}</Text>
                    <Text style={bulkStyles.currentMeta}>Loan {current.loan_no || "—"} · Due {toDisplayDate(current.ptp_date) || "—"}</Text>
                    {current.agent_name ? <Text style={bulkStyles.currentMeta}>Agent: {current.agent_name}</Text> : null}
                  </>
                )}
                <Text style={bulkStyles.currentMeta}>{currentPhone || "No number saved"}</Text>
              </View>

              <Text style={bulkStyles.hint}>
                {mode === "agent"
                  ? "Tap \"Send WhatsApp\" to open WhatsApp with this agent's full PTP list pre-filled, then come back here to move on to the next agent."
                  : "Tap \"Send WhatsApp\" to open WhatsApp with the reminder pre-filled for this customer, then come back here to move on to the next one."}
              </Text>

              <View style={bulkStyles.actionsRow}>
                <Pressable style={bulkStyles.skipBtn} onPress={skipCurrent}>
                  <Text style={bulkStyles.skipBtnText}>Skip</Text>
                </Pressable>
                <Pressable
                  style={[bulkStyles.primaryBtn, bulkStyles.whatsAppBtn, !currentPhone && { opacity: 0.5 }]}
                  onPress={sendCurrent}
                  disabled={!currentPhone}
                >
                  <Ionicons name="logo-whatsapp" size={18} color="#fff" />
                  <Text style={bulkStyles.primaryBtnText}>Send WhatsApp</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const bulkStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, gap: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { fontSize: 16, fontWeight: "800", color: Colors.text },
  subtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 2, fontWeight: "600" },
  closeBtn: { padding: 4 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: Colors.surfaceAlt, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3, backgroundColor: "#25D366" },
  currentCard: { backgroundColor: Colors.surfaceAlt, borderRadius: 14, padding: 14, gap: 3 },
  currentName: { fontSize: 16, fontWeight: "800", color: Colors.text },
  currentMeta: { fontSize: 12, color: Colors.textSecondary, fontWeight: "600" },
  hint: { fontSize: 12, color: Colors.textMuted, lineHeight: 17 },
  actionsRow: { flexDirection: "row", gap: 10 },
  skipBtn: { paddingHorizontal: 16, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: Colors.surfaceAlt },
  skipBtnText: { fontSize: 13, fontWeight: "700", color: Colors.textSecondary },
  primaryBtn: { paddingVertical: 13, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: Colors.primary },
  whatsAppBtn: { flex: 1, flexDirection: "row", gap: 8, backgroundColor: "#25D366" },
  primaryBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  doneBox: { alignItems: "center", gap: 10, paddingVertical: 14 },
  doneText: { fontSize: 14, color: Colors.textSecondary, fontWeight: "600", textAlign: "center" },
});

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
  const [ptpDateText, setPtpDateText] = useState("");
  const [commentsText, setCommentsText] = useState("");
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [extraNumbers, setExtraNumbers] = useState<string[]>([]);
  const [newNumber, setNewNumber] = useState("");
  const [numberBusy, setNumberBusy] = useState<string | null>(null);

  useEffect(() => {
    setLocalItem(item);
    setFeedbackCode(item?.feedback_code || "");
    setPtpDateText(toDisplayDate(item?.ptp_date));
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
    if (feedbackCode === "PTP" && !PTP_DATE_REGEX.test(ptpDateText.trim())) {
      Alert.alert("Error", "Please enter a valid PTP date (DD-MM-YYYY)");
      return;
    }
    setSavingFeedback(true);
    try {
      const meta = FEEDBACK_CODE_LIST.find((f) => f.code === feedbackCode);
      // Only a PTP save (with a date the telecaller just typed) changes the
      // stored PTP date. Any other feedback code leaves it exactly as-is —
      // it must never be silently cleared out from under the telecaller.
      const nextPtpDate = feedbackCode === "PTP"
        ? toIsoDate(ptpDateText.trim())
        : (localItem.ptp_date ? String(localItem.ptp_date).slice(0, 10) : null);
      await applyUpdate({
        status: feedbackCode === "PTP" ? "PTP" : localItem.status,
        feedback: meta?.desc ?? feedbackCode,
        feedback_code: feedbackCode,
        comments: commentsText.trim() || null,
        ptp_date: nextPtpDate,
        rollback_yn: localItem.rollback_yn ?? null,
      });
      setLocalItem((prev: any) => ({
        ...prev,
        status: feedbackCode === "PTP" ? "PTP" : prev.status,
        latest_feedback: meta?.desc ?? feedbackCode,
        feedback_code: feedbackCode,
        feedback_comments: commentsText.trim(),
        ptp_date: nextPtpDate,
      }));
      onUpdated?.();
      Alert.alert("Saved", "Feedback updated.");
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to save feedback");
    } finally {
      setSavingFeedback(false);
    }
  };

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
            <Text style={detailStyles.headerTitle} numberOfLines={1}>{localItem.customer_name || "Details"}</Text>
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

            {/* ── PTP reminder ───────────────────────────────────────────────── */}
            {localItem.status === "PTP" && localItem.ptp_date ? (
              <View style={manageStyles.section}>
                <Text style={manageStyles.sectionTitle}>PTP Reminder · {toDisplayDate(localItem.ptp_date)}</Text>
                <View style={manageStyles.reminderRow}>
                  <Pressable style={[manageStyles.reminderBtn, { backgroundColor: "#25D366" }]} onPress={() => sendPtpWhatsApp(localItem)}>
                    <Ionicons name="logo-whatsapp" size={16} color="#fff" />
                    <Text style={manageStyles.reminderBtnText}>WhatsApp</Text>
                  </Pressable>
                  <Pressable style={[manageStyles.reminderBtn, { backgroundColor: Colors.info }]} onPress={() => sendPtpSms(localItem)}>
                    <Ionicons name="chatbox-ellipses" size={16} color="#fff" />
                    <Text style={manageStyles.reminderBtnText}>SMS</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

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
                      onPress={() => setFeedbackCode(feedbackCode === code ? "" : code)}
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

              {feedbackCode === "PTP" && (
                <>
                  <Text style={manageStyles.sectionTitle}>PTP Date</Text>
                  <TextInput
                    style={manageStyles.input}
                    placeholder="DD-MM-YYYY"
                    placeholderTextColor={Colors.textMuted}
                    value={ptpDateText}
                    onChangeText={setPtpDateText}
                    keyboardType="numeric"
                    maxLength={10}
                  />
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

            <View style={[manageStyles.section, { paddingHorizontal: 0, paddingVertical: 0, overflow: "hidden" }]}>
              {rows.map((r, i) => (
                <TableRow key={r.label} label={r.label} value={r.value} phone={r.phone} even={i % 2 === 1} />
              ))}
            </View>
            <View style={{ height: insets.bottom + 24 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const manageStyles = StyleSheet.create({
  section: {
    marginHorizontal: 12, marginTop: 12, backgroundColor: "#fff", borderRadius: 16,
    paddingHorizontal: 14, paddingTop: 14, paddingBottom: 14, gap: 8,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 1,
  },
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
  reminderRow: { flexDirection: "row", gap: 8 },
  reminderBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 10, borderRadius: 10, gap: 6,
  },
  reminderBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  // Feedback code rows
  fcRow: {
    flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, paddingHorizontal: 12,
    borderRadius: 10, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  fcDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: Colors.border },
  fcName: { fontSize: 13, fontWeight: "700", color: Colors.text },
  fcDesc: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
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
          <View style={[cardStyles.statusBadge, { backgroundColor: statusColor + "1A" }]}>
            <View style={[cardStyles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[cardStyles.statusText, { color: statusColor }]}>{item.status}</Text>
          </View>
        </View>

        {item.agent_name ? (
          <View style={cardStyles.agentRow}>
            <Ionicons name="person" size={12} color={Colors.primary} />
            <Text style={cardStyles.agentName}>{item.agent_name}</Text>
          </View>
        ) : null}

        {/* Loan No + BKT */}
        <View style={cardStyles.infoRow}>
          <View style={cardStyles.infoCell}>
            <Text style={cardStyles.infoLabel}>LOAN NO</Text>
            <Text style={cardStyles.infoValue} numberOfLines={1}>{item.loan_no || "—"}</Text>
          </View>
          <View style={cardStyles.infoCellSmall}>
            <Text style={cardStyles.infoLabel}>BKT</Text>
            <Text style={[cardStyles.infoValue, { color: Colors.primary }]}>{item.bkt ?? "—"}</Text>
          </View>
        </View>

        {/* EMI Due + POS — the two numbers that matter most on a call */}
        <View style={cardStyles.infoRow}>
          <View style={cardStyles.infoCell}>
            <Text style={cardStyles.infoLabel}>EMI DUE</Text>
            <Text style={[cardStyles.infoValue, { color: Colors.danger }]}>{fmt(item.emi_due, "₹")}</Text>
          </View>
          <View style={cardStyles.infoCell}>
            <Text style={cardStyles.infoLabel}>POS</Text>
            <Text style={cardStyles.infoValue}>{fmt(item.pos, "₹")}</Text>
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
          <Ionicons name="chatbubble-ellipses-outline" size={14} color={Colors.textSecondary} style={{ marginTop: 1 }} />
          <Text style={cardStyles.feedbackValue} numberOfLines={2}>{item.latest_feedback}</Text>
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

// ─── PTP queue card — used on the overdue/due-today follow-up screen ────────
export type PtpQueueVariant = "overdue" | "dueToday" | "dueTomorrow";

export function PtpQueueCard({
  item, overdue, variant, onDetails,
}: {
  item: any;
  // Kept for backward compatibility — prefer `variant`. If only `overdue` is
  // passed, `true` maps to "overdue" and `false` maps to "dueToday".
  overdue?: boolean;
  variant?: PtpQueueVariant;
  onDetails: (item: any) => void;
}) {
  const resolvedVariant: PtpQueueVariant = variant ?? (overdue ? "overdue" : "dueToday");
  const isOverdue = resolvedVariant === "overdue";
  const call = () => {
    const phone = String(item.mobile_no || "").split(",")[0]?.trim();
    if (!phone) { Alert.alert("No number available"); return; }
    Linking.openURL(`tel:${phone}`);
  };
  const daysLate = isOverdue ? Math.max(1, Math.round((Date.now() - new Date(item.ptp_date).getTime()) / 86400000)) : 0;
  const badgeColor = resolvedVariant === "overdue" ? Colors.danger : resolvedVariant === "dueTomorrow" ? Colors.warning : Colors.statusPTP;
  const badgeText = resolvedVariant === "overdue" ? `${daysLate}d overdue` : resolvedVariant === "dueTomorrow" ? "Due tomorrow" : "Due today";

  return (
    <View style={cardStyles.card}>
      <Pressable style={cardStyles.cardTapArea} onPress={() => onDetails(item)}>
        <View style={cardStyles.cardHeader}>
          <View style={cardStyles.cardNameRow}>
            <Ionicons name="person-circle" size={20} color={Colors.primary} />
            <Text style={cardStyles.cardName} numberOfLines={1}>{item.customer_name}</Text>
          </View>
          <View style={[cardStyles.statusBadge, { backgroundColor: badgeColor + "1A" }]}>
            <View style={[cardStyles.statusDot, { backgroundColor: badgeColor }]} />
            <Text style={[cardStyles.statusText, { color: badgeColor }]}>
              {badgeText}
            </Text>
          </View>
        </View>
        {item.agent_name ? (
          <View style={cardStyles.agentRow}>
            <Ionicons name="person" size={12} color={Colors.primary} />
            <Text style={cardStyles.agentName}>{item.agent_name}</Text>
          </View>
        ) : null}
        <View style={cardStyles.infoRow}>
          <View style={cardStyles.infoCell}>
            <Text style={cardStyles.infoLabel}>LOAN NO</Text>
            <Text style={cardStyles.infoValue} numberOfLines={1}>{item.loan_no || "—"}</Text>
          </View>
          <View style={cardStyles.infoCell}>
            <Text style={cardStyles.infoLabel}>PTP DATE</Text>
            <Text style={[cardStyles.infoValue, { color: badgeColor }]}>{toDisplayDate(item.ptp_date) || "—"}</Text>
          </View>
          <View style={cardStyles.infoCell}>
            <Text style={cardStyles.infoLabel}>EMI DUE</Text>
            <Text style={cardStyles.infoValue}>{fmt(item.emi_due || item.pos, "₹")}</Text>
          </View>
        </View>
      </Pressable>

      <View style={cardStyles.cardActions}>
        <Pressable style={[cardStyles.actionBtn, cardStyles.callBtn]} onPress={call}>
          <Ionicons name="call" size={15} color="#fff" />
        </Pressable>
        <Pressable style={[cardStyles.actionBtn, { backgroundColor: "#25D366" }]} onPress={() => sendPtpWhatsApp(item)}>
          <Ionicons name="logo-whatsapp" size={15} color="#fff" />
        </Pressable>
        <Pressable style={[cardStyles.actionBtn, { backgroundColor: Colors.info }]} onPress={() => sendPtpSms(item)}>
          <Ionicons name="chatbox-ellipses" size={15} color="#fff" />
        </Pressable>
        <Pressable style={[cardStyles.actionBtn, cardStyles.detailBtn, { flex: 1.4 }]} onPress={() => onDetails(item)}>
          <Ionicons name="eye" size={15} color={Colors.primary} />
          <Text style={[cardStyles.actionBtnText, { color: Colors.primary }]}>Details</Text>
        </Pressable>
      </View>
    </View>
  );
}

const STAT_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Total: "layers-outline",
  Unpaid: "alert-circle-outline",
  PTP: "time-outline",
  Paid: "checkmark-circle-outline",
};

export function StatBox({
  label, count, color, active, onPress,
}: { label: string; count: number; color: string; active: boolean; onPress?: () => void }) {
  const Wrapper: any = onPress ? Pressable : View;
  const icon = STAT_ICONS[label];
  return (
    <Wrapper
      onPress={onPress}
      style={[
        cardStyles.statBox,
        { borderColor: active ? color : "transparent", backgroundColor: color + "12" },
        active && { backgroundColor: color + "20" },
      ]}
    >
      {icon ? <Ionicons name={icon} size={14} color={color} style={{ marginBottom: 1 }} /> : null}
      <Text style={[cardStyles.statCount, { color }]}>{count}</Text>
      <Text style={cardStyles.statLabel} numberOfLines={1}>{label}</Text>
    </Wrapper>
  );
}

const cardStyles = StyleSheet.create({
  statBox: {
    flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 12,
    borderRadius: 14, borderWidth: 1.5, backgroundColor: "#fff", gap: 3,
  },
  statCount: { fontSize: 19, fontWeight: "800" },
  statLabel: { fontSize: 10, fontWeight: "700", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.3 },
  card: {
    backgroundColor: "#fff", borderRadius: 18, padding: 16, gap: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 10, elevation: 2,
  },
  cardTapArea: { gap: 10 },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardNameRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  cardName: { flex: 1, fontSize: 16, fontWeight: "800", color: Colors.text },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: "700" },
  agentRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: -4 },
  agentName: { fontSize: 12, color: Colors.primary, fontWeight: "600" },
  infoRow: { flexDirection: "row", gap: 8 },
  infoCell: { flex: 1, backgroundColor: Colors.surfaceAlt, borderRadius: 10, padding: 10 },
  infoCellSmall: { width: 56, backgroundColor: Colors.surfaceAlt, borderRadius: 10, padding: 10, alignItems: "center" },
  infoLabel: { fontSize: 9, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 3 },
  infoValue: { fontSize: 13, fontWeight: "700", color: Colors.text },
  phoneRow: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start",
    backgroundColor: Colors.info + "12", borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10,
  },
  phoneText: { fontSize: 13, color: Colors.info, fontWeight: "700" },
  feedbackRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 6,
    backgroundColor: Colors.surfaceAlt, borderRadius: 10, padding: 10,
  },
  feedbackLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: "700" },
  feedbackValue: { flex: 1, fontSize: 12, color: Colors.text, fontWeight: "500" },
  cardActions: { flexDirection: "row", gap: 8, marginTop: 2 },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 11, borderRadius: 12, gap: 5,
  },
  callBtn: { backgroundColor: Colors.primary },
  detailBtn: { backgroundColor: Colors.primary + "12", borderWidth: 1, borderColor: Colors.primary + "30" },
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

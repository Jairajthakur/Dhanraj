import React, { useState, useMemo, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput, Linking,
  Alert, ActivityIndicator, Modal, ScrollView, Platform, Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";
import { caseStore } from "@/lib/caseStore";

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_TABS = ["All", "Unpaid", "PTP", "Paid"] as const;
type StatusTab = typeof STATUS_TABS[number];

const TABS = ["Unpaid", "PTP", "Paid", "Monthly Feedback"] as const;
type FeedbackTab = typeof TABS[number];

const STATUS_COLORS: Record<string, string> = {
  All:    Colors.primary,
  Unpaid: Colors.statusUnpaid,
  PTP:    Colors.statusPTP,
  Paid:   Colors.statusPaid,
};

const PAID_DETAIL_OPTIONS   = ["PAID", "PART PAYMENT", "SETTLED"];
const UNPAID_DETAIL_OPTIONS = [
  "CUSTOMER ALREADY PAID",
  "CUSTOMER & VEHICLE SKIP",
  "PROMISS TO PAY",
  "CUSTOMER INTENATIONALLY DEFULTER",
  "CUSTOMER VEHICLE SOMEONE MORTGAGE & CUSTOMER SKIP",
];
const PTP_DETAIL_OPTIONS        = ["PTP DATE SET", "WILL PAY TOMORROW", "WILL ARRANGE FUNDS", "CALL LATER"];
const MONTHLY_FEEDBACK_OPTIONS  = [
  "SWITCH OFF", "NOT AVAILABLE", "DISCONNECTED", "REFUSED TO PAY",
  "DISPUTED", "NOT AT HOME", "CUSTOMER MET - WILL PAY", "CUSTOMER MET - REFUSED",
  "PARTIAL PAYMENT DONE", "RESCHEDULED", "SKIP TRACE", "LEGAL ACTION INITIATED",
];
const FEEDBACK_CODES     = ["PAID", "RTP", "SKIP", "PTP", "CAVNA", "ANF", "EXP", "SFT", "VSL"];
const PROJECTION_OPTIONS = ["ST", "RF", "RB"];

// Field Visit constants
const VISIT_OUTCOMES = [
  "PTP",
  "Paid",
  "Refused to Pay",
  "Customer Absent",
  "Skip / Not Found",
] as const;
type VisitOutcome = typeof VISIT_OUTCOMES[number];

const VISIT_OUTCOME_COLORS: Record<VisitOutcome, string> = {
  "PTP":              Colors.statusPTP,
  "Paid":             Colors.success,
  "Refused to Pay":   Colors.danger,
  "Customer Absent":  Colors.warning,
  "Skip / Not Found": Colors.textSecondary,
};

const MAX_PHOTOS       = 4;
const GPS_TIMEOUT_MS   = 20_000;
const GPS_MAX_AGE_MS   = 10_000;
const PTP_DATE_REGEX   = /^\d{2}-\d{2}-\d{4}$/;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt(v: unknown, prefix = ""): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = parseFloat(String(v).replace(/,/g, ""));
  if (!isNaN(n)) return prefix + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return String(v);
}

function fmtRaw(v: unknown): string {
  if (v === null || v === undefined || v === "" || v === "0" || Number(v) === 0) return "—";
  return String(v);
}

function toIsoDate(val: string): string {
  const parts = val.trim().split(/[-\/]/);
  if (parts.length === 3 && parts[2].length === 4)
    return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
  return val;
}

function navigateToDetail(item: CaseItem) {
  caseStore.set(item);
  router.push({ pathname: "/(app)/customer/[id]", params: { id: String(item.id) } });
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface CaseItem {
  id: number;
  customer_name: string;
  loan_no: string;
  app_id?: string;
  mobile_no?: string;
  status: string;
  bkt?: string | number;
  emi_amount?: number;
  emi_due?: number;
  pos?: number;
  cbc?: number;
  lpp?: number;
  cbc_lpp?: number;
  rollback?: unknown;
  clearance?: unknown;
  tenor?: unknown;
  rollback_yn?: boolean;
  feedback_code?: string;
  latest_feedback?: string;
  monthly_feedback?: string;
  ptp_date?: string;
  telecaller_ptp_date?: string;
  feedback_comments?: string;
  registration_no?: string;
  address?: string;
  city?: string;
  customer_available?: boolean | null;
  vehicle_available?: boolean | null;
  third_party?: boolean | null;
  third_party_name?: string;
  third_party_number?: string;
  projection?: string;
  non_starter?: boolean | null;
  kyc_purchase?: boolean | null;
  workable?: boolean | null;
}

interface GpsCoords {
  lat: number;
  lng: number;
  accuracy: number;
}

interface PhotoAsset {
  uri: string;
  fileName: string;
  mimeType: string;
}

// ─── CallPickerModal ──────────────────────────────────────────────────────────
interface CallPickerModalProps {
  visible: boolean;
  phones: string[];
  onClose: () => void;
}

function CallPickerModal({ visible, phones, onClose }: CallPickerModalProps) {
  const call = (num: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Linking.openURL(`tel:${num}`);
    onClose();
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={cpStyles.overlay} onPress={onClose}>
        <View style={cpStyles.sheet}>
          <Text style={cpStyles.title}>Select Number to Call</Text>
          {phones.map((ph, i) => (
            <Pressable key={i} style={cpStyles.numberRow} onPress={() => call(ph)}>
              <View style={cpStyles.numberIcon}>
                <Ionicons name="call" size={16} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={cpStyles.numberLabel}>Number {i + 1}{i === 0 ? " (Primary)" : ""}</Text>
                <Text style={cpStyles.numberText}>{ph}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </Pressable>
          ))}
          <Pressable style={cpStyles.cancelBtn} onPress={onClose}>
            <Text style={cpStyles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const cpStyles = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: 24 },
  sheet:       { backgroundColor: Colors.surface, borderRadius: 20, padding: 20, width: "100%", gap: 8 },
  title:       { fontSize: 16, fontWeight: "700", color: Colors.text, marginBottom: 8, textAlign: "center" },
  numberRow:   { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: Colors.surfaceAlt, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border },
  numberIcon:  { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primary + "18", alignItems: "center", justifyContent: "center" },
  numberLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: "600", textTransform: "uppercase" },
  numberText:  { fontSize: 15, color: Colors.text, fontWeight: "700", marginTop: 2 },
  cancelBtn:   { marginTop: 4, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, alignItems: "center" },
  cancelText:  { fontSize: 15, fontWeight: "600", color: Colors.textSecondary },
});

// ─── YNToggle ─────────────────────────────────────────────────────────────────
function YNToggle({ label, value, onChange }: {
  label: string; value: boolean | null; onChange: (v: boolean | null) => void;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={fbStyles.sectionLabel}>{label}</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {([true, false] as const).map((val) => (
          <Pressable
            key={String(val)}
            style={[
              fbStyles.feedbackOption,
              { flex: 1, alignItems: "center" },
              value === val && {
                backgroundColor: val ? Colors.success : Colors.danger,
                borderColor: val ? Colors.success : Colors.danger,
              },
            ]}
            onPress={() => onChange(value === val ? null : val)}
          >
            <Text style={[fbStyles.feedbackOptionText, value === val && { color: "#fff" }]}>
              {val ? "Y" : "N"}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ─── LockedFeedbackView ───────────────────────────────────────────────────────
function LockedFeedbackView({ item, onClose }: { item: CaseItem; onClose: () => void }) {
  const rows = [
    item.status           && { label: "Status",          value: item.status,            color: STATUS_COLORS[item.status] || Colors.text },
    item.feedback_code    && { label: "Feedback Code",   value: item.feedback_code,      color: Colors.accent },
    item.latest_feedback  && { label: "Detail Feedback", value: item.latest_feedback,    color: Colors.text },
    item.monthly_feedback && item.monthly_feedback !== "SUBMITTED" && { label: "Monthly", value: item.monthly_feedback, color: Colors.primary },
    item.ptp_date         && { label: "PTP Date",        value: String(item.ptp_date).slice(0, 10), color: Colors.statusPTP },
    item.feedback_comments&& { label: "Comments",        value: item.feedback_comments,  color: Colors.textSecondary },
  ].filter(Boolean) as { label: string; value: string; color: string }[];

  return (
    <>
      <View style={fbStyles.lockBanner}>
        <Ionicons name="lock-closed" size={16} color={Colors.warning} />
        <Text style={fbStyles.lockBannerText}>
          Monthly feedback locked — contact admin to reset before editing
        </Text>
      </View>
      {rows.length > 0 ? (
        <View style={fbStyles.lockedRows}>
          {rows.map((r) => (
            <View key={r.label} style={fbStyles.lockedRow}>
              <Text style={fbStyles.lockedRowLabel}>{r.label}</Text>
              <Text style={[fbStyles.lockedRowValue, { color: r.color }]}>{r.value}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={{ color: Colors.textMuted, textAlign: "center", marginVertical: 24 }}>
          No feedback details saved yet.
        </Text>
      )}
    </>
  );
}

// ─── FeedbackModal ────────────────────────────────────────────────────────────
interface FeedbackModalProps {
  visible: boolean;
  caseItem: CaseItem | null;
  onClose: () => void;
  isMonthlyLocked?: boolean;
  extraNumbers?: string[];
}

function FeedbackModal({ visible, caseItem, onClose, isMonthlyLocked = false, extraNumbers = [] }: FeedbackModalProps) {
  const [activeTab, setActiveTab] = useState<FeedbackTab>("Unpaid");

  const [detailFeedback,    setDetailFeedback]    = useState(caseItem?.latest_feedback   || "");
  const [monthlyFeedback,   setMonthlyFeedback]   = useState(caseItem?.monthly_feedback  || "");
  const [feedbackCode,      setFeedbackCode]      = useState(caseItem?.feedback_code     || "");
  const [comments,          setComments]          = useState(caseItem?.feedback_comments || "");
  const [ptpDate,           setPtpDate]           = useState(
    caseItem?.ptp_date ? String(caseItem.ptp_date).slice(0, 10) : ""
  );
  const [paidDetailFeedback, setPaidDetailFeedback] = useState(caseItem?.latest_feedback   || "");
  const [paidComments,       setPaidComments]       = useState(caseItem?.feedback_comments || "");
  const [paidRollbackYn, setPaidRollbackYn] = useState<boolean | null>(
    caseItem?.rollback_yn != null ? Boolean(caseItem.rollback_yn) : null
  );
  const [customerAvailable, setCustomerAvailable] = useState<boolean | null>(caseItem?.customer_available ?? null);
  const [vehicleAvailable,  setVehicleAvailable]  = useState<boolean | null>(caseItem?.vehicle_available  ?? null);
  const [thirdParty,        setThirdParty]        = useState<boolean | null>(caseItem?.third_party        ?? null);
  const [thirdPartyName,    setThirdPartyName]    = useState(caseItem?.third_party_name   || "");
  const [thirdPartyNumber,  setThirdPartyNumber]  = useState(caseItem?.third_party_number || "");
  const [projection,        setProjection]        = useState(caseItem?.projection || "");
  const [nonStarter,        setNonStarter]        = useState<boolean | null>(caseItem?.non_starter  ?? null);
  const [kycPurchase,       setKycPurchase]       = useState<boolean | null>(caseItem?.kyc_purchase  ?? null);
  const [workable,          setWorkable]          = useState<boolean | null>(caseItem?.workable      ?? null);
  const [loading, setLoading] = useState(false);
  const [callPickerVisible, setCallPickerVisible] = useState(false);

  const qc = useQueryClient();

  const primaryPhones: string[] = (caseItem?.mobile_no ?? "")
    .split(",").map((p) => p.trim()).filter(Boolean);
  const allPhones = [...primaryPhones, ...extraNumbers.filter((n) => !primaryPhones.includes(n))];

  const save = async () => {
    if (activeTab === "Monthly Feedback" && !feedbackCode) {
      Alert.alert("Error", "Please select a Feedback Code"); return;
    }
    if (activeTab === "PTP" && !ptpDate) {
      Alert.alert("Error", "Please enter a PTP date"); return;
    }
    if (!caseItem) return;

    let finalStatus = "Unpaid";
    if (activeTab === "Paid")                  finalStatus = "Paid";
    else if (activeTab === "PTP")              finalStatus = "PTP";
    else if (activeTab === "Monthly Feedback") finalStatus = "Unpaid";

    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        status:   finalStatus,
        feedback: activeTab === "Paid" ? paidDetailFeedback : detailFeedback,
        comments: activeTab === "Paid" ? paidComments       : comments,
        ptp_date: activeTab === "PTP"  ? toIsoDate(ptpDate) : null,
        rollback_yn:        activeTab === "Paid" ? paidRollbackYn : null,
        customer_available: customerAvailable,
        vehicle_available:  vehicleAvailable,
        third_party:        thirdParty,
        third_party_name:   thirdParty ? thirdPartyName   : null,
        third_party_number: thirdParty ? thirdPartyNumber : null,
      };
      if (activeTab === "Monthly Feedback") {
        payload.feedback_code    = feedbackCode;
        payload.projection       = projection;
        payload.non_starter      = nonStarter;
        payload.kyc_purchase     = kycPurchase;
        payload.workable         = workable;
        payload.monthly_feedback = monthlyFeedback || "SUBMITTED";
      }
      await api.updateFeedback(caseItem.id, payload);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["/api/cases"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      qc.invalidateQueries({ queryKey: ["/api/bkt-perf-summary"] });
      onClose();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const renderDetailOptions = (
    options: string[], val: string,
    setVal: (v: string) => void, activeColor: string
  ) => (
    <View style={{ gap: 8, marginBottom: 12 }}>
      {options.map((opt) => (
        <Pressable
          key={opt}
          style={[fbStyles.detailOptionBtn, val === opt && { backgroundColor: activeColor + "20", borderColor: activeColor }]}
          onPress={() => setVal(val === opt ? "" : opt)}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={[fbStyles.detailOptionDot, val === opt && { backgroundColor: activeColor }]} />
            <Text style={[fbStyles.detailOptionText, val === opt && { color: activeColor, fontWeight: "700" }]}>{opt}</Text>
          </View>
          {val === opt && <Ionicons name="checkmark-circle" size={20} color={activeColor} />}
        </Pressable>
      ))}
    </View>
  );

  const isMonthlyTabLocked = isMonthlyLocked && activeTab === "Monthly Feedback";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={fbStyles.overlay}>
        <View style={fbStyles.sheet}>
          <View style={fbStyles.handle} />
          <Text style={fbStyles.title}>Update Feedback</Text>
          <Text style={fbStyles.customerName}>
            {caseItem?.customer_name} · {caseItem?.loan_no}
          </Text>

          {allPhones.length > 0 && (
            <View style={fbStyles.numbersSection}>
              <Text style={fbStyles.numbersSectionLabel}>
                <Ionicons name="call-outline" size={12} color={Colors.textMuted} /> Contact Numbers
              </Text>
              <View style={fbStyles.numbersRow}>
                {allPhones.map((ph, i) => (
                  <Pressable
                    key={i}
                    style={[fbStyles.numberChip, i >= primaryPhones.length && fbStyles.numberChipExtra]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); Linking.openURL(`tel:${ph}`); }}
                  >
                    <Ionicons name="call" size={12} color={i >= primaryPhones.length ? Colors.success : "#fff"} />
                    <Text style={[fbStyles.numberChipText, i >= primaryPhones.length && fbStyles.numberChipTextExtra]}>{ph}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          <View style={fbStyles.caseInfoRow}>
            {caseItem?.rollback && fmtRaw(caseItem.rollback) !== "—" && (
              <View style={[fbStyles.caseInfoChip, { backgroundColor: Colors.info + "18" }]}>
                <Text style={fbStyles.caseInfoLabel}>ROLLBACK</Text>
                <Text style={[fbStyles.caseInfoValue, { color: Colors.info }]}>{fmtRaw(caseItem.rollback)}</Text>
              </View>
            )}
            {caseItem?.clearance && fmtRaw(caseItem.clearance) !== "—" && (
              <View style={[fbStyles.caseInfoChip, { backgroundColor: Colors.success + "18" }]}>
                <Text style={fbStyles.caseInfoLabel}>CLEARANCE</Text>
                <Text style={[fbStyles.caseInfoValue, { color: Colors.success }]}>{fmtRaw(caseItem.clearance)}</Text>
              </View>
            )}
          </View>

          <View style={fbStyles.tabRow}>
            {TABS.map((t) => {
              const isActive = activeTab === t;
              const isThisTabLocked = t === "Monthly Feedback" && isMonthlyLocked;
              const color = t === "Paid" ? Colors.success
                : t === "PTP"             ? Colors.statusPTP
                : t === "Monthly Feedback"? Colors.primary
                : Colors.statusUnpaid;
              return (
                <Pressable
                  key={t}
                  style={[
                    fbStyles.tabChip,
                    isActive && { backgroundColor: color, borderColor: color },
                    isThisTabLocked && !isActive && { borderColor: Colors.warning + "60", backgroundColor: Colors.warning + "10" },
                  ]}
                  onPress={() => setActiveTab(t)}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    {isThisTabLocked && <Ionicons name="lock-closed" size={11} color={isActive ? "#fff" : Colors.warning} />}
                    <Text style={[fbStyles.tabChipText, isActive && { color: "#fff" }, isThisTabLocked && !isActive && { color: Colors.warning }]}>{t}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 1, flexShrink: 1 }}>
            {activeTab === "Unpaid" && (
              <>
                <Text style={fbStyles.sectionLabel}>Detail Feedback</Text>
                {renderDetailOptions(MONTHLY_FEEDBACK_OPTIONS, detailFeedback, setDetailFeedback, Colors.statusUnpaid)}
                <Text style={fbStyles.sectionLabel}>Comments (Optional)</Text>
                <TextInput style={fbStyles.commentInput} placeholder="Add comments..." placeholderTextColor={Colors.textMuted} value={comments} onChangeText={setComments} multiline numberOfLines={4} />
              </>
            )}

            {activeTab === "Monthly Feedback" && (
              <>
                {isMonthlyLocked ? (
                  <LockedFeedbackView item={caseItem!} onClose={onClose} />
                ) : (
                  <>
                    <View style={fbStyles.divider} />
                    <YNToggle label="Customer Available" value={customerAvailable} onChange={setCustomerAvailable} />
                    <YNToggle label="Vehicle Available"  value={vehicleAvailable}  onChange={setVehicleAvailable}  />
                    <YNToggle label="Third Party"        value={thirdParty}        onChange={setThirdParty}        />
                    {thirdParty === true && (
                      <>
                        <Text style={fbStyles.sectionLabel}>Third Party Name</Text>
                        <TextInput style={[fbStyles.commentInput, { minHeight: 44, marginBottom: 8 }]} placeholder="Enter name" placeholderTextColor={Colors.textMuted} value={thirdPartyName} onChangeText={setThirdPartyName} />
                        <Text style={fbStyles.sectionLabel}>Third Party Number</Text>
                        <TextInput style={[fbStyles.commentInput, { minHeight: 44, marginBottom: 8 }]} placeholder="Enter number" placeholderTextColor={Colors.textMuted} value={thirdPartyNumber} onChangeText={setThirdPartyNumber} keyboardType="phone-pad" />
                      </>
                    )}
                    <Text style={fbStyles.sectionLabel}>Feedback Code</Text>
                    <View style={fbStyles.chipWrapRow}>
                      {FEEDBACK_CODES.map((f) => (
                        <Pressable key={f} style={[fbStyles.tabChip, feedbackCode === f && { backgroundColor: Colors.accent, borderColor: Colors.accent }]} onPress={() => setFeedbackCode(f)}>
                          <Text style={[fbStyles.tabChipText, feedbackCode === f && { color: "#fff" }]}>{f}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <Text style={fbStyles.sectionLabel}>Detail Feedback</Text>
                    {feedbackCode === "PTP" ? (
                      <>
                        {renderDetailOptions(PTP_DETAIL_OPTIONS, detailFeedback, setDetailFeedback, Colors.statusPTP)}
                        <Text style={fbStyles.sectionLabel}>PTP Date</Text>
                        <TextInput style={[fbStyles.commentInput, { minHeight: 44, marginBottom: 12 }]} placeholder="DD-MM-YYYY" placeholderTextColor={Colors.textMuted} value={ptpDate} onChangeText={setPtpDate} keyboardType="numeric" />
                      </>
                    ) : (
                      <>
                        {renderDetailOptions(UNPAID_DETAIL_OPTIONS, detailFeedback, setDetailFeedback, Colors.statusUnpaid)}
                        <TextInput style={[fbStyles.commentInput, { minHeight: 44 }]} placeholder="Or type custom feedback..." placeholderTextColor={Colors.textMuted} value={detailFeedback && !UNPAID_DETAIL_OPTIONS.includes(detailFeedback) ? detailFeedback : ""} onChangeText={setDetailFeedback} multiline numberOfLines={2} />
                      </>
                    )}
                    <Text style={fbStyles.sectionLabel}>Projection</Text>
                    <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                      {PROJECTION_OPTIONS.map((p) => (
                        <Pressable key={p} style={[fbStyles.feedbackOption, { flex: 1, alignItems: "center" }, projection === p && { backgroundColor: Colors.primary, borderColor: Colors.primary }]} onPress={() => setProjection(projection === p ? "" : p)}>
                          <Text style={[fbStyles.feedbackOptionText, projection === p && { color: "#fff" }]}>{p}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <YNToggle label="Non Starter"  value={nonStarter}  onChange={setNonStarter}  />
                    <YNToggle label="KYC Purchase"  value={kycPurchase}  onChange={setKycPurchase}  />
                    <Text style={fbStyles.sectionLabel}>Workable</Text>
                    <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                      {(["Workable", "Non Workable"] as const).map((w) => {
                        const val = w === "Workable";
                        return (
                          <Pressable key={w} style={[fbStyles.feedbackOption, { flex: 1, alignItems: "center" }, workable === val && { backgroundColor: val ? Colors.success : Colors.danger, borderColor: val ? Colors.success : Colors.danger }]} onPress={() => setWorkable(workable === val ? null : val)}>
                            <Text style={[fbStyles.feedbackOptionText, workable === val && { color: "#fff" }]}>{w}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Text style={fbStyles.sectionLabel}>Comments (Optional)</Text>
                    <TextInput style={fbStyles.commentInput} placeholder="Add comments..." placeholderTextColor={Colors.textMuted} value={comments} onChangeText={setComments} multiline numberOfLines={3} />
                  </>
                )}
              </>
            )}

            {activeTab === "Paid" && (
              <>
                <Text style={fbStyles.sectionLabel}>Detail Feedback</Text>
                {renderDetailOptions(PAID_DETAIL_OPTIONS, paidDetailFeedback, setPaidDetailFeedback, Colors.success)}
                <YNToggle label="Rollback" value={paidRollbackYn} onChange={setPaidRollbackYn} />
                <Text style={fbStyles.sectionLabel}>Comments (Optional)</Text>
                <TextInput style={fbStyles.commentInput} placeholder="Add comments..." placeholderTextColor={Colors.textMuted} value={paidComments} onChangeText={setPaidComments} multiline numberOfLines={3} />
              </>
            )}

            {activeTab === "PTP" && (
              <>
                <Text style={fbStyles.sectionLabel}>Detail Feedback</Text>
                {renderDetailOptions(PTP_DETAIL_OPTIONS, detailFeedback, setDetailFeedback, Colors.statusPTP)}
                <Text style={fbStyles.sectionLabel}>PTP Date</Text>
                <TextInput style={[fbStyles.commentInput, { minHeight: 44, marginBottom: 12 }]} placeholder="DD-MM-YYYY" placeholderTextColor={Colors.textMuted} value={ptpDate} onChangeText={setPtpDate} keyboardType="numeric" />
                <Text style={fbStyles.sectionLabel}>Comments (Optional)</Text>
                <TextInput style={fbStyles.commentInput} placeholder="Add comments..." placeholderTextColor={Colors.textMuted} value={comments} onChangeText={setComments} multiline numberOfLines={3} />
              </>
            )}
            <View style={{ height: 16 }} />
          </ScrollView>

          <View style={fbStyles.btnRow}>
            <Pressable style={fbStyles.cancelBtn} onPress={onClose}>
              <Text style={fbStyles.cancelText}>{isMonthlyTabLocked ? "Close" : "Cancel"}</Text>
            </Pressable>
            {!isMonthlyTabLocked && (
              <Pressable
                style={[fbStyles.saveBtn, {
                  backgroundColor: activeTab === "Paid" ? Colors.success
                    : activeTab === "PTP"              ? Colors.statusPTP
                    : activeTab === "Monthly Feedback" ? Colors.primary
                    : Colors.statusUnpaid,
                }]}
                onPress={save}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={fbStyles.saveText}>Save</Text>
                }
              </Pressable>
            )}
          </View>
          <View style={{ height: 24 }} />
        </View>
      </View>
      <CallPickerModal visible={callPickerVisible} phones={allPhones} onClose={() => setCallPickerVisible(false)} />
    </Modal>
  );
}

// ─── FieldVisitModal ──────────────────────────────────────────────────────────
interface FieldVisitModalProps {
  visible: boolean;
  caseItem: CaseItem | null;
  onClose: () => void;
}

function FieldVisitModal({ visible, caseItem, onClose }: FieldVisitModalProps) {
  // ── form state ──────────────────────────────────────────────────────────────
  const [outcome,    setOutcome]    = useState<VisitOutcome | "">("");
  const [remarks,    setRemarks]    = useState("");
  const [ptpDate,    setPtpDate]    = useState("");
  const [photos,     setPhotos]     = useState<PhotoAsset[]>([]);
  const [gps,        setGps]        = useState<GpsCoords | null>(null);

  // ── async state ─────────────────────────────────────────────────────────────
  const [locLoading,  setLocLoading]  = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [photoError,  setPhotoError]  = useState("");

  const qc = useQueryClient();
  const saveGuardRef = useRef(false); // prevent double-submit

  // ── reset on close ──────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setOutcome("");
    setRemarks("");
    setPtpDate("");
    setPhotos([]);
    setGps(null);
    setLocLoading(false);
    setSaving(false);
    setPhotoError("");
    saveGuardRef.current = false;
  }, []);

  const handleClose = useCallback(() => {
    if (saving) return; // block close while saving
    reset();
    onClose();
  }, [saving, reset, onClose]);

  // ── GPS capture ─────────────────────────────────────────────────────────────
  const captureGps = useCallback(async () => {
    if (locLoading) return;
    setLocLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Location Permission Denied",
          "Please enable location access in your device settings to record field visits.",
          [{ text: "OK" }]
        );
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        timeInterval: GPS_TIMEOUT_MS,
        maximumAge: GPS_MAX_AGE_MS,
      } as any);
      setGps({
        lat:      loc.coords.latitude,
        lng:      loc.coords.longitude,
        accuracy: Math.round(loc.coords.accuracy ?? 0),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not capture GPS. Try again.";
      Alert.alert("GPS Error", msg);
    } finally {
      setLocLoading(false);
    }
  }, [locLoading]);

  // ── Photo capture ───────────────────────────────────────────────────────────
  const pickPhoto = useCallback(async () => {
    setPhotoError("");
    if (photos.length >= MAX_PHOTOS) {
      setPhotoError(`Maximum ${MAX_PHOTOS} photos allowed.`);
      return;
    }
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Camera Permission Denied",
        "Please enable camera access in your device settings to add photo proof.",
        [{ text: "OK" }]
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality:       0.65,
      base64:        false,
      allowsEditing: false,
      mediaTypes:    ImagePicker.MediaTypeOptions.Images,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const ext   = (asset.uri.split(".").pop() ?? "jpg").toLowerCase();
      const mime  = ext === "png" ? "image/png" : "image/jpeg";
      setPhotos((prev) => [
        ...prev,
        {
          uri:      asset.uri,
          fileName: `visit_${Date.now()}_${prev.length}.${ext}`,
          mimeType: mime,
        },
      ]);
    }
  }, [photos.length]);

  const removePhoto = useCallback((index: number) => {
    setPhotoError("");
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ── Validation ──────────────────────────────────────────────────────────────
  const validate = (): string | null => {
    if (!outcome)                               return "Please select a visit outcome.";
    if (!gps)                                   return "GPS location is required. Tap 'Capture GPS' before saving.";
    if (outcome === "PTP" && !ptpDate.trim())   return "PTP date is required when outcome is PTP.";
    if (outcome === "PTP" && !PTP_DATE_REGEX.test(ptpDate.trim()))
      return "PTP date must be in DD-MM-YYYY format.";
    if (!remarks.trim())                        return "Visit remarks are required.";
    if (remarks.trim().length < 10)             return "Remarks must be at least 10 characters.";
    return null;
  };

  // ── Save ────────────────────────────────────────────────────────────────────
  const save = useCallback(async () => {
    if (saveGuardRef.current) return;
    const err = validate();
    if (err) { Alert.alert("Validation Error", err); return; }
    if (!caseItem) return;

    saveGuardRef.current = true;
    setSaving(true);

    try {
      // 1. Record the field visit via the dedicated API endpoint
      await api.recordFieldVisit(caseItem.id, {
        lat:       gps!.lat,
        lng:       gps!.lng,
        accuracy:  gps!.accuracy,
        case_type: "allocation",
      });

      // 2. Push the visit outcome as a feedback update so it surfaces in the case list
      const feedbackPayload: Record<string, unknown> = {
        visit_outcome:     outcome,
        visit_remarks:     remarks.trim(),
        visit_location:    `${gps!.lat.toFixed(6)},${gps!.lng.toFixed(6)}`,
        visit_photo_count: photos.length,
        visited_at:        new Date().toISOString(),
      };

      if (outcome === "PTP") {
        feedbackPayload.ptp_date = toIsoDate(ptpDate.trim());
        feedbackPayload.status   = "PTP";
      } else if (outcome === "Paid") {
        feedbackPayload.status = "Paid";
      }

      await api.updateFeedback(caseItem.id, feedbackPayload);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["/api/cases"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });

      reset();
      onClose();

      // Brief delay so the modal closes before Alert fires
      setTimeout(() => {
        Alert.alert("Visit Recorded", "Field visit has been saved successfully.");
      }, 300);

    } catch (e: unknown) {
      saveGuardRef.current = false;
      const msg = e instanceof Error ? e.message : "Something went wrong. Please try again.";
      Alert.alert("Save Failed", msg);
    } finally {
      setSaving(false);
    }
  }, [outcome, gps, remarks, ptpDate, photos, caseItem, qc, reset, onClose]);

  // ── Guard against null case ─────────────────────────────────────────────────
  if (!caseItem) return null;

  const outcomeColor = outcome ? VISIT_OUTCOME_COLORS[outcome as VisitOutcome] : Colors.border;
  const canSave      = !!outcome && !!gps && remarks.trim().length >= 10;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={fvStyles.overlay}>
        <View style={fvStyles.sheet}>
          <View style={fvStyles.handle} />

          {/* ── Header ── */}
          <View style={fvStyles.headerRow}>
            <View style={fvStyles.headerIconWrap}>
              <Ionicons name="location" size={18} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={fvStyles.title}>Field Visit</Text>
              <Text style={fvStyles.subtitle} numberOfLines={1}>
                {caseItem.customer_name}  ·  {caseItem.loan_no}  ·  BKT {caseItem.bkt ?? "—"}
              </Text>
            </View>
            <Pressable style={fvStyles.closeBtn} onPress={handleClose} disabled={saving}>
              <Ionicons name="close" size={20} color={saving ? Colors.textMuted : Colors.textSecondary} />
            </Pressable>
          </View>

          {/* ── Case summary chips ── */}
          <View style={fvStyles.amountRow}>
            <View style={fvStyles.amountChip}>
              <Text style={fvStyles.amountLabel}>EMI DUE</Text>
              <Text style={[fvStyles.amountValue, { color: Colors.danger }]}>{fmt(caseItem.emi_due, "₹")}</Text>
            </View>
            <View style={fvStyles.amountChip}>
              <Text style={fvStyles.amountLabel}>POS</Text>
              <Text style={fvStyles.amountValue}>{fmt(caseItem.pos, "₹")}</Text>
            </View>
            <View style={[fvStyles.amountChip, { flex: 1.4 }]}>
              <Text style={fvStyles.amountLabel}>ADDRESS</Text>
              <Text style={[fvStyles.amountValue, { fontSize: 11 }]} numberOfLines={2}>
                {caseItem.address || caseItem.city || "—"}
              </Text>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">

            {/* ── GPS Location (REQUIRED) ── */}
            <View style={fvStyles.sectionRow}>
              <Text style={fvStyles.sectionLabel}>GPS Location</Text>
              <View style={fvStyles.requiredBadge}><Text style={fvStyles.requiredText}>Required</Text></View>
            </View>

            <Pressable
              style={[
                fvStyles.locationBtn,
                gps        && fvStyles.locationBtnCaptured,
                locLoading && fvStyles.locationBtnLoading,
              ]}
              onPress={captureGps}
              disabled={locLoading || saving}
            >
              {locLoading ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Ionicons
                  name={gps ? "checkmark-circle" : "locate"}
                  size={20}
                  color={gps ? Colors.success : Colors.primary}
                />
              )}
              <View style={{ flex: 1 }}>
                <Text style={[fvStyles.locationBtnText, gps && { color: Colors.success, fontWeight: "700" }]}>
                  {locLoading
                    ? "Acquiring GPS signal…"
                    : gps
                    ? `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}`
                    : "Tap to capture current location"}
                </Text>
                {gps && (
                  <Text style={fvStyles.locationAccuracy}>
                    Accuracy: ±{gps.accuracy}m
                  </Text>
                )}
              </View>
              {!gps && !locLoading && (
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
              )}
              {gps && (
                <Pressable
                  style={fvStyles.reCaptureBtnSmall}
                  onPress={captureGps}
                  disabled={locLoading || saving}
                >
                  <Ionicons name="refresh" size={14} color={Colors.primary} />
                  <Text style={fvStyles.reCaptureText}>Re-capture</Text>
                </Pressable>
              )}
            </Pressable>

            {/* ── Visit Outcome (REQUIRED) ── */}
            <View style={fvStyles.sectionRow}>
              <Text style={fvStyles.sectionLabel}>Visit Outcome</Text>
              <View style={fvStyles.requiredBadge}><Text style={fvStyles.requiredText}>Required</Text></View>
            </View>
            <View style={{ gap: 8, marginBottom: 16 }}>
              {VISIT_OUTCOMES.map((opt) => {
                const color      = VISIT_OUTCOME_COLORS[opt];
                const isSelected = outcome === opt;
                return (
                  <Pressable
                    key={opt}
                    style={[
                      fvStyles.outcomeBtn,
                      isSelected && { backgroundColor: color + "18", borderColor: color, borderWidth: 2 },
                    ]}
                    onPress={() => { setOutcome(isSelected ? "" : opt); setPtpDate(""); }}
                    disabled={saving}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <View style={[fvStyles.outcomeDot, { backgroundColor: isSelected ? color : Colors.border }]} />
                      <Text style={[fvStyles.outcomeText, isSelected && { color, fontWeight: "700" }]}>
                        {opt}
                      </Text>
                    </View>
                    {isSelected && <Ionicons name="checkmark-circle" size={22} color={color} />}
                  </Pressable>
                );
              })}
            </View>

            {/* ── PTP Date (conditional, REQUIRED when outcome=PTP) ── */}
            {outcome === "PTP" && (
              <>
                <View style={fvStyles.sectionRow}>
                  <Text style={fvStyles.sectionLabel}>PTP Date</Text>
                  <View style={fvStyles.requiredBadge}><Text style={fvStyles.requiredText}>Required</Text></View>
                </View>
                <TextInput
                  style={[
                    fvStyles.input,
                    ptpDate && !PTP_DATE_REGEX.test(ptpDate) && fvStyles.inputError,
                  ]}
                  placeholder="DD-MM-YYYY"
                  placeholderTextColor={Colors.textMuted}
                  value={ptpDate}
                  onChangeText={setPtpDate}
                  keyboardType="numeric"
                  maxLength={10}
                  editable={!saving}
                />
                {ptpDate && !PTP_DATE_REGEX.test(ptpDate) && (
                  <Text style={fvStyles.fieldError}>Enter date as DD-MM-YYYY</Text>
                )}
              </>
            )}

            {/* ── Remarks (REQUIRED, min 10 chars) ── */}
            <View style={fvStyles.sectionRow}>
              <Text style={fvStyles.sectionLabel}>Visit Remarks</Text>
              <View style={fvStyles.requiredBadge}><Text style={fvStyles.requiredText}>Required · min 10 chars</Text></View>
            </View>
            <TextInput
              style={[
                fvStyles.input,
                { minHeight: 90, textAlignVertical: "top" },
                remarks.trim().length > 0 && remarks.trim().length < 10 && fvStyles.inputError,
              ]}
              placeholder="Describe what happened during this visit — customer status, conversation outcome, address confirmed, etc."
              placeholderTextColor={Colors.textMuted}
              value={remarks}
              onChangeText={setRemarks}
              multiline
              numberOfLines={4}
              editable={!saving}
            />
            {remarks.trim().length > 0 && remarks.trim().length < 10 && (
              <Text style={fvStyles.fieldError}>Minimum 10 characters ({remarks.trim().length}/10)</Text>
            )}

            {/* ── Photo Proof (optional) ── */}
            <Text style={fvStyles.sectionLabel}>
              Photo Proof <Text style={fvStyles.sectionOptional}>({photos.length}/{MAX_PHOTOS} · optional)</Text>
            </Text>
            {photoError ? <Text style={fvStyles.fieldError}>{photoError}</Text> : null}
            <View style={fvStyles.photoGrid}>
              {photos.map((photo, i) => (
                <View key={i} style={fvStyles.photoThumb}>
                  <Image source={{ uri: photo.uri }} style={fvStyles.photoImg} resizeMode="cover" />
                  {!saving && (
                    <Pressable style={fvStyles.photoRemoveBtn} onPress={() => removePhoto(i)}>
                      <View style={fvStyles.photoRemoveBg}>
                        <Ionicons name="close" size={12} color="#fff" />
                      </View>
                    </Pressable>
                  )}
                  <View style={fvStyles.photoIndexBadge}>
                    <Text style={fvStyles.photoIndexText}>{i + 1}</Text>
                  </View>
                </View>
              ))}
              {photos.length < MAX_PHOTOS && !saving && (
                <Pressable style={fvStyles.photoAddBtn} onPress={pickPhoto}>
                  <Ionicons name="camera-outline" size={24} color={Colors.textMuted} />
                  <Text style={fvStyles.photoAddText}>Add Photo</Text>
                </Pressable>
              )}
            </View>

            {/* ── Validation summary ── */}
            {!canSave && (outcome || gps || remarks) && (
              <View style={fvStyles.validationBox}>
                <Ionicons name="information-circle-outline" size={15} color={Colors.warning} />
                <Text style={fvStyles.validationText}>
                  {!outcome   ? "Select a visit outcome." :
                   !gps       ? "Capture GPS location." :
                   remarks.trim().length < 10 ? "Add visit remarks (min 10 chars)." :
                   outcome === "PTP" && !PTP_DATE_REGEX.test(ptpDate) ? "Enter PTP date as DD-MM-YYYY." :
                   ""}
                </Text>
              </View>
            )}

            <View style={{ height: 20 }} />
          </ScrollView>

          {/* ── Actions ── */}
          <View style={fvStyles.btnRow}>
            <Pressable style={fvStyles.cancelBtn} onPress={handleClose} disabled={saving}>
              <Text style={[fvStyles.cancelText, saving && { color: Colors.textMuted }]}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[
                fvStyles.saveBtn,
                {
                  backgroundColor: canSave ? outcomeColor : Colors.border,
                  opacity: saving ? 0.8 : 1,
                },
              ]}
              onPress={save}
              disabled={saving || !canSave}
            >
              {saving ? (
                <>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={fvStyles.saveText}>Saving…</Text>
                </>
              ) : (
                <>
                  <Ionicons name="location" size={16} color={canSave ? "#fff" : Colors.textMuted} />
                  <Text style={[fvStyles.saveText, !canSave && { color: Colors.textMuted }]}>
                    Save Visit
                  </Text>
                </>
              )}
            </Pressable>
          </View>
          <View style={{ height: 24 }} />
        </View>
      </View>
    </Modal>
  );
}

// ─── CaseCard ─────────────────────────────────────────────────────────────────
interface CaseCardProps {
  item: CaseItem;
  onFeedback:   (item: CaseItem) => void;
  onFieldVisit: (item: CaseItem) => void;
}

function CaseCard({ item, onFeedback, onFieldVisit }: CaseCardProps) {
  const [callPickerVisible, setCallPickerVisible] = useState(false);

  const phones: string[] = (item.mobile_no ?? "")
    .split(",").map((p) => p.trim()).filter(Boolean);

  const call = () => {
    if (!phones.length) { Alert.alert("No number available"); return; }
    if (phones.length === 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      Linking.openURL(`tel:${phones[0]}`);
    } else {
      setCallPickerVisible(true);
    }
  };

  const isUploaded       = !!item.loan_no;
  const isMonthlyLocked  = !!item.monthly_feedback;
  const statusColor      = STATUS_COLORS[item.status] || Colors.textMuted;
  const rollbackRaw      = (item.rollback  != null && item.rollback  !== "" && item.rollback  !== "0" && Number(item.rollback)  !== 0) ? "RollBack"  : "—";
  const clearanceRaw     = (item.clearance != null && item.clearance !== "" && item.clearance !== "0" && Number(item.clearance) !== 0) ? "Clearance" : "—";
  const hasRollback      = rollbackRaw  !== "—";
  const hasClearance     = clearanceRaw !== "—";

  return (
    <View style={styles.card}>
      <Pressable style={styles.cardTapArea} onPress={() => navigateToDetail(item)}>
        <View style={styles.cardHeader}>
          <View style={styles.cardNameRow}>
            <Ionicons name="person-circle" size={20} color={Colors.primary} />
            <Text style={styles.cardName} numberOfLines={1}>{item.customer_name}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {isMonthlyLocked && (
              <View style={styles.lockBadge}>
                <Ionicons name="lock-closed" size={10} color={Colors.warning} />
              </View>
            )}
            <View style={[styles.statusBadge, { backgroundColor: statusColor + "22" }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>{item.status}</Text>
            </View>
          </View>
        </View>

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

        <View style={styles.infoRow}>
          <View style={[styles.infoCell, hasRollback  && { borderWidth: 1, borderColor: Colors.info    + "60" }]}>
            <Text style={styles.infoLabel}>ROLLBACK</Text>
            <Text style={[styles.infoValue, hasRollback  && { color: Colors.info,    fontWeight: "800" }]}>{rollbackRaw}</Text>
          </View>
          <View style={[styles.infoCell, hasClearance && { borderWidth: 1, borderColor: Colors.success + "60" }]}>
            <Text style={styles.infoLabel}>CLEARANCE</Text>
            <Text style={[styles.infoValue, hasClearance && { color: Colors.success, fontWeight: "800" }]}>{clearanceRaw}</Text>
          </View>
          <View style={styles.infoCellSmall}>
            <Text style={styles.infoLabel}>TEN</Text>
            <Text style={styles.infoValue}>{item.tenor ?? "—"}</Text>
          </View>
        </View>

        {item.rollback_yn === true && (
          <View style={styles.rollbackYnBadge}>
            <Ionicons name="refresh-circle" size={13} color={Colors.info} />
            <Text style={styles.rollbackYnText}>Rollback Marked</Text>
          </View>
        )}
      </Pressable>

      {item.mobile_no && (
        <Pressable style={styles.phoneRow} onPress={call}>
          <Ionicons name="call" size={14} color={Colors.info} />
          <Text style={styles.phoneText}>{item.mobile_no}</Text>
        </Pressable>
      )}

      {item.feedback_code && (
        <View style={styles.feedbackRow}>
          <Text style={styles.feedbackLabel}>FB Code: </Text>
          <Text style={styles.feedbackValue}>{item.feedback_code}</Text>
          {item.latest_feedback ? <Text style={styles.feedbackValue}> · {item.latest_feedback}</Text> : null}
        </View>
      )}

      {item.monthly_feedback && item.monthly_feedback !== "SUBMITTED" && (
        <View style={styles.monthlyFeedbackRow}>
          <Ionicons name="calendar-outline" size={13} color={Colors.primary} />
          <Text style={styles.monthlyFeedbackText}>{item.monthly_feedback}</Text>
        </View>
      )}

      {item.ptp_date && (
        <View style={styles.ptpDateRow}>
          <Ionicons name="calendar" size={13} color={Colors.statusPTP} />
          <Text style={styles.ptpDateLabel}>PTP Date: </Text>
          <Text style={styles.ptpDateValue}>{String(item.ptp_date).slice(0, 10)}</Text>
        </View>
      )}

      {item.telecaller_ptp_date && (
        <View style={[styles.ptpDateRow, { backgroundColor: Colors.info + "12" }]}>
          <Ionicons name="calendar-outline" size={13} color={Colors.info} />
          <Text style={[styles.ptpDateLabel, { color: Colors.info }]}>Telecaller PTP: </Text>
          <Text style={[styles.ptpDateValue,  { color: Colors.info }]}>{String(item.telecaller_ptp_date).slice(0, 10)}</Text>
        </View>
      )}

      {/* ── Card Actions ── */}
      <View style={styles.cardActions}>
        <Pressable style={[styles.actionBtn, styles.callBtn]} onPress={call}>
          <Ionicons name="call" size={15} color="#fff" />
          <Text style={styles.actionBtnText}>Call</Text>
        </Pressable>

        <Pressable style={[styles.actionBtn, styles.detailBtn]} onPress={() => navigateToDetail(item)}>
          <Ionicons name="eye" size={15} color={Colors.textSecondary} />
          <Text style={[styles.actionBtnText, { color: Colors.textSecondary }]}>Details</Text>
        </Pressable>

        {isUploaded && (
          <Pressable style={[styles.actionBtn, styles.feedbackBtn]} onPress={() => onFeedback(item)}>
            <Ionicons name="chatbox" size={15} color="#fff" />
            <Text style={styles.actionBtnText}>Feedback</Text>
          </Pressable>
        )}

        {/* ── Field Visit button — always visible on My Cases ── */}
        <Pressable
          style={[styles.actionBtn, styles.visitBtn]}
          onPress={() => onFieldVisit(item)}
        >
          <Ionicons name="location" size={15} color="#fff" />
          <Text style={styles.actionBtnText}>Visit</Text>
        </Pressable>
      </View>

      <CallPickerModal
        visible={callPickerVisible}
        phones={phones}
        onClose={() => setCallPickerVisible(false)}
      />
    </View>
  );
}

// ─── AllocationScreen ─────────────────────────────────────────────────────────
export default function AllocationScreen() {
  const insets  = useSafeAreaInsets();
  const qc      = useQueryClient();

  const [activeTab,    setActiveTab]    = useState<StatusTab>("All");
  const [search,       setSearch]       = useState("");
  const [feedbackItem, setFeedbackItem] = useState<CaseItem | null>(null);
  const [visitItem,    setVisitItem]    = useState<CaseItem | null>(null);
  const [extraNumbersMap] = useState<Record<string, string[]>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["/api/cases"],
    queryFn:  () => api.getCases(),
  });

  const allCases: CaseItem[] = data?.cases || [];

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return allCases
      .filter((c) => activeTab === "All" || c.status === activeTab)
      .filter((c) =>
        !q ||
        c.customer_name?.toLowerCase().includes(q) ||
        c.loan_no?.toLowerCase().includes(q)        ||
        c.app_id?.toLowerCase().includes(q)         ||
        c.registration_no?.toLowerCase().includes(q)
      );
  }, [allCases, activeTab, search]);

  const counts = useMemo(() => ({
    All:    allCases.length,
    Unpaid: allCases.filter((c) => c.status === "Unpaid").length,
    PTP:    allCases.filter((c) => c.status === "PTP").length,
    Paid:   allCases.filter((c) => c.status === "Paid").length,
  }), [allCases]);

  const feedbackItemMonthlyLocked = feedbackItem ? !!feedbackItem.monthly_feedback : false;
  const feedbackExtraNumbers      = feedbackItem ? (extraNumbersMap[String(feedbackItem.id)] ?? []) : [];

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {/* ── Tabs ── */}
      <View style={[styles.tabsContainer, { paddingTop: Platform.OS === "web" ? 67 : 12 }]}>
        {STATUS_TABS.map((tab) => (
          <Pressable
            key={tab}
            style={[
              styles.tab,
              activeTab === tab && [styles.tabActive, { backgroundColor: STATUS_COLORS[tab] ?? Colors.primary }],
            ]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
            <View style={[styles.tabCount, activeTab === tab && { backgroundColor: "rgba(255,255,255,0.3)" }]}>
              <Text style={[styles.tabCountText, activeTab === tab && { color: "#fff" }]}>
                {counts[tab]}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>

      {/* ── Search ── */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={Colors.textMuted} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search name, loan no, app id, reg no..."
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

      {/* ── List ── */}
      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <CaseCard item={item} onFeedback={setFeedbackItem} onFieldVisit={setVisitItem} />
          )}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + 24 },
            filtered.length === 0 && { flex: 1 },
          ]}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>
                {activeTab === "All" ? "No cases" : `No ${activeTab} cases`}
              </Text>
            </View>
          }
          scrollEnabled={!!filtered.length}
        />
      )}

      {/* ── Feedback modal ── */}
      {feedbackItem && (
        <FeedbackModal
          visible={!!feedbackItem}
          caseItem={feedbackItem}
          isMonthlyLocked={feedbackItemMonthlyLocked}
          extraNumbers={feedbackExtraNumbers}
          onClose={() => setFeedbackItem(null)}
        />
      )}

      {/* ── Field Visit modal ── */}
      <FieldVisitModal
        visible={!!visitItem}
        caseItem={visitItem}
        onClose={() => setVisitItem(null)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  tabsContainer:       { flexDirection: "row", backgroundColor: Colors.surface, paddingHorizontal: 8, paddingBottom: 12, gap: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  tab:                 { flex: 1, alignItems: "center", paddingVertical: 10, paddingHorizontal: 2, borderRadius: 10, backgroundColor: Colors.surfaceAlt, gap: 4 },
  tabActive:           { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 3 },
  tabText:             { fontSize: 11, fontWeight: "600", color: Colors.textSecondary, textAlign: "center" },
  tabTextActive:       { color: "#fff" },
  tabCount:            { backgroundColor: Colors.border, borderRadius: 10, paddingHorizontal: 5, paddingVertical: 1, minWidth: 18, alignItems: "center" },
  tabCountText:        { fontSize: 10, fontWeight: "700", color: Colors.textSecondary },
  searchContainer:     { flexDirection: "row", alignItems: "center", margin: 12, backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: Colors.border },
  searchInput:         { flex: 1, fontSize: 14, color: Colors.text },
  list:                { padding: 12, gap: 12 },
  card:                { backgroundColor: Colors.surface, borderRadius: 16, padding: 14, gap: 8, borderWidth: 1, borderColor: Colors.border, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  cardTapArea:         { gap: 8 },
  cardHeader:          { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardNameRow:         { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  cardName:            { flex: 1, fontSize: 15, fontWeight: "700", color: Colors.text, textTransform: "uppercase" },
  lockBadge:           { width: 18, height: 18, borderRadius: 9, backgroundColor: Colors.warning + "20", alignItems: "center", justifyContent: "center" },
  statusBadge:         { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText:          { fontSize: 11, fontWeight: "700" },
  infoRow:             { flexDirection: "row", gap: 6 },
  infoCell:            { flex: 1, backgroundColor: Colors.surfaceAlt, borderRadius: 8, padding: 8 },
  infoCellSmall:       { width: 52, backgroundColor: Colors.surfaceAlt, borderRadius: 8, padding: 8 },
  infoLabel:           { fontSize: 9, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase", marginBottom: 2 },
  infoValue:           { fontSize: 12, fontWeight: "700", color: Colors.text },
  phoneRow:            { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 },
  phoneText:           { fontSize: 13, color: Colors.info, fontWeight: "500" },
  feedbackRow:         { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  feedbackLabel:       { fontSize: 12, color: Colors.textSecondary, fontWeight: "600" },
  feedbackValue:       { fontSize: 12, color: Colors.text, fontWeight: "500" },
  monthlyFeedbackRow:  { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.primary + "12", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  monthlyFeedbackText: { fontSize: 12, color: Colors.primary, fontWeight: "600", flex: 1 },
  rollbackYnBadge:     { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: Colors.info + "15", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" },
  rollbackYnText:      { fontSize: 11, color: Colors.info, fontWeight: "700" },
  ptpDateRow:          { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: Colors.statusPTP + "12", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  ptpDateLabel:        { fontSize: 12, color: Colors.statusPTP, fontWeight: "600" },
  ptpDateValue:        { fontSize: 12, color: Colors.statusPTP, fontWeight: "700" },
  cardActions:         { flexDirection: "row", gap: 7, marginTop: 4 },
  actionBtn:           { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 10, borderRadius: 10, gap: 4 },
  callBtn:             { backgroundColor: Colors.primary },
  detailBtn:           { backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.borderLight },
  feedbackBtn:         { backgroundColor: Colors.accent },
  visitBtn:            { backgroundColor: "#0F6E56" },
  actionBtnText:       { color: "#fff", fontSize: 12, fontWeight: "700" },
  empty:               { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText:           { fontSize: 16, color: Colors.textMuted },
});

const fbStyles = StyleSheet.create({
  overlay:             { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet:               { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "92%", flexShrink: 1 },
  handle:              { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: "center", marginBottom: 12 },
  title:               { fontSize: 20, fontWeight: "700", color: Colors.text, marginBottom: 4 },
  customerName:        { fontSize: 13, color: Colors.textSecondary, marginBottom: 8, textTransform: "uppercase" },
  sectionLabel:        { fontSize: 13, fontWeight: "700", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  divider:             { height: 1, backgroundColor: Colors.border, marginVertical: 12 },
  caseInfoRow:         { flexDirection: "row", gap: 8, marginBottom: 12 },
  caseInfoChip:        { flex: 1, borderRadius: 10, padding: 10, gap: 2 },
  caseInfoLabel:       { fontSize: 9, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase" },
  caseInfoValue:       { fontSize: 13, fontWeight: "800" },
  lockBanner:          { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.warning + "18", borderWidth: 1, borderColor: Colors.warning + "40", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16 },
  lockBannerText:      { flex: 1, fontSize: 13, color: Colors.warning, fontWeight: "600" },
  lockedRows:          { gap: 2, marginBottom: 8 },
  lockedRow:           { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, paddingHorizontal: 12, backgroundColor: Colors.surfaceAlt, borderRadius: 10, marginBottom: 4 },
  lockedRowLabel:      { fontSize: 12, color: Colors.textSecondary, fontWeight: "600" },
  lockedRowValue:      { fontSize: 13, fontWeight: "700", flex: 1, textAlign: "right" },
  tabRow:              { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  chipWrapRow:         { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  tabChip:             { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.border },
  tabChipText:         { fontSize: 13, fontWeight: "600", color: Colors.text, fontFamily: Platform.OS === "android" ? "Roboto" : undefined },
  feedbackOption:      { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt },
  feedbackOptionText:  { fontSize: 14, fontWeight: "600", color: Colors.text },
  detailOptionBtn:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt, marginBottom: 4 },
  detailOptionDot:     { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.border },
  detailOptionText:    { fontSize: 14, fontWeight: "600", color: Colors.text, flex: 1 },
  commentInput:        { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 12, fontSize: 14, color: Colors.text, minHeight: 80, textAlignVertical: "top", backgroundColor: Colors.surfaceAlt, marginBottom: 12 },
  btnRow:              { flexDirection: "row", gap: 12, marginTop: 8 },
  cancelBtn:           { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, alignItems: "center" },
  cancelText:          { fontSize: 15, fontWeight: "600", color: Colors.textSecondary },
  saveBtn:             { flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  saveText:            { fontSize: 15, fontWeight: "700", color: "#fff" },
  numbersSection:      { marginBottom: 12 },
  numbersSectionLabel: { fontSize: 11, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase", marginBottom: 6 },
  numbersRow:          { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  numberChip:          { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  numberChipExtra:     { backgroundColor: Colors.success + "18", borderWidth: 1, borderColor: Colors.success + "50" },
  numberChipText:      { color: "#fff", fontWeight: "700", fontSize: 13 },
  numberChipTextExtra: { color: Colors.success },
});

// ─── Field Visit Styles ───────────────────────────────────────────────────────
const fvStyles = StyleSheet.create({
  overlay:             { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet:               { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "94%", flexShrink: 1 },
  handle:              { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: "center", marginBottom: 16 },

  headerRow:           { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  headerIconWrap:      { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.primary + "14", alignItems: "center", justifyContent: "center" },
  title:               { fontSize: 18, fontWeight: "800", color: Colors.text },
  subtitle:            { fontSize: 11, color: Colors.textSecondary, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.3 },
  closeBtn:            { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.surfaceAlt, alignItems: "center", justifyContent: "center" },

  amountRow:           { flexDirection: "row", gap: 8, marginBottom: 16 },
  amountChip:          { flex: 1, backgroundColor: Colors.surfaceAlt, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: Colors.border },
  amountLabel:         { fontSize: 9, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase", marginBottom: 3 },
  amountValue:         { fontSize: 13, fontWeight: "700", color: Colors.text },

  sectionRow:          { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  sectionLabel:        { fontSize: 11, fontWeight: "700", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  sectionOptional:     { fontSize: 10, fontWeight: "500", color: Colors.textMuted, textTransform: "none" },
  requiredBadge:       { backgroundColor: Colors.danger + "15", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  requiredText:        { fontSize: 9, fontWeight: "700", color: Colors.danger, textTransform: "uppercase" },

  locationBtn:         { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: Colors.surfaceAlt, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.border, padding: 14, marginBottom: 16 },
  locationBtnCaptured: { borderColor: Colors.success + "80", backgroundColor: Colors.success + "0C" },
  locationBtnLoading:  { borderColor: Colors.primary + "60", backgroundColor: Colors.primary + "08" },
  locationBtnText:     { fontSize: 13, color: Colors.textSecondary, fontWeight: "500" },
  locationAccuracy:    { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  reCaptureBtnSmall:   { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: Colors.primary + "14" },
  reCaptureText:       { fontSize: 11, color: Colors.primary, fontWeight: "700" },

  outcomeBtn:          { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt },
  outcomeDot:          { width: 10, height: 10, borderRadius: 5 },
  outcomeText:         { fontSize: 14, fontWeight: "600", color: Colors.text, flex: 1, marginLeft: 2 },

  input:               { borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12, padding: 13, fontSize: 14, color: Colors.text, backgroundColor: Colors.surfaceAlt, marginBottom: 4 },
  inputError:          { borderColor: Colors.danger + "90", backgroundColor: Colors.danger + "08" },
  fieldError:          { fontSize: 11, color: Colors.danger, fontWeight: "600", marginBottom: 10, marginLeft: 2 },

  photoGrid:           { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  photoThumb:          { width: 80, height: 80, borderRadius: 12, overflow: "hidden", position: "relative", borderWidth: 1, borderColor: Colors.border },
  photoImg:            { width: "100%", height: "100%" },
  photoRemoveBtn:      { position: "absolute", top: 4, right: 4 },
  photoRemoveBg:       { width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.danger, alignItems: "center", justifyContent: "center" },
  photoIndexBadge:     { position: "absolute", bottom: 4, left: 4, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 },
  photoIndexText:      { fontSize: 10, color: "#fff", fontWeight: "700" },
  photoAddBtn:         { width: 80, height: 80, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, borderStyle: "dashed", backgroundColor: Colors.surfaceAlt, alignItems: "center", justifyContent: "center", gap: 4 },
  photoAddText:        { fontSize: 10, color: Colors.textMuted, fontWeight: "600" },

  validationBox:       { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: Colors.warning + "14", borderRadius: 10, borderWidth: 1, borderColor: Colors.warning + "40", paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  validationText:      { flex: 1, fontSize: 12, color: Colors.warning, fontWeight: "600" },

  btnRow:              { flexDirection: "row", gap: 12, marginTop: 12 },
  cancelBtn:           { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, alignItems: "center" },
  cancelText:          { fontSize: 15, fontWeight: "600", color: Colors.textSecondary },
  saveBtn:             { flex: 2, paddingVertical: 14, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  saveText:            { fontSize: 15, fontWeight: "700", color: "#fff" },
});

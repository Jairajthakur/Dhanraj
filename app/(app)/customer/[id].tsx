import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  Linking, Alert, Platform, TextInput, ActivityIndicator, Modal, Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { caseStore } from "@/lib/caseStore";
import { api } from "@/lib/api";
import MonthlyFeedbackStepper from "@/components/MonthlyFeedbackStepper"


// ─── Constants ────────────────────────────────────────────────────────────────
const TABS = ["Unpaid", "PTP", "Paid", "Monthly Feedback"] as const;
type FeedbackTab = typeof TABS[number];

const STATUS_COLORS: Record<string, string> = {
  Unpaid: Colors.statusUnpaid ?? "#EF4444",
  PTP:    Colors.statusPTP    ?? "#F59E0B",
  Paid:   Colors.statusPaid   ?? "#22C55E",
};

const PAID_DETAIL_OPTIONS   = ["PAID", "PART PAYMENT", "SETTLED"];
const UNPAID_DETAIL_OPTIONS = [
  "SWITCH OFF", "NOT AVAILABLE", "DISCONNECTED", "REFUSED TO PAY",
  "DISPUTED", "NOT AT HOME", "CUSTOMER MET - WILL PAY", "CUSTOMER MET - REFUSED",
  "PARTIAL PAYMENT DONE", "RESCHEDULED", "SKIP TRACE", "LEGAL ACTION INITIATED",
];
const PTP_DETAIL_OPTIONS       = ["PTP DATE SET", "WILL PAY TOMORROW", "WILL ARRANGE FUNDS", "CALL LATER"];
const MONTHLY_FEEDBACK_OPTIONS = [
  "SWITCH OFF", "NOT AVAILABLE", "DISCONNECTED", "REFUSED TO PAY",
  "DISPUTED", "NOT AT HOME", "CUSTOMER MET - WILL PAY", "CUSTOMER MET - REFUSED",
  "PARTIAL PAYMENT DONE", "RESCHEDULED", "SKIP TRACE", "LEGAL ACTION INITIATED",
];
const FEEDBACK_CODES     = ["PAID", "RTP", "SKIP", "PTP", "CAVNA", "ANF", "EXP", "SFT", "VSL"];
const PROJECTION_OPTIONS = ["ST", "RF", "RB"];

const VISIT_OUTCOMES = ["PTP", "Paid", "Refused to Pay", "Customer Absent", "Skip / Not Found"] as const;
type VisitOutcome = typeof VISIT_OUTCOMES[number];
const VISIT_OUTCOME_COLORS: Record<VisitOutcome, string> = {
  "PTP":              Colors.statusPTP    ?? "#F59E0B",
  "Paid":             Colors.success      ?? "#22C55E",
  "Refused to Pay":   Colors.danger       ?? "#EF4444",
  "Customer Absent":  (Colors as any).warning ?? "#F59E0B",
  "Skip / Not Found": Colors.textSecondary,
};

const CALL_OUTCOMES = [
  "Call Connected - Will Pay",
  "Call Connected - PTP Set",
  "Call Connected - Refused to Pay",
  "Call Connected - Already Paid",
  "Switch Off",
  "Not Reachable",
  "No Answer",
  "Call Back Later",
  "Wrong Number",
  "Disconnected",
];

const MAX_PHOTOS     = 4;
const PTP_DATE_REGEX = /^\d{2}-\d{2}-\d{4}$/;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(v: any, prefix = "") {
  if (v === null || v === undefined || v === "" || v === "0" || Number(v) === 0) return "—";
  const n = parseFloat(String(v).replace(/,/g, ""));
  if (!isNaN(n)) return prefix + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return String(v);
}
function fmtStr(v: any) { return (v === null || v === undefined || v === "") ? "—" : String(v); }
function fmtDate(v: any) { return !v ? "—" : String(v).slice(0, 10); }
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

interface GpsCoords { lat: number; lng: number; accuracy: number; }
interface PhotoAsset { uri: string; fileName: string; mimeType: string; }

// ─── SectionCard & Row ────────────────────────────────────────────────────────
function SectionCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
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
function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
    </View>
  );
}

// ─── YNToggle ─────────────────────────────────────────────────────────────────
function YNToggle({ label, value, onChange }: { label: string; value: boolean | null; onChange: (v: boolean | null) => void }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={fbStyles.sectionLabel}>{label}</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {([true, false] as const).map((val) => (
          <Pressable key={String(val)} style={[fbStyles.feedbackOption, { flex: 1, alignItems: "center" }, value === val && { backgroundColor: val ? Colors.success : Colors.danger, borderColor: val ? Colors.success : Colors.danger }]} onPress={() => onChange(value === val ? null : val)}>
            <Text style={[fbStyles.feedbackOptionText, value === val && { color: "#fff" }]}>{val ? "Y" : "N"}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ─── LockedFeedbackView ───────────────────────────────────────────────────────
function LockedFeedbackView({ item, onClose }: { item: any; onClose: () => void }) {
  const rows = [
    item.status            && { label: "Status",          value: item.status,            color: STATUS_COLORS[item.status] || Colors.text },
    item.feedback_code     && { label: "Feedback Code",   value: item.feedback_code,      color: (Colors as any).accent ?? Colors.primary },
    item.latest_feedback   && { label: "Detail Feedback", value: item.latest_feedback,    color: Colors.text },
    item.monthly_feedback  && item.monthly_feedback !== "SUBMITTED" && { label: "Monthly", value: item.monthly_feedback, color: Colors.primary },
    item.ptp_date          && { label: "PTP Date",        value: String(item.ptp_date).slice(0, 10), color: Colors.statusPTP ?? "#F59E0B" },
    item.feedback_comments && { label: "Comments",        value: item.feedback_comments,  color: Colors.textSecondary },
  ].filter(Boolean) as { label: string; value: string; color: string }[];
  return (
    <>
      <View style={fbStyles.lockBanner}>
        <Ionicons name="lock-closed" size={16} color={(Colors as any).warning ?? "#F59E0B"} />
        <Text style={fbStyles.lockBannerText}>Monthly feedback locked — contact admin to reset before editing</Text>
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
        <Text style={{ color: Colors.textMuted, textAlign: "center", marginVertical: 24 }}>No feedback details saved yet.</Text>
      )}
    </>
  );
}

// ─── FeedbackModal ────────────────────────────────────────────────────────────
function FeedbackModal({ visible, item, onClose, extraNumbers = [], onMonthlyFeedbackRequest }: { visible: boolean; item: any; onClose: () => void; extraNumbers?: string[]; onMonthlyFeedbackRequest?: () => void }) {
  const [activeTab,          setActiveTab]          = useState<FeedbackTab>("Unpaid");
  const [detailFeedback,     setDetailFeedback]     = useState(item?.latest_feedback   || "");
  const [monthlyFeedback,    setMonthlyFeedback]    = useState(item?.monthly_feedback  || "");
  const [feedbackCode,       setFeedbackCode]       = useState(item?.feedback_code     || "");
  const [comments,           setComments]           = useState(item?.feedback_comments || "");
  const [ptpDate,            setPtpDate]            = useState(item?.ptp_date ? String(item.ptp_date).slice(0, 10) : "");
  const [paidDetailFeedback, setPaidDetailFeedback] = useState(item?.latest_feedback   || "");
  const [paidComments,       setPaidComments]       = useState(item?.feedback_comments || "");
  const [paidRollbackYn,     setPaidRollbackYn]     = useState<boolean | null>(item?.rollback_yn != null ? Boolean(item.rollback_yn) : null);
  const [customerAvailable,  setCustomerAvailable]  = useState<boolean | null>(item?.customer_available ?? null);
  const [vehicleAvailable,   setVehicleAvailable]   = useState<boolean | null>(item?.vehicle_available  ?? null);
  const [thirdParty,         setThirdParty]         = useState<boolean | null>(item?.third_party        ?? null);
  const [thirdPartyName,     setThirdPartyName]     = useState(item?.third_party_name   || "");
  const [thirdPartyNumber,   setThirdPartyNumber]   = useState(item?.third_party_number || "");
  const [projection,         setProjection]         = useState(item?.projection || "");
  const [nonStarter,         setNonStarter]         = useState<boolean | null>(item?.non_starter  ?? null);
  const [kycPurchase,        setKycPurchase]        = useState<boolean | null>(item?.kyc_purchase  ?? null);
  const [workable,           setWorkable]           = useState<boolean | null>(item?.workable      ?? null);
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();
  const isMonthlyLocked = !!(item?.monthly_feedback && item.monthly_feedback !== "");
  const primaryPhones: string[] = (item?.mobile_no ?? "").split(",").map((p: string) => p.trim()).filter(Boolean);
  const allPhones = [...primaryPhones, ...extraNumbers.filter((n) => !primaryPhones.includes(n))];

  const renderDetailOptions = (options: string[], val: string, setVal: (v: string) => void, activeColor: string) => (
    <View style={{ gap: 8, marginBottom: 12 }}>
      {options.map((opt) => (
        <Pressable key={opt} style={[fbStyles.detailOptionBtn, val === opt && { backgroundColor: activeColor + "20", borderColor: activeColor }]} onPress={() => setVal(val === opt ? "" : opt)}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={[fbStyles.detailOptionDot, val === opt && { backgroundColor: activeColor }]} />
            <Text style={[fbStyles.detailOptionText, val === opt && { color: activeColor, fontWeight: "700" }]}>{opt}</Text>
          </View>
          {val === opt && <Ionicons name="checkmark-circle" size={20} color={activeColor} />}
        </Pressable>
      ))}
    </View>
  );

  const save = async () => {
    if (activeTab === "Monthly Feedback" && !feedbackCode) { Alert.alert("Error", "Please select a Feedback Code"); return; }
    if (activeTab === "PTP" && !ptpDate) { Alert.alert("Error", "Please enter a PTP date"); return; }
    if (!item) return;
    let finalStatus = "Unpaid";
    if (activeTab === "Paid") finalStatus = "Paid";
    else if (activeTab === "PTP") finalStatus = "PTP";
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        status:   finalStatus,
        feedback: activeTab === "Paid" ? paidDetailFeedback : detailFeedback,
        comments: activeTab === "Paid" ? paidComments       : comments,
        ptp_date: activeTab === "PTP"  ? toIsoDate(ptpDate) : null,
        rollback_yn: activeTab === "Paid" ? paidRollbackYn : null,
        customer_available: customerAvailable, vehicle_available: vehicleAvailable,
        third_party: thirdParty, third_party_name: thirdParty ? thirdPartyName : null,
        third_party_number: thirdParty ? thirdPartyNumber : null,
      };
      if (activeTab === "Monthly Feedback") {
        payload.feedback_code = feedbackCode; payload.projection = projection;
        payload.non_starter = nonStarter; payload.kyc_purchase = kycPurchase;
        payload.workable = workable; payload.monthly_feedback = monthlyFeedback || "SUBMITTED";
      }
      const caseType = (item as any).case_type === "bkt" ? "bkt" : "loan";
      if (caseType === "bkt") await api.updateBktFeedback(item.id, payload);
      else await api.updateFeedback(item.id, payload);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["/api/cases"] });
      qc.invalidateQueries({ queryKey: ["/api/bkt-cases"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      // BUG FIX: invalidate broken-ptps so blocking modal clears immediately
      qc.invalidateQueries({ queryKey: ["/api/broken-ptps"] });
      onClose();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Something went wrong");
    } finally { setLoading(false); }
  };

  const isMonthlyTabLocked = isMonthlyLocked && activeTab === "Monthly Feedback";
  const tabColor = (t: FeedbackTab) => t === "Paid" ? Colors.success : t === "PTP" ? (Colors.statusPTP ?? "#F59E0B") : t === "Monthly Feedback" ? Colors.primary : (Colors.statusUnpaid ?? "#EF4444");

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={fbStyles.overlay}>
        <View style={fbStyles.sheet}>
          <View style={fbStyles.handle} />
          <Text style={fbStyles.title}>Update Feedback</Text>
          <Text style={fbStyles.customerName}>{item?.customer_name} · {item?.loan_no}</Text>
          {allPhones.length > 0 && (
            <View style={fbStyles.numbersSection}>
              <Text style={fbStyles.numbersSectionLabel}>Contact Numbers</Text>
              <View style={fbStyles.numbersRow}>
                {allPhones.map((ph, i) => (
                  <Pressable key={i} style={[fbStyles.numberChip, i >= primaryPhones.length && fbStyles.numberChipExtra]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); Linking.openURL(`tel:${ph}`); }}>
                    <Ionicons name="call" size={12} color={i >= primaryPhones.length ? Colors.success : "#fff"} />
                    <Text style={[fbStyles.numberChipText, i >= primaryPhones.length && fbStyles.numberChipTextExtra]}>{ph}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
          <View style={fbStyles.caseInfoRow}>
            {item?.rollback && fmtRaw(item.rollback) !== "—" && (
              <View style={[fbStyles.caseInfoChip, { backgroundColor: (Colors.info ?? "#3B82F6") + "18" }]}>
                <Text style={fbStyles.caseInfoLabel}>ROLLBACK</Text>
                <Text style={[fbStyles.caseInfoValue, { color: Colors.info ?? "#3B82F6" }]}>{fmtRaw(item.rollback)}</Text>
              </View>
            )}
            {item?.clearance && fmtRaw(item.clearance) !== "—" && (
              <View style={[fbStyles.caseInfoChip, { backgroundColor: Colors.success + "18" }]}>
                <Text style={fbStyles.caseInfoLabel}>CLEARANCE</Text>
                <Text style={[fbStyles.caseInfoValue, { color: Colors.success }]}>{fmtRaw(item.clearance)}</Text>
              </View>
            )}
          </View>
          <View style={fbStyles.tabRow}>
            {TABS.map((t) => {
              const isActive = activeTab === t;
              const isLocked = t === "Monthly Feedback" && isMonthlyLocked;
              const color = tabColor(t);
              return (
                <Pressable key={t} style={[fbStyles.tabChip, isActive && { backgroundColor: color, borderColor: color }, isLocked && !isActive && { borderColor: ((Colors as any).warning ?? "#F59E0B") + "60", backgroundColor: ((Colors as any).warning ?? "#F59E0B") + "10" }]} onPress={() => {
                    if (t === "Monthly Feedback" && !isLocked && onMonthlyFeedbackRequest) {
                      onClose();
                      onMonthlyFeedbackRequest();
                    } else {
                      setActiveTab(t);
                    }
                  }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    {isLocked && <Ionicons name="lock-closed" size={11} color={isActive ? "#fff" : ((Colors as any).warning ?? "#F59E0B")} />}
                    <Text style={[fbStyles.tabChipText, isActive && { color: "#fff" }, isLocked && !isActive && { color: (Colors as any).warning ?? "#F59E0B" }]}>{t}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 1, flexShrink: 1 }}>
            {activeTab === "Unpaid" && (
              <>
                <Text style={fbStyles.sectionLabel}>Detail Feedback</Text>
                {renderDetailOptions(MONTHLY_FEEDBACK_OPTIONS, detailFeedback, setDetailFeedback, Colors.statusUnpaid ?? "#EF4444")}
                <Text style={fbStyles.sectionLabel}>Comments (Optional)</Text>
                <TextInput style={fbStyles.commentInput} placeholder="Add comments..." placeholderTextColor={Colors.textMuted} value={comments} onChangeText={setComments} multiline numberOfLines={4} />
              </>
            )}
            {activeTab === "Monthly Feedback" && (
              <>
                {isMonthlyLocked ? <LockedFeedbackView item={item!} onClose={onClose} /> : (
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
                        <Pressable key={f} style={[fbStyles.tabChip, feedbackCode === f && { backgroundColor: (Colors as any).accent ?? Colors.primary, borderColor: (Colors as any).accent ?? Colors.primary }]} onPress={() => setFeedbackCode(f)}>
                          <Text style={[fbStyles.tabChipText, feedbackCode === f && { color: "#fff" }]}>{f}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <Text style={fbStyles.sectionLabel}>Detail Feedback</Text>
                    {feedbackCode === "PTP" ? (
                      <>
                        {renderDetailOptions(PTP_DETAIL_OPTIONS, detailFeedback, setDetailFeedback, Colors.statusPTP ?? "#F59E0B")}
                        <Text style={fbStyles.sectionLabel}>PTP Date</Text>
                        <TextInput style={[fbStyles.commentInput, { minHeight: 44, marginBottom: 12 }]} placeholder="DD-MM-YYYY" placeholderTextColor={Colors.textMuted} value={ptpDate} onChangeText={setPtpDate} keyboardType="numeric" />
                      </>
                    ) : (
                      <>
                        {renderDetailOptions(UNPAID_DETAIL_OPTIONS, detailFeedback, setDetailFeedback, Colors.statusUnpaid ?? "#EF4444")}
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
                    <YNToggle label="Non Starter" value={nonStarter} onChange={setNonStarter} />
                    <YNToggle label="KYC Purchase" value={kycPurchase} onChange={setKycPurchase} />
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
                {renderDetailOptions(PTP_DETAIL_OPTIONS, detailFeedback, setDetailFeedback, Colors.statusPTP ?? "#F59E0B")}
                <Text style={fbStyles.sectionLabel}>PTP Date</Text>
                <TextInput style={[fbStyles.commentInput, { minHeight: 44, marginBottom: 12 }]} placeholder="DD-MM-YYYY" placeholderTextColor={Colors.textMuted} value={ptpDate} onChangeText={setPtpDate} keyboardType="numeric" />
                <Text style={fbStyles.sectionLabel}>Comments (Optional)</Text>
                <TextInput style={fbStyles.commentInput} placeholder="Add comments..." placeholderTextColor={Colors.textMuted} value={comments} onChangeText={setComments} multiline numberOfLines={3} />
              </>
            )}
            <View style={{ height: 16 }} />
          </ScrollView>
          <View style={fbStyles.btnRow}>
            <Pressable style={fbStyles.cancelBtn} onPress={onClose}><Text style={fbStyles.cancelText}>{isMonthlyTabLocked ? "Close" : "Cancel"}</Text></Pressable>
            {!isMonthlyTabLocked && (
              <Pressable style={[fbStyles.saveBtn, { backgroundColor: tabColor(activeTab) }]} onPress={save} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={fbStyles.saveText}>Save</Text>}
              </Pressable>
            )}
          </View>
          <View style={{ height: 24 }} />
        </View>
      </View>
    </Modal>
  );
}

// ─── FieldVisitModal ──────────────────────────────────────────────────────────
function FieldVisitModal({ visible, item, onClose }: { visible: boolean; item: any; onClose: () => void }) {
  const [outcome,    setOutcome]    = useState<VisitOutcome | "">("");
  const [remarks,    setRemarks]    = useState("");
  const [ptpDate,    setPtpDate]    = useState("");
  const [photos,     setPhotos]     = useState<PhotoAsset[]>([]);
  const [gps,        setGps]        = useState<GpsCoords | null>(null);
  const [locLoading, setLocLoading] = useState(false);
  const [saving,     setSaving]     = useState(false);
  const qc = useQueryClient();
  const saveGuardRef = useRef(false);

  const reset = useCallback(() => {
    setOutcome(""); setRemarks(""); setPtpDate(""); setPhotos([]); setGps(null);
    setLocLoading(false); setSaving(false); saveGuardRef.current = false;
  }, []);

  const handleClose = useCallback(() => { if (saving) return; reset(); onClose(); }, [saving, reset, onClose]);

  const captureGps = useCallback(async () => {
    if (locLoading) return;
    setLocLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") { Alert.alert("Location Permission Denied", "Please enable location access in device settings."); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High } as any);
      setGps({ lat: loc.coords.latitude, lng: loc.coords.longitude, accuracy: Math.round(loc.coords.accuracy ?? 0) });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      Alert.alert("GPS Error", err instanceof Error ? err.message : "Could not capture GPS.");
    } finally { setLocLoading(false); }
  }, [locLoading]);

  const pickPhoto = useCallback(async () => {
    if (photos.length >= MAX_PHOTOS) { Alert.alert(`Maximum ${MAX_PHOTOS} photos allowed.`); return; }
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") { Alert.alert("Camera Permission Denied", "Please enable camera access."); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.65, base64: false, allowsEditing: false, mediaTypes: ImagePicker.MediaTypeOptions.Images });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const ext = (asset.uri.split(".").pop() ?? "jpg").toLowerCase();
      setPhotos((prev) => [...prev, { uri: asset.uri, fileName: `visit_${Date.now()}_${prev.length}.${ext}`, mimeType: ext === "png" ? "image/png" : "image/jpeg" }]);
    }
  }, [photos.length]);

  const save = useCallback(async () => {
    if (saveGuardRef.current) return;
    if (!outcome)                              { Alert.alert("Validation Error", "Please select a visit outcome."); return; }
    if (!gps)                                  { Alert.alert("Validation Error", "GPS location is required."); return; }
    if (outcome === "PTP" && !ptpDate.trim())  { Alert.alert("Validation Error", "PTP date is required."); return; }
    if (outcome === "PTP" && !PTP_DATE_REGEX.test(ptpDate.trim())) { Alert.alert("Validation Error", "PTP date must be DD-MM-YYYY."); return; }
    if (!remarks.trim() || remarks.trim().length < 10) { Alert.alert("Validation Error", "Remarks must be at least 10 characters."); return; }
    if (!item) return;
    saveGuardRef.current = true;
    setSaving(true);
    const caseType = (item as any).case_type === "bkt" ? "bkt" : "loan";
    try {
      await api.recordFieldVisit(item.id, {
        lat: gps!.lat,
        lng: gps!.lng,
        accuracy: gps!.accuracy,
        case_type: caseType,
        photo: photos.length > 0
          ? { uri: photos[0].uri, name: photos[0].fileName, mimeType: photos[0].mimeType }
          : null,
        visit_outcome: outcome,
        visit_remarks: remarks.trim(),
      });
      const feedbackPayload: Record<string, unknown> = {
        visit_outcome: outcome, visit_remarks: remarks.trim(),
        visit_location: `${gps!.lat.toFixed(6)},${gps!.lng.toFixed(6)}`,
        visit_photo_count: photos.length, visited_at: new Date().toISOString(),
      };
      if (outcome === "PTP")  { feedbackPayload.ptp_date = toIsoDate(ptpDate.trim()); feedbackPayload.status = "PTP"; }
      if (outcome === "Paid") { feedbackPayload.status = "Paid"; }
      if (caseType === "bkt") await api.updateBktFeedback(item.id, feedbackPayload);
      else await api.updateFeedback(item.id, feedbackPayload);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["/api/cases"] });
      qc.invalidateQueries({ queryKey: ["/api/bkt-cases"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      // BUG FIX: invalidate broken-ptps so blocking modal clears immediately
      qc.invalidateQueries({ queryKey: ["/api/broken-ptps"] });
      reset(); onClose();
      setTimeout(() => Alert.alert("Visit Recorded", "Field visit saved successfully."), 300);
    } catch (e: unknown) {
      saveGuardRef.current = false;
      Alert.alert("Save Failed", e instanceof Error ? e.message : "Something went wrong.");
    } finally { setSaving(false); }
  }, [outcome, gps, remarks, ptpDate, photos, item, qc, reset, onClose]);

  if (!item) return null;

  const canSave = !!outcome && !!gps && !saving;
  const phones: string[] = (item?.mobile_no ?? "").split(",").map((p: string) => p.trim()).filter(Boolean);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose} statusBarTranslucent>
      <View style={fvStyles.overlay}>
        <View style={fvStyles.sheet}>
          {/* Handle */}
          <View style={fvStyles.handle} />

          {/* Header */}
          <View style={fvStyles.headerRow}>
            <View style={fvStyles.headerIconWrap}>
              <Ionicons name="navigate" size={18} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={fvStyles.title}>Update Feedback</Text>
              <Text style={fvStyles.subtitle} numberOfLines={1}>
                {item.customer_name}  ·  {item.loan_no}
              </Text>
            </View>
            <Pressable style={fvStyles.closeBtn} onPress={handleClose} disabled={saving}>
              <Ionicons name="close" size={20} color={saving ? Colors.textMuted : Colors.textSecondary} />
            </Pressable>
          </View>

          {/* Contact Numbers */}
          {phones.length > 0 && (
            <View style={fvStyles.contactSection}>
              <Text style={fvStyles.contactLabel}>CONTACT NUMBERS</Text>
              <View style={fvStyles.contactRow}>
                {phones.map((ph, i) => (
                  <Pressable
                    key={i}
                    style={fvStyles.contactChip}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); Linking.openURL(`tel:${ph}`); }}
                  >
                    <Ionicons name="call" size={14} color="#fff" />
                    <Text style={fvStyles.contactChipText}>{ph}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* Amount Chips */}
          <View style={fvStyles.amountRow}>
            <View style={fvStyles.amountChip}>
              <Text style={fvStyles.amountLabel}>EMI DUE</Text>
              <Text style={[fvStyles.amountValue, { color: Colors.danger }]}>{fmt(item.emi_due, "₹")}</Text>
            </View>
            <View style={fvStyles.amountChip}>
              <Text style={fvStyles.amountLabel}>POS</Text>
              <Text style={fvStyles.amountValue}>{fmt(item.pos, "₹")}</Text>
            </View>
            <View style={[fvStyles.amountChip, { flex: 1.5 }]}>
              <Text style={fvStyles.amountLabel}>ADDRESS</Text>
              <Text style={[fvStyles.amountValue, { fontSize: 10, lineHeight: 14 }]} numberOfLines={2}>
                {item.address || "—"}
              </Text>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">

            {/* GPS Section */}
            <View style={fvStyles.sectionRow}>
              <Text style={fvStyles.sectionLabel}>GPS LOCATION</Text>
              <View style={fvStyles.requiredBadge}><Text style={fvStyles.requiredText}>REQUIRED</Text></View>
            </View>
            <Pressable
              style={[fvStyles.locationBtn, gps && fvStyles.locationBtnCaptured, locLoading && fvStyles.locationBtnLoading]}
              onPress={captureGps}
              disabled={locLoading || saving}
            >
              <View style={fvStyles.locationIconWrap}>
                {locLoading
                  ? <ActivityIndicator size="small" color={Colors.primary} />
                  : <Ionicons name={gps ? "checkmark-circle" : "locate-outline"} size={22} color={gps ? Colors.success : Colors.textSecondary} />
                }
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[fvStyles.locationBtnText, gps && { color: Colors.success, fontWeight: "700" }]}>
                  {locLoading ? "Getting location…" : gps ? `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}` : "Tap to capture current location"}
                </Text>
                {gps && <Text style={fvStyles.locationAccuracy}>±{gps.accuracy}m accuracy</Text>}
              </View>
              {gps && !locLoading
                ? <Pressable style={fvStyles.reCaptureBtnSmall} onPress={captureGps} disabled={saving}>
                    <Ionicons name="refresh" size={12} color={Colors.primary} />
                    <Text style={fvStyles.reCaptureText}>Retry</Text>
                  </Pressable>
                : <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              }
            </Pressable>

            {/* Visit Outcome Section */}
            <View style={fvStyles.sectionRow}>
              <Text style={fvStyles.sectionLabel}>VISIT OUTCOME</Text>
              <View style={fvStyles.requiredBadge}><Text style={fvStyles.requiredText}>REQUIRED</Text></View>
            </View>
            <View style={{ gap: 8, marginBottom: 16 }}>
              {VISIT_OUTCOMES.map((o) => {
                const color = VISIT_OUTCOME_COLORS[o];
                const isSelected = outcome === o;
                return (
                  <Pressable
                    key={o}
                    style={[fvStyles.outcomeBtn, isSelected && { borderColor: color, backgroundColor: color + "12" }]}
                    onPress={() => setOutcome(o)}
                  >
                    <View style={[fvStyles.outcomeDot, { borderColor: isSelected ? color : Colors.border, backgroundColor: isSelected ? color : "transparent" }]} />
                    <Text style={[fvStyles.outcomeText, isSelected && { color, fontWeight: "700" }]}>{o}</Text>
                    {isSelected && <Ionicons name="checkmark-circle" size={20} color={color} style={{ marginLeft: "auto" }} />}
                  </Pressable>
                );
              })}
            </View>

            {/* PTP Date */}
            {outcome === "PTP" && (
              <>
                <View style={fvStyles.sectionRow}>
                  <Text style={fvStyles.sectionLabel}>PTP Date</Text>
                  <View style={fvStyles.requiredBadge}><Text style={fvStyles.requiredText}>Required</Text></View>
                </View>
                <TextInput
                  style={[fvStyles.input, { marginBottom: 16 }]}
                  placeholder="DD-MM-YYYY"
                  placeholderTextColor={Colors.textMuted}
                  value={ptpDate}
                  onChangeText={setPtpDate}
                  keyboardType="numeric"
                  editable={!saving}
                />
              </>
            )}

            {/* Remarks */}
            <View style={fvStyles.sectionRow}>
              <Text style={fvStyles.sectionLabel}>Visit Remarks</Text>
              <View style={[fvStyles.requiredBadge, { backgroundColor: Colors.textMuted + "18" }]}>
                <Text style={[fvStyles.requiredText, { color: Colors.textMuted }]}>Min 10 chars</Text>
              </View>
            </View>
            <TextInput
              style={[fvStyles.input, { minHeight: 90, textAlignVertical: "top", marginBottom: 16 }]}
              placeholder="Describe what happened during the visit…"
              placeholderTextColor={Colors.textMuted}
              value={remarks}
              onChangeText={setRemarks}
              multiline
              numberOfLines={4}
              editable={!saving}
            />

            {/* Photos */}
            <View style={fvStyles.sectionRow}>
              <Text style={fvStyles.sectionLabel}>Photo Proof</Text>
              <Text style={fvStyles.sectionOptional}>Optional · max {MAX_PHOTOS}</Text>
            </View>
            <View style={fvStyles.photoGrid}>
              {photos.map((p, i) => (
                <View key={i} style={fvStyles.photoThumb}>
                  <Image source={{ uri: p.uri }} style={fvStyles.photoImg as any} />
                  <Pressable style={fvStyles.photoRemoveBtn} onPress={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}>
                    <View style={fvStyles.photoRemoveBg}><Ionicons name="close" size={12} color="#fff" /></View>
                  </Pressable>
                </View>
              ))}
              {photos.length < MAX_PHOTOS && (
                <Pressable style={fvStyles.photoAddBtn} onPress={pickPhoto} disabled={saving}>
                  <Ionicons name="camera" size={22} color={Colors.textMuted} />
                  <Text style={fvStyles.photoAddText}>Add Photo</Text>
                </Pressable>
              )}
            </View>
            <View style={{ height: 16 }} />
          </ScrollView>

          {/* Footer Buttons */}
          <View style={fvStyles.btnRow}>
            <Pressable style={fvStyles.cancelBtn} onPress={handleClose} disabled={saving}>
              <Text style={fvStyles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[fvStyles.saveBtn, { backgroundColor: canSave ? Colors.primary : Colors.surfaceElevated ?? "#D8D6CF", opacity: saving ? 0.7 : 1 }]}
              onPress={save}
              disabled={!canSave}
            >
              {saving ? (
                <><ActivityIndicator size="small" color="#fff" /><Text style={fvStyles.saveText}>Saving…</Text></>
              ) : (
                <>
                  <Ionicons name="location" size={16} color={canSave ? "#fff" : Colors.textMuted} />
                  <Text style={[fvStyles.saveText, { color: canSave ? "#fff" : Colors.textMuted }]}>Save Visit</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── PhoneCallModal ───────────────────────────────────────────────────────────
function PhoneCallModal({ visible, item, onClose, extraNumbers = [] }: { visible: boolean; item: any; onClose: () => void; extraNumbers?: string[] }) {
  const [selectedOutcome, setSelectedOutcome] = useState("");
  const [comments,        setComments]        = useState("");
  const [ptpDate,         setPtpDate]         = useState("");
  const [saving,          setSaving]          = useState(false);
  const qc = useQueryClient();
  const primaryPhones: string[] = (item?.mobile_no ?? "").split(",").map((p: string) => p.trim()).filter(Boolean);
  const allPhones = [...primaryPhones, ...extraNumbers.filter((n) => !primaryPhones.includes(n))];

  const reset = () => { setSelectedOutcome(""); setComments(""); setPtpDate(""); setSaving(false); };
  const handleClose = () => { reset(); onClose(); };

  const save = async () => {
    if (!selectedOutcome) { Alert.alert("Please select a call outcome"); return; }
    if (!item) return;
    setSaving(true);
    try {
      const isPTP  = selectedOutcome === "Call Connected - PTP Set";
      const isPaid = selectedOutcome === "Call Connected - Already Paid";
      const caseType = (item as any).case_type === "bkt" ? "bkt" : "loan";
      const payload: Record<string, unknown> = {
        feedback: selectedOutcome, comments: comments.trim() || null,
        status:   isPTP ? "PTP" : isPaid ? "Paid" : "Unpaid",
        ptp_date: isPTP && ptpDate ? toIsoDate(ptpDate) : null,
      };
      if (caseType === "bkt") await api.updateBktFeedback(item.id, payload);
      else await api.updateFeedback(item.id, payload);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["/api/cases"] });
      qc.invalidateQueries({ queryKey: ["/api/bkt-cases"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      // BUG FIX: invalidate broken-ptps so blocking modal clears immediately
      qc.invalidateQueries({ queryKey: ["/api/broken-ptps"] });
      reset(); onClose();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Something went wrong");
    } finally { setSaving(false); }
  };

  if (!item) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={fbStyles.overlay}>
        <View style={fbStyles.sheet}>
          <View style={fbStyles.handle} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primary + "18", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="call" size={20} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={fbStyles.title}>Log Phone Call</Text>
              <Text style={fbStyles.customerName}>{item?.customer_name} · {item?.loan_no}</Text>
            </View>
          </View>
          {allPhones.length > 0 && (
            <View style={fbStyles.numbersSection}>
              <Text style={fbStyles.numbersSectionLabel}>Tap to Call</Text>
              <View style={fbStyles.numbersRow}>
                {allPhones.map((ph, i) => (
                  <Pressable key={i} style={[fbStyles.numberChip, i >= primaryPhones.length && fbStyles.numberChipExtra]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); Linking.openURL(`tel:${ph}`); }}>
                    <Ionicons name="call" size={12} color={i >= primaryPhones.length ? Colors.success : "#fff"} />
                    <Text style={[fbStyles.numberChipText, i >= primaryPhones.length && fbStyles.numberChipTextExtra]}>{ph}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
          <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 1, flexShrink: 1 }}>
            <Text style={fbStyles.sectionLabel}>Call Outcome</Text>
            <View style={{ gap: 8, marginBottom: 12 }}>
              {CALL_OUTCOMES.map((opt) => {
                const isSelected = selectedOutcome === opt;
                const color = opt.includes("Will Pay") || opt.includes("Paid") ? Colors.success
                  : opt.includes("Refused") ? Colors.danger
                  : opt.includes("PTP")     ? (Colors.statusPTP ?? "#F59E0B")
                  : Colors.primary;
                return (
                  <Pressable key={opt} style={[fbStyles.detailOptionBtn, isSelected && { backgroundColor: color + "20", borderColor: color }]} onPress={() => setSelectedOutcome(isSelected ? "" : opt)}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <View style={[fbStyles.detailOptionDot, isSelected && { backgroundColor: color }]} />
                      <Text style={[fbStyles.detailOptionText, isSelected && { color, fontWeight: "700" }]}>{opt}</Text>
                    </View>
                    {isSelected && <Ionicons name="checkmark-circle" size={20} color={color} />}
                  </Pressable>
                );
              })}
            </View>
            {selectedOutcome === "Call Connected - PTP Set" && (
              <>
                <Text style={fbStyles.sectionLabel}>PTP Date</Text>
                <TextInput style={[fbStyles.commentInput, { minHeight: 44, marginBottom: 8 }]} placeholder="DD-MM-YYYY" placeholderTextColor={Colors.textMuted} value={ptpDate} onChangeText={setPtpDate} keyboardType="numeric" />
              </>
            )}
            <Text style={fbStyles.sectionLabel}>Comments (Optional)</Text>
            <TextInput style={fbStyles.commentInput} placeholder="Add any call notes..." placeholderTextColor={Colors.textMuted} value={comments} onChangeText={setComments} multiline numberOfLines={3} />
            <View style={{ height: 16 }} />
          </ScrollView>
          <View style={fbStyles.btnRow}>
            <Pressable style={fbStyles.cancelBtn} onPress={handleClose}><Text style={fbStyles.cancelText}>Cancel</Text></Pressable>
            <Pressable style={[fbStyles.saveBtn, { backgroundColor: Colors.primary }]} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={fbStyles.saveText}>Log Call</Text>}
            </Pressable>
          </View>
          <View style={{ height: 24 }} />
        </View>
      </View>
    </Modal>
  );
}

// ─── ReceiptRequestModal ──────────────────────────────────────────────────────
function ReceiptRequestModal({ visible, item, onClose }: { visible: boolean; item: any; onClose: () => void }) {
  const [loading,   setLoading]   = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const insets = useSafeAreaInsets();
  const [emiInput, setEmiInput] = useState(String(item?.emi_amount || ""));
  const [cbcInput, setCbcInput] = useState(String(item?.cbc || ""));
  const [lppInput, setLppInput] = useState(String(item?.lpp || ""));

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await api.requestReceipt(item.id, { loan_no: item.loan_no, customer_name: item.customer_name, table_type: (item as any).case_type || "loan", emi_amount: emiInput ? parseFloat(emiInput) : undefined, cbc: cbcInput ? parseFloat(cbcInput) : undefined, lpp: lppInput ? parseFloat(lppInput) : undefined });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSubmitted(true);
    } catch (e: any) {
      if (e.message?.includes("already") || e.message?.includes("pending")) { setSubmitted(true); }
      else Alert.alert("Error", e.message || "Failed to send request");
    } finally { setLoading(false); }
  };
  const handleClose = () => { setSubmitted(false); setEmiInput(String(item?.emi_amount || "")); setCbcInput(String(item?.cbc || "")); setLppInput(String(item?.lpp || "")); onClose(); };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={rrStyles.overlay}>
        <View style={[rrStyles.sheet, { paddingBottom: insets.bottom + 24 }]}>
          <View style={rrStyles.handle} />
          {submitted ? (
            <View style={rrStyles.successContainer}>
              <View style={rrStyles.successIcon}><Ionicons name="checkmark-circle" size={48} color={Colors.success} /></View>
              <Text style={rrStyles.successTitle}>Request Sent!</Text>
              <Text style={rrStyles.successMsg}>Admin has been notified for <Text style={{ fontWeight: "700" }}>{item?.customer_name}</Text>.</Text>
              <Pressable style={rrStyles.doneBtn} onPress={handleClose}><Text style={rrStyles.doneBtnText}>Done</Text></Pressable>
            </View>
          ) : (
            <>
              <View style={rrStyles.headerRow}>
                <View style={rrStyles.receiptIcon}><Ionicons name="receipt-outline" size={22} color={Colors.primary} /></View>
                <View style={{ flex: 1 }}><Text style={rrStyles.title}>Request Receipt</Text><Text style={rrStyles.subtitle} numberOfLines={1}>{item?.customer_name} · {item?.loan_no}</Text></View>
              </View>
              <View style={rrStyles.infoBox}>
                <Ionicons name="information-circle-outline" size={16} color={Colors.info ?? "#3B82F6"} />
                <Text style={rrStyles.infoText}>Admin will receive a notification and process your receipt request.</Text>
              </View>
              <View style={rrStyles.amountGrid}>
                {[{ label: "EMI AMOUNT", val: emiInput, set: setEmiInput }, { label: "CBC", val: cbcInput, set: setCbcInput }, { label: "LPP", val: lppInput, set: setLppInput }].map((f) => (
                  <View key={f.label} style={rrStyles.amountCell}>
                    <Text style={rrStyles.amountLabel}>{f.label}</Text>
                    <View style={rrStyles.amountInputRow}><Text style={rrStyles.amountRupee}>₹</Text><TextInput style={rrStyles.amountInput} placeholder="0" placeholderTextColor={Colors.textMuted} value={f.val} onChangeText={f.set} keyboardType="numeric" maxLength={10} /></View>
                  </View>
                ))}
              </View>
              <View style={rrStyles.btnRow}>
                <Pressable style={rrStyles.cancelBtn} onPress={handleClose}><Text style={rrStyles.cancelText}>Cancel</Text></Pressable>
                <Pressable style={[rrStyles.submitBtn, loading && { opacity: 0.6 }]} onPress={handleSubmit} disabled={loading}>
                  {loading ? <ActivityIndicator size="small" color="#fff" /> : <><Ionicons name="paper-plane-outline" size={16} color="#fff" /><Text style={rrStyles.submitText}>Send Request</Text></>}
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
  const { id, fromBlocking } = useLocalSearchParams<{ id: string; fromBlocking?: string }>();
  const qc      = useQueryClient();
  const item    = caseStore.get();
  const isFromBlocking = fromBlocking === "1";

  // When opened from blocking modal, auto-open the feedback modal immediately
  useEffect(() => {
    if (isFromBlocking) {
      setShowFeedbackModal(true);
    }
  }, [isFromBlocking]);

  const handleBack = () => {
    if (isFromBlocking) {
      // Refetch blocking items so modal auto-clears if PTP was resolved
      qc.invalidateQueries({ queryKey: ["/api/broken-ptps"] });
    }
    router.back();
  };

  const [extraNumbers,     setExtraNumbers]     = useState<string[]>((item as any)?.extra_numbers ?? []);
  const [newNumberInput,   setNewNumberInput]   = useState("");
  const [showAddNumber,    setShowAddNumber]    = useState(false);
  const [saving,           setSaving]           = useState(false);
  const [removing,         setRemoving]         = useState<string | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showFeedbackModal,setShowFeedbackModal]= useState(false);
  const [showMonthlyFeedbackModal, setShowMonthlyFeedbackModal] = useState(false);
  const [showVisitModal,   setShowVisitModal]   = useState(false);
  const [showCallModal,    setShowCallModal]    = useState(false);

  const { data: permData } = useQuery({ queryKey: ["/api/receipt-permission"], queryFn: () => api.getReceiptPermission(), staleTime: 0 });
  const canRequestReceipt = permData?.canRequestReceipt === true;

  if (!item) {
    return (
      <View style={styles.empty}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.textMuted} />
        <Text style={styles.emptyText}>Case not found.</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}><Text style={styles.backBtnText}>Go Back</Text></Pressable>
      </View>
    );
  }

  const statusColor = STATUS_COLORS[item.status] ?? Colors.textMuted;

  // Banner shown when navigated from blocking modal
  const blockingBanner = isFromBlocking ? (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FEE2E2", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#FECACA" }}>
      <Ionicons name="warning" size={14} color="#E24B4A" />
      <Text style={{ flex: 1, fontSize: 12, color: "#991B1B", fontWeight: "700" }}>
        This PTP is overdue — update the status to unlock the app
      </Text>
      <Pressable onPress={handleBack} style={{ padding: 4 }}>
        <Ionicons name="close" size={16} color="#991B1B" />
      </Pressable>
    </View>
  ) : null;
  const caseType    = (item as any).case_type === "bkt" ? "bkt" : "loan";
  const call        = (number: string) => { const num = number.trim(); if (!num) return; Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); Linking.openURL(`tel:${num}`); };
  const phones: string[] = (item.mobile_no ?? "").split(",").map((p: string) => p.trim()).filter(Boolean);

  const handleAddNumber = async () => {
    const trimmed = newNumberInput.trim();
    if (!trimmed || trimmed.length < 7) { Alert.alert("Enter a valid phone number"); return; }
    setSaving(true);
    try {
      await api.addExtraNumber(item.id, trimmed, caseType);
      const updated = [...extraNumbers, trimmed];
      setExtraNumbers(updated); caseStore.set({ ...item, extra_numbers: updated });
      qc.invalidateQueries({ queryKey: ["/api/cases"] }); qc.invalidateQueries({ queryKey: ["/api/bkt-cases"] });
      setNewNumberInput(""); setShowAddNumber(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) { Alert.alert("Error", String(e?.message ?? e) || "Failed to save number"); }
    finally { setSaving(false); }
  };

  const handleRemoveNumber = async (num: string) => {
    Alert.alert("Remove Number", `Remove ${num}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => {
        setRemoving(num);
        try {
          await api.removeExtraNumber(item.id, num, caseType);
          const updated = extraNumbers.filter(n => n !== num);
          setExtraNumbers(updated); caseStore.set({ ...item, extra_numbers: updated });
          qc.invalidateQueries({ queryKey: ["/api/cases"] }); qc.invalidateQueries({ queryKey: ["/api/bkt-cases"] });
        } catch { Alert.alert("Failed to remove number"); }
        finally { setRemoving(null); }
      }},
    ]);
  };

  return (
    <>
      {blockingBanner}
      <ScrollView style={{ flex: 1, backgroundColor: Colors.background }} contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 32, paddingTop: Platform.OS === "web" ? 72 : 12 }]}>

        {/* ── Hero Card ── */}
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

        {/* ── 3 Action Buttons ── */}
        <View style={styles.actionRow}>
          <Pressable style={[styles.actionBtn, { backgroundColor: Colors.primary }]} onPress={() => setShowFeedbackModal(true)}>
            <Ionicons name="chatbubble-ellipses" size={18} color="#fff" />
            <Text style={styles.actionBtnText}>Feedback</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, { backgroundColor: isMonthlyLocked ? "#6B7280" : "#7C3AED" }]}
            onPress={() => !isMonthlyLocked && setShowMonthlyFeedbackModal(true)}
            disabled={isMonthlyLocked}
          >
            <Ionicons name="calendar" size={18} color="#fff" />
            <Text style={styles.actionBtnText}>{isMonthlyLocked ? "Monthly ✓" : "Monthly"}</Text>
          </Pressable>
          <Pressable style={[styles.actionBtn, { backgroundColor: Colors.success ?? "#22C55E" }]} onPress={() => setShowVisitModal(true)}>
            <Ionicons name="location" size={18} color="#fff" />
            <Text style={styles.actionBtnText}>Field Visit</Text>
          </Pressable>
          <Pressable style={[styles.actionBtn, { backgroundColor: (Colors as any).warning ?? "#F59E0B" }]} onPress={() => setShowCallModal(true)}>
            <Ionicons name="call" size={18} color="#fff" />
            <Text style={styles.actionBtnText}>Log Call</Text>
          </Pressable>
        </View>

        {/* ── Feedback Summary ── */}
        {(item.latest_feedback || item.feedback_code || (item as any).ptp_date) && (
          <View style={styles.feedbackCard}>
            <View style={styles.feedbackCardHeader}>
              <Ionicons name="information-circle" size={15} color={Colors.primary} />
              <Text style={styles.feedbackCardTitle}>Current Feedback</Text>
              <Pressable onPress={() => setShowFeedbackModal(true)} style={styles.feedbackEditBtn}>
                <Ionicons name="create-outline" size={14} color={Colors.primary} />
                <Text style={styles.feedbackEditText}>Edit</Text>
              </Pressable>
            </View>
            <View style={styles.feedbackCardBody}>
              {(item as any).feedback_code   && <View style={styles.fbTag}><Text style={styles.fbTagText}>{(item as any).feedback_code}</Text></View>}
              {item.latest_feedback          && <Text style={styles.fbDetail}>{item.latest_feedback}</Text>}
              {(item as any).ptp_date        && <Text style={styles.fbPtp}>PTP: {fmtDate((item as any).ptp_date)}</Text>}
              {item.feedback_comments        && <Text style={styles.fbComments}>{item.feedback_comments}</Text>}
            </View>
          </View>
        )}

        {/* ── Loan Details ── */}
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
          {(item.rollback  && Number(item.rollback)  > 0) && <Row label="Rollback"  value={fmt(item.rollback,  "₹")} valueColor={Colors.info ?? "#3B82F6"} />}
          {(item.clearance && Number(item.clearance) > 0) && <Row label="Clearance" value={fmt(item.clearance, "₹")} valueColor={Colors.success ?? "#22C55E"} />}
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
            <View style={styles.noNumbersRow}><Ionicons name="information-circle-outline" size={16} color={Colors.textMuted} /><Text style={styles.noNumbersText}>No additional numbers added yet</Text></View>
          )}
          {extraNumbers.map((num, i) => (
            <View key={`${num}-${i}`} style={styles.extraNumberRow}>
              <View style={styles.extraNumberLabelWrap}>
                <Text style={styles.extraNumberIndex}>#{phones.length + i + 1}</Text>
                <Text style={styles.extraNumberLabel}>Additional</Text>
              </View>
              <Pressable style={styles.extraNumberCallArea} onPress={() => call(num)}>
                <View style={styles.extraNumberCallIcon}><Ionicons name="call" size={14} color="#fff" /></View>
                <Text style={styles.extraNumberValue}>{num}</Text>
              </Pressable>
              <Pressable style={styles.extraNumberDeleteBtn} onPress={() => handleRemoveNumber(num)} disabled={removing === num}>
                {removing === num ? <ActivityIndicator size="small" color={Colors.danger} /> : <Ionicons name="trash-outline" size={18} color={Colors.danger} />}
              </Pressable>
            </View>
          ))}
          {showAddNumber ? (
            <View style={styles.addNumberForm}>
              <TextInput style={styles.addNumberInput} placeholder="Enter phone number" placeholderTextColor={Colors.textMuted} value={newNumberInput} onChangeText={setNewNumberInput} keyboardType="phone-pad" maxLength={15} autoFocus />
              <View style={styles.addNumberBtns}>
                <Pressable style={styles.addNumberCancelBtn} onPress={() => { setShowAddNumber(false); setNewNumberInput(""); }}><Text style={styles.addNumberCancelText}>Cancel</Text></Pressable>
                <Pressable style={[styles.addNumberSaveBtn, saving && { opacity: 0.6 }]} onPress={handleAddNumber} disabled={saving}>
                  {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.addNumberSaveText}>Save</Text>}
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

        {/* ── Request Receipt ── */}
        {canRequestReceipt && (
          <Pressable style={styles.receiptRequestBtn} onPress={() => setShowReceiptModal(true)}>
            <View style={styles.receiptBtnIconWrap}><Ionicons name="receipt-outline" size={22} color={Colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.receiptBtnTitle}>Send Receipt</Text>
              <Text style={styles.receiptBtnSubtitle}>Request admin to send a receipt for this case</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.primary} />
          </Pressable>
        )}
      </ScrollView>

      {/* ── Modals ── */}
<FeedbackModal visible={showFeedbackModal} item={item} onClose={() => setShowFeedbackModal(false)} extraNumbers={extraNumbers} onMonthlyFeedbackRequest={() => setShowMonthlyFeedbackModal(true)} />

<MonthlyFeedbackStepper
  visible={showMonthlyFeedbackModal}
  onClose={() => setShowMonthlyFeedbackModal(false)}
  onSave={async (data) => {
    const caseType = (item as any).case_type === "bkt" ? "bkt" : "loan";
    const payload = {
      feedback_code:      data.feedbackCode,
      feedback:           data.detailFeedback,
      comments:           data.comments,
      projection:         data.projection,
      non_starter:        data.nonStarter,
      kyc_purchase:       data.kycPurchase,
      workable:           data.workable,
      monthly_feedback:   "SUBMITTED",
      customer_available: data.customerAvailable,
      vehicle_available:  data.vehicleAvailable,
      third_party:        data.thirdParty,
      occupation:         data.occupation || null,
      ptp_date:           data.feedbackCode === "PTP" ? toIsoDate(data.smartInputValue) : null,
      shifted_to:         data.feedbackCode === "SFT" ? data.smartInputValue || null : null,
    };
    if (caseType === "bkt") await api.updateBktFeedback(item.id, payload);
    else await api.updateFeedback(item.id, payload);
    qc.invalidateQueries({ queryKey: ["/api/cases"] });
    qc.invalidateQueries({ queryKey: ["/api/bkt-cases"] });
    qc.invalidateQueries({ queryKey: ["/api/stats"] });
    qc.invalidateQueries({ queryKey: ["/api/broken-ptps"] });
    setShowMonthlyFeedbackModal(false);
  }}
  currentCaseName={item.name}
  currentCaseId={item.loan_account_no ?? ""}
/>      <FieldVisitModal  visible={showVisitModal}    item={item} onClose={() => setShowVisitModal(false)} />
      <PhoneCallModal   visible={showCallModal}     item={item} onClose={() => setShowCallModal(false)} extraNumbers={extraNumbers} />
      <ReceiptRequestModal visible={showReceiptModal} item={item} onClose={() => setShowReceiptModal(false)} />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const SA = (Colors as any).surfaceAlt ?? Colors.background;
const SE = (Colors as any).surfaceElevated ?? SA;
const WRN = (Colors as any).warning ?? "#F59E0B";

const styles = StyleSheet.create({
  container:  { padding: 12, gap: 12 },
  empty:      { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background, gap: 12 },
  emptyText:  { fontSize: 16, color: Colors.textMuted },
  backBtn:    { marginTop: 8, paddingVertical: 10, paddingHorizontal: 24, backgroundColor: Colors.primary, borderRadius: 12 },
  backBtnText:{ color: "#fff", fontWeight: "700", fontSize: 14 },

  heroCard:      { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: Colors.border, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 4 },
  heroTop:       { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  customerName:  { fontSize: 17, fontWeight: "800", color: Colors.text, textTransform: "uppercase", flexShrink: 1 },
  loanNo:        { fontSize: 12, color: Colors.textSecondary, marginTop: 2, fontWeight: "500" },
  statusBadge:   { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  statusText:    { fontSize: 12, fontWeight: "700" },
  amountRow:     { flexDirection: "row", gap: 8 },
  amountCell:    { flex: 1, backgroundColor: SA, borderRadius: 10, padding: 10, alignItems: "center" },
  amountLabel:   { fontSize: 9, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase" },
  amountValue:   { fontSize: 13, fontWeight: "800", color: Colors.text, marginTop: 2 },
  callBtnRow:    { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  callBtn:       { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14, flex: 1, justifyContent: "center" },
  callBtnText:   { color: "#fff", fontWeight: "700", fontSize: 13 },

  actionRow:     { flexDirection: "row", gap: 10 },
  actionBtn:     { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 14, paddingVertical: 14, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 3 },
  actionBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },

  feedbackCard:       { backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.primary + "30", overflow: "hidden" },
  feedbackCardHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: Colors.primary + "10", borderBottomWidth: 1, borderBottomColor: Colors.primary + "20" },
  feedbackCardTitle:  { fontSize: 12, fontWeight: "700", color: Colors.primary, textTransform: "uppercase", letterSpacing: 0.5, flex: 1 },
  feedbackEditBtn:    { flexDirection: "row", alignItems: "center", gap: 4 },
  feedbackEditText:   { fontSize: 12, fontWeight: "700", color: Colors.primary },
  feedbackCardBody:   { padding: 12, gap: 4 },
  fbTag:              { alignSelf: "flex-start", backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3, marginBottom: 4 },
  fbTagText:          { fontSize: 11, fontWeight: "800", color: "#fff" },
  fbDetail:           { fontSize: 13, fontWeight: "600", color: Colors.text },
  fbPtp:              { fontSize: 12, color: Colors.statusPTP ?? "#F59E0B", fontWeight: "700" },
  fbComments:         { fontSize: 12, color: Colors.textSecondary, fontStyle: "italic" },

  sectionCard:    { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, overflow: "hidden" },
  sectionHeader:  { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: SA },
  sectionTitle:   { fontSize: 13, fontWeight: "700", color: Colors.text, textTransform: "uppercase", letterSpacing: 0.5 },
  row:            { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  rowLabel:       { fontSize: 12, color: Colors.textSecondary, fontWeight: "600", flex: 1 },
  rowValue:       { fontSize: 12, color: Colors.text, fontWeight: "700", flex: 1.5, textAlign: "right" },

  noNumbersRow:           { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 14 },
  noNumbersText:          { fontSize: 13, color: Colors.textMuted, fontStyle: "italic" },
  extraNumberRow:         { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border, gap: 10, minHeight: 58 },
  extraNumberLabelWrap:   { alignItems: "center", width: 44 },
  extraNumberIndex:       { fontSize: 13, fontWeight: "800", color: Colors.primary },
  extraNumberLabel:       { fontSize: 9, fontWeight: "600", color: Colors.textMuted, textTransform: "uppercase", marginTop: 1 },
  extraNumberCallArea:    { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: Colors.primary + "12", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 },
  extraNumberCallIcon:    { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  extraNumberValue:       { fontSize: 14, fontWeight: "700", color: Colors.primary, flex: 1, letterSpacing: 0.3 },
  extraNumberDeleteBtn:   { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.danger + "12", alignItems: "center", justifyContent: "center" },
  addNumberForm:          { padding: 14, gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  addNumberInput:         { borderWidth: 1.5, borderColor: Colors.primary + "60", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: Colors.text, backgroundColor: SA, letterSpacing: 0.5 },
  addNumberBtns:          { flexDirection: "row", gap: 10 },
  addNumberCancelBtn:     { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, alignItems: "center" },
  addNumberCancelText:    { color: Colors.textSecondary, fontWeight: "600", fontSize: 14 },
  addNumberSaveBtn:       { flex: 2, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.primary, alignItems: "center" },
  addNumberSaveText:      { color: "#fff", fontWeight: "700", fontSize: 14 },
  addNumberTrigger:       { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, margin: 12, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.primary + "50", borderStyle: "dashed", backgroundColor: Colors.primary + "06" },
  addNumberTriggerText:   { color: Colors.primary, fontWeight: "700", fontSize: 14 },

  receiptRequestBtn:   { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: Colors.surface, borderRadius: 16, padding: 16, borderWidth: 1.5, borderColor: Colors.primary + "40", shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2 },
  receiptBtnIconWrap:  { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.primary + "15", alignItems: "center", justifyContent: "center" },
  receiptBtnTitle:     { fontSize: 15, fontWeight: "800", color: Colors.primary },
  receiptBtnSubtitle:  { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
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
  lockBanner:          { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: WRN + "18", borderWidth: 1, borderColor: WRN + "40", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16 },
  lockBannerText:      { flex: 1, fontSize: 13, color: WRN, fontWeight: "600" },
  lockedRows:          { gap: 2, marginBottom: 8 },
  lockedRow:           { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, paddingHorizontal: 12, backgroundColor: SA, borderRadius: 10, marginBottom: 4 },
  lockedRowLabel:      { fontSize: 12, color: Colors.textSecondary, fontWeight: "600" },
  lockedRowValue:      { fontSize: 13, fontWeight: "700", flex: 1, textAlign: "right" },
  tabRow:              { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  chipWrapRow:         { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  tabChip:             { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: SE, borderWidth: 1, borderColor: Colors.border },
  tabChipText:         { fontSize: 13, fontWeight: "600", color: Colors.text, fontFamily: Platform.OS === "android" ? "Roboto" : undefined },
  feedbackOption:      { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: SA },
  feedbackOptionText:  { fontSize: 14, fontWeight: "600", color: Colors.text },
  detailOptionBtn:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: SA, marginBottom: 4 },
  detailOptionDot:     { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.border },
  detailOptionText:    { fontSize: 14, fontWeight: "600", color: Colors.text, flex: 1 },
  commentInput:        { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 12, fontSize: 14, color: Colors.text, minHeight: 80, textAlignVertical: "top", backgroundColor: SA, marginBottom: 12 },
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

const fvStyles = StyleSheet.create({
  overlay:             { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet:               { backgroundColor: Colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, maxHeight: "94%", flexShrink: 1 },
  handle:              { width: 36, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: "center", marginBottom: 18 },

  // Header
  headerRow:           { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  headerIconWrap:      { width: 42, height: 42, borderRadius: 13, backgroundColor: Colors.primary + "10", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border },
  title:               { fontSize: 18, fontWeight: "800", color: Colors.text, letterSpacing: -0.3 },
  subtitle:            { fontSize: 11, color: Colors.textSecondary, marginTop: 1, letterSpacing: 0.2 },
  closeBtn:            { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.surfaceAlt ?? SA, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border },

  // Contact numbers
  contactSection:      { marginBottom: 14 },
  contactLabel:        { fontSize: 10, fontWeight: "700", color: Colors.textMuted, letterSpacing: 0.8, marginBottom: 7 },
  contactRow:          { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  contactChip:         { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14 },
  contactChipText:     { color: "#fff", fontWeight: "700", fontSize: 14, letterSpacing: 0.3 },

  // Amount row
  amountRow:           { flexDirection: "row", gap: 8, marginBottom: 18 },
  amountChip:          { flex: 1, backgroundColor: SA, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: Colors.border },
  amountLabel:         { fontSize: 9, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  amountValue:         { fontSize: 13, fontWeight: "800", color: Colors.text },

  // Section header
  sectionRow:          { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  sectionLabel:        { fontSize: 12, fontWeight: "700", color: Colors.text, textTransform: "uppercase", letterSpacing: 0.5 },
  sectionOptional:     { fontSize: 10, fontWeight: "500", color: Colors.textMuted },
  requiredBadge:       { backgroundColor: Colors.danger + "18", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  requiredText:        { fontSize: 9, fontWeight: "700", color: Colors.danger, textTransform: "uppercase", letterSpacing: 0.5 },

  // GPS button
  locationBtn:         { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: SA, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.border, padding: 14, marginBottom: 20 },
  locationBtnCaptured: { borderColor: Colors.success + "80", backgroundColor: Colors.success + "0A" },
  locationBtnLoading:  { borderColor: Colors.primary + "50", backgroundColor: Colors.primary + "06" },
  locationIconWrap:    { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.background, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border },
  locationBtnText:     { fontSize: 13, color: Colors.textSecondary, fontWeight: "500" },
  locationAccuracy:    { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  reCaptureBtnSmall:   { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: Colors.primary + "12", borderWidth: 1, borderColor: Colors.primary + "30" },
  reCaptureText:       { fontSize: 11, color: Colors.primary, fontWeight: "700" },

  // Outcome buttons
  outcomeBtn:          { flexDirection: "row", alignItems: "center", paddingVertical: 15, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: SA, gap: 12 },
  outcomeDot:          { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: Colors.border },
  outcomeText:         { fontSize: 14, fontWeight: "600", color: Colors.text, flex: 1 },

  input:               { borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12, padding: 13, fontSize: 14, color: Colors.text, backgroundColor: SA },
  photoGrid:           { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  photoThumb:          { width: 80, height: 80, borderRadius: 12, overflow: "hidden", position: "relative", borderWidth: 1, borderColor: Colors.border },
  photoImg:            { width: "100%", height: "100%" },
  photoRemoveBtn:      { position: "absolute", top: 4, right: 4 },
  photoRemoveBg:       { width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.danger, alignItems: "center", justifyContent: "center" },
  photoAddBtn:         { width: 80, height: 80, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, borderStyle: "dashed", backgroundColor: SA, alignItems: "center", justifyContent: "center", gap: 4 },
  photoAddText:        { fontSize: 10, color: Colors.textMuted, fontWeight: "600" },

  // Buttons
  btnRow:              { flexDirection: "row", gap: 12, marginTop: 14, paddingBottom: 4 },
  cancelBtn:           { flex: 1, paddingVertical: 15, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.border, alignItems: "center", backgroundColor: SA },
  cancelText:          { fontSize: 15, fontWeight: "600", color: Colors.textSecondary },
  saveBtn:             { flex: 2, paddingVertical: 15, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  saveText:            { fontSize: 15, fontWeight: "700", color: "#fff" },
});

const rrStyles = StyleSheet.create({
  overlay:          { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet:            { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 16 },
  handle:           { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: "center", marginBottom: 4 },
  headerRow:        { flexDirection: "row", alignItems: "center", gap: 12 },
  receiptIcon:      { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.primary + "15", alignItems: "center", justifyContent: "center" },
  title:            { fontSize: 18, fontWeight: "800", color: Colors.text },
  subtitle:         { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  infoBox:          { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "#3B82F612", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: "#3B82F630" },
  infoText:         { flex: 1, fontSize: 13, color: "#3B82F6", lineHeight: 18 },
  amountGrid:       { flexDirection: "row", gap: 8 },
  amountCell:       { flex: 1, backgroundColor: SA, borderRadius: 12, padding: 10, alignItems: "center", borderWidth: 1.5, borderColor: Colors.border },
  amountLabel:      { fontSize: 9, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  amountInputRow:   { flexDirection: "row", alignItems: "center", gap: 2, borderBottomWidth: 1.5, borderBottomColor: Colors.primary + "60", paddingBottom: 2, width: "100%" },
  amountRupee:      { fontSize: 13, fontWeight: "800", color: Colors.primary },
  amountInput:      { flex: 1, fontSize: 14, fontWeight: "800", color: Colors.text, paddingVertical: 2, textAlign: "center" },
  btnRow:           { flexDirection: "row", gap: 12 },
  cancelBtn:        { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, alignItems: "center" },
  cancelText:       { fontSize: 15, fontWeight: "600", color: Colors.textSecondary },
  submitBtn:        { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: Colors.primary, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 },
  submitText:       { fontSize: 15, fontWeight: "700", color: "#fff" },
  successContainer: { alignItems: "center", gap: 12, paddingVertical: 16 },
  successIcon:      { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.success + "15", alignItems: "center", justifyContent: "center" },
  successTitle:     { fontSize: 20, fontWeight: "800", color: Colors.text },
  successMsg:       { fontSize: 14, color: Colors.textSecondary, textAlign: "center", lineHeight: 22 },
  doneBtn:          { marginTop: 8, paddingVertical: 14, paddingHorizontal: 32, backgroundColor: Colors.success, borderRadius: 14, alignItems: "center" },
  doneBtnText:      { color: "#fff", fontWeight: "700", fontSize: 15 },
});

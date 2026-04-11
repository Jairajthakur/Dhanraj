import React, { useState, useMemo } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput, Linking,
  Alert, ActivityIndicator, Modal, ScrollView, Platform
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";
import { caseStore } from "@/lib/caseStore";

// ─── Tabs ─────────────────────────────────────────────────────────────────────
const STATUS_TABS = ["All", "Unpaid", "PTP", "Paid"];
const TABS = ["Unpaid", "PTP", "Paid", "Monthly Feedback"];

const STATUS_COLORS: Record<string, string> = {
  All:    Colors.primary,
  Unpaid: Colors.statusUnpaid,
  PTP:    Colors.statusPTP,
  Paid:   Colors.statusPaid,
};

// ─── Options ──────────────────────────────────────────────────────────────────
const PAID_DETAIL_OPTIONS   = ["PAID", "PART PAYMENT", "SETTLED"];
const UNPAID_DETAIL_OPTIONS = [
  "CUSTOMER ALREADY PAID",
  "CUSTOMER & VEHICLE SKIP",
  "PROMISS TO PAY",
  "CUSTOMER INTENATIONALLY DEFULTER",
  "CUSTOMER VEHICLE SOMEONE MORTGAGE & CUSTOMER SKIP",
];
const PTP_DETAIL_OPTIONS = ["PTP DATE SET", "WILL PAY TOMORROW", "WILL ARRANGE FUNDS", "CALL LATER"];
const MONTHLY_FEEDBACK_OPTIONS = [
  "SWITCH OFF", "NOT AVAILABLE", "DISCONNECTED", "REFUSED TO PAY",
  "DISPUTED", "NOT AT HOME", "CUSTOMER MET - WILL PAY", "CUSTOMER MET - REFUSED",
  "PARTIAL PAYMENT DONE", "RESCHEDULED", "SKIP TRACE", "LEGAL ACTION INITIATED",
];

// ─── Updated Feedback Codes ───────────────────────────────────────────────────
const FEEDBACK_CODES: { code: string; label: string; color: string }[] = [
  { code: "PTP",  label: "PROMISE TO PAY",         color: Colors.statusPTP     },
  { code: "PAID", label: "CUSTOMER ALREADY PAID",  color: Colors.success       },
  { code: "REPO", label: "VEHICLE REPOSSESSED",    color: Colors.danger        },
  { code: "RTP",  label: "REFUSE TO PAY",          color: Colors.statusUnpaid  },
  { code: "SFT",  label: "CUSTOMER TRANSFERRED / SHIFTED", color: Colors.warning },
  { code: "SKIP", label: "SKIP CUSTOMER",          color: Colors.accent        },
];

// ─── Updated Detail Feedback (no income) ────────────────────────────────────
const MONTHLY_DETAIL_OPTIONS: { label: string; color: string }[] = [
  { label: "Customer already paid",                   color: Colors.success      },
  { label: "Customer & vehicle skip",                 color: Colors.danger       },
  { label: "Promise to pay",                          color: Colors.statusPTP    },
  { label: "Customer intentional defaulter",          color: Colors.statusUnpaid },
  { label: "Vehicle mortgaged & customer skip",       color: Colors.danger       },
  { label: "Customer shifted",                        color: Colors.warning      },
];

const PROJECTION_OPTIONS = ["ST", "RF", "RB"];

const OCC_GROUPS = [
  { group: "Agriculture", chips: ["Own farm land", "Tenant farmer", "Agricultural labour", "Dairy / poultry"] },
  { group: "Business",    chips: ["Kirana / grocery", "Hotel / dhaba", "Hardware shop", "Cloth / garment", "Mobile / electronics", "Wholesale trader", "Street vendor"] },
  { group: "Employment",  chips: ["Govt. job (permanent)", "Govt. job (contract)", "Private company", "Factory / mill worker"] },
  { group: "Transport & Labour", chips: ["Auto driver", "Truck / tempo driver", "Construction labour", "Daily wage worker"] },
  { group: "Other",       chips: ["Housewife (family income)", "Unemployed", "Retired / pension", "NRI / migrant"] },
];

// ─── Monthly Feedback Steps (6 steps, no income) ─────────────────────────────
const TOTAL_MF_STEPS = 6;
// Step 0: Availability Check
// Step 1: Feedback Code
// Step 2: Detail Feedback
// Step 3: Case Flags (Projection, Non Starter, KYC, Workable)
// Step 4: Occupation
// Step 5: Comments

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt(v: any, prefix = "") {
  if (v === null || v === undefined || v === "") return "—";
  const n = parseFloat(String(v).replace(/,/g, ""));
  if (!isNaN(n)) return prefix + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return String(v);
}

function fmtRaw(v: any) {
  if (v === null || v === undefined || v === "" || v === "0" || Number(v) === 0) return "—";
  return String(v);
}

// ─── Call Picker Modal ────────────────────────────────────────────────────────
function CallPickerModal({ visible, phones, onClose }: { visible: boolean; phones: string[]; onClose: () => void }) {
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

// ─── YN Toggle ────────────────────────────────────────────────────────────────
function YNToggle({ label, value, onChange }: { label: string; value: boolean | null; onChange: (v: boolean | null) => void }) {
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
              value === val && { backgroundColor: val ? Colors.success : Colors.danger, borderColor: val ? Colors.success : Colors.danger },
            ]}
            onPress={() => onChange(value === val ? null : val)}
          >
            <Text style={[fbStyles.feedbackOptionText, value === val && { color: "#fff" }]}>
              {val ? "Yes" : "No"}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ─── Progress dots ────────────────────────────────────────────────────────────
function StepProgress({ current, total }: { current: number; total: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 4, marginBottom: 20, marginTop: 4 }}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            mfStyles.dot,
            i < current  && mfStyles.dotDone,
            i === current && mfStyles.dotActive,
          ]}
        />
      ))}
    </View>
  );
}

// ─── Locked view ──────────────────────────────────────────────────────────────
function LockedFeedbackView({ item }: { item: any }) {
  const rows = [
    item.status            && { label: "Status",          value: item.status,            color: STATUS_COLORS[item.status] || Colors.text },
    item.feedback_code     && { label: "Feedback Code",   value: item.feedback_code,      color: Colors.accent },
    item.latest_feedback   && { label: "Detail Feedback", value: item.latest_feedback,    color: Colors.text },
    item.monthly_feedback  && item.monthly_feedback !== "SUBMITTED" && { label: "Monthly", value: item.monthly_feedback, color: Colors.primary },
    item.ptp_date          && { label: "PTP Date",        value: String(item.ptp_date).slice(0, 10), color: Colors.statusPTP },
    item.feedback_comments && { label: "Comments",        value: item.feedback_comments,  color: Colors.textSecondary },
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

// ─── Monthly Feedback Stepper ─────────────────────────────────────────────────
type MFState = {
  customerAvailable: boolean | null;
  vehicleAvailable:  boolean | null;
  thirdParty:        boolean | null;
  thirdPartyName:    string;
  thirdPartyNumber:  string;
  feedbackCode:      string;
  detailFeedback:    string;
  projection:        string;
  nonStarter:        boolean | null;
  kycPurchase:       boolean | null;
  workable:          boolean | null;
  occupation:        string[];
  comments:          string;
  ptpDateMf:         string;
  shiftedCity:       string;
};

function MonthlyFeedbackStepper({
  caseItem,
  onClose,
  onSubmit,
  loading,
}: {
  caseItem: any;
  onClose: () => void;
  onSubmit: (state: MFState) => void;
  loading: boolean;
}) {
  const [step, setStep] = useState(0);
  const [mf, setMf] = useState<MFState>({
    customerAvailable: caseItem?.customer_available ?? null,
    vehicleAvailable:  caseItem?.vehicle_available  ?? null,
    thirdParty:        caseItem?.third_party        ?? null,
    thirdPartyName:    caseItem?.third_party_name   || "",
    thirdPartyNumber:  caseItem?.third_party_number || "",
    feedbackCode:      caseItem?.feedback_code      || "",
    detailFeedback:    caseItem?.latest_feedback    || "",
    projection:        caseItem?.projection         || "",
    nonStarter:        caseItem?.non_starter        ?? null,
    kycPurchase:       caseItem?.kyc_purchase       ?? null,
    workable:          caseItem?.workable           ?? null,
    occupation:        [],
     comments:          caseItem?.feedback_comments  || "",
    ptpDateMf:         caseItem?.ptp_date_mf ? String(caseItem.ptp_date_mf).slice(0,10) : "",
    shiftedCity:       caseItem?.shifted_city || "",
  });

  const upd = (patch: Partial<MFState>) => setMf((prev) => ({ ...prev, ...patch }));

  const isStepValid = () => {
    if (step === 0) return mf.customerAvailable !== null && mf.vehicleAvailable !== null && mf.thirdParty !== null;
    if (step === 1) return !!mf.feedbackCode && (mf.feedbackCode !== "PTP" || !!mf.ptpDateMf.trim());
    if (step === 2) return !!mf.detailFeedback && (mf.detailFeedback !== "Customer shifted" || !!mf.shiftedCity.trim());
    if (step === 3) return !!mf.projection && mf.nonStarter !== null && mf.kycPurchase !== null && mf.workable !== null;
    if (step === 4) return mf.occupation.length > 0;
    if (step === 5) return true; // comments optional
    return false;
  };

  const next = () => {
    if (step < TOTAL_MF_STEPS - 1) setStep(step + 1);
    else onSubmit(mf);
  };
  const back = () => { if (step > 0) setStep(step - 1); };

  const toggleOcc = (label: string) => {
    const idx = mf.occupation.indexOf(label);
    if (idx > -1) upd({ occupation: mf.occupation.filter((o) => o !== label) });
    else upd({ occupation: [...mf.occupation, label] });
  };

  const stepTitles = [
    "Availability Check",
    "Feedback Code",
    "Detail Feedback",
    "Case Flags",
    "Occupation",
    "Comments",
  ];

  return (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View style={mfStyles.stepHeader}>
        <Text style={mfStyles.stepNum}>Step {step + 1} of {TOTAL_MF_STEPS}</Text>
        <Text style={mfStyles.stepTitle}>{stepTitles[step]}</Text>
        <StepProgress current={step} total={TOTAL_MF_STEPS} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 8 }}>

        {/* ── STEP 0: Availability ── */}
        {step === 0 && (
          <View style={{ gap: 4 }}>
            <Text style={mfStyles.hint}>Tap Yes or No for each field</Text>
            <YNToggle label="Customer Available?" value={mf.customerAvailable} onChange={(v) => upd({ customerAvailable: v })} />
            <YNToggle label="Vehicle Available?"  value={mf.vehicleAvailable}  onChange={(v) => upd({ vehicleAvailable: v })} />
            <YNToggle label="Third Party Contacted?" value={mf.thirdParty}    onChange={(v) => upd({ thirdParty: v })} />
            {mf.thirdParty === true && (
              <>
                <Text style={fbStyles.sectionLabel}>Third Party Name</Text>
                <TextInput
                  style={[fbStyles.commentInput, { minHeight: 44, marginBottom: 8 }]}
                  placeholder="Enter name"
                  placeholderTextColor={Colors.textMuted}
                  value={mf.thirdPartyName}
                  onChangeText={(t) => upd({ thirdPartyName: t })}
                />
                <Text style={fbStyles.sectionLabel}>Third Party Number</Text>
                <TextInput
                  style={[fbStyles.commentInput, { minHeight: 44, marginBottom: 8 }]}
                  placeholder="Enter number"
                  placeholderTextColor={Colors.textMuted}
                  value={mf.thirdPartyNumber}
                  onChangeText={(t) => upd({ thirdPartyNumber: t })}
                  keyboardType="phone-pad"
                />
              </>
            )}
          </View>
        )}

        {/* ── STEP 1: Feedback Code ── */}
        {step === 1 && (
          <View>
            <Text style={mfStyles.hint}>Select primary outcome of this visit</Text>
            <View style={{ gap: 8 }}>
              {FEEDBACK_CODES.map(({ code, label, color }) => {
                const sel = mf.feedbackCode === code;
                return (
                  <Pressable
                    key={code}
                    style={[
                      mfStyles.codeCard,
                      sel && { backgroundColor: color + "18", borderColor: color, borderWidth: 1.5 },
                    ]}
                    onPress={() => upd({ feedbackCode: code })}
                  >
                    <View style={[mfStyles.codeBadge, { backgroundColor: sel ? color : Colors.border }]}>
                      <Text style={[mfStyles.codeBadgeText, sel && { color: "#fff" }]}>{code}</Text>
                    </View>
                    <Text style={[mfStyles.codeLabel, sel && { color, fontWeight: "700" }]}>{label}</Text>
                    {sel && <Ionicons name="checkmark-circle" size={20} color={color} />}
                  </Pressable>
                );
              })}
            </View>

            {mf.feedbackCode === "PTP" && (
              <View style={{ marginTop: 16, backgroundColor: Colors.statusPTP + "10", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.statusPTP + "40" }}>
                <Text style={[fbStyles.sectionLabel, { color: Colors.statusPTP }]}>📅 Promise to Pay Date *</Text>
                <TextInput
                  style={[fbStyles.commentInput, { minHeight: 44, marginBottom: 0, borderColor: Colors.statusPTP + "60" }]}
                  placeholder="DD-MM-YYYY"
                  placeholderTextColor={Colors.textMuted}
                  value={mf.ptpDateMf}
                  onChangeText={(t) => upd({ ptpDateMf: t })}
                  keyboardType="numeric"
                />
                <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 6 }}>
                  Required — date when customer promises to pay
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ── STEP 2: Detail Feedback */}
        {step === 2 && (
          <View>
            <Text style={mfStyles.hint}>More specific reason behind the feedback code</Text>
            <View style={{ gap: 8 }}>
              {MONTHLY_DETAIL_OPTIONS.map(({ label, color }) => {
                const sel = mf.detailFeedback === label;
                return (
                  <Pressable
                    key={label}
                    style={[
                      fbStyles.detailOptionBtn,
                      sel && { backgroundColor: color + "18", borderColor: color, borderWidth: 1.5 },
                    ]}
                    onPress={() => upd({ detailFeedback: sel ? "" : label })}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                      <View style={[fbStyles.detailOptionDot, sel && { backgroundColor: color }]} />
                      <Text style={[fbStyles.detailOptionText, sel && { color, fontWeight: "700" }]}>{label}</Text>
                    </View>
                    {sel && <Ionicons name="checkmark-circle" size={20} color={color} />}
                  </Pressable>
                );
              })}
            </View>

            {mf.detailFeedback === "Customer shifted" && (
              <View style={{ marginTop: 16, backgroundColor: Colors.warning + "10", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.warning + "40" }}>
                <Text style={[fbStyles.sectionLabel, { color: Colors.warning }]}>📍 City / Location Shifted To *</Text>
                <TextInput
                  style={[fbStyles.commentInput, { minHeight: 44, marginBottom: 0, borderColor: Colors.warning + "60" }]}
                  placeholder="Enter city or area name"
                  placeholderTextColor={Colors.textMuted}
                  value={mf.shiftedCity}
                  onChangeText={(t) => upd({ shiftedCity: t })}
                />
                <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 6 }}>
                  Required — where has the customer shifted?
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ── STEP 3: Case Flags */}
        {step === 3 && (
          <View>
            <Text style={mfStyles.hint}>Tap one option per row</Text>

            <Text style={fbStyles.sectionLabel}>Projection Type</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
              {[
                { code: "ST", label: "ST — Settlement" },
                { code: "RF", label: "RF — Rollback full" },
                { code: "RB", label: "RB — Rollback partial" },
              ].map(({ code, label }) => (
                <Pressable
                  key={code}
                  style={[
                    fbStyles.feedbackOption,
                    { flex: 1, alignItems: "center" },
                    mf.projection === code && { backgroundColor: Colors.primary, borderColor: Colors.primary },
                  ]}
                  onPress={() => {
                    if (code === "ST" && mf.projection === "ST") return;
                    upd({ projection: mf.projection === code ? "" : code });
                  }}
                >
                  <Text style={[mfStyles.projCode, mf.projection === code && { color: "#fff" }]}>{code}</Text>
                  <Text style={[mfStyles.projLabel, mf.projection === code && { color: "rgba(255,255,255,0.75)" }]}>
                    {label.split(" — ")[1]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={mfStyles.divider} />
            <YNToggle label="Non Starter?" value={mf.nonStarter}  onChange={(v) => upd({ nonStarter: v })} />
            <YNToggle label="KYC Purchase Done?" value={mf.kycPurchase} onChange={(v) => upd({ kycPurchase: v })} />

            <Text style={fbStyles.sectionLabel}>Case Workable?</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
              {[
                { label: "Workable",     val: true,  color: Colors.success },
                { label: "Non Workable", val: false, color: Colors.danger  },
              ].map(({ label, val, color }) => (
                <Pressable
                  key={label}
                  style={[
                    fbStyles.feedbackOption,
                    { flex: 1, alignItems: "center" },
                    mf.workable === val && { backgroundColor: color, borderColor: color },
                  ]}
                  onPress={() => upd({ workable: mf.workable === val ? null : val })}
                >
                  <Text style={[fbStyles.feedbackOptionText, mf.workable === val && { color: "#fff" }]}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* ── STEP 4: Occupation ── */}
        {step === 4 && (
          <View>
            <Text style={mfStyles.hint}>Tap all that apply</Text>
            {OCC_GROUPS.map((grp) => (
              <View key={grp.group} style={{ marginBottom: 12 }}>
                <Text style={mfStyles.occGroupLabel}>{grp.group}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {grp.chips.map((chip) => {
                    const sel = mf.occupation.includes(chip);
                    return (
                      <Pressable
                        key={chip}
                        style={[
                          mfStyles.occChip,
                          sel && { backgroundColor: Colors.primary, borderColor: Colors.primary },
                        ]}
                        onPress={() => toggleOcc(chip)}
                      >
                        <Text style={[mfStyles.occChipText, sel && { color: "#fff" }]}>{chip}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── STEP 5: Comments ── */}
        {step === 5 && (
          <View>
            <Text style={mfStyles.hint}>Add any extra context — or skip and submit</Text>
            <View style={mfStyles.commentBox}>
              <Text style={mfStyles.commentBoxLabel}>Agent's own words — type freely</Text>
              <TextInput
                style={fbStyles.commentInput}
                placeholder="e.g. Customer's husband lost job. Wife managing. Promised ₹2000 by 20th..."
                placeholderTextColor={Colors.textMuted}
                value={mf.comments}
                onChangeText={(t) => upd({ comments: t })}
                multiline
                numberOfLines={5}
              />
              <Text style={mfStyles.commentHint}>All fields above are already saved. This is extra context only.</Text>
            </View>
          </View>
        )}

      </ScrollView>

      {/* Nav buttons */}
      <View style={mfStyles.navRow}>
        <Pressable
          style={mfStyles.backBtn}
          onPress={step === 0 ? onClose : back}
        >
          <Text style={mfStyles.backBtnText}>{step === 0 ? "Cancel" : "Back"}</Text>
        </Pressable>

        <Pressable
          style={[mfStyles.nextBtn, !isStepValid() && mfStyles.nextBtnDisabled]}
          onPress={next}
          disabled={!isStepValid() || loading}
        >
          {loading && step === TOTAL_MF_STEPS - 1
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={[mfStyles.nextBtnText, !isStepValid() && { color: Colors.textMuted }]}>
                {step === TOTAL_MF_STEPS - 1 ? "Submit Feedback" : "Next →"}
              </Text>
          }
        </Pressable>
      </View>
    </View>
  );
}

// ─── Feedback Modal ────────────────────────────────────────────────────────────
function FeedbackModal({ visible, caseItem, onClose, isMonthlyLocked = false, extraNumbers = [] }: any) {
  const [activeTab, setActiveTab] = useState("Unpaid");

  const [detailFeedback,     setDetailFeedback]    = useState(caseItem?.latest_feedback   || "");
  const [monthlyFeedback,    setMonthlyFeedback]   = useState(caseItem?.monthly_feedback  || "");
  const [feedbackCode,       setFeedbackCode]      = useState(caseItem?.feedback_code     || "");
  const [comments,           setComments]          = useState(caseItem?.feedback_comments || "");
  const [ptpDate,            setPtpDate]           = useState(
    caseItem?.ptp_date ? String(caseItem.ptp_date).slice(0, 10) : ""
  );

  const [paidDetailFeedback, setPaidDetailFeedback] = useState(caseItem?.latest_feedback   || "");
  const [paidComments,       setPaidComments]       = useState(caseItem?.feedback_comments || "");
  const [paidRollbackYn,     setPaidRollbackYn]     = useState<boolean | null>(
    caseItem?.rollback_yn != null ? Boolean(caseItem.rollback_yn) : null
  );

  const [loading, setLoading] = useState(false);
  const [callPickerVisible, setCallPickerVisible] = useState(false);

  const qc = useQueryClient();

  const primaryPhones: string[] = (caseItem?.mobile_no ?? "")
    .split(",").map((p: string) => p.trim()).filter(Boolean);
  const allPhones = [...primaryPhones, ...extraNumbers.filter((n: string) => !primaryPhones.includes(n))];

  const toIsoDate = (val: string) => {
    const parts = val.trim().split(/[-\/]/);
    if (parts.length === 3 && parts[2].length === 4)
      return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
    return val;
  };

  const saveBasic = async () => {
    if (activeTab === "PTP" && !ptpDate) {
      Alert.alert("Error", "Please enter a PTP date"); return;
    }
    let finalStatus = "Unpaid";
    if (activeTab === "Paid") finalStatus = "Paid";
    else if (activeTab === "PTP") finalStatus = "PTP";

    setLoading(true);
    try {
      const payload: Record<string, any> = {
        status:      finalStatus,
        feedback:    activeTab === "Paid" ? paidDetailFeedback : detailFeedback,
        comments:    activeTab === "Paid" ? paidComments       : comments,
        ptp_date:    activeTab === "PTP"  ? toIsoDate(ptpDate) : null,
        rollback_yn: activeTab === "Paid" ? paidRollbackYn     : null,
      };
      await api.updateFeedback(caseItem.id, payload);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["/api/cases"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      qc.invalidateQueries({ queryKey: ["/api/bkt-perf-summary"] });
      onClose();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  const saveMonthly = async (mfState: MFState) => {
    setLoading(true);
    try {
      const payload: Record<string, any> = {
        status:             "Unpaid",
        feedback:           mfState.detailFeedback,
        comments:           mfState.comments,
        ptp_date:           null,
        rollback_yn:        null,
        customer_available: mfState.customerAvailable,
        vehicle_available:  mfState.vehicleAvailable,
        third_party:        mfState.thirdParty,
        third_party_name:   mfState.thirdParty ? mfState.thirdPartyName   : null,
        third_party_number: mfState.thirdParty ? mfState.thirdPartyNumber : null,
        feedback_code:      mfState.feedbackCode,
        projection:         mfState.projection,
        non_starter:        mfState.nonStarter,
        kyc_purchase:       mfState.kycPurchase,
        workable:           mfState.workable,
        ptp_date_mf:        mfState.feedbackCode === "PTP" && mfState.ptpDateMf
                              ? toIsoDate(mfState.ptpDateMf) : null,
        shifted_city:       mfState.detailFeedback === "Customer shifted"
                              ? (mfState.shiftedCity.trim() || null) : null,
        occupation:         mfState.occupation.length > 0
                              ? mfState.occupation.join(", ") : null,
        monthly_feedback:   "SUBMITTED",
      };
      await api.updateFeedback(caseItem.id, payload);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["/api/cases"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      qc.invalidateQueries({ queryKey: ["/api/bkt-perf-summary"] });
      onClose();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  const renderDetailOptions = (
    options: string[], val: string, setVal: (v: string) => void, activeColor: string
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

          {/* Contact Numbers */}
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
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      Linking.openURL(`tel:${ph}`);
                    }}
                  >
                    <Ionicons name="call" size={12} color={i >= primaryPhones.length ? Colors.success : "#fff"} />
                    <Text style={[fbStyles.numberChipText, i >= primaryPhones.length && fbStyles.numberChipTextExtra]}>
                      {ph}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* Rollback / Clearance chips */}
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

          {/* Tab row */}
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
                    isThisTabLocked && !isActive && {
                      borderColor: Colors.warning + "60",
                      backgroundColor: Colors.warning + "10",
                    },
                  ]}
                  onPress={() => setActiveTab(t)}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    {isThisTabLocked && (
                      <Ionicons name="lock-closed" size={11} color={isActive ? "#fff" : Colors.warning} />
                    )}
                    <Text style={[
                      fbStyles.tabChipText,
                      isActive && { color: "#fff" },
                      isThisTabLocked && !isActive && { color: Colors.warning },
                    ]}>
                      {t}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* ── Monthly Feedback: Full stepper ── */}
          {activeTab === "Monthly Feedback" && (
            isMonthlyLocked ? (
              <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1, flexShrink: 1 }}>
                <LockedFeedbackView item={caseItem} />
                <View style={{ height: 16 }} />
              </ScrollView>
            ) : (
              <MonthlyFeedbackStepper
                caseItem={caseItem}
                onClose={onClose}
                onSubmit={saveMonthly}
                loading={loading}
              />
            )
          )}

          {/* ── Non-monthly tabs ── */}
          {activeTab !== "Monthly Feedback" && (
            <>
              <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 1, flexShrink: 1 }}>

                {/* UNPAID */}
                {activeTab === "Unpaid" && (
                  <>
                    <Text style={fbStyles.sectionLabel}>Detail Feedback</Text>
                    {renderDetailOptions(MONTHLY_FEEDBACK_OPTIONS, detailFeedback, setDetailFeedback, Colors.statusUnpaid)}
                    <Text style={fbStyles.sectionLabel}>Comments (Optional)</Text>
                    <TextInput
                      style={fbStyles.commentInput}
                      placeholder="Add comments..."
                      placeholderTextColor={Colors.textMuted}
                      value={comments}
                      onChangeText={setComments}
                      multiline
                      numberOfLines={4}
                    />
                  </>
                )}

                {/* PAID */}
                {activeTab === "Paid" && (
                  <>
                    <Text style={fbStyles.sectionLabel}>Detail Feedback</Text>
                    {renderDetailOptions(PAID_DETAIL_OPTIONS, paidDetailFeedback, setPaidDetailFeedback, Colors.success)}
                    <YNToggle label="Rollback" value={paidRollbackYn} onChange={setPaidRollbackYn} />
                    <Text style={fbStyles.sectionLabel}>Comments (Optional)</Text>
                    <TextInput
                      style={fbStyles.commentInput}
                      placeholder="Add comments..."
                      placeholderTextColor={Colors.textMuted}
                      value={paidComments}
                      onChangeText={setPaidComments}
                      multiline
                      numberOfLines={3}
                    />
                  </>
                )}

                {/* PTP */}
                {activeTab === "PTP" && (
                  <>
                    <Text style={fbStyles.sectionLabel}>Detail Feedback</Text>
                    {renderDetailOptions(PTP_DETAIL_OPTIONS, detailFeedback, setDetailFeedback, Colors.statusPTP)}
                    <Text style={fbStyles.sectionLabel}>PTP Date</Text>
                    <TextInput
                      style={[fbStyles.commentInput, { minHeight: 44, marginBottom: 12 }]}
                      placeholder="DD-MM-YYYY"
                      placeholderTextColor={Colors.textMuted}
                      value={ptpDate}
                      onChangeText={setPtpDate}
                      keyboardType="numeric"
                    />
                    <Text style={fbStyles.sectionLabel}>Comments (Optional)</Text>
                    <TextInput
                      style={fbStyles.commentInput}
                      placeholder="Add comments..."
                      placeholderTextColor={Colors.textMuted}
                      value={comments}
                      onChangeText={setComments}
                      multiline
                      numberOfLines={3}
                    />
                  </>
                )}

                <View style={{ height: 16 }} />
              </ScrollView>

              {/* Action buttons for non-monthly tabs */}
              <View style={fbStyles.btnRow}>
                <Pressable style={fbStyles.cancelBtn} onPress={onClose}>
                  <Text style={fbStyles.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[fbStyles.saveBtn, {
                    backgroundColor: activeTab === "Paid" ? Colors.success
                      : activeTab === "PTP"              ? Colors.statusPTP
                      : Colors.statusUnpaid,
                  }]}
                  onPress={saveBasic}
                  disabled={loading}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={fbStyles.saveText}>Save</Text>
                  }
                </Pressable>
              </View>
              <View style={{ height: 24 }} />
            </>
          )}

        </View>
      </View>

      <CallPickerModal
        visible={callPickerVisible}
        phones={allPhones}
        onClose={() => setCallPickerVisible(false)}
      />
    </Modal>
  );
}

// ─── Navigate to Detail ───────────────────────────────────────────────────────
function navigateToDetail(item: any) {
  caseStore.set(item);
  router.push({ pathname: "/(app)/customer/[id]", params: { id: String(item.id) } });
}

// ─── Case Card ────────────────────────────────────────────────────────────────
function CaseCard({ item, onFeedback }: { item: any; onFeedback: (item: any) => void }) {
  const [callPickerVisible, setCallPickerVisible] = useState(false);

  const phones: string[] = (item.mobile_no ?? "")
    .split(",").map((p: string) => p.trim()).filter(Boolean);

  const call = () => {
    if (!phones.length) { Alert.alert("No number available"); return; }
    if (phones.length === 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      Linking.openURL(`tel:${phones[0]}`);
    } else {
      setCallPickerVisible(true);
    }
  };

  const isUploaded = !!item.loan_no;
  const isMonthlyLocked = !!item.monthly_feedback;

  const statusColor  = STATUS_COLORS[item.status] || Colors.textMuted;
  const rollbackRaw  = (item.rollback  !== null && item.rollback  !== undefined && item.rollback  !== "" && item.rollback  !== "0" && Number(item.rollback)  !== 0) ? "RollBack"  : "—";
  const clearanceRaw = (item.clearance !== null && item.clearance !== undefined && item.clearance !== "" && item.clearance !== "0" && Number(item.clearance) !== 0) ? "Clearance" : "—";
  const hasRollback  = rollbackRaw  !== "—";
  const hasClearance = clearanceRaw !== "—";

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

      <View style={styles.cardActions}>
        <Pressable style={[styles.actionBtn, styles.callBtn]} onPress={call}>
          <Ionicons name="call" size={16} color="#fff" />
          <Text style={styles.actionBtnText}>Call</Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, styles.detailBtn]} onPress={() => navigateToDetail(item)}>
          <Ionicons name="eye" size={16} color={Colors.textSecondary} />
          <Text style={[styles.actionBtnText, { color: Colors.textSecondary }]}>Details</Text>
        </Pressable>
        {isUploaded && (
          <Pressable
            style={[styles.actionBtn, styles.feedbackBtn]}
            onPress={() => onFeedback(item)}
          >
            <Ionicons name="chatbox" size={16} color="#fff" />
            <Text style={styles.actionBtnText}>Feedback</Text>
          </Pressable>
        )}
      </View>

      <CallPickerModal
        visible={callPickerVisible}
        phones={phones}
        onClose={() => setCallPickerVisible(false)}
      />
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function AllocationScreen() {
  const insets  = useSafeAreaInsets();
  const qc      = useQueryClient();
  const [activeTab,    setActiveTab]    = useState("All");
  const [search,       setSearch]       = useState("");
  const [feedbackItem, setFeedbackItem] = useState<any>(null);

  const [extraNumbersMap, setExtraNumbersMap] = useState<Record<string, string[]>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["/api/cases"],
    queryFn:  () => api.getCases(),
  });

  const allCases: any[] = data?.cases || [];

  const filtered = useMemo(() => {
    return allCases
      .filter((c: any) => activeTab === "All" || c.status === activeTab)
      .filter((c: any) =>
        !search ||
        c.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
        c.loan_no?.toLowerCase().includes(search.toLowerCase())       ||
        c.app_id?.toLowerCase().includes(search.toLowerCase())        ||
        c.registration_no?.toLowerCase().includes(search.toLowerCase())
      );
  }, [allCases, activeTab, search]);

  const counts = useMemo(() => ({
    All:    allCases.length,
    Unpaid: allCases.filter((c: any) => c.status === "Unpaid").length,
    PTP:    allCases.filter((c: any) => c.status === "PTP").length,
    Paid:   allCases.filter((c: any) => c.status === "Paid").length,
  }), [allCases]);

  const feedbackItemMonthlyLocked = feedbackItem ? !!feedbackItem.monthly_feedback : false;
  const feedbackExtraNumbers = feedbackItem ? (extraNumbersMap[String(feedbackItem.id)] ?? []) : [];

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={[styles.tabsContainer, { paddingTop: Platform.OS === "web" ? 67 : 12 }]}>
        {STATUS_TABS.map((tab) => (
          <Pressable
            key={tab}
            style={[
              styles.tab,
              activeTab === tab && [
                styles.tabActive,
                { backgroundColor: STATUS_COLORS[tab] ?? Colors.primary },
              ],
            ]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
            <View style={[styles.tabCount, activeTab === tab && { backgroundColor: "rgba(255,255,255,0.3)" }]}>
              <Text style={[styles.tabCountText, activeTab === tab && { color: "#fff" }]}>
                {counts[tab as keyof typeof counts]}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>

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

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <CaseCard item={item} onFeedback={setFeedbackItem} />
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

      {feedbackItem && (
        <FeedbackModal
          visible={!!feedbackItem}
          caseItem={feedbackItem}
          isMonthlyLocked={feedbackItemMonthlyLocked}
          extraNumbers={feedbackExtraNumbers}
          onClose={() => setFeedbackItem(null)}
        />
      )}
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
  cardActions:         { flexDirection: "row", gap: 8, marginTop: 4 },
  actionBtn:           { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 10, borderRadius: 10, gap: 5 },
  callBtn:             { backgroundColor: Colors.primary },
  detailBtn:           { backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.borderLight },
  feedbackBtn:         { backgroundColor: Colors.accent },
  actionBtnText:       { color: "#fff", fontSize: 13, fontWeight: "700" },
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

const mfStyles = StyleSheet.create({
  stepHeader:    { marginBottom: 8 },
  stepNum:       { fontSize: 11, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 },
  stepTitle:     { fontSize: 18, fontWeight: "700", color: Colors.text, marginBottom: 10 },
  dot:           { flex: 1, height: 4, borderRadius: 2, backgroundColor: Colors.border },
  dotDone:       { backgroundColor: Colors.primary },
  dotActive:     { backgroundColor: Colors.primary + "70" },
  hint:          { fontSize: 13, color: Colors.textMuted, marginBottom: 16 },
  codeCard:      { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt },
  codeBadge:     { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, minWidth: 52, alignItems: "center" },
  codeBadgeText: { fontSize: 12, fontWeight: "800", color: Colors.textSecondary },
  codeLabel:     { flex: 1, fontSize: 14, fontWeight: "500", color: Colors.text },
  projCode:      { fontSize: 16, fontWeight: "800", color: Colors.text },
  projLabel:     { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  occGroupLabel: { fontSize: 11, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginTop: 4 },
  occChip:       { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt },
  occChipText:   { fontSize: 13, fontWeight: "500", color: Colors.text },
  commentBox:    { backgroundColor: Colors.surfaceAlt, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border },
  commentBoxLabel:{ fontSize: 11, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase", marginBottom: 10 },
  commentHint:   { fontSize: 11, color: Colors.textMuted, marginTop: -4 },
  divider:       { height: 1, backgroundColor: Colors.border, marginVertical: 12 },
  navRow:        { flexDirection: "row", gap: 12, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  backBtn:       { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, alignItems: "center" },
  backBtnText:   { fontSize: 15, fontWeight: "600", color: Colors.textSecondary },
  nextBtn:       { flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: "center", backgroundColor: Colors.primary },
  nextBtnDisabled:{ backgroundColor: Colors.surfaceElevated },
  nextBtnText:   { fontSize: 15, fontWeight: "700", color: "#fff" },
});

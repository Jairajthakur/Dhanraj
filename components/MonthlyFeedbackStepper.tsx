import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  TextInput, Modal, Alert, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ─── Constants ────────────────────────────────────────────────────────────────
const DETAIL_OPTIONS: Record<string, string[]> = {
  PTP:    ["PTP DATE SET", "WILL PAY TOMORROW", "WILL ARRANGE FUNDS", "CALL LATER"],
  PAID:   ["PAID", "PART PAYMENT", "SETTLED"],
  REPO:   ["VEHICLE TAKEN", "SELF SURRENDER"],
  RTP:    ["REFUSED TO PAY", "DISPUTES AMOUNT"],
  CAVNA:  ["CUSTOMER MET - VEHICLE ABSENT"],
  CNAVNA: ["CUSTOMER ABSENT - VEHICLE PRESENT"],
  ANF:    ["WRONG ADDRESS", "INCOMPLETE ADDRESS"],
  EXP:    ["DECEASED", "CRITICALLY ILL"],
  SFT:    ["SHIFTED CITY", "SHIFTED STATE"],
  VSL:    ["VEHICLE SURRENDERED", "VEHICLE LOCKED"],
  SKIP:   ["ABSCONDING", "NOT TRACEABLE"],
};

const FEEDBACK_CODES = [
  { code: "PTP",    desc: "Promise To Pay" },
  { code: "PAID",   desc: "Customer Already Paid" },
  { code: "REPO",   desc: "Vehicle Repossessed" },
  { code: "RTP",    desc: "Refuse To Pay" },
  { code: "CAVNA",  desc: "Customer Available & Vehicle Not Available" },
  { code: "CNAVNA", desc: "Customer Not Available & Vehicle Available" },
  { code: "ANF",    desc: "Address Not Found" },
  { code: "EXP",    desc: "Expired / Deceased" },
  { code: "SFT",    desc: "Customer Transferred / Shifted" },
  { code: "VSL",    desc: "Vehicle Surrendered / Locked" },
  { code: "SKIP",   desc: "Skip / Absconding" },
];

const SMART_INPUT_CONFIG: Record<string, { label: string; placeholder: string; hint: string; keyboardType?: any }> = {
  PTP: {
    label: "PTP Date",
    placeholder: "DD-MM-YYYY",
    hint: "Enter the date the customer promised to pay",
    keyboardType: "numeric",
  },
  SFT: {
    label: "Shifted To (City / Area)",
    placeholder: "e.g. Pune, Nagpur South...",
    hint: "Enter the city or area customer has shifted to",
    keyboardType: "default",
  },
};

const OCCUPATION_OPTIONS = [
  "Salaried", "Daily Wage Worker", "Business Owner", "Shop Owner", "Trader",
  "Farmer", "Agricultural Labour", "Factory Worker", "Construction Worker",
  "Auto / Taxi Driver", "Delivery Boy", "Security Guard", "Mechanic",
  "Electrician / Plumber", "Domestic Worker", "Street Vendor", "Govt Employee",
  "Teacher", "Nurse / Health Worker", "Self-employed", "Student", "Retired",
  "Unemployed", "Other",
];

const PROJECTION_OPTIONS = ["ST", "RF", "RB"];
const TOTAL_STEPS = 4;

// ─── Types ────────────────────────────────────────────────────────────────────
type YNValue = true | false | null;

interface FormState {
  customerAvailable: YNValue;
  vehicleAvailable: YNValue;
  thirdParty: YNValue;
  occupation: string;
  feedbackCode: string;
  detailFeedback: string;
  smartInputValue: string;
  projection: string;
  nonStarter: YNValue;
  kycPurchase: YNValue;
  workable: YNValue;
  comments: string;
}

const EMPTY_FORM: FormState = {
  customerAvailable: null,
  vehicleAvailable: null,
  thirdParty: null,
  occupation: "",
  feedbackCode: "",
  detailFeedback: "",
  smartInputValue: "",
  projection: "",
  nonStarter: null,
  kycPurchase: null,
  workable: null,
  comments: "",
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function YNToggle({
  label, value, onChange,
}: { label: string; value: YNValue; onChange: (v: YNValue) => void }) {
  return (
    <View style={s.block}>
      <Text style={s.sectionTitle}>{label}</Text>
      <View style={s.ynRow}>
        <Pressable
          style={[s.ynBtn, s.ynLeft, value === true && s.ynSelY]}
          onPress={() => onChange(value === true ? null : true)}
        >
          <Text style={[s.ynText, value === true && s.ynTextSel]}>Y</Text>
        </Pressable>
        <Pressable
          style={[s.ynBtn, s.ynRight, value === false && s.ynSelN]}
          onPress={() => onChange(value === false ? null : false)}
        >
          <Text style={[s.ynText, value === false && s.ynTextSel]}>N</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function MonthlyFeedbackStepper({
  visible,
  onClose,
  onSave,
  onCallLog,
  onFieldVisit,
  currentCaseName = "Rajesh Kumar",
  currentCaseId = "LN-2024-00481",
  nextCaseName = "Suresh Patel",
  nextCaseId = "LN-2024-00482",
  nextCaseDue = "₹1,12,000",
  nextCaseBkt = "BKT-2",
  nextCaseType = "2-Wheeler",
}: {
  visible: boolean;
  onClose: () => void;
  onSave?: (data: FormState) => void;
  onCallLog?: () => void;
  onFieldVisit?: () => void;
  currentCaseName?: string;
  currentCaseId?: string;
  nextCaseName?: string;
  nextCaseId?: string;
  nextCaseDue?: string;
  nextCaseBkt?: string;
  nextCaseType?: string;
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showSuccess, setShowSuccess] = useState(false);
  const insets = useSafeAreaInsets();

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const smartConfig = form.feedbackCode ? SMART_INPUT_CONFIG[form.feedbackCode] : null;

  function goNext() {
    if (step < TOTAL_STEPS - 1) {
      setStep((s) => s + 1);
    } else {
      if (!form.feedbackCode) {
        Alert.alert("Required", "Please select a Feedback Code before saving.");
        setStep(1);
        return;
      }
      if (onSave) {
        Promise.resolve(onSave(form))
          .then(() => setShowSuccess(true))
          .catch((err: any) => {
            Alert.alert("Save Failed", err?.message || "Could not save feedback. Please try again.");
          });
      } else {
        setShowSuccess(true);
      }
    }
  }

  function goBack() {
    if (step > 0) setStep((s) => s - 1);
  }

  function reset() {
    setForm(EMPTY_FORM);
    setStep(0);
    setShowSuccess(false);
  }

  function handleNextCase() {
    setShowSuccess(false);
    reset();
    // Parent should swap case props; here we just reset for demo
  }

  // ── Step 1: Availability + Occupation ──
  const Page1 = (
    <>
      <YNToggle label="CUSTOMER AVAILABLE" value={form.customerAvailable} onChange={(v) => setField("customerAvailable", v)} />
      <YNToggle label="VEHICLE AVAILABLE"  value={form.vehicleAvailable}  onChange={(v) => setField("vehicleAvailable", v)} />
      <YNToggle label="THIRD PARTY"        value={form.thirdParty}        onChange={(v) => setField("thirdParty", v)} />
      <View style={s.block}>
        <Text style={s.sectionTitle}>CUSTOMER OCCUPATION</Text>
        <View style={s.chipsWrap}>
          {OCCUPATION_OPTIONS.map((o) => (
            <Pressable
              key={o}
              style={[s.chip, form.occupation === o && s.chipSel]}
              onPress={() => setField("occupation", form.occupation === o ? "" : o)}
            >
              <Text style={[s.chipText, form.occupation === o && s.chipTextSel]}>{o}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </>
  );

  // ── Step 2: Feedback Code + Detail + Smart Input ──
  const Page2 = (
    <>
      <View style={s.block}>
        <Text style={s.sectionTitle}>FEEDBACK CODE</Text>
        {FEEDBACK_CODES.map(({ code, desc }) => (
          <Pressable
            key={code}
            style={[s.fcItem, form.feedbackCode === code && s.fcItemSel]}
            onPress={() => {
              setField("feedbackCode", code);
              setField("detailFeedback", "");
              setField("smartInputValue", "");
            }}
          >
            <View style={[s.radio, form.feedbackCode === code && s.radioSel]} />
            <View>
              <Text style={s.fcCode}>{code}</Text>
              <Text style={s.fcDesc}>{desc}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      {form.feedbackCode !== "" && (
        <View style={s.block}>
          <Text style={s.sectionTitle}>DETAIL FEEDBACK</Text>
          {(DETAIL_OPTIONS[form.feedbackCode] || []).map((opt) => (
            <Pressable
              key={opt}
              style={[s.detailChip, form.detailFeedback === opt && s.detailChipSel]}
              onPress={() => setField("detailFeedback", form.detailFeedback === opt ? "" : opt)}
            >
              <Text style={[s.detailChipText, form.detailFeedback === opt && s.detailChipTextSel]}>{opt}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {smartConfig && (
        <View style={s.smartBox}>
          <Text style={s.smartLabel}>{smartConfig.label}</Text>
          <TextInput
            style={s.smartInput}
            placeholder={smartConfig.placeholder}
            placeholderTextColor="#AAAAAA"
            keyboardType={smartConfig.keyboardType}
            value={form.smartInputValue}
            onChangeText={(v) => setField("smartInputValue", v)}
          />
          <Text style={s.smartHint}>{smartConfig.hint}</Text>
        </View>
      )}
    </>
  );

  // ── Step 3: Projection + Non Starter + KYC ──
  const Page3 = (
    <>
      <View style={s.block}>
        <Text style={s.sectionTitle}>PROJECTION</Text>
        <View style={s.projRow}>
          {PROJECTION_OPTIONS.map((p, i) => (
            <Pressable
              key={p}
              style={[
                s.projBtn,
                i === 0 && s.projLeft,
                i === PROJECTION_OPTIONS.length - 1 && s.projRight,
                form.projection === p && s.projSel,
              ]}
              onPress={() => setField("projection", form.projection === p ? "" : p)}
            >
              <Text style={[s.projText, form.projection === p && s.projTextSel]}>{p}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <YNToggle label="NON STARTER"  value={form.nonStarter}  onChange={(v) => setField("nonStarter", v)} />
      <YNToggle label="KYC PURCHASE" value={form.kycPurchase} onChange={(v) => setField("kycPurchase", v)} />
    </>
  );

  // ── Step 4: Workable + Comments ──
  const Page4 = (
    <>
      <View style={s.block}>
        <Text style={s.sectionTitle}>WORKABLE</Text>
        <View style={s.ynRow}>
          <Pressable
            style={[s.ynBtn, s.ynLeft, form.workable === true && s.ynSelY]}
            onPress={() => setField("workable", form.workable === true ? null : true)}
          >
            <Text style={[s.ynText, form.workable === true && s.ynTextSel]}>Workable</Text>
          </Pressable>
          <Pressable
            style={[s.ynBtn, s.ynRight, form.workable === false && s.ynSelN]}
            onPress={() => setField("workable", form.workable === false ? null : false)}
          >
            <Text style={[s.ynText, form.workable === false && s.ynTextSel]}>Not Workable</Text>
          </Pressable>
        </View>
      </View>
      <View style={s.block}>
        <Text style={s.sectionTitle}>COMMENTS (OPTIONAL)</Text>
        <TextInput
          style={s.commentInput}
          placeholder="Add comments..."
          placeholderTextColor="#AAAAAA"
          multiline
          numberOfLines={4}
          value={form.comments}
          onChangeText={(v) => setField("comments", v)}
        />
      </View>
    </>
  );

  const pages = [Page1, Page2, Page3, Page4];

  if (!visible) return null;

  const inner = (
    <View style={s.container}>
      {/* Tab bar */}
      <View style={[s.tabBar, { paddingTop: Math.max(8, insets.top) }]}>
        <Pressable style={s.tabInactive} onPress={() => { onClose(); onCallLog?.(); }}>
          <Text style={s.tabInactiveText}>← Call Log</Text>
        </Pressable>
        <View style={s.tabActive}>
          <Text style={s.tabActiveText}>Monthly Feedback</Text>
        </View>
        <Pressable style={s.tabInactive} onPress={() => { onClose(); onFieldVisit?.(); }}>
          <Text style={s.tabInactiveText}>+ Field Visit</Text>
        </Pressable>
      </View>

      {/* Progress bar */}
      <View style={s.progressBar}>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <View
            key={i}
            style={[
              s.stepDot,
              i < step && s.stepDone,
              i === step && s.stepActive,
            ]}
          />
        ))}
        <Text style={s.stepLabel}>Step {step + 1} of {TOTAL_STEPS}</Text>
      </View>

      {/* Page content */}
      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.pageContent}>
          {pages[step]}
        </View>
        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Footer */}
      <View style={[s.footer, { paddingBottom: Math.max(10, insets.bottom) }]}>
        {step > 0 && (
          <Pressable style={s.backBtn} onPress={goBack}>
            <Text style={s.backBtnText}>Back</Text>
          </Pressable>
        )}
        <Pressable style={[s.nextBtn, step === 0 && { flex: 1 }]} onPress={goNext}>
          <Text style={s.nextBtnText}>
            {step === TOTAL_STEPS - 1 ? "Save ✓" : "Next →"}
          </Text>
        </Pressable>
      </View>

      {/* Success overlay — inline so it works on both web and native */}
      {showSuccess && (
        <View style={s.overlay}>
          <View style={s.ovCard}>
            <View style={s.ovTop}>
              <Text style={s.ovTick}>✓</Text>
              <Text style={s.ovSaved}>Feedback Saved!</Text>
              <Text style={s.ovSub}>{currentCaseName} · {currentCaseId}</Text>
            </View>
            <View style={s.ovBody}>
              <Text style={s.ovLbl}>NEXT CASE</Text>
              <View style={s.ovBox}>
                <Text style={s.ovNextName}>{nextCaseName}</Text>
                <Text style={s.ovNextMeta}>{nextCaseId} · {nextCaseDue} due</Text>
                <View style={s.ovTags}>
                  <View style={s.tagRed}><Text style={s.tagRedText}>{nextCaseBkt}</Text></View>
                  <View style={s.tagGray}><Text style={s.tagGrayText}>{nextCaseType}</Text></View>
                </View>
              </View>
              <Pressable style={s.ovGoBtn} onPress={handleNextCase}>
                <Text style={s.ovGoBtnText}>Open Next Case →</Text>
              </Pressable>
              <Pressable style={s.ovSkipBtn} onPress={() => { setShowSuccess(false); onClose(); reset(); }}>
                <Text style={s.ovSkipText}>Back to List</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {inner}
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const PRIMARY = "#111111";
const BG      = "#ECEAE4";
const SURFACE = "#F5F4F0";
const ALT     = "#E2E0DA";
const BORDER  = "#C8C6BE";
const SUCCESS = "#16A34A";
const DANGER  = "#DC2626";
const MUTED   = "#888888";

const s = StyleSheet.create({
  container:       { flex: 1, backgroundColor: BG },
  tabBar:          { flexDirection: "row", paddingHorizontal: 10, paddingTop: 8, borderBottomWidth: 1, borderColor: BORDER, backgroundColor: BG },
  tabActive:       { paddingHorizontal: 14, paddingVertical: 7, backgroundColor: SURFACE, borderWidth: 1, borderBottomWidth: 0, borderColor: BORDER, borderRadius: 6, marginRight: 2 },
  tabActiveText:   { fontSize: 11, fontWeight: "600", color: PRIMARY },
  tabInactive:     { paddingHorizontal: 14, paddingVertical: 7, backgroundColor: ALT, borderWidth: 1, borderBottomWidth: 0, borderColor: BORDER, borderRadius: 6, marginRight: 2 },
  tabInactiveText: { fontSize: 11, color: MUTED },
  progressBar:     { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, backgroundColor: SURFACE, gap: 4 },
  stepDot:         { width: 28, height: 4, borderRadius: 2, backgroundColor: BORDER },
  stepDone:        { backgroundColor: PRIMARY },
  stepActive:      { backgroundColor: "#555" },
  stepLabel:       { marginLeft: "auto", fontSize: 10, color: MUTED },
  scroll:          { flex: 1, backgroundColor: SURFACE },
  pageContent:     { padding: 16, gap: 14 },
  block:           { gap: 6 },
  sectionTitle:    { fontSize: 10, fontWeight: "700", color: MUTED, letterSpacing: 0.6 },

  // Y/N
  ynRow:     { flexDirection: "row" },
  ynBtn:     { flex: 1, paddingVertical: 11, alignItems: "center", backgroundColor: ALT, borderWidth: 1, borderColor: BORDER },
  ynLeft:    { borderRadius: 4, borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRightWidth: 0 },
  ynRight:   { borderRadius: 4, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
  ynSelY:    { backgroundColor: SUCCESS, borderColor: SUCCESS },
  ynSelN:    { backgroundColor: DANGER,  borderColor: DANGER },
  ynText:    { fontSize: 13, fontWeight: "600", color: "#666" },
  ynTextSel: { color: "#fff" },

  // Occupation chips
  chipsWrap:    { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  chip:         { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: ALT },
  chipSel:      { backgroundColor: PRIMARY, borderColor: PRIMARY },
  chipText:     { fontSize: 11, color: "#555" },
  chipTextSel:  { color: "#fff" },

  // Feedback code list
  fcItem:    { flexDirection: "row", alignItems: "center", gap: 10, padding: 9, backgroundColor: ALT, borderWidth: 1, borderColor: BORDER, borderRadius: 4 },
  fcItemSel: { backgroundColor: "#fff", borderColor: "#888" },
  radio:     { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: "#999" },
  radioSel:  { borderColor: PRIMARY, backgroundColor: PRIMARY, shadowColor: "#fff", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 2 },
  fcCode:    { fontSize: 12, fontWeight: "700", color: PRIMARY },
  fcDesc:    { fontSize: 10, color: MUTED, marginTop: 1 },

  // Detail chips
  detailChip:        { padding: 9, borderRadius: 4, borderWidth: 1, borderColor: BORDER, backgroundColor: ALT, marginBottom: 3 },
  detailChipSel:     { backgroundColor: PRIMARY, borderColor: PRIMARY },
  detailChipText:    { fontSize: 11, color: "#555" },
  detailChipTextSel: { color: "#fff" },

  // Smart input box
  smartBox:   { backgroundColor: "#fff", borderWidth: 1.5, borderColor: PRIMARY, borderRadius: 6, padding: 12, gap: 6 },
  smartLabel: { fontSize: 10, fontWeight: "700", color: PRIMARY, textTransform: "uppercase", letterSpacing: 0.5 },
  smartInput: { borderWidth: 1, borderColor: BORDER, borderRadius: 4, backgroundColor: SURFACE, paddingHorizontal: 11, paddingVertical: 10, fontSize: 13, color: PRIMARY },
  smartHint:  { fontSize: 10, color: MUTED },

  // Projection
  projRow:        { flexDirection: "row" },
  projBtn:        { flex: 1, paddingVertical: 11, alignItems: "center", backgroundColor: ALT, borderWidth: 1, borderColor: BORDER },
  projLeft:       { borderRadius: 4, borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRightWidth: 0 },
  projRight:      { borderRadius: 4, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
  projSel:        { backgroundColor: PRIMARY, borderColor: PRIMARY },
  projText:       { fontSize: 13, fontWeight: "600", color: "#666" },
  projTextSel:    { color: "#fff" },

  // Comment input
  commentInput: { borderWidth: 1, borderColor: BORDER, borderRadius: 4, backgroundColor: ALT, padding: 10, fontSize: 11, color: "#555", textAlignVertical: "top", minHeight: 80 },

  // Footer
  footer:      { flexDirection: "row", gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderColor: BORDER, backgroundColor: BG },
  backBtn:     { flex: 1, paddingVertical: 12, backgroundColor: ALT, borderWidth: 1, borderColor: BORDER, borderRadius: 4, alignItems: "center" },
  backBtnText: { fontSize: 13, color: "#555" },
  nextBtn:     { flex: 2, paddingVertical: 12, backgroundColor: PRIMARY, borderRadius: 4, alignItems: "center" },
  nextBtnText: { fontSize: 13, fontWeight: "600", color: "#fff" },

  // Success overlay
  overlay:      { position: "absolute" as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", zIndex: 10 },
  ovCard:       { backgroundColor: "#fff", borderRadius: 12, width: 290, overflow: "hidden" },
  ovTop:        { backgroundColor: SUCCESS, padding: 16, alignItems: "center" },
  ovTick:       { fontSize: 28, color: "#fff", marginBottom: 4 },
  ovSaved:      { fontSize: 14, fontWeight: "700", color: "#fff" },
  ovSub:        { fontSize: 11, color: "rgba(255,255,255,0.85)", marginTop: 2 },
  ovBody:       { padding: 14 },
  ovLbl:        { fontSize: 10, color: MUTED, letterSpacing: 0.5, marginBottom: 6 },
  ovBox:        { backgroundColor: SURFACE, borderWidth: 1, borderColor: BORDER, borderRadius: 8, padding: 10, marginBottom: 12 },
  ovNextName:   { fontSize: 14, fontWeight: "700", color: PRIMARY },
  ovNextMeta:   { fontSize: 10, color: MUTED, marginTop: 3 },
  ovTags:       { flexDirection: "row", gap: 5, marginTop: 6 },
  tagRed:       { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: "#FEE2E2" },
  tagRedText:   { fontSize: 10, fontWeight: "600", color: "#991B1B" },
  tagGray:      { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: ALT },
  tagGrayText:  { fontSize: 10, fontWeight: "600", color: "#555" },
  ovGoBtn:      { width: "100%", paddingVertical: 11, backgroundColor: PRIMARY, borderRadius: 7, alignItems: "center", marginBottom: 7 },
  ovGoBtnText:  { fontSize: 13, fontWeight: "600", color: "#fff" },
  ovSkipBtn:    { width: "100%", paddingVertical: 9, borderRadius: 7, borderWidth: 1, borderColor: BORDER, alignItems: "center" },
  ovSkipText:   { fontSize: 12, color: MUTED },
});

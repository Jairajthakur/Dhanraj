import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput, Linking,
  Alert, ActivityIndicator, Modal, ScrollView, Platform, Image, Share,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";
import { caseStore } from "@/lib/caseStore";
import MonthlyFeedbackStepper from "@/components/MonthlyFeedbackStepper";

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_TABS = ["All", "Unpaid", "PTP", "Paid"] as const;
type StatusTab = typeof STATUS_TABS[number];

const FEEDBACK_TABS = ["Call Log", "Monthly Feedback", "Field Visit"] as const;
type FeedbackTab = typeof FEEDBACK_TABS[number];

const STATUS_COLORS: Record<string, string> = {
  All:    Colors.primary,
  Unpaid: Colors.statusUnpaid,
  PTP:    Colors.statusPTP,
  Paid:   Colors.statusPaid,
};

// Call Log dispositions
const CALL_LOG_OPTIONS = [
  "SWITCH OFF", "NOT AVAILABLE", "DISCONNECTED", "REFUSED TO PAY",
  "DISPUTED", "NOT AT HOME", "WILL PAY", "PTP DATE SET", "PTP",
  "PARTIAL PAYMENT DONE", "PAID", "PART PAYMENT", "SETTLED",
  "RESCHEDULED", "CALL BACK REQUESTED",
] as const;

const OUTCOME_TO_STATUS: Record<string, string> = {
  "PAID":               "Paid",
  "PART PAYMENT":       "Paid",
  "SETTLED":            "Paid",
  "PTP DATE SET":       "PTP",
  "PTP":                "PTP",
  "WILL PAY TOMORROW":  "PTP",
  "WILL ARRANGE FUNDS": "PTP",
  "CALL LATER":         "PTP",
};

// ── Full feedback codes with descriptions & colours ───────────────────────────
interface FbCodeMeta {
  code: string;
  desc: string;
  color: string;
}
const FEEDBACK_CODE_LIST: FbCodeMeta[] = [
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

// Keep legacy string array for backwards compat elsewhere
const FEEDBACK_CODES = FEEDBACK_CODE_LIST.map((f) => f.code) as readonly string[];

// ── Full-sentence detail options per feedback code ────────────────────────────
const DETAIL_SENTENCES: Record<string, string[]> = {
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

// ── Customer occupation list ───────────────────────────────────────────────────
const OCCUPATION_LIST = [
  "Salaried", "Daily Wage Worker", "Business Owner", "Shop Owner",
  "Trader", "Farmer", "Agricultural Labour", "Factory Worker",
  "Construction Worker", "Auto / Taxi Driver", "Delivery Boy",
  "Security Guard", "Mechanic", "Electrician / Plumber",
  "Domestic Worker", "Street Vendor", "Govt Employee", "Teacher",
  "Nurse / Health Worker", "Self-employed", "Student", "Retired",
  "Unemployed", "Other",
];

const PTP_DETAIL_OPTIONS = [
  "PTP DATE SET", "WILL PAY TOMORROW", "WILL ARRANGE FUNDS", "CALL LATER",
] as const;

const PROJECTION_OPTIONS = ["ST", "RF", "RB"] as const;

// Field Visit
const VISIT_OUTCOMES = [
  "PTP", "Paid", "Refused to Pay", "Customer Absent", "Skip / Not Found",
] as const;
type VisitOutcome = typeof VISIT_OUTCOMES[number];

const VISIT_OUTCOME_COLORS: Record<VisitOutcome, string> = {
  "PTP":              Colors.statusPTP,
  "Paid":             Colors.success,
  "Refused to Pay":   Colors.danger,
  "Customer Absent":  Colors.warning,
  "Skip / Not Found": Colors.textSecondary,
};

const MAX_PHOTOS     = 4;
const GPS_TIMEOUT_MS = 20_000;
const GPS_MAX_AGE_MS = 10_000;
const PTP_DATE_REGEX = /^\d{2}-\d{2}-\d{4}$/;

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

// ─── CSV Download ─────────────────────────────────────────────────────────────
function escCsv(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function downloadAllocationCsv(cases: CaseItem[], filename: string): Promise<void> {
  const headers = [
    "Customer Name", "Loan No", "App ID", "Mobile No",
    "Status", "Bucket", "EMI Amount", "POS",
    "CBC", "LPP", "CBC+LPP", "PTP Date",
    "Address", "Registration No", "Company",
  ];

  const rows = cases.map((c) => [
    c.customer_name, c.loan_no, c.app_id ?? "", c.mobile_no ?? "",
    c.status, c.bkt ?? "", c.emi_amount ?? "", c.pos ?? "",
    c.cbc ?? "", c.lpp ?? "", c.cbc_lpp ?? "",
    c.ptp_date ? String(c.ptp_date).slice(0, 10) : "",
    c.address ?? "", c.registration_no ?? "",
    c.company_name ?? "",
  ].map(escCsv).join(","));

  const csv = [headers.map(escCsv).join(","), ...rows].join("\n");

  if (Platform.OS === "android") {
    // Android: save directly to Downloads via StorageAccessFramework
    const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(
      "content://com.android.externalstorage.documents/tree/primary%3ADownload"
    );
    if (!permissions.granted) {
      Alert.alert("Permission Denied", "Please allow access to the Downloads folder.");
      return;
    }
    const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
      permissions.directoryUri,
      filename,
      "text/csv"
    );
    await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
    Alert.alert("✅ Downloaded", `Saved to Downloads:\n${filename}`);
  } else {
    // iOS: save to app's Documents folder (accessible via Files app)
    const path = `${FileSystem.documentDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
    Alert.alert("✅ Downloaded", `Saved to Files app:\n${filename}`);
  }
}

function navigateToDetail(item: CaseItem, fromBlocking = false) {
  caseStore.set(item);
  router.push({
    pathname: "/(app)/customer/[id]",
    params: { id: String(item.id), ...(fromBlocking ? { fromBlocking: "1" } : {}) },
  });
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
  company_name?: string;
  occupation?: string;
  sft_city?: string;
}

interface GpsCoords { lat: number; lng: number; accuracy: number; }
interface PhotoAsset { uri: string; fileName: string; mimeType: string; }

// ─── CallPickerModal ──────────────────────────────────────────────────────────
interface CallPickerModalProps { visible: boolean; phones: string[]; onClose: () => void; }

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
              <View style={cpStyles.numberIcon}><Ionicons name="call" size={16} color={Colors.primary} /></View>
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
              fbStyles.feedbackOption, { flex: 1, alignItems: "center" },
              value === val && { backgroundColor: val ? Colors.success : Colors.danger, borderColor: val ? Colors.success : Colors.danger },
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
function LockedFeedbackView({ item }: { item: CaseItem }) {
  const rows = [
    item.status            && { label: "Status",          value: item.status,                        color: STATUS_COLORS[item.status] ?? Colors.text },
    item.feedback_code     && { label: "Feedback Code",   value: item.feedback_code,                 color: Colors.accent },
    item.latest_feedback   && { label: "Detail Feedback", value: item.latest_feedback,               color: Colors.text },
    item.monthly_feedback !== "SUBMITTED" && item.monthly_feedback
                           && { label: "Monthly",         value: item.monthly_feedback,              color: Colors.primary },
    item.ptp_date          && { label: "PTP Date",        value: String(item.ptp_date).slice(0, 10), color: Colors.statusPTP },
    item.feedback_comments && { label: "Comments",        value: item.feedback_comments,             color: Colors.textSecondary },
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
  initialTab?: FeedbackTab;
  onMonthlyFeedbackRequest?: () => void;
}

// ─── WhatsApp helpers ─────────────────────────────────────────────────────────
function fmtRupee(n?: number) {
  return n != null ? `₹${n.toLocaleString("en-IN")}` : "—";
}

function buildFieldVisitMsg(
  caseItem: CaseItem,
  visitOutcome: string,
  visitRemarks: string,
  gps: { lat: number; lng: number } | null,
): string {
  const mapsLink = gps ? `https://maps.google.com/?q=${gps.lat},${gps.lng}` : null;
  const lines = [
    `📍 *FIELD VISIT REPORT*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `👥 *Customer:* ${caseItem.customer_name?.toUpperCase() ?? "—"}`,
    caseItem.loan_no  ? `🔖 *Loan No:*  ${caseItem.loan_no}`  : "",
    caseItem.pos != null ? `💰 *POS:*      ${fmtRupee(caseItem.pos)}` : "",
    visitOutcome      ? `📊 *Outcome:*  ${visitOutcome}`      : "",
    visitRemarks      ? `💬 *Remarks:*  ${visitRemarks}`      : "",
    `⏰ *Time:*     ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}`,
    gps       ? `📍 *Location:* ${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}` : "",
    mapsLink  ? `🗺️ ${mapsLink}` : "",
    `━━━━━━━━━━━━━━━━━━━━`,
    `_Dhanraj Collections App_`,
  ];
  return lines.filter(Boolean).join("\n");
}

function buildCallLogMsg(
  caseItem: CaseItem,
  callOutcome: string,
  callComments: string,
  callPtpDate: string,
): string {
  const lines = [
    `📞 *CALL LOG REPORT*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `👥 *Customer:* ${caseItem.customer_name?.toUpperCase() ?? "—"}`,
    caseItem.loan_no  ? `🔖 *Loan No:*  ${caseItem.loan_no}`      : "",
    caseItem.pos != null ? `💰 *POS:*      ${fmtRupee(caseItem.pos)}` : "",
    callOutcome       ? `📞 *Outcome:*  ${callOutcome}`             : "",
    callComments      ? `💬 *Comments:* ${callComments}`            : "",
    callPtpDate       ? `📅 *PTP Date:* ${callPtpDate}`             : "",
    `⏰ *Time:*     ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `_Dhanraj Collections App_`,
  ];
  return lines.filter(Boolean).join("\n");
}

async function shareToWhatsApp(
  msg: string,
  photoUri: string | null,
  reportTitle: string,
): Promise<void> {
  if (photoUri && Platform.OS !== "web") {
    try {
      // Copy to a stable cache path so URI stays valid after modal closes
      const ext    = photoUri.split(".").pop()?.split("?")[0]?.toLowerCase() ?? "jpg";
      const cached = `${FileSystem.cacheDirectory}wa_share_${Date.now()}.${ext}`;
      const info   = await FileSystem.getInfoAsync(photoUri);
      if (info.exists) {
        await FileSystem.copyAsync({ from: photoUri, to: cached });
      }
      const stableUri = info.exists ? cached : photoUri;

      if (Platform.OS === "ios") {
        // iOS: Share.share with message + url sends both text and image together
        await Share.share({ message: msg, url: stableUri, title: reportTitle });
        return;
      }

      // Android: share photo FIRST via native sheet (agent picks WhatsApp group),
      // then WhatsApp deep link opens with the text pre-filled.
      // Order matters — openURL backgrounds the app so anything after it won't run.
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(stableUri, {
          mimeType: "image/jpeg",
          dialogTitle: "Send photo to WhatsApp group",
          UTI: "public.jpeg",
        });
      }

      // After share sheet is dismissed, open WhatsApp with the report text
      await new Promise(res => setTimeout(res, 500));
      const waUrl = `whatsapp://send?text=${encodeURIComponent(msg)}`;
      const canWA = await Linking.canOpenURL(waUrl).catch(() => false);
      if (canWA) await Linking.openURL(waUrl);
      return;
    } catch (_) {
      // fall through to text-only
    }
  }

  // Text-only (no photo, web, or error)
  const waUrl = `whatsapp://send?text=${encodeURIComponent(msg)}`;
  const canWA = await Linking.canOpenURL(waUrl).catch(() => false);
  if (canWA) {
    await Linking.openURL(waUrl);
  } else {
    await Share.share({ message: msg, title: reportTitle });
  }
}

async function shareFieldVisitWhatsApp(
  msg: string,
  photoUri: string | null,
): Promise<void> {
  return shareToWhatsApp(msg, photoUri, "Field Visit Report");
}

async function shareCallLogWhatsApp(msg: string, photoUri: string | null): Promise<void> {
  return shareToWhatsApp(msg, photoUri, "Call Log Report");
}

function FeedbackModal({
  visible, caseItem, onClose, isMonthlyLocked = false, initialTab = "Call Log", onMonthlyFeedbackRequest,
}: FeedbackModalProps) {

  const [activeTab, setActiveTab] = useState<FeedbackTab>(initialTab);

  useEffect(() => { if (visible) setActiveTab(initialTab); }, [visible, initialTab]);

  // ── Call Log state ─────────────────────────────────────────────────────────
  const [callOutcome,  setCallOutcome]  = useState("");
  const [callComments, setCallComments] = useState("");
  const [callPtpDate,  setCallPtpDate]  = useState("");

  // ── Monthly Feedback state ─────────────────────────────────────────────────
  const [detailFeedback,    setDetailFeedback]    = useState(caseItem?.latest_feedback   ?? "");
  const [monthlyFeedback,   setMonthlyFeedback]   = useState(caseItem?.monthly_feedback  ?? "");
  const [feedbackCode,      setFeedbackCode]      = useState(caseItem?.feedback_code     ?? "");
  const [comments,          setComments]          = useState(caseItem?.feedback_comments ?? "");
  const [ptpDate,           setPtpDate]           = useState(
    caseItem?.ptp_date ? String(caseItem.ptp_date).slice(0, 10) : ""
  );
  const [customerAvailable, setCustomerAvailable] = useState<boolean | null>(caseItem?.customer_available ?? null);
  const [vehicleAvailable,  setVehicleAvailable]  = useState<boolean | null>(caseItem?.vehicle_available  ?? null);
  const [thirdParty,        setThirdParty]        = useState<boolean | null>(caseItem?.third_party        ?? null);
  const [thirdPartyName,    setThirdPartyName]    = useState(caseItem?.third_party_name   ?? "");
  const [thirdPartyNumber,  setThirdPartyNumber]  = useState(caseItem?.third_party_number ?? "");
  const [projection,        setProjection]        = useState(caseItem?.projection          ?? "");
  const [nonStarter,        setNonStarter]        = useState<boolean | null>(caseItem?.non_starter  ?? null);
  const [kycPurchase,       setKycPurchase]       = useState<boolean | null>(caseItem?.kyc_purchase  ?? null);
  const [workable,          setWorkable]          = useState<boolean | null>(caseItem?.workable      ?? null);
  // NEW: occupation + sft city
  const [occupation,        setOccupation]        = useState(caseItem?.occupation ?? "");
  const [sftCity,           setSftCity]           = useState(caseItem?.sft_city   ?? "");

  // ── Field Visit state ──────────────────────────────────────────────────────
  const [visitOutcome, setVisitOutcome] = useState<VisitOutcome | "">("");
  const [visitRemarks, setVisitRemarks] = useState("");
  const [visitPtpDate, setVisitPtpDate] = useState("");
  const [photos,       setPhotos]       = useState<PhotoAsset[]>([]);
  const [gps,          setGps]          = useState<GpsCoords | null>(null);
  const [locLoading,   setLocLoading]   = useState(false);
  const [photoError,   setPhotoError]   = useState("");

  const [loading,    setLoading]    = useState(false);
  const saveGuardRef = useRef(false);
  const qc = useQueryClient();

  const phones: string[] = (caseItem?.mobile_no ?? "")
    .split(",").map((p) => p.trim()).filter(Boolean);

  const callOutcomeIsPtp  = OUTCOME_TO_STATUS[callOutcome] === "PTP";
  const callOutcomeIsPaid = OUTCOME_TO_STATUS[callOutcome] === "Paid";

  // Derived: which code colour to use
  const activeFbMeta = FEEDBACK_CODE_LIST.find((f) => f.code === feedbackCode);
  const activeFbColor = activeFbMeta?.color ?? Colors.accent;

  // Detail sentences for selected code
  const detailSentences: string[] = feedbackCode ? (DETAIL_SENTENCES[feedbackCode] ?? []) : [];

  // ── GPS ────────────────────────────────────────────────────────────────────
  const captureGps = useCallback(async () => {
    if (locLoading) return;
    setLocLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") { Alert.alert("Location Permission Denied", "Please enable location access in your device settings."); return; }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        timeInterval: GPS_TIMEOUT_MS,
        maximumAge: GPS_MAX_AGE_MS,
      } as any);
      setGps({ lat: loc.coords.latitude, lng: loc.coords.longitude, accuracy: Math.round(loc.coords.accuracy ?? 0) });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      Alert.alert("GPS Error", err instanceof Error ? err.message : "Could not capture GPS. Try again.");
    } finally { setLocLoading(false); }
  }, [locLoading]);

  // ── Photo ──────────────────────────────────────────────────────────────────
  const pickPhoto = useCallback(async () => {
    setPhotoError("");
    if (photos.length >= MAX_PHOTOS) { setPhotoError(`Maximum ${MAX_PHOTOS} photos allowed.`); return; }
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") { Alert.alert("Camera Permission Denied", "Please enable camera access in your device settings."); return; }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.65, base64: false, allowsEditing: false,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const ext = (asset.uri.split(".").pop() ?? "jpg").toLowerCase();
      setPhotos((prev) => [...prev, {
        uri: asset.uri,
        fileName: `visit_${Date.now()}_${prev.length}.${ext}`,
        mimeType: ext === "png" ? "image/png" : "image/jpeg",
      }]);
    }
  }, [photos.length]);

  const removePhoto = useCallback((index: number) => {
    setPhotoError("");
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ── Validation ─────────────────────────────────────────────────────────────
  const validate = (): string | null => {
    if (activeTab === "Call Log") {
      if (!callOutcome) return "Please select a call outcome.";
      if (callOutcomeIsPtp && !callPtpDate.trim()) return "Please enter a PTP date.";
      if (callOutcomeIsPtp && !PTP_DATE_REGEX.test(callPtpDate.trim())) return "PTP date must be DD-MM-YYYY.";
      return null;
    }
    if (activeTab === "Monthly Feedback") {
      if (!feedbackCode) return "Please select a Feedback Code.";
      if (feedbackCode === "PTP" && !ptpDate.trim()) return "Please enter a PTP date.";
      if (feedbackCode === "PTP" && !PTP_DATE_REGEX.test(ptpDate.trim())) return "PTP date must be DD-MM-YYYY.";
      if (feedbackCode === "SFT" && !sftCity.trim()) return "Please enter the city customer shifted to.";
      return null;
    }
    if (activeTab === "Field Visit") {
      if (!visitOutcome) return "Please select a visit outcome.";
      if (!gps) return "GPS location is required. Tap 'Capture GPS' before saving.";
      if (visitOutcome === "PTP" && !visitPtpDate.trim()) return "PTP date is required when outcome is PTP.";
      if (visitOutcome === "PTP" && !PTP_DATE_REGEX.test(visitPtpDate.trim())) return "PTP date must be DD-MM-YYYY.";
      if (!visitRemarks.trim()) return "Visit remarks are required.";
      return null;
    }
    return null;
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const save = async () => {
    if (saveGuardRef.current || !caseItem) return;
    const error = validate();
    if (error) { Alert.alert("Validation Error", error); return; }
    saveGuardRef.current = true;
    setLoading(true);
    try {
      let payload: Record<string, unknown> = {};

      if (activeTab === "Call Log") {
        const newStatus = OUTCOME_TO_STATUS[callOutcome] ?? caseItem.status;
        payload = {
          status:       newStatus,
          call_outcome: callOutcome,
          call_comments: callComments.trim() || null,
          ...(callOutcomeIsPtp && { ptp_date: toIsoDate(callPtpDate.trim()) }),
          logged_at:    new Date().toISOString(),
        };
      } else if (activeTab === "Monthly Feedback") {
        // Determine status from code
        const newStatus = feedbackCode === "PAID" ? "Paid"
          : feedbackCode === "PTP" ? "PTP"
          : "Unpaid";
        payload = {
          status:             newStatus,
          feedback:           detailFeedback,
          comments:           comments.trim() || null,
          ptp_date:           feedbackCode === "PTP" ? toIsoDate(ptpDate.trim()) : null,
          feedback_code:      feedbackCode,
          projection:         projection || null,
          non_starter:        nonStarter,
          kyc_purchase:       kycPurchase,
          workable:           workable,
          monthly_feedback:   monthlyFeedback || "SUBMITTED",
          customer_available: customerAvailable,
          vehicle_available:  vehicleAvailable,
          third_party:        thirdParty,
          third_party_name:   thirdParty ? thirdPartyName   : null,
          third_party_number: thirdParty ? thirdPartyNumber : null,
          // NEW fields
          occupation:         occupation || null,
          sft_city:           feedbackCode === "SFT" ? sftCity.trim() || null : null,
        };
      } else if (activeTab === "Field Visit") {
        const newStatus =
          visitOutcome === "Paid" ? "Paid"
          : visitOutcome === "PTP" ? "PTP"
          : caseItem.status;

        await api.recordFieldVisit(caseItem.id, {
          lat: gps!.lat, lng: gps!.lng, accuracy: gps!.accuracy, case_type: "allocation",
          visit_outcome: visitOutcome || undefined,
          visit_remarks: visitRemarks.trim() || undefined,
          photo: photos.length > 0
            ? { uri: photos[0].uri, name: photos[0].fileName, mimeType: photos[0].mimeType }
            : undefined,
        });

        payload = {
          status:            newStatus,
          visit_outcome:     visitOutcome,
          visit_remarks:     visitRemarks.trim(),
          visit_location:    `${gps!.lat.toFixed(6)},${gps!.lng.toFixed(6)}`,
          visit_photo_count: photos.length,
          visited_at:        new Date().toISOString(),
          ...(visitOutcome === "PTP" && { ptp_date: toIsoDate(visitPtpDate.trim()) }),
        };
      }

      await api.updateFeedback(caseItem.id, payload);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["/api/cases"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      qc.invalidateQueries({ queryKey: ["/api/bkt-perf-summary"] });
      qc.invalidateQueries({ queryKey: ["/api/broken-ptps"] }); // re-check blocking after feedback

      // Capture share data BEFORE onClose() unmounts the modal and clears state
      const shareTab     = activeTab;
      const sharePhotoUri = photos.length > 0 ? photos[0].uri : null;
      const shareMsg =
        shareTab === "Field Visit"
          ? buildFieldVisitMsg(caseItem, visitOutcome, visitRemarks, gps)
          : shareTab === "Call Log"
          ? buildCallLogMsg(caseItem, callOutcome, callComments, callPtpDate)
          : null;

      onClose();

      if (shareMsg && shareTab === "Field Visit") {
        // Directly share to WhatsApp — no confirmation needed for agent
        setTimeout(() => shareFieldVisitWhatsApp(shareMsg, sharePhotoUri), 300);
      }

      if (shareMsg && shareTab === "Call Log") {
        // Directly share to WhatsApp — no confirmation needed for agent
        setTimeout(() => shareCallLogWhatsApp(shareMsg, sharePhotoUri), 300);
      }
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Something went wrong");
    } finally { setLoading(false); saveGuardRef.current = false; }
  };

  // ── Renderers ─────────────────────────────────────────────────────────────
  const renderCallOptions = (
    options: readonly string[], val: string, setVal: (v: string) => void, activeColor: string,
  ) => (
    <View style={{ gap: 8, marginBottom: 12 }}>
      {options.map((opt) => (
        <Pressable
          key={opt}
          style={[
            fbStyles.optionBtn,
            val === opt && { backgroundColor: activeColor + "20", borderColor: activeColor },
          ]}
          onPress={() => setVal(val === opt ? "" : opt)}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={[fbStyles.optionDot, val === opt && { backgroundColor: activeColor }]} />
            <Text style={[fbStyles.optionText, val === opt && { color: activeColor, fontWeight: "700" }]}>{opt}</Text>
          </View>
          {val === opt && <Ionicons name="checkmark-circle" size={20} color={activeColor} />}
        </Pressable>
      ))}
    </View>
  );

  const tabColor = (tab: FeedbackTab): string => {
    if (tab === "Monthly Feedback") return Colors.primary;
    if (tab === "Field Visit")      return Colors.accent ?? Colors.primary;
    return Colors.textSecondary;
  };

  const isMonthlyTabLocked = isMonthlyLocked && activeTab === "Monthly Feedback";

  const visitCanSave = !!visitOutcome && !!gps
    && (visitOutcome !== "PTP" || PTP_DATE_REGEX.test(visitPtpDate.trim()));

  const saveBtnColor = (): string => {
    if (activeTab === "Field Visit")
      return visitCanSave ? (VISIT_OUTCOME_COLORS[visitOutcome as VisitOutcome] ?? Colors.border) : Colors.border;
    return tabColor(activeTab);
  };

  // ── Monthly Feedback: full-sentence detail renderer ────────────────────────
  const renderDetailSentences = () => {
    if (!feedbackCode) {
      return (
        <View style={mfStyles.noCodeHint}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.textMuted} />
          <Text style={mfStyles.noCodeHintText}>Select a feedback code above first</Text>
        </View>
      );
    }
    if (detailSentences.length === 0) return null;
    return (
      <View style={{ gap: 6, marginBottom: 12 }}>
        {/* Code badge */}
        <View style={[mfStyles.codeBadge, { backgroundColor: activeFbColor + "18", borderColor: activeFbColor + "40" }]}>
          <Text style={[mfStyles.codeBadgeText, { color: activeFbColor }]}>
            {feedbackCode} — {activeFbMeta?.desc}
          </Text>
        </View>
        {detailSentences.map((sentence) => {
          const selected = detailFeedback === sentence;
          return (
            <Pressable
              key={sentence}
              style={[
                mfStyles.sentenceRow,
                selected && { borderColor: activeFbColor, backgroundColor: activeFbColor + "0D" },
              ]}
              onPress={() => setDetailFeedback(selected ? "" : sentence)}
            >
              <View style={[mfStyles.sentenceDot, selected && { backgroundColor: activeFbColor }]} />
              <Text style={[mfStyles.sentenceText, selected && { color: activeFbColor, fontWeight: "600" }]}>
                {sentence}
              </Text>
              {selected && <Ionicons name="checkmark-circle" size={18} color={activeFbColor} />}
            </Pressable>
          );
        })}
      </View>
    );
  };

  // ── Monthly Feedback: feedback code selector (full rows) ───────────────────
  const renderFbCodeRows = () => (
    <View style={{ gap: 6, marginBottom: 12 }}>
      {FEEDBACK_CODE_LIST.map(({ code, desc, color }) => {
        const selected = feedbackCode === code;
        return (
          <Pressable
            key={code}
            style={[
              mfStyles.fcRow,
              selected && { borderColor: color, backgroundColor: color + "0D" },
            ]}
            onPress={() => {
              const newCode = feedbackCode === code ? "" : code;
              setFeedbackCode(newCode);
              setDetailFeedback(""); // reset detail when code changes
              if (newCode !== "SFT") setSftCity("");
              if (newCode !== "PTP") setPtpDate("");
            }}
          >
            <View style={[mfStyles.fcDot, selected && { backgroundColor: color }]} />
            <View style={{ flex: 1 }}>
              <Text style={[mfStyles.fcName, selected && { color }]}>{code}</Text>
              <Text style={mfStyles.fcDesc}>{desc}</Text>
            </View>
            {selected && <Ionicons name="checkmark-circle" size={20} color={color} />}
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={fbStyles.overlay}>
        <View style={fbStyles.sheet}>
          <View style={fbStyles.handle} />
          <Text style={fbStyles.title}>Update Feedback</Text>
          <Text style={fbStyles.customerName}>
            {caseItem?.customer_name} · {caseItem?.loan_no}
          </Text>

          {/* Contact chips */}
          {phones.length > 0 && (
            <View style={fbStyles.numbersSection}>
              <Text style={fbStyles.numbersSectionLabel}>
                <Ionicons name="call-outline" size={12} color={Colors.textMuted} /> Contact Numbers
              </Text>
              <View style={fbStyles.numbersRow}>
                {phones.map((ph, i) => (
                  <Pressable
                    key={i} style={fbStyles.numberChip}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); Linking.openURL(`tel:${ph}`); }}
                  >
                    <Ionicons name="call" size={12} color="#fff" />
                    <Text style={fbStyles.numberChipText}>{ph}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* Case info chips */}
          {(fmtRaw(caseItem?.rollback) !== "—" || fmtRaw(caseItem?.clearance) !== "—") && (
            <View style={fbStyles.caseInfoRow}>
              {fmtRaw(caseItem?.rollback) !== "—" && (
                <View style={[fbStyles.caseInfoChip, { backgroundColor: Colors.info + "18" }]}>
                  <Text style={fbStyles.caseInfoLabel}>ROLLBACK</Text>
                  <Text style={[fbStyles.caseInfoValue, { color: Colors.info }]}>{fmtRaw(caseItem?.rollback)}</Text>
                </View>
              )}
              {fmtRaw(caseItem?.clearance) !== "—" && (
                <View style={[fbStyles.caseInfoChip, { backgroundColor: Colors.success + "18" }]}>
                  <Text style={fbStyles.caseInfoLabel}>CLEARANCE</Text>
                  <Text style={[fbStyles.caseInfoValue, { color: Colors.success }]}>{fmtRaw(caseItem?.clearance)}</Text>
                </View>
              )}
            </View>
          )}

          {/* Tab bar */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12, flexShrink: 0, flexGrow: 0 }}>
            <View style={{ flexDirection: "row", gap: 8, paddingRight: 8, alignItems: "flex-start" }}>
              {FEEDBACK_TABS.map((t) => {
                const isActive = activeTab === t;
                const isLocked = t === "Monthly Feedback" && isMonthlyLocked;
                const color    = tabColor(t);
                return (
                  <Pressable
                    key={t}
                    style={[
                      fbStyles.tabChip,
                      isActive && { backgroundColor: color, borderColor: color },
                      isLocked && !isActive && { borderColor: Colors.warning + "60", backgroundColor: Colors.warning + "10" },
                    ]}
                    onPress={() => {
                      if (t === "Monthly Feedback" && !isLocked && onMonthlyFeedbackRequest) {
                        onClose();
                        onMonthlyFeedbackRequest();
                      } else {
                        setActiveTab(t);
                      }
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                      {t === "Call Log"    && <Ionicons name="call-outline"     size={12} color={isActive ? "#fff" : Colors.textSecondary} />}
                      {t === "Field Visit" && <Ionicons name="location-outline" size={12} color={isActive ? "#fff" : Colors.textSecondary} />}
                      {isLocked           && <Ionicons name="lock-closed"       size={11} color={isActive ? "#fff" : Colors.warning} />}
                      <Text style={[fbStyles.tabChipText, isActive && { color: "#fff" }, isLocked && !isActive && { color: Colors.warning }]}>
                        {t}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {/* Tab content */}
          <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} keyboardShouldPersistTaps="handled">

            {/* ══ CALL LOG ══ */}
            {activeTab === "Call Log" && (
              <>
                <View style={fbStyles.tabHeaderRow}>
                  <View style={[fbStyles.tabHeaderIcon, { backgroundColor: Colors.textSecondary + "18" }]}>
                    <Ionicons name="call" size={16} color={Colors.textSecondary} />
                  </View>
                  <Text style={fbStyles.tabHeaderText}>Select the outcome of this call</Text>
                </View>
                <Text style={fbStyles.sectionLabel}>Call Outcome</Text>
                {renderCallOptions(CALL_LOG_OPTIONS, callOutcome, setCallOutcome, Colors.textSecondary)}
                {callOutcomeIsPtp && (
                  <>
                    <Text style={fbStyles.sectionLabel}>PTP Date</Text>
                    <TextInput
                      style={[fbStyles.textInput, { minHeight: 44, marginBottom: 12 }]}
                      placeholder="DD-MM-YYYY" placeholderTextColor={Colors.textMuted}
                      value={callPtpDate} onChangeText={setCallPtpDate}
                      keyboardType="numeric" maxLength={10}
                    />
                  </>
                )}
                <Text style={fbStyles.sectionLabel}>Comments (Optional)</Text>
                <TextInput
                  style={fbStyles.textInput} placeholder="What happened on this call..."
                  placeholderTextColor={Colors.textMuted} value={callComments}
                  onChangeText={setCallComments} multiline numberOfLines={3}
                />
              </>
            )}

            {/* ══ MONTHLY FEEDBACK ══ */}
            {activeTab === "Monthly Feedback" && (
              isMonthlyLocked ? (
                <LockedFeedbackView item={caseItem!} />
              ) : null
            )}

            {/* ══ FIELD VISIT ══ */}
            {activeTab === "Field Visit" && (
              <>
                <View style={fvStyles.amountRow}>
                  <View style={fvStyles.amountChip}>
                    <Text style={fvStyles.amountLabel}>EMI DUE</Text>
                    <Text style={[fvStyles.amountValue, { color: Colors.danger }]}>{fmt(caseItem?.emi_due, "₹")}</Text>
                  </View>
                  <View style={fvStyles.amountChip}>
                    <Text style={fvStyles.amountLabel}>POS</Text>
                    <Text style={fvStyles.amountValue}>{fmt(caseItem?.pos, "₹")}</Text>
                  </View>
                  <View style={[fvStyles.amountChip, { flex: 1.4 }]}>
                    <Text style={fvStyles.amountLabel}>ADDRESS</Text>
                    <Text style={[fvStyles.amountValue, { fontSize: 11 }]} numberOfLines={2}>
                      {caseItem?.address ?? caseItem?.city ?? "—"}
                    </Text>
                  </View>
                </View>

                {/* GPS */}
                <View style={fvStyles.sectionRow}>
                  <Text style={fvStyles.sectionLabel}>GPS Location</Text>
                  <View style={fvStyles.requiredBadge}><Text style={fvStyles.requiredText}>Required</Text></View>
                </View>
                <Pressable
                  style={[fvStyles.locationBtn, gps && fvStyles.locationBtnCaptured, locLoading && fvStyles.locationBtnLoading]}
                  onPress={captureGps} disabled={locLoading || loading}
                >
                  {locLoading
                    ? <ActivityIndicator size="small" color={Colors.primary} />
                    : <Ionicons name={gps ? "checkmark-circle" : "locate"} size={20} color={gps ? Colors.success : Colors.primary} />
                  }
                  <View style={{ flex: 1 }}>
                    <Text style={[fvStyles.locationBtnText, gps && { color: Colors.success, fontWeight: "700" }]}>
                      {locLoading ? "Acquiring GPS signal…" : gps ? `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}` : "Tap to capture current location"}
                    </Text>
                    {gps && <Text style={fvStyles.locationAccuracy}>Accuracy: ±{gps.accuracy}m</Text>}
                  </View>
                  {gps ? (
                    <Pressable style={fvStyles.reCaptureBtnSmall} onPress={captureGps} disabled={locLoading || loading}>
                      <Ionicons name="refresh" size={14} color={Colors.primary} />
                      <Text style={fvStyles.reCaptureText}>Re-capture</Text>
                    </Pressable>
                  ) : (
                    !locLoading && <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                  )}
                </Pressable>

                {/* Visit Outcome */}
                <View style={fvStyles.sectionRow}>
                  <Text style={fvStyles.sectionLabel}>Visit Outcome</Text>
                  <View style={fvStyles.requiredBadge}><Text style={fvStyles.requiredText}>Required</Text></View>
                </View>
                <View style={{ gap: 8, marginBottom: 16 }}>
                  {VISIT_OUTCOMES.map((opt) => {
                    const color = VISIT_OUTCOME_COLORS[opt];
                    const isSelected = visitOutcome === opt;
                    return (
                      <Pressable
                        key={opt}
                        style={[fvStyles.outcomeBtn, isSelected && { backgroundColor: color + "18", borderColor: color, borderWidth: 2 }]}
                        onPress={() => { setVisitOutcome(isSelected ? "" : opt); setVisitPtpDate(""); }}
                        disabled={loading}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                          <View style={[fvStyles.outcomeDot, { backgroundColor: isSelected ? color : Colors.border }]} />
                          <Text style={[fvStyles.outcomeText, isSelected && { color, fontWeight: "700" }]}>{opt}</Text>
                        </View>
                        {isSelected && <Ionicons name="checkmark-circle" size={22} color={color} />}
                      </Pressable>
                    );
                  })}
                </View>

                {visitOutcome === "PTP" && (
                  <>
                    <View style={fvStyles.sectionRow}>
                      <Text style={fvStyles.sectionLabel}>PTP Date</Text>
                      <View style={fvStyles.requiredBadge}><Text style={fvStyles.requiredText}>Required</Text></View>
                    </View>
                    <TextInput
                      style={[fvStyles.input, visitPtpDate && !PTP_DATE_REGEX.test(visitPtpDate) && fvStyles.inputError]}
                      placeholder="DD-MM-YYYY" placeholderTextColor={Colors.textMuted}
                      value={visitPtpDate} onChangeText={setVisitPtpDate}
                      keyboardType="numeric" maxLength={10} editable={!loading}
                    />
                    {visitPtpDate && !PTP_DATE_REGEX.test(visitPtpDate) && (
                      <Text style={fvStyles.fieldError}>Enter date as DD-MM-YYYY</Text>
                    )}
                  </>
                )}

                <View style={fvStyles.sectionRow}>
                  <Text style={fvStyles.sectionLabel}>Visit Remarks</Text>
                  <View style={fvStyles.requiredBadge}><Text style={fvStyles.requiredText}>Optional</Text></View>
                </View>
                <TextInput
                  style={[fvStyles.input, { minHeight: 90, textAlignVertical: "top" },
                    visitRemarks.trim().length > 0 && visitRemarks.trim().length < 10 && fvStyles.inputError]}
                  placeholder="Describe what happened — customer status, conversation outcome, address confirmed, etc."
                  placeholderTextColor={Colors.textMuted} value={visitRemarks} onChangeText={setVisitRemarks}
                  multiline numberOfLines={4} editable={!loading}
                />

                <Text style={fvStyles.sectionLabel}>
                  Photo Proof{" "}
                  <Text style={fvStyles.sectionOptional}>({photos.length}/{MAX_PHOTOS} · optional)</Text>
                </Text>
                {photoError ? <Text style={fvStyles.fieldError}>{photoError}</Text> : null}
                <View style={fvStyles.photoGrid}>
                  {photos.map((photo, i) => (
                    <View key={i} style={fvStyles.photoThumb}>
                      <Image source={{ uri: photo.uri }} style={fvStyles.photoImg} resizeMode="cover" />
                      {!loading && (
                        <Pressable style={fvStyles.photoRemoveBtn} onPress={() => removePhoto(i)}>
                          <View style={fvStyles.photoRemoveBg}><Ionicons name="close" size={12} color="#fff" /></View>
                        </Pressable>
                      )}
                      <View style={fvStyles.photoIndexBadge}>
                        <Text style={fvStyles.photoIndexText}>{i + 1}</Text>
                      </View>
                    </View>
                  ))}
                  {photos.length < MAX_PHOTOS && !loading && (
                    <Pressable style={fvStyles.photoAddBtn} onPress={pickPhoto}>
                      <Ionicons name="camera-outline" size={24} color={Colors.textMuted} />
                      <Text style={fvStyles.photoAddText}>Add Photo</Text>
                    </Pressable>
                  )}
                </View>

                {!visitCanSave && (visitOutcome || gps || visitRemarks) && (
                  <View style={fvStyles.validationBox}>
                    <Ionicons name="information-circle-outline" size={15} color={Colors.warning} />
                    <Text style={fvStyles.validationText}>
                      {!visitOutcome ? "Select a visit outcome."
                        : !gps ? "Capture GPS location."
                        : visitOutcome === "PTP" && !PTP_DATE_REGEX.test(visitPtpDate)
                            ? "Enter PTP date as DD-MM-YYYY." : ""}
                    </Text>
                  </View>
                )}
              </>
            )}

            <View style={{ height: 16 }} />
          </ScrollView>

          {/* Action buttons */}
          <View style={fbStyles.btnRow}>
            <Pressable style={fbStyles.cancelBtn} onPress={onClose}>
              <Text style={fbStyles.cancelText}>{isMonthlyTabLocked ? "Close" : "Cancel"}</Text>
            </Pressable>
            {!isMonthlyTabLocked && (
              <Pressable
                style={[
                  fbStyles.saveBtn,
                  { backgroundColor: saveBtnColor(), opacity: loading ? 0.8 : 1 },
                  activeTab === "Field Visit" && !visitCanSave && { backgroundColor: Colors.border },
                ]}
                onPress={save}
                disabled={loading || (activeTab === "Field Visit" && !visitCanSave)}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : activeTab === "Field Visit" ? (
                  <>
                    <Ionicons name="location" size={16} color={visitCanSave ? "#fff" : Colors.textMuted} />
                    <Text style={[fbStyles.saveText, !visitCanSave && { color: Colors.textMuted }]}>Save Visit</Text>
                  </>
                ) : activeTab === "Call Log" ? (
                  <>
                    <Ionicons name="call" size={16} color="#fff" />
                    <Text style={fbStyles.saveText}>Log Call</Text>
                  </>
                ) : (
                  <Text style={fbStyles.saveText}>Save</Text>
                )}
              </Pressable>
            )}
          </View>
          <View style={{ height: 24 }} />
        </View>
      </View>
    </Modal>
  );
}

// ─── CaseCard ─────────────────────────────────────────────────────────────────
interface CaseCardProps { item: CaseItem; onOpenModal: (item: CaseItem, tab: FeedbackTab) => void; isBrokenPtp?: boolean; }

function CaseCard({ item, onOpenModal, isBrokenPtp = false }: CaseCardProps) {
  const [callPickerVisible, setCallPickerVisible] = useState(false);
  const phones: string[] = (item.mobile_no ?? "").split(",").map((p) => p.trim()).filter(Boolean);

  const call = () => {
    if (!phones.length) { Alert.alert("No number available"); return; }
    if (phones.length === 1) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); Linking.openURL(`tel:${phones[0]}`); }
    else { setCallPickerVisible(true); }
  };

  const isMonthlyLocked = !!item.monthly_feedback;
  const primaryPhone    = phones[0] ?? "";

  return (
    <Pressable style={[styles.card, isBrokenPtp && styles.cardBrokenPtp]} onPress={() => navigateToDetail(item, isBrokenPtp)}>
      <View style={styles.cardHeader}>
        <View style={styles.cardNameRow}>
          <Ionicons name="person" size={16} color={Colors.textSecondary} />
          <Text style={styles.cardName} numberOfLines={1}>{item.customer_name}</Text>
        </View>
        <View style={styles.bucketBadge}>
          {isMonthlyLocked && <Ionicons name="lock-closed" size={10} color={Colors.warning} style={{ marginRight: 3 }} />}
          <Text style={styles.bucketText}>Bucket: {item.bkt ?? "—"}</Text>
        </View>
      </View>
      <View style={styles.metaRow}>
        <Ionicons name="briefcase" size={14} color={Colors.textSecondary} />
        <Text style={styles.metaText} numberOfLines={1}>{item.loan_no}</Text>
      </View>
      {item.company_name ? (
        <View style={styles.metaRow}>
          <Ionicons name="business" size={14} color={Colors.textSecondary} />
          <Text style={styles.metaText} numberOfLines={1}>{item.company_name}</Text>
        </View>
      ) : null}
      {primaryPhone ? (
        <View style={styles.metaRow}>
          <Ionicons name="call" size={14} color={Colors.textSecondary} />
          <Text style={styles.metaText}>{primaryPhone}</Text>
        </View>
      ) : null}
      {item.ptp_date ? (
        <View style={styles.ptpDateRow}>
          <Ionicons name="calendar" size={12} color={Colors.statusPTP} />
          <Text style={styles.ptpDateText}>PTP: {String(item.ptp_date).slice(0, 10)}</Text>
        </View>
      ) : null}
      {item.monthly_feedback && item.monthly_feedback !== "SUBMITTED" ? (
        <View style={styles.monthlyFeedbackRow}>
          <Ionicons name="calendar-outline" size={12} color={Colors.primary} />
          <Text style={styles.monthlyFeedbackText}>{item.monthly_feedback}</Text>
        </View>
      ) : null}
      <View style={styles.cardActions}>
        <Pressable style={[styles.actionBtn, styles.callBtn]} onPress={(e) => { e.stopPropagation?.(); call(); }}>
          <Ionicons name="call" size={15} color="#fff" />
          <Text style={styles.actionBtnText}>Call</Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, styles.feedbackBtn]} onPress={(e) => { e.stopPropagation?.(); onOpenModal(item, "Call Log"); }}>
          <Ionicons name="create" size={15} color="#fff" />
          <Text style={styles.actionBtnText}>Feedback</Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, styles.visitBtn]} onPress={(e) => { e.stopPropagation?.(); onOpenModal(item, "Field Visit"); }}>
          <Ionicons name="location" size={15} color="#fff" />
          <Text style={styles.actionBtnText}>Visit</Text>
        </Pressable>
      </View>
      <CallPickerModal visible={callPickerVisible} phones={phones} onClose={() => setCallPickerVisible(false)} />
    </Pressable>
  );
}

// ─── AllocationScreen ─────────────────────────────────────────────────────────
export default function AllocationScreen() {
  const insets = useSafeAreaInsets();
  const qc     = useQueryClient();

  // When navigated from blocking modal, brokenPtpIds contains the case ids to focus
  const { brokenPtpIds } = useLocalSearchParams<{ brokenPtpIds?: string }>();
  const brokenPtpIdSet = useMemo(() => {
    if (!brokenPtpIds) return new Set<number>();
    return new Set(brokenPtpIds.split(",").map(Number).filter(Boolean));
  }, [brokenPtpIds]);
  const isBrokenPtpMode = brokenPtpIdSet.size > 0;

  const [activeTab,     setActiveTab]     = useState<StatusTab>("All");
  const [activeCompany, setActiveCompany] = useState<string>("All");
  const [search,        setSearch]        = useState("");
  const [modalItem,     setModalItem]     = useState<CaseItem | null>(null);
  const [modalInitTab,  setModalInitTab]  = useState<FeedbackTab>("Call Log");
  const [monthlyStepperItem, setMonthlyStepperItem] = useState<CaseItem | null>(null);
  const [downloading,   setDownloading]   = useState(false);

  const { data: companiesData, isLoading: companiesLoading } = useQuery({
    queryKey: ["/api/companies"],
    queryFn:  () => api.getCompanies(),
  });
  const companies: string[] = ["All", ...(companiesData?.companies ?? []).filter((c: string) => !!c)];

  const { data, isLoading } = useQuery({
    queryKey: ["/api/cases", activeCompany],
    queryFn:  () => api.getCases({ company: activeCompany === "All" ? undefined : activeCompany }),
  });

  const { data: bktData } = useQuery({
    queryKey: ["/api/bkt-cases", activeCompany],
    queryFn:  () => api.getBktCases({ company: activeCompany === "All" ? undefined : activeCompany }),
    staleTime: 60_000,
  });

  const allCases: CaseItem[]    = data?.cases     ?? [];
  const allBktCases: CaseItem[] = bktData?.cases  ?? [];

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    // When navigated from blocking modal — show ONLY broken PTP cases first, then rest
    if (isBrokenPtpMode && !q && activeTab === "All") {
      const broken = allCases.filter((c) => brokenPtpIdSet.has(c.id));
      const rest   = allCases.filter((c) => !brokenPtpIdSet.has(c.id));
      return [...broken, ...rest];
    }
    return allCases
      .filter((c) => activeTab === "All" || c.status === activeTab)
      .filter((c) =>
        !q ||
        c.customer_name?.toLowerCase().includes(q) ||
        c.loan_no?.toLowerCase().includes(q)        ||
        c.app_id?.toLowerCase().includes(q)         ||
        c.registration_no?.toLowerCase().includes(q)
      );
  }, [allCases, activeTab, search, isBrokenPtpMode, brokenPtpIdSet]);

  const counts = useMemo(() => ({
    All:    allCases.length,
    Unpaid: allCases.filter((c) => c.status === "Unpaid").length,
    PTP:    allCases.filter((c) => c.status === "PTP").length,
    Paid:   allCases.filter((c) => c.status === "Paid").length,
  }), [allCases]);

  const handleDownload = useCallback(async () => {
    if (!allCases.length) { Alert.alert("No Cases", "There are no cases to download."); return; }
    setDownloading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const date = new Date().toISOString().slice(0, 10);
      const company = activeCompany !== "All" ? `_${activeCompany.replace(/\s+/g, "_")}` : "";
      const tab = activeTab !== "All" ? `_${activeTab}` : "";
      const filename = `allocation${company}${tab}_${date}.csv`;
      // Download currently visible (filtered) cases, or all if no filter
      const toExport = filtered.length > 0 ? filtered : allCases;
      await downloadAllocationCsv(toExport, filename);
    } catch (e: unknown) {
      Alert.alert("Download Failed", e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setDownloading(false);
    }
  }, [allCases, filtered, activeCompany, activeTab]);

  const handleOpenModal = useCallback((item: CaseItem, tab: FeedbackTab) => {
    setModalItem(item); setModalInitTab(tab);
  }, []);


  return (
    <View style={{ flex: 1, backgroundColor: "#EFEFEF" }}>
      {!companiesLoading && companies.length > 1 && (
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, flexShrink: 0, backgroundColor: Colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border }}
          contentContainerStyle={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10 }}
        >
          {companies.map((c, idx) => (
            <Pressable
              key={c}
              style={{ paddingHorizontal: 20, paddingVertical: 9, borderRadius: 20, marginRight: idx < companies.length - 1 ? 8 : 0, backgroundColor: activeCompany === c ? Colors.primary : "#FFFFFF", borderWidth: 1.5, borderColor: activeCompany === c ? Colors.primary : "#AAAAAA", alignSelf: "center" }}
              onPress={() => { setActiveCompany(c); setActiveTab("All"); }}
            >
              <Text style={{ fontSize: 14, fontWeight: "700", color: activeCompany === c ? "#FFFFFF" : "#111111" }}>{c}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <View style={[styles.tabsContainer, { paddingTop: 12 }]}>
        {STATUS_TABS.map((tab) => (
          <Pressable
            key={tab}
            style={[styles.tab, activeTab === tab && [styles.tabActive, { backgroundColor: STATUS_COLORS[tab] ?? Colors.primary }]]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
            <View style={[styles.tabCount, activeTab === tab && { backgroundColor: "rgba(255,255,255,0.3)" }]}>
              <Text style={[styles.tabCountText, activeTab === tab && { color: "#fff" }]}>{counts[tab]}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color={Colors.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput} placeholder="Search name, loan no, app id, reg no..."
            placeholderTextColor={Colors.textMuted} value={search} onChangeText={setSearch}
          />
          {search ? <Pressable onPress={() => setSearch("")}><Ionicons name="close-circle" size={18} color={Colors.textMuted} /></Pressable> : null}
        </View>
        <Pressable
          style={[styles.downloadBtn, (downloading || isLoading) && { opacity: 0.5 }]}
          onPress={handleDownload}
          disabled={downloading || isLoading}
        >
          {downloading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="download-outline" size={20} color="#fff" />
          }
        </Pressable>
      </View>

      {isBrokenPtpMode && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FEE2E2", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#FECACA" }}>
          <Ionicons name="warning" size={16} color="#E24B4A" />
          <Text style={{ flex: 1, fontSize: 12, color: "#991B1B", fontWeight: "700" }}>
            {brokenPtpIdSet.size} broken PTP{brokenPtpIdSet.size > 1 ? "s" : ""} highlighted below — update them to unlock the app
          </Text>
        </View>
      )}

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <CaseCard item={item} onOpenModal={handleOpenModal} isBrokenPtp={brokenPtpIdSet.has(item.id)} />}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }, filtered.length === 0 && { flex: 1 }]}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>{activeTab === "All" ? "No cases" : `No ${activeTab} cases`}</Text>
            </View>
          }
          scrollEnabled={filtered.length > 0}
        />
      )}

      {modalItem && (
        <FeedbackModal
          visible={!!modalItem} caseItem={modalItem}
          isMonthlyLocked={!!modalItem.monthly_feedback}
          initialTab={modalInitTab}
          onClose={() => setModalItem(null)}
          onMonthlyFeedbackRequest={() => {
            const item = modalItem;
            setModalItem(null);
            setMonthlyStepperItem(item);
          }}
        />
      )}

      {monthlyStepperItem && (
        <MonthlyFeedbackStepper
          visible={!!monthlyStepperItem}
          onClose={() => setMonthlyStepperItem(null)}
          onCallLog={() => {
              const item = monthlyStepperItem;
              setMonthlyStepperItem(null);
              setTimeout(() => { setModalItem(item); setModalInitTab("Call Log"); }, 50);
            }}
          onFieldVisit={() => {
              const item = monthlyStepperItem;
              setMonthlyStepperItem(null);
              setTimeout(() => { setModalItem(item); setModalInitTab("Field Visit"); }, 50);
            }}
          currentCaseName={monthlyStepperItem.customer_name ?? ""}
          currentCaseId={monthlyStepperItem.loan_no ?? ""}
          onSave={async (data) => {
            const caseType = (monthlyStepperItem as any).case_type === "bkt" ? "bkt" : "loan";
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
            if (caseType === "bkt") await api.updateBktFeedback(monthlyStepperItem.id, payload);
            else await api.updateFeedback(monthlyStepperItem.id, payload);
            qc.invalidateQueries({ queryKey: ["/api/cases"] });
            qc.invalidateQueries({ queryKey: ["/api/bkt-cases"] });
            qc.invalidateQueries({ queryKey: ["/api/stats"] });
            qc.invalidateQueries({ queryKey: ["/api/broken-ptps"] });
            setMonthlyStepperItem(null);
          }}
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
  searchRow:           { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 12, marginVertical: 12 },
  searchContainer:     { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: Colors.border },
  searchInput:         { flex: 1, fontSize: 14, color: Colors.text },
  downloadBtn:         { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 3 },
  list:                { padding: 12, gap: 10 },
  cardBrokenPtp:       { borderWidth: 2, borderColor: "#E24B4A", shadowColor: "#E24B4A", shadowOpacity: 0.2, shadowRadius: 6, elevation: 4 },
  card:                { backgroundColor: "#fff", borderRadius: 14, padding: 14, gap: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3 },
  cardHeader:          { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  cardNameRow:         { flex: 1, flexDirection: "row", alignItems: "center", gap: 7 },
  cardName:            { flex: 1, fontSize: 14, fontWeight: "700", color: "#111", textTransform: "uppercase", letterSpacing: 0.2 },
  bucketBadge:         { flexDirection: "row", alignItems: "center", backgroundColor: "#f0f0f0", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 },
  bucketText:          { fontSize: 11, fontWeight: "600", color: "#555" },
  metaRow:             { flexDirection: "row", alignItems: "center", gap: 7 },
  metaText:            { fontSize: 13, color: "#444", fontWeight: "500" },
  ptpDateRow:          { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: Colors.statusPTP + "12", borderRadius: 7, paddingHorizontal: 9, paddingVertical: 4, alignSelf: "flex-start" },
  ptpDateText:         { fontSize: 12, color: Colors.statusPTP, fontWeight: "600" },
  monthlyFeedbackRow:  { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: Colors.primary + "10", borderRadius: 7, paddingHorizontal: 9, paddingVertical: 4, alignSelf: "flex-start" },
  monthlyFeedbackText: { fontSize: 12, color: Colors.primary, fontWeight: "600" },
  cardActions:         { flexDirection: "row", gap: 8, marginTop: 6 },
  actionBtn:           { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 11, borderRadius: 10, gap: 5 },
  callBtn:             { backgroundColor: "#2DB56C" },
  feedbackBtn:         { backgroundColor: "#3B82F6" },
  visitBtn:            { backgroundColor: "#8B5CF6" },
  actionBtnText:       { color: "#fff", fontSize: 13, fontWeight: "700" },
  empty:               { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText:           { fontSize: 16, color: Colors.textMuted },
});

const fbStyles = StyleSheet.create({
  overlay:             { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet:               { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingTop: 20, maxHeight: "94%", flex: 1, flexDirection: "column" },
  handle:              { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: "center", marginBottom: 12 },
  title:               { fontSize: 18, fontWeight: "700", color: Colors.text, marginBottom: 2 },
  customerName:        { fontSize: 12, color: Colors.textSecondary, marginBottom: 6, textTransform: "uppercase" },
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
  chipWrapRow:         { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  tabChip:             { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.border },
  tabChipText:         { fontSize: 13, fontWeight: "600", color: Colors.text, fontFamily: Platform.OS === "android" ? "Roboto" : undefined },
  feedbackOption:      { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt },
  feedbackOptionText:  { fontSize: 14, fontWeight: "600", color: Colors.text },
  optionBtn:           { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt, marginBottom: 4 },
  optionDot:           { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.border },
  optionText:          { fontSize: 14, fontWeight: "600", color: Colors.text, flex: 1 },
  textInput:           { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 12, fontSize: 14, color: Colors.text, minHeight: 80, textAlignVertical: "top", backgroundColor: Colors.surfaceAlt, marginBottom: 12 },
  btnRow:              { flexDirection: "row", gap: 12, marginTop: 8 },
  cancelBtn:           { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, alignItems: "center" },
  cancelText:          { fontSize: 15, fontWeight: "600", color: Colors.textSecondary },
  saveBtn:             { flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 7 },
  saveText:            { fontSize: 15, fontWeight: "700", color: "#fff" },
  numbersSection:      { marginBottom: 8 },
  numbersSectionLabel: { fontSize: 11, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase", marginBottom: 6 },
  numbersRow:          { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  numberChip:          { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, alignSelf: "flex-start" },
  numberChipText:      { color: "#fff", fontWeight: "700", fontSize: 13 },
  tabHeaderRow:        { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16, backgroundColor: Colors.surfaceAlt, borderRadius: 12, padding: 12 },
  tabHeaderIcon:       { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  tabHeaderText:       { fontSize: 13, color: Colors.textSecondary, fontWeight: "600", flex: 1 },
});

// ── Monthly Feedback extra styles ─────────────────────────────────────────────
const mfStyles = StyleSheet.create({
  // Occupation chips
  occChips:       { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 12 },
  occChip:        { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt },
  occChipText:    { fontSize: 12, fontWeight: "500", color: Colors.text },

  // Feedback code rows
  fcRow:          { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt, marginBottom: 6 },
  fcDot:          { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.border },
  fcName:         { fontSize: 13, fontWeight: "700", color: Colors.text },
  fcDesc:         { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },

  // Code badge above detail sentences
  codeBadge:      { flexDirection: "row", alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, marginBottom: 8 },
  codeBadgeText:  { fontSize: 11, fontWeight: "600" },

  // Full-sentence option rows
  sentenceRow:    { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 12, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt, marginBottom: 6 },
  sentenceDot:    { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.border, marginTop: 3, flexShrink: 0 },
  sentenceText:   { flex: 1, fontSize: 13, color: Colors.text, lineHeight: 20 },

  // No code selected hint
  noCodeHint:     { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.surfaceAlt, borderRadius: 10, padding: 12, marginBottom: 12 },
  noCodeHintText: { fontSize: 12, color: Colors.textMuted },
});

const fvStyles = StyleSheet.create({
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
});

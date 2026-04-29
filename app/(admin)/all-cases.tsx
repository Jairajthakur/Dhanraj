import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  Modal,
  ScrollView,
  Linking,
  Platform,
  Alert,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { api, tokenStore } from "@/lib/api";
import { getApiUrl } from "@/lib/query-client";
import { ReassignCaseModal } from "@/components/ReassignCaseModal";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
// WebView is native-only; on web we use an iframe instead
const HtmlPreview = ({ html }: { html: string }) => {
  if (Platform.OS === "web") {
    // On web: render HTML in a sandboxed iframe via a blob URL
    const [src, setSrc] = React.useState("");
    React.useEffect(() => {
      const blob = new Blob([html], { type: "text/html" });
      const url  = URL.createObjectURL(blob);
      setSrc(url);
      return () => URL.revokeObjectURL(url);
    }, [html]);
    return (
      <iframe
        src={src}
        style={{ flex: 1, border: "none", width: "100%", height: "100%", background: "#fff" } as any}
        sandbox="allow-same-origin"
        title="Letter Preview"
      />
    );
  }
  // Native: use react-native-webview
  const { WebView } = require("react-native-webview");
  return (
    <WebView
      source={{ html, baseUrl: "" }}
      style={{ flex: 1, backgroundColor: "#fff" }}
      scrollEnabled
      originWhitelist={["*"]}
    />
  );
};

const STATUS_COLORS: Record<string, string> = {
  Unpaid: Colors.statusUnpaid,
  PTP:    Colors.statusPTP,
  Paid:   Colors.statusPaid,
};

// ── Company color palette (cycles through these) ──────────────────────────────
const COMPANY_COLORS = [
  { bg: "#eeedfe", border: "#afa9ec", text: "#534ab7" },
  { bg: "#e1f5ee", border: "#5dcaa5", text: "#0f6e56" },
  { bg: "#faeeda", border: "#ef9f27", text: "#854f0b" },
  { bg: "#faece7", border: "#f0997b", text: "#993c1d" },
  { bg: "#e6f1fb", border: "#85b7eb", text: "#185fa5" },
  { bg: "#fbeaf0", border: "#ed93b1", text: "#993556" },
];

const companyColorCache: Record<string, typeof COMPANY_COLORS[0]> = {};
let companyColorIdx = 0;

function getCompanyColor(name: string) {
  if (!name) return COMPANY_COLORS[0];
  if (!companyColorCache[name]) {
    companyColorCache[name] = COMPANY_COLORS[companyColorIdx % COMPANY_COLORS.length];
    companyColorIdx++;
  }
  return companyColorCache[name];
}

function fmt(v: any, prefix = "") {
  if (v === null || v === undefined || v === "") return "";
  const n = parseFloat(v);
  if (!isNaN(n) && prefix)
    return prefix + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return String(v);
}
function fmtDate(v: any): string {
  if (!v) return "";
  return String(v).slice(0, 10);
}
function fmtBool(v: any): string {
  if (v === true || v === "true" || v === "t") return "Yes";
  if (v === false || v === "false" || v === "f") return "No";
  return "";
}

function TableRow({
  label, value, phone, even,
}: {
  label: string; value?: any; phone?: boolean; even?: boolean;
}) {
  const display =
    value !== null && value !== undefined && value !== ""
      ? String(value)
      : "—";
  return (
    <View style={[detailStyles.row, even && { backgroundColor: Colors.surfaceAlt }]}>
      <View style={detailStyles.labelCell}>
        <Text style={detailStyles.labelText}>{label}</Text>
      </View>
      <View style={detailStyles.valueCell}>
        {phone && display !== "—" ? (
          <Pressable onPress={() => Linking.openURL(`tel:${display.split(",")[0].trim()}`)}>
            <Text style={[detailStyles.valueText, { color: Colors.info, textDecorationLine: "underline" }]}>
              {display}
            </Text>
          </Pressable>
        ) : (
          <Text style={detailStyles.valueText}>{display}</Text>
        )}
      </View>
    </View>
  );
}

// ── Company Badge ─────────────────────────────────────────────────────────────
function CompanyBadge({ name }: { name?: string | null }) {
  if (!name) return null;
  const c = getCompanyColor(name);
  return (
    <View style={[styles.companyTag, { backgroundColor: c.bg, borderColor: c.border }]}>
      <View style={[styles.companyDot, { backgroundColor: c.text }]} />
      <Text style={[styles.companyTagText, { color: c.text }]} numberOfLines={1}>{name}</Text>
    </View>
  );
}

// ── Shared download helper ────────────────────────────────────────────────
async function downloadIntimation(
  endpoint: string,
  format: "pdf" | "docx",
  fileName: string,
  body: object,
) {
  const token = await tokenStore.get();
  const url   = new URL(endpoint, getApiUrl()).toString();
  const res   = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to generate document");

  if (Platform.OS === "web") {
    const blob    = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a       = document.createElement("a");
    a.href = blobUrl; a.download = fileName; a.click();
    URL.revokeObjectURL(blobUrl);
  } else {
    const arrayBuf = await res.arrayBuffer();
    const base64   = btoa(
      new Uint8Array(arrayBuf).reduce((s, b) => s + String.fromCharCode(b), ""),
    );
    const mime = format === "pdf"
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const fileUri = FileSystem.cacheDirectory + fileName;
    await FileSystem.writeAsStringAsync(fileUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, { mimeType: mime, dialogTitle: "Save " + fileName });
    } else {
      Alert.alert("Saved", "File saved to: " + fileUri);
    }
  }
}

// ── Letter HTML builders (mirrors server templates exactly) ───────────────
function buildPreHtml(p: {
  date: string; police_station: string; tq: string;
  customer_name: string; address: string; app_id: string; loan_no: string;
  registration_no: string; asset_make: string; engine_no: string; chassis_no: string;
}): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #000; padding: 28px 32px; line-height: 1.65; background: #fff; }
    .title { text-align: center; font-size: 15px; font-weight: bold; margin-bottom: 6px; }
    .divider { border: none; border-top: 1.5px solid #888; margin: 8px 0 14px; }
    .date { font-weight: bold; margin-bottom: 14px; }
    .to-block { margin-left: 24px; margin-bottom: 12px; }
    .to-block p { margin-bottom: 2px; }
    .subject { margin-bottom: 12px; }
    .body-text { margin-bottom: 10px; text-align: justify; }
    .details-table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 12px; }
    .details-table tr:nth-child(even) { background-color: #f5f5f5; }
    .details-table td { padding: 5px 8px; border: 1px solid #ccc; vertical-align: top; }
    .details-table td:first-child { width: 46%; color: #333; }
    .details-table td:last-child { font-weight: bold; }
    .footer { margin-top: 18px; text-align: center; font-size: 11px; border-top: 1px solid #ccc; padding-top: 7px; font-weight: bold; }
    .signature { margin-top: 36px; }
  </style>
</head>
<body>
  <p class="title">Pre Repossession Intimation to Police Station</p>
  <hr class="divider">
  <p class="date">Date :- ${p.date}</p>
  <div class="to-block">
    <p>To,</p>
    <p>The Senior Inspector,</p>
    <p><strong>${p.police_station},</strong></p>
    <p>TQ. ${p.tq}&nbsp;&nbsp;&nbsp;Dist. Nanded</p>
  </div>
  <div class="subject">
    <p><strong>Sub :</strong> Pre intimation of repossession of the vehicle from <strong>${p.customer_name}</strong></p>
    <p>(Borrower) residing <strong>${p.address}</strong></p>
  </div>
  <p class="body-text"><strong>Respected Sir,</strong></p>
  <p class="body-text">The afore mentioned borrower has taken a loan from Hero Fin-Corp Limited ("Company") for the purchase of the Vehicle having the below mentioned details and further the Borrower hypothecated the said vehicle to the Company in terms of loan-cum-hypothecation agreement executed between the borrower and the Company.</p>
  <table class="details-table">
    <tr><td>Name of the Borrower</td><td>${p.customer_name}</td></tr>
    <tr><td>Address of Borrower</td><td>${p.address}</td></tr>
    <tr><td>App ID</td><td>${p.app_id}</td></tr>
    <tr><td>Loan cum Hypothecation Agreement No.</td><td>${p.loan_no}</td></tr>
    <tr><td>Date</td><td>${p.date}</td></tr>
    <tr><td>Vehicle Registration No.</td><td>${p.registration_no}</td></tr>
    <tr><td>Model Make</td><td>${p.asset_make}</td></tr>
    <tr><td>Engine No.</td><td>${p.engine_no}</td></tr>
    <tr><td>Chassis No.</td><td>${p.chassis_no}</td></tr>
  </table>
  <p class="body-text">The Borrower has committed default on the scheduled payment of the Monthly Payments and/or other charges payable on the loan obtained by the Borrower from the Company in terms of the provisions of the aforesaid loan-cum-hypothecation agreement. In spite of Company's requests and reminders, the Borrower has not remitted the outstanding dues; as a result of which the company was left with no option but to enforce the terms and conditions of the said agreement. Under the said agreement, the said Borrower has specifically authorized Company or any of its authorized persons to take charge/repossession of the vehicle, in the event he fails to pay the loan amount when due to the Company. Pursuant to our right therein we are taking steps to recover possession of the said vehicle. This communication is for your record and to prevent confusion that may arise from any complaint that the borrower may lodge with respect to the aforesaid vehicle.</p>
  <p class="body-text">Thanking you,</p>
  <p class="body-text">Yours Sincerely,</p>
  <div class="signature"><p><strong>For, Hero Fin-Corp Limited</strong></p></div>
  <div class="footer">Hero Fincorp Ltd. Corporate Office: 09, Basant Lok, Vasant Vihar, New Delhi-110057 India</div>
</body>
</html>`;
}

function buildPostHtml(p: {
  date: string; police_station: string; tq: string;
  customer_name: string; address: string; app_id: string; loan_no: string;
  registration_no: string; asset_make: string; engine_no: string; chassis_no: string;
  repossession_date: string; repossession_address: string; reference_no: string;
}): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #000; padding: 28px 32px; line-height: 1.65; background: #fff; }
    .title { text-align: center; font-size: 15px; font-weight: bold; text-decoration: underline; margin-bottom: 6px; }
    .divider { border: none; border-top: 1.5px solid #888; margin: 8px 0 14px; }
    .date { font-weight: bold; margin-bottom: 14px; }
    .to-block { margin-left: 24px; margin-bottom: 12px; }
    .to-block p { margin-bottom: 2px; }
    .subject { margin-bottom: 12px; }
    .body-text { margin-bottom: 10px; text-align: justify; }
    .details-table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 12px; }
    .details-table tr:nth-child(even) { background-color: #f5f5f5; }
    .details-table td { padding: 5px 8px; border: 1px solid #ccc; vertical-align: top; }
    .details-table td:first-child { width: 46%; color: #333; }
    .details-table td:last-child { font-weight: bold; }
    .footer { margin-top: 18px; text-align: center; font-size: 11px; border-top: 1px solid #ccc; padding-top: 7px; font-weight: bold; }
    .signature { margin-top: 36px; }
  </style>
</head>
<body>
  <p class="title">Post Repossession Intimation to Police Station</p>
  <hr class="divider">
  <p class="date">Date: ${p.date}</p>
  <div class="to-block">
    <p>To,</p>
    <p>The Senior Inspector,</p>
    <p><strong>${p.police_station},</strong></p>
    <p>TQ. ${p.tq}&nbsp;&nbsp;&nbsp;Dist. Nanded</p>
  </div>
  <div class="subject">
    <p><strong>Sub :</strong> Intimation after repossession of the vehicle No <strong>${p.registration_no}</strong> From Mr. <strong>${p.customer_name}</strong></p>
    <p>(Borrower) residing <strong>${p.address}</strong></p>
  </div>
  <p class="body-text"><strong>Respected Sir,</strong></p>
  <p class="body-text">This is in furtherance to our letter dated bearing reference number <strong>${p.reference_no}</strong> whereby it was intimated to you that despite our repeated requests, reminders and personal visits the above said borrower has defaulted in repaying the above TW Loan as expressly agreed by him/her under the Loan (cum Hypothecation) Agreement and guarantee entered between the said borrower and the company.</p>
  <p class="body-text">Pursuant to our right under the said Agreement we have taken peaceful repossession of the said vehicle.</p>
  <p class="body-text">We have taken peaceful repossession of the said vehicle on <strong>${p.repossession_date}</strong> at from <strong>${p.repossession_address}</strong></p>
  <p class="body-text"><strong>DETAILS OF THE VEHICLE REPOSSESSED:-</strong></p>
  <table class="details-table">
    <tr><td>Name of the Borrower</td><td>${p.customer_name}</td></tr>
    <tr><td>Address of Borrower</td><td>${p.address}</td></tr>
    <tr><td>Loan Agreement No.</td><td>${p.loan_no}</td></tr>
    <tr><td>App ID</td><td>${p.app_id}</td></tr>
    <tr><td>Vehicle Registration Number</td><td>${p.registration_no}</td></tr>
    <tr><td>Model Make</td><td>${p.asset_make}</td></tr>
    <tr><td>Engine No.</td><td>${p.engine_no}</td></tr>
    <tr><td>Chassis No.</td><td>${p.chassis_no}</td></tr>
  </table>
  <p class="body-text">This communication is for your records and to prevent any confusion that may arise for any complaint that the Borrower may lodge with respect to the said vehicle.</p>
  <p class="body-text">Thanking You,</p>
  <p class="body-text">Yours Sincerely,</p>
  <div class="signature"><p><strong>For, Hero Fin Corp Limited</strong></p></div>
  <div class="footer">Hero Fincorp Ltd. Corporate Office: 09, Basant Lok, Vasant Vihar, New Delhi-110057 India</div>
</body>
</html>`;
}

// ── Pre Intimation Modal ───────────────────────────────────────────────────
function PreIntimationModal({ item, onClose }: { item: any; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [downloading, setDownloading]       = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [showPreview, setShowPreview]       = useState(false);
  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
  const [policeStation, setPoliceStation]   = useState("");
  const [tq, setTq]                         = useState("");

  if (!item) return null;

  const customerName = item.customer_name    || "___________";
  const address      = item.address          || "___________";
  const appId        = item.app_id           || "___________";
  const loanNo       = item.loan_no          || "___________";
  const regNo        = item.registration_no  || "___________";
  const assetMake    = item.asset_make       || "___________";
  const engineNo     = item.engine_no        || "___________";
  const chassisNo    = item.chassis_no       || "___________";

  const letterParams = {
    date: today,
    police_station: policeStation.trim() || "________________________________",
    tq: tq.trim() || "_____________",
    customer_name: customerName, address, app_id: appId, loan_no: loanNo,
    registration_no: regNo, asset_make: assetMake, engine_no: engineNo, chassis_no: chassisNo,
  };

  const body = { ...letterParams,
    police_station: policeStation.trim() || "________________________________",
    tq: tq.trim() || "_____________",
  };

  const handleDownload = async (format: "docx" | "pdf") => {
    const setter = format === "pdf" ? setDownloadingPdf : setDownloading;
    setter(true);
    try {
      const ext      = format === "pdf" ? "pdf" : "docx";
      const endpoint = format === "pdf"
        ? "/api/admin/generate-pre-intimation"
        : "/api/admin/generate-pre-intimation-docx";
      await downloadIntimation(endpoint, format, `Pre_Intimation_${customerName.replace(/\s+/g, "_")}.${ext}`, body);
    } catch (e: any) { Alert.alert("Error", e.message || "Could not generate document"); }
    finally { setter(false); }
  };

  const previewHtml = buildPreHtml(letterParams);

  return (
    <Modal visible={!!item} transparent={false} animationType="slide" onRequestClose={onClose}>
      <View style={[intimStyles.screen, { paddingTop: insets.top }]}>
        <View style={intimStyles.header}>
          <Pressable onPress={onClose} style={{ padding: 6 }}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          <Text style={intimStyles.headerTitle} numberOfLines={1}>Pre Intimation</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable style={[intimStyles.downloadBtn, { backgroundColor: "rgba(255,255,255,0.25)" }, downloading && { opacity: 0.6 }]} onPress={() => handleDownload("docx")} disabled={downloading || downloadingPdf}>
              {downloading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="document-outline" size={16} color="#fff" />}
              <Text style={intimStyles.downloadBtnText}>{downloading ? "…" : "DOCX"}</Text>
            </Pressable>
            <Pressable style={[intimStyles.downloadBtn, { backgroundColor: "#dc2626" }, downloadingPdf && { opacity: 0.6 }]} onPress={() => handleDownload("pdf")} disabled={downloading || downloadingPdf}>
              {downloadingPdf ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="document-text-outline" size={16} color="#fff" />}
              <Text style={intimStyles.downloadBtnText}>{downloadingPdf ? "…" : "PDF"}</Text>
            </Pressable>
          </View>
        </View>

        <View style={intimStyles.tabRow}>
          <Pressable style={[intimStyles.tab, !showPreview && intimStyles.tabActive]} onPress={() => setShowPreview(false)}>
            <Text style={[intimStyles.tabText, !showPreview && intimStyles.tabTextActive]}>Fill Details</Text>
          </Pressable>
          <Pressable style={[intimStyles.tab, showPreview && intimStyles.tabActive]} onPress={() => setShowPreview(true)}>
            <Text style={[intimStyles.tabText, showPreview && intimStyles.tabTextActive]}>Preview Letter</Text>
          </Pressable>
        </View>

        {!showPreview ? (
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
              <View style={intimStyles.editableCard}>
                <Text style={intimStyles.editableTitle}>Fill in Details</Text>
                <View style={intimStyles.editableRow}>
                  <Text style={intimStyles.editableLabel}>Police Station Name</Text>
                  <TextInput style={intimStyles.editableInput} placeholder="Enter police station name" placeholderTextColor={Colors.textMuted} value={policeStation} onChangeText={setPoliceStation} />
                </View>
                <View style={intimStyles.editableRow}>
                  <Text style={intimStyles.editableLabel}>TQ (Taluka)</Text>
                  <TextInput style={intimStyles.editableInput} placeholder="Enter taluka name" placeholderTextColor={Colors.textMuted} value={tq} onChangeText={setTq} />
                </View>
              </View>
              <Pressable style={intimStyles.previewBtn} onPress={() => setShowPreview(true)}>
                <Ionicons name="eye-outline" size={16} color="#fff" />
                <Text style={intimStyles.previewBtnText}>Preview Letter →</Text>
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        ) : (
          <View style={{ flex: 1 }}>
            <HtmlPreview html={previewHtml} />
          </View>
        )}
      </View>
    </Modal>
  );
}

// ── Post Intimation Modal ──────────────────────────────────────────────────
function PostIntimationModal({ item, onClose }: { item: any; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [downloading, setDownloading]       = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [showPreview, setShowPreview]       = useState(false);
  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
  const [policeStation, setPoliceStation]             = useState("");
  const [tq, setTq]                                   = useState("");
  const [repossessionDate, setRepossessionDate]       = useState(today);
  const [repossessionAddress, setRepossessionAddress] = useState(item?.address || "");

  if (!item) return null;

  const customerName = item.customer_name    || "___________";
  const loanNo       = item.loan_no          || "___________";
  const regNo        = item.registration_no  || "___________";

  const letterParams = {
    date: today,
    police_station: policeStation.trim() || "________________________________",
    tq: tq.trim() || "_____________",
    customer_name: customerName,
    address:       item.address   || "___________",
    app_id:        item.app_id    || "___________",
    loan_no:       loanNo,
    registration_no: regNo,
    asset_make:    item.asset_make  || "___________",
    engine_no:     item.engine_no   || "___________",
    chassis_no:    item.chassis_no  || "___________",
    repossession_date:    repossessionDate    || today,
    repossession_address: repossessionAddress || item.address || "___________",
    reference_no:  loanNo,
  };

  const body = { ...letterParams };

  const handleDownload = async (format: "docx" | "pdf") => {
    const setter = format === "pdf" ? setDownloadingPdf : setDownloading;
    setter(true);
    try {
      const ext      = format === "pdf" ? "pdf" : "docx";
      const endpoint = format === "pdf"
        ? "/api/admin/generate-post-intimation"
        : "/api/admin/generate-post-intimation-docx";
      await downloadIntimation(endpoint, format, `Post_Intimation_${customerName.replace(/\s+/g, "_")}.${ext}`, body);
    } catch (e: any) { Alert.alert("Error", e.message || "Could not generate document"); }
    finally { setter(false); }
  };

  const previewHtml = buildPostHtml(letterParams);

  return (
    <Modal visible={!!item} transparent={false} animationType="slide" onRequestClose={onClose}>
      <View style={[intimStyles.screen, { paddingTop: insets.top }]}>
        <View style={[intimStyles.header, { backgroundColor: "#1e40af" }]}>
          <Pressable onPress={onClose} style={{ padding: 6 }}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          <Text style={intimStyles.headerTitle} numberOfLines={1}>Post Intimation</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable style={[intimStyles.downloadBtn, { backgroundColor: "rgba(255,255,255,0.25)" }, downloading && { opacity: 0.6 }]} onPress={() => handleDownload("docx")} disabled={downloading || downloadingPdf}>
              {downloading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="document-outline" size={16} color="#fff" />}
              <Text style={intimStyles.downloadBtnText}>{downloading ? "…" : "DOCX"}</Text>
            </Pressable>
            <Pressable style={[intimStyles.downloadBtn, { backgroundColor: "#dc2626" }, downloadingPdf && { opacity: 0.6 }]} onPress={() => handleDownload("pdf")} disabled={downloading || downloadingPdf}>
              {downloadingPdf ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="document-text-outline" size={16} color="#fff" />}
              <Text style={intimStyles.downloadBtnText}>{downloadingPdf ? "…" : "PDF"}</Text>
            </Pressable>
          </View>
        </View>

        <View style={intimStyles.tabRow}>
          <Pressable style={[intimStyles.tab, !showPreview && { ...intimStyles.tabActive, borderBottomColor: "#1e40af" }]} onPress={() => setShowPreview(false)}>
            <Text style={[intimStyles.tabText, !showPreview && { ...intimStyles.tabTextActive, color: "#1e40af" }]}>Fill Details</Text>
          </Pressable>
          <Pressable style={[intimStyles.tab, showPreview && { ...intimStyles.tabActive, borderBottomColor: "#1e40af" }]} onPress={() => setShowPreview(true)}>
            <Text style={[intimStyles.tabText, showPreview && { ...intimStyles.tabTextActive, color: "#1e40af" }]}>Preview Letter</Text>
          </Pressable>
        </View>

        {!showPreview ? (
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
              <View style={intimStyles.editableCard}>
                <Text style={intimStyles.editableTitle}>Fill in Details</Text>
                {([
                  ["Police Station Name",  policeStation,       setPoliceStation,       "Enter police station name"],
                  ["TQ (Taluka)",          tq,                  setTq,                  "Enter taluka name"],
                  ["Date of Repossession", repossessionDate,    setRepossessionDate,    "DD/MM/YYYY"],
                  ["Repossession Address", repossessionAddress, setRepossessionAddress, "Where vehicle was taken from"],
                ] as [string, string, (v: string) => void, string][]).map(([label, val, setter, ph]) => (
                  <View key={label} style={intimStyles.editableRow}>
                    <Text style={intimStyles.editableLabel}>{label}</Text>
                    <TextInput style={intimStyles.editableInput} placeholder={ph} placeholderTextColor={Colors.textMuted} value={val} onChangeText={setter} />
                  </View>
                ))}
              </View>
              <Pressable style={[intimStyles.previewBtn, { backgroundColor: "#1e40af" }]} onPress={() => setShowPreview(true)}>
                <Ionicons name="eye-outline" size={16} color="#fff" />
                <Text style={intimStyles.previewBtnText}>Preview Letter →</Text>
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        ) : (
          <View style={{ flex: 1 }}>
            <HtmlPreview html={previewHtml} />
          </View>
        )}
      </View>
    </Modal>
  );
}

// ── Status Action Bar ──────────────────────────────────────────────────────
function StatusActionBar({ item, tableType, onUpdated, onPreIntimation, onPostIntimation }: { item: any; tableType: "loan" | "bkt"; onUpdated: () => void; onPreIntimation?: (item: any) => void; onPostIntimation?: (item: any) => void; }) {
  const [loading, setLoading] = useState<string | null>(null);
  const handleStatus = async (status: "Paid" | "Unpaid", rollback_yn?: boolean) => {
    const key = status + (rollback_yn !== undefined ? "_rb" : "");
    setLoading(key);
    try {
      await api.admin.updateCaseStatus(item.id, { status, rollback_yn: rollback_yn ?? null, table: tableType });
      onUpdated();
    } catch (e: any) { Alert.alert("Error", e.message); }
    finally { setLoading(null); }
  };
  const isPaid = item.status === "Paid";
  const isRollback = item.rollback_yn === true;
  return (
    <View style={actionStyles.bar}>
      <Pressable style={[actionStyles.btn, isPaid ? actionStyles.btnActivePaid : actionStyles.btnInactive, loading === "Paid" && { opacity: 0.6 }]} onPress={() => handleStatus(isPaid ? "Unpaid" : "Paid")} disabled={!!loading}>
        {loading === "Paid" ? <ActivityIndicator size="small" color="#fff" /> : (<><Ionicons name={isPaid ? "checkmark-circle" : "checkmark-circle-outline"} size={15} color={isPaid ? "#fff" : Colors.success} /><Text style={[actionStyles.btnText, isPaid && { color: "#fff" }]}>{isPaid ? "Paid ✓" : "Mark Paid"}</Text></>)}
      </Pressable>
      {isPaid && (
        <Pressable style={[actionStyles.btn, actionStyles.btnUnpaid, loading === "Unpaid" && { opacity: 0.6 }]} onPress={() => handleStatus("Unpaid")} disabled={!!loading}>
          {loading === "Unpaid" ? <ActivityIndicator size="small" color="#fff" /> : (<><Ionicons name="close-circle-outline" size={15} color="#fff" /><Text style={[actionStyles.btnText, { color: "#fff" }]}>Unpaid</Text></>)}
        </Pressable>
      )}
      <Pressable style={[actionStyles.btn, isRollback ? actionStyles.btnActiveRollback : actionStyles.btnInactive, loading === "Paid_rb" && { opacity: 0.6 }]} onPress={() => handleStatus(isPaid ? "Paid" : "Unpaid", !isRollback)} disabled={!!loading}>
        {loading === "Paid_rb" ? <ActivityIndicator size="small" color="#fff" /> : (<><Ionicons name={isRollback ? "refresh-circle" : "refresh-circle-outline"} size={15} color={isRollback ? "#fff" : Colors.info} /><Text style={[actionStyles.btnText, isRollback && { color: "#fff" }]}>{isRollback ? "Rollback ✓" : "Rollback"}</Text></>)}
      </Pressable>
      {onPreIntimation && (
        <Pressable style={[actionStyles.btn, actionStyles.btnPreIntimation]} onPress={() => onPreIntimation(item)} disabled={!!loading}>
          <Ionicons name="notifications-outline" size={15} color="#f59e0b" />
          <Text style={[actionStyles.btnText, { color: "#f59e0b" }]}>Pre Intimation</Text>
        </Pressable>
      )}
      {onPostIntimation && (
        <Pressable style={[actionStyles.btn, actionStyles.btnPostIntimation]} onPress={() => onPostIntimation(item)} disabled={!!loading}>
          <Ionicons name="checkmark-done-outline" size={15} color="#3b82f6" />
          <Text style={[actionStyles.btnText, { color: "#3b82f6" }]}>Post Intimation</Text>
        </Pressable>
      )}
    </View>
  );
}

// ── Case Detail Modal ──────────────────────────────────────────────────────
function CaseDetailModal({ item, tableType, onClose, onResetCase, onStatusUpdated, onPreIntimation, onPostIntimation, onTransferCase }: { item: any; tableType: "loan" | "bkt"; onClose: () => void; onResetCase: (id: number) => void; onStatusUpdated: () => Promise<void>; onPreIntimation: (item: any) => void; onPostIntimation: (item: any) => void; onTransferCase: (item: any) => void; }) {
  const insets = useSafeAreaInsets();
  const [resetting, setResetting] = useState(false);
  const [localItem, setLocalItem] = useState(item);
  React.useEffect(() => { if (item) setLocalItem(item); }, [item]);
  const statusColor = localItem ? STATUS_COLORS[localItem.status] || Colors.primary : Colors.primary;
  const companyColor = localItem?.company_name ? getCompanyColor(localItem.company_name) : null;

  const rows = localItem ? [
    ...(localItem.feedback_code || localItem.latest_feedback || localItem.feedback_comments || localItem.feedback_date || localItem.customer_available != null || localItem.vehicle_available != null || localItem.third_party != null || localItem.projection || localItem.non_starter != null || localItem.kyc_purchase != null || localItem.workable != null || localItem.ptp_date || localItem.telecaller_ptp_date
      ? [
          { section: "Feedback" },
          ...(localItem.feedback_code ? [{ label: "Feedback Code", value: localItem.feedback_code }] : []),
          ...(localItem.latest_feedback ? [{ label: "Detail Feedback", value: localItem.latest_feedback }] : []),
          ...(localItem.feedback_comments ? [{ label: "Comments", value: localItem.feedback_comments }] : []),
          ...(localItem.feedback_date ? [{ label: "Feedback Date", value: fmtDate(localItem.feedback_date) }] : []),
          ...(localItem.customer_available != null ? [{ label: "Customer Avail.", value: fmtBool(localItem.customer_available) }] : []),
          ...(localItem.vehicle_available != null ? [{ label: "Vehicle Avail.", value: fmtBool(localItem.vehicle_available) }] : []),
          ...(localItem.third_party != null ? [{ label: "Third Party", value: fmtBool(localItem.third_party) }] : []),
          ...(localItem.third_party === true || localItem.third_party === "true" || localItem.third_party === "t" ? [{ label: "Third Party Name", value: localItem.third_party_name }, { label: "Third Party Number", value: localItem.third_party_number, phone: true }] : []),
          ...(localItem.projection ? [{ label: "Projection", value: localItem.projection }] : []),
          ...(localItem.non_starter != null ? [{ label: "Non Starter", value: fmtBool(localItem.non_starter) }] : []),
          ...(localItem.kyc_purchase != null ? [{ label: "KYC Purchase", value: fmtBool(localItem.kyc_purchase) }] : []),
          ...(localItem.workable != null ? [{ label: "Workable", value: localItem.workable === true || localItem.workable === "true" || localItem.workable === "t" ? "Workable" : localItem.workable === false || localItem.workable === "false" || localItem.workable === "f" ? "Non Workable" : "" }] : []),
          ...(localItem.ptp_date ? [{ label: "PTP Date", value: fmtDate(localItem.ptp_date) }] : []),
          ...(localItem.ptp_date_mf ? [{ label: "PTP Date (Monthly)", value: fmtDate(localItem.ptp_date_mf) }] : []),
          ...(localItem.telecaller_ptp_date ? [{ label: "Telecaller PTP", value: fmtDate(localItem.telecaller_ptp_date) }] : []),
          ...(localItem.shifted_city ? [{ label: "Shifted City", value: localItem.shifted_city }] : []),
          ...(localItem.occupation ? [{ label: "Occupation", value: localItem.occupation }] : []),
        ]
      : []),
    { section: "Case Info" },
    { label: "Status", value: localItem.status },
    { label: "FOS Agent", value: localItem.agent_name },
    // ── Company row — highlighted when present ──────────────────────────────
    ...(localItem.company_name ? [{ label: "Company", value: localItem.company_name, isCompany: true }] : []),
    { label: "Customer Name", value: localItem.customer_name },
    { label: "Loan No", value: localItem.loan_no },
    { label: "APP ID", value: localItem.app_id },
    { label: "BKT", value: localItem.bkt },
    { label: "Mobile No", value: localItem.mobile_no, phone: true },
    { label: "Address", value: localItem.address },
    { label: "Ref Address", value: localItem.reference_address },
    { label: "Ref 1 Name", value: localItem.ref1_name },
    { label: "Ref 1 Mobile", value: localItem.ref1_mobile, phone: true },
    { label: "Ref 2 Name", value: localItem.ref2_name },
    { label: "Ref 2 Mobile", value: localItem.ref2_mobile, phone: true },
    { label: "Ref Number", value: localItem.ref_number },
    { section: "Financial" },
    { label: "POS", value: fmt(localItem.pos, "₹") },
    { label: "EMI", value: fmt(localItem.emi_amount, "₹") },
    { label: "EMI Due", value: fmt(localItem.emi_due, "₹") },
    { label: "CBC", value: fmt(localItem.cbc, "₹") },
    { label: "LPP", value: fmt(localItem.lpp, "₹") },
    { label: "CBC + LPP", value: fmt(localItem.cbc_lpp, "₹") },
    { label: "Rollback", value: fmt(localItem.rollback, "₹") },
    { label: "Clearance", value: fmt(localItem.clearance, "₹") },
    { section: "Vehicle" },
    { label: "Asset Name", value: localItem.asset_name },
    { label: "Asset Make", value: localItem.asset_make },
    { label: "Reg No", value: localItem.registration_no },
    { label: "Engine No", value: localItem.engine_no },
    { label: "Chassis No", value: localItem.chassis_no },
    { label: "Tenor", value: localItem.tenor },
    { label: "Product", value: localItem.pro },
    { label: "First EMI Date", value: fmtDate(localItem.first_emi_due_date) },
    { label: "Maturity Date", value: fmtDate(localItem.loan_maturity_date) },
    ...((localItem.extra_numbers?.length > 0) ? [
      { section: "Additional Numbers" },
      ...localItem.extra_numbers.map((num: string, i: number) => ({ label: `Number ${i + 1}`, value: num, phone: true, extraNum: num })),
    ] : []),
  ] : [];

  const handleResetCase = () => {
    Alert.alert("Reset Feedback", `Reset feedback for ${localItem?.customer_name}? Status will be set to Unpaid.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Reset", style: "destructive", onPress: async () => { setResetting(true); try { await onResetCase(localItem.id); onClose(); } finally { setResetting(false); } } },
    ]);
  };

  return (
    <Modal visible={!!item} transparent={false} animationType="slide" onRequestClose={onClose}>
      <View style={[detailStyles.screen, { paddingTop: insets.top }]}>
        {localItem && (
          <>
            <View style={[detailStyles.header, { backgroundColor: statusColor }]}>
              <Pressable onPress={onClose} style={detailStyles.backBtn}><Ionicons name="arrow-back" size={22} color="#fff" /></Pressable>
              <View style={{ flex: 1 }}>
                <Text style={detailStyles.headerTitle} numberOfLines={1}>{localItem.customer_name}</Text>
                {localItem.company_name && companyColor && (
                  <Text style={[detailStyles.headerCompany, { color: "rgba(255,255,255,0.85)" }]} numberOfLines={1}>{localItem.company_name}</Text>
                )}
              </View>
              <View style={detailStyles.statusPill}>
                <Text style={[detailStyles.statusPillText, { color: statusColor }]}>{localItem.status}</Text>
              </View>
            </View>
            <View style={{ padding: 12, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
              <StatusActionBar item={localItem} tableType={tableType} onUpdated={() => { onStatusUpdated(); }} onPreIntimation={onPreIntimation} onPostIntimation={onPostIntimation} />
              <Pressable style={detailStyles.transferBtn} onPress={() => onTransferCase(localItem)}>
                <Ionicons name="swap-horizontal-outline" size={15} color="#fff" />
                <Text style={detailStyles.transferBtnText}>Transfer Case to Another FOS</Text>
              </Pressable>
            </View>
            {localItem.monthly_feedback ? (
              <Pressable style={[detailStyles.resetCaseBtn, resetting && { opacity: 0.6 }]} onPress={handleResetCase} disabled={resetting}>
                {resetting ? <ActivityIndicator size="small" color={Colors.danger} /> : <Ionicons name="refresh" size={16} color={Colors.danger} />}
                <Text style={detailStyles.resetCaseBtnText}>{resetting ? "Resetting…" : "Reset Monthly Feedback — Allow FOS to re-submit"}</Text>
              </Pressable>
            ) : (
              <View style={detailStyles.noFeedbackBanner}>
                <Ionicons name="information-circle-outline" size={15} color={Colors.textMuted} />
                <Text style={detailStyles.noFeedbackText}>No feedback given yet</Text>
              </View>
            )}
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {rows.map((r, i) => {
                if ((r as any).section) {
                  return (
                    <View key={(r as any).section} style={detailStyles.sectionHeader}>
                      <Text style={detailStyles.sectionHeaderText}>{(r as any).section}</Text>
                    </View>
                  );
                }
                // Company row gets special highlighting
                if ((r as any).isCompany && companyColor) {
                  return (
                    <View key="company" style={[detailStyles.row, { backgroundColor: companyColor.bg }]}>
                      <View style={[detailStyles.labelCell, { backgroundColor: companyColor.bg, borderRightColor: companyColor.border }]}>
                        <Text style={[detailStyles.labelText, { color: companyColor.text }]}>Company</Text>
                      </View>
                      <View style={[detailStyles.valueCell, { flexDirection: "row", alignItems: "center", gap: 6 }]}>
                        <View style={[styles.companyDot, { backgroundColor: companyColor.text }]} />
                        <Text style={[detailStyles.valueText, { color: companyColor.text, fontWeight: "700" }]}>{r.value}</Text>
                      </View>
                    </View>
                  );
                }
                if ((r as any).extraNum) {
                  return (
                    <View key={r.label} style={[detailStyles.row, i % 2 === 1 && { backgroundColor: Colors.surfaceAlt }]}>
                      <View style={detailStyles.labelCell}><Text style={detailStyles.labelText}>{r.label}</Text></View>
                      <View style={[detailStyles.valueCell, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}>
                        <Pressable onPress={() => Linking.openURL(`tel:${(r as any).extraNum}`)}>
                          <Text style={[detailStyles.valueText, { color: Colors.info, textDecorationLine: "underline" }]}>{r.value}</Text>
                        </Pressable>
                        <Pressable onPress={() => { Alert.alert("Remove Number", `Remove ${(r as any).extraNum}?`, [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: async () => { try { await api.admin.removeExtraNumber(localItem.id, (r as any).extraNum, tableType); setLocalItem((prev: any) => ({ ...prev, extra_numbers: prev.extra_numbers.filter((n: string) => n !== (r as any).extraNum) })); onStatusUpdated(); } catch (e: any) { Alert.alert("Error", e.message); } } }]); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                        </Pressable>
                      </View>
                    </View>
                  );
                }
                return <TableRow key={r.label} label={r.label!} value={r.value} phone={(r as any).phone} even={i % 2 === 1} />;
              })}
              <View style={{ height: insets.bottom + 24 }} />
            </ScrollView>
          </>
        )}
      </View>
    </Modal>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────
export default function AllCasesScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [companyFilter, setCompanyFilter] = useState("All");
  const [selectedCase, setSelectedCase] = useState<any>(null);
  const [intimationCase, setIntimationCase] = useState<any>(null);
  const [postIntimationCase, setPostIntimationCase] = useState<any>(null);
  const [resettingAgent, setResettingAgent] = useState<number | null>(null);
  const [agentCasesModal, setAgentCasesModal] = useState<{ agentId: number; agentName: string; cases: any[]; } | null>(null);
  const [resettingCaseId, setResettingCaseId] = useState<number | null>(null);
  const [transferCase, setTransferCase] = useState<any>(null);

  const tableType = "loan";
  const queryKey = ["/api/admin/cases"];

  const { data, isLoading } = useQuery({ queryKey, queryFn: () => api.admin.getCases(), refetchInterval: 15000 });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["/api/admin/cases"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/bkt-cases"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/bkt-performance"] });
    qc.invalidateQueries({ queryKey: ["/api/bkt-perf-summary"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/stats"] });
  };

  const invalidateAndSyncSelected = async () => {
    invalidateAll();
    if (selectedCase) {
      try {
        await qc.refetchQueries({ queryKey });
        const freshData = qc.getQueryData<any>(queryKey);
        const freshItem = freshData?.cases?.find((c: any) => c.id === selectedCase.id);
        if (freshItem) setSelectedCase(freshItem);
      } catch (_) {}
    }
  };

  // ── Distinct companies ────────────────────────────────────────────────────
  const companies = useMemo(() => {
    const all: string[] = (data?.cases || []).map((c: any) => c.company_name).filter(Boolean);
    return Array.from(new Set(all)).sort();
  }, [data]);

  const filtered = useMemo(() => {
    const cases = data?.cases || [];
    const q = search.toLowerCase().trim();
    return cases.filter((c: any) => {
      const matchStatus = statusFilter === "All" || c.status === statusFilter;
      const matchCompany = companyFilter === "All" || c.company_name === companyFilter;
      const matchSearch = !q || c.registration_no?.toLowerCase().includes(q) || c.app_id?.toLowerCase().includes(q) || c.loan_no?.toLowerCase().includes(q) || c.customer_name?.toLowerCase().includes(q) || c.agent_name?.toLowerCase().includes(q) || c.company_name?.toLowerCase().includes(q);
      return matchStatus && matchCompany && matchSearch;
    });
  }, [data, search, statusFilter, companyFilter]);

  const agentGroups = useMemo(() => {
    const cases = data?.cases || [];
    const groups: Record<string, { agentId: number; agentName: string; count: number; feedbackCount: number }> = {};
    for (const c of cases) {
      const name = c.agent_name || "Unassigned";
      const id = c.agent_id || 0;
      if (!groups[name]) groups[name] = { agentId: id, agentName: name, count: 0, feedbackCount: 0 };
      groups[name].count++;
      if (c.monthly_feedback) groups[name].feedbackCount++;
    }
    return Object.values(groups).sort((a, b) => a.agentName.localeCompare(b.agentName));
  }, [data]);

  const handleResetAgentFeedback = (agentId: number, agentName: string) => {
    Alert.alert("Reset Monthly Feedback", `Reset ONLY monthly feedback for ${agentName}?\n\nStatus, PTP dates, detail feedback and comments will NOT be changed.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Reset Monthly", style: "destructive", onPress: async () => { setResettingAgent(agentId); try { await api.admin.resetMonthlyFeedbackForAgent(agentId); invalidateAll(); Alert.alert("Done", `Monthly feedback reset for ${agentName}`); } catch (e: any) { Alert.alert("Error", e.message); } finally { setResettingAgent(null); } } },
    ]);
  };

  const handleResetCase = async (caseId: number) => {
    const tType = selectedCase?.case_type === "bkt" ? "bkt" : "loan";
    try {
      const token = await tokenStore.get();
      const url = new URL(`/api/admin/reset-monthly-feedback/case/${caseId}`, getApiUrl()).toString();
      const res = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ table: tType }) });
      const json: any = await res.json();
      if (!res.ok) throw new Error(json.message || "Reset failed");
      invalidateAll();
      Alert.alert("Done", "Monthly feedback reset. FOS can now re-submit.");
    } catch (e: any) { Alert.alert("Error", e.message); }
  };

  const FILTERS = ["All", "Unpaid", "PTP", "Paid"];
  const allCases = data?.cases || [];
  const paidCount = allCases.filter((c: any) => c.status === "Paid").length;
  const unpaidCount = allCases.filter((c: any) => c.status !== "Paid" && c.status !== "PTP").length;
  const ptpCount = allCases.filter((c: any) => c.status === "PTP").length;

  const selectedCompanyColor = companyFilter !== "All" ? getCompanyColor(companyFilter) : null;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={[styles.filterBar, { paddingTop: Platform.OS === "web" ? 67 : 12 }]}>
        <View style={styles.summaryRow}>
          <View style={[styles.summaryChip, { backgroundColor: Colors.success + "18" }]}>
            <Text style={[styles.summaryChipText, { color: Colors.success }]}>✓ {paidCount} Paid</Text>
          </View>
          <View style={[styles.summaryChip, { backgroundColor: Colors.danger + "18" }]}>
            <Text style={[styles.summaryChipText, { color: Colors.danger }]}>✗ {unpaidCount} Unpaid</Text>
          </View>
          <View style={[styles.summaryChip, { backgroundColor: Colors.statusPTP + "18" }]}>
            <Text style={[styles.summaryChipText, { color: Colors.statusPTP }]}>◷ {ptpCount} PTP</Text>
          </View>
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={Colors.textMuted} style={{ marginRight: 8 }} />
          <TextInput style={styles.searchInput} placeholder="Search by name, loan, reg, company..." placeholderTextColor={Colors.textMuted} value={search} onChangeText={setSearch} autoCapitalize="none" />
          {search ? <Pressable onPress={() => setSearch("")}><Ionicons name="close-circle" size={18} color={Colors.textMuted} /></Pressable> : null}
        </View>

        {/* Status filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.filters}>
            {FILTERS.map((f) => (
              <Pressable key={f} style={[styles.filterChip, statusFilter === f && { backgroundColor: f === "All" ? Colors.primary : STATUS_COLORS[f], borderColor: "transparent" }]} onPress={() => setStatusFilter(f)}>
                <Text style={[styles.filterChipText, statusFilter === f && { color: "#fff" }]}>{f}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        {/* Company filter — only shown when there are multiple companies */}
        {companies.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.filters}>
              <Pressable style={[styles.filterChip, companyFilter === "All" && styles.companyFilterChipActive]} onPress={() => setCompanyFilter("All")}>
                <Ionicons name="business-outline" size={12} color={companyFilter === "All" ? "#fff" : "#534ab7"} />
                <Text style={[styles.filterChipText, { color: companyFilter === "All" ? "#fff" : "#534ab7" }]}>All Companies</Text>
              </Pressable>
              {companies.map((co) => {
                const cc = getCompanyColor(co);
                const isActive = companyFilter === co;
                return (
                  <Pressable key={co} style={[styles.filterChip, { borderColor: cc.border, backgroundColor: isActive ? cc.text : cc.bg }]} onPress={() => setCompanyFilter(isActive ? "All" : co)}>
                    <Text style={[styles.filterChipText, { color: isActive ? "#fff" : cc.text }]} numberOfLines={1}>{co}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        )}

        {/* Active company filter banner */}
        {companyFilter !== "All" && selectedCompanyColor && (
          <View style={[styles.companyFilterBanner, { backgroundColor: selectedCompanyColor.bg, borderColor: selectedCompanyColor.border }]}>
            <Ionicons name="business" size={13} color={selectedCompanyColor.text} />
            <Text style={[styles.companyFilterBannerText, { color: selectedCompanyColor.text }]}>
              {companyFilter} — {filtered.length} case{filtered.length !== 1 ? "s" : ""}
            </Text>
            <Pressable onPress={() => setCompanyFilter("All")} hitSlop={8}>
              <Ionicons name="close-circle" size={15} color={selectedCompanyColor.text} />
            </Pressable>
          </View>
        )}
      </View>

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          keyboardShouldPersistTaps="handled"
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }, !filtered.length && { flex: 1 }]}
          ListHeaderComponent={
            <View style={{ gap: 12, marginBottom: 4 }}>
              <Text style={styles.count}>{filtered.length} case{filtered.length !== 1 ? "s" : ""}{companyFilter !== "All" ? ` · ${companyFilter}` : ""}</Text>
              {agentGroups.length > 0 && (
                <View style={styles.resetPanel}>
                  <View style={styles.resetPanelHeader}>
                    <Ionicons name="refresh-circle" size={18} color={Colors.danger} />
                    <Text style={styles.resetPanelTitle}>Reset Monthly Feedback</Text>
                  </View>
                  <Text style={styles.resetPanelSub}>Tap an agent to view and reset their feedback</Text>
                  {agentGroups.map((ag) => (
                    <Pressable key={ag.agentId} style={styles.agentResetRow} onPress={() => { const agentCases = (data?.cases || []).filter((c: any) => c.agent_id === ag.agentId); setAgentCasesModal({ agentId: ag.agentId, agentName: ag.agentName, cases: agentCases }); }}>
                      <View style={styles.agentResetInfo}>
                        <Text style={styles.agentResetName}>{ag.agentName}</Text>
                        <Text style={styles.agentResetCount}>{ag.feedbackCount}/{ag.count} feedback given · tap to view</Text>
                      </View>
                      {ag.feedbackCount > 0 ? (
                        <Pressable style={[styles.resetBtn, resettingAgent === ag.agentId && { opacity: 0.5 }]} onPress={(e) => { e.stopPropagation?.(); handleResetAgentFeedback(ag.agentId, ag.agentName); }} disabled={resettingAgent === ag.agentId}>
                          {resettingAgent === ag.agentId ? <ActivityIndicator size="small" color="#fff" /> : (<><Ionicons name="refresh" size={13} color="#fff" /><Text style={styles.resetBtnText}>Reset Monthly</Text></>)}
                        </Pressable>
                      ) : (
                        <View style={styles.noFeedbackBadge}><Text style={styles.noFeedbackBadgeText}>No feedback</Text></View>
                      )}
                      <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} style={{ marginLeft: 4 }} />
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.customerName} numberOfLines={1}>{item.customer_name}</Text>
                <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[item.status] || Colors.textMuted) + "22" }]}>
                  <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] || Colors.textSecondary }]}>{item.status}</Text>
                </View>
              </View>
              <View style={styles.tagRow}>
                {item.loan_no && <View style={styles.tag}><Text style={styles.tagLabel}>LOAN</Text><Text style={styles.tagValue}>{item.loan_no}</Text></View>}
                {item.app_id && <View style={styles.tag}><Text style={styles.tagLabel}>APP ID</Text><Text style={styles.tagValue}>{item.app_id}</Text></View>}
                {item.bkt != null && <View style={[styles.tag, { backgroundColor: Colors.primary + "15" }]}><Text style={styles.tagLabel}>BKT</Text><Text style={[styles.tagValue, { color: Colors.primary }]}>{item.bkt}</Text></View>}
                {item.pos && <View style={[styles.tag, { backgroundColor: Colors.info + "15" }]}><Text style={styles.tagLabel}>POS</Text><Text style={[styles.tagValue, { color: Colors.info }]}>₹{parseFloat(item.pos).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</Text></View>}
                {/* Company badge on card */}
                {item.company_name && <CompanyBadge name={item.company_name} />}
              </View>
              {item.registration_no && <Text style={styles.regNo}>Reg: {item.registration_no}</Text>}
              {item.agent_name && <Text style={styles.agentTagText}>{item.agent_name}</Text>}
              {(item.feedback_code || item.latest_feedback) && (
                <View style={styles.feedbackRow}>
                  {item.feedback_code && <View style={styles.feedbackCodeBadge}><Text style={styles.feedbackCodeText}>{item.feedback_code}</Text></View>}
                  {item.latest_feedback && <Text style={styles.feedback} numberOfLines={1}>{item.latest_feedback}</Text>}
                </View>
              )}
              <StatusActionBar item={item} tableType="loan" onUpdated={invalidateAll} onPreIntimation={setIntimationCase} onPostIntimation={setPostIntimationCase} />
              <View style={styles.cardActions}>
                <Pressable style={styles.viewDetail} onPress={() => setSelectedCase(item)}>
                  <Ionicons name="eye-outline" size={14} color={Colors.primary} />
                  <Text style={styles.viewDetailText}>View Details</Text>
                </Pressable>
                <Pressable style={styles.transferCardBtn} onPress={() => setTransferCase(item)}>
                  <Ionicons name="swap-horizontal-outline" size={14} color="#7c3aed" />
                  <Text style={styles.transferCardBtnText}>Transfer</Text>
                </Pressable>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>
                {companyFilter !== "All" ? `No ${companyFilter} cases` : search ? `No cases matching "${search}"` : "No cases found"}
              </Text>
            </View>
          }
        />
      )}

      <CaseDetailModal item={selectedCase} tableType={tableType} onClose={() => setSelectedCase(null)} onResetCase={handleResetCase} onStatusUpdated={invalidateAndSyncSelected} onPreIntimation={setIntimationCase} onPostIntimation={setPostIntimationCase} onTransferCase={(c) => { setSelectedCase(null); setTransferCase(c); }} />
      <PreIntimationModal item={intimationCase} onClose={() => setIntimationCase(null)} />
      <PostIntimationModal item={postIntimationCase} onClose={() => setPostIntimationCase(null)} />
      <ReassignCaseModal
        item={transferCase}
        caseType="loan"
        onClose={() => setTransferCase(null)}
        onSuccess={() => { setTransferCase(null); invalidateAll(); }}
      />

      {agentCasesModal && (
        <Modal visible={true} transparent={false} animationType="slide" onRequestClose={() => setAgentCasesModal(null)}>
          <View style={{ flex: 1, backgroundColor: Colors.background }}>
            <View style={agentModalStyles.header}>
              <Pressable onPress={() => setAgentCasesModal(null)} style={{ padding: 8 }}><Ionicons name="arrow-back" size={22} color={Colors.text} /></Pressable>
              <View style={{ flex: 1 }}>
                <Text style={agentModalStyles.headerTitle}>{agentCasesModal.agentName}</Text>
                <Text style={agentModalStyles.headerSub}>{agentCasesModal.cases.length} cases</Text>
              </View>
              <Pressable style={[agentModalStyles.resetAllBtn, resettingAgent === agentCasesModal.agentId && { opacity: 0.5 }]} onPress={() => handleResetAgentFeedback(agentCasesModal.agentId, agentCasesModal.agentName)} disabled={resettingAgent === agentCasesModal.agentId}>
                {resettingAgent === agentCasesModal.agentId ? <ActivityIndicator size="small" color="#fff" /> : <Text style={agentModalStyles.resetAllBtnText}>Reset All</Text>}
              </Pressable>
            </View>
            <FlatList
              data={agentCasesModal.cases}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={{ padding: 12, gap: 10 }}
              renderItem={({ item }) => {
                const hasFeedback = !!(item.monthly_feedback);
                const statusColor = STATUS_COLORS[item.status] || Colors.textMuted;
                return (
                  <View style={agentModalStyles.caseRow}>
                    <View style={agentModalStyles.caseInfo}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <Text style={agentModalStyles.caseName} numberOfLines={1}>{item.customer_name}</Text>
                        <View style={[agentModalStyles.statusBadge, { backgroundColor: statusColor + "22" }]}>
                          <Text style={[agentModalStyles.statusText, { color: statusColor }]}>{item.status}</Text>
                        </View>
                      </View>
                      <Text style={agentModalStyles.caseLoan}>{item.loan_no}</Text>
                      {/* Company in agent modal */}
                      {item.company_name && <CompanyBadge name={item.company_name} />}
                      {(item.latest_feedback || item.feedback_code) && (
                        <Text style={agentModalStyles.caseFeedback} numberOfLines={1}>{item.feedback_code ? item.feedback_code + " · " : ""}{item.latest_feedback || ""}</Text>
                      )}
                      {item.monthly_feedback && <Text style={agentModalStyles.caseFeedback} numberOfLines={1}>Monthly: {item.monthly_feedback}</Text>}
                      <StatusActionBar item={item} tableType="loan" onUpdated={() => { invalidateAll(); setAgentCasesModal((prev) => prev ? { ...prev } : null); }} onPreIntimation={setIntimationCase} onPostIntimation={setPostIntimationCase} />
                    </View>
                    {hasFeedback ? (
                      <Pressable style={[agentModalStyles.resetCaseBtn, resettingCaseId === item.id && { opacity: 0.5 }]} disabled={resettingCaseId === item.id} onPress={() => { Alert.alert("Reset Monthly Feedback", `Reset only monthly feedback for ${item.customer_name}?`, [{ text: "Cancel", style: "cancel" }, { text: "Reset", style: "destructive", onPress: async () => { setResettingCaseId(item.id); try { await handleResetCase(item.id); setAgentCasesModal((prev) => prev ? { ...prev, cases: prev.cases.map((c) => c.id === item.id ? { ...c, monthly_feedback: null } : c) } : null); } finally { setResettingCaseId(null); } } }]); }}>
                        {resettingCaseId === item.id ? <ActivityIndicator size="small" color="#fff" /> : (<><Ionicons name="refresh" size={13} color="#fff" /><Text style={agentModalStyles.resetCaseBtnText}>Reset</Text></>)}
                      </Pressable>
                    ) : (
                      <View style={agentModalStyles.noFeedbackTag}><Text style={agentModalStyles.noFeedbackTagText}>No feedback</Text></View>
                    )}
                  </View>
                );
              }}
            />
          </View>
        </Modal>
      )}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const actionStyles = StyleSheet.create({
  bar: { flexDirection: "row", gap: 6, marginTop: 4, flexWrap: "wrap" },
  btn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: Colors.border },
  btnText: { fontSize: 12, fontWeight: "700", color: Colors.text },
  btnInactive: { backgroundColor: Colors.surfaceAlt, borderColor: Colors.border },
  btnActivePaid: { backgroundColor: Colors.success, borderColor: Colors.success },
  btnUnpaid: { backgroundColor: Colors.danger, borderColor: Colors.danger },
  btnActiveRollback: { backgroundColor: Colors.info, borderColor: Colors.info },
  btnPreIntimation: { backgroundColor: "#fff7ed", borderColor: "#f59e0b" },
  btnPostIntimation: { backgroundColor: "#eff6ff", borderColor: "#3b82f6" },
});

const styles = StyleSheet.create({
  filterBar: { backgroundColor: Colors.surface, padding: 12, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  summaryRow: { flexDirection: "row", gap: 8 },
  summaryChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  summaryChipText: { fontSize: 12, fontWeight: "700" },
  searchBox: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.surfaceAlt, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: Colors.border },
  searchInput: { flex: 1, fontSize: 14, color: Colors.text },
  filters: { flexDirection: "row", gap: 8 },
  filterChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border },
  filterChipText: { fontSize: 12, fontWeight: "600", color: Colors.textSecondary },
  companyFilterChipActive: { backgroundColor: "#534ab7", borderColor: "transparent" },
  companyFilterBanner: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1 },
  companyFilterBannerText: { flex: 1, fontSize: 12, fontWeight: "700" },
  count: { fontSize: 13, color: Colors.textSecondary, fontWeight: "600" },
  list: { padding: 12, gap: 10 },
  resetPanel: { backgroundColor: Colors.surface, borderRadius: 14, padding: 14, gap: 10, borderWidth: 1, borderColor: Colors.danger + "30" },
  resetPanelHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  resetPanelTitle: { fontSize: 14, fontWeight: "700", color: Colors.danger },
  resetPanelSub: { fontSize: 12, color: Colors.textSecondary },
  agentResetRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  agentResetInfo: { flex: 1 },
  agentResetName: { fontSize: 13, fontWeight: "700", color: Colors.text },
  agentResetCount: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  resetBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: Colors.danger, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  resetBtnText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  noFeedbackBadge: { backgroundColor: Colors.surfaceAlt, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  noFeedbackBadgeText: { fontSize: 11, color: Colors.textMuted, fontWeight: "600" },
  card: { backgroundColor: Colors.surface, borderRadius: 14, padding: 14, gap: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  customerName: { flex: 1, fontSize: 14, fontWeight: "700", color: Colors.text, textTransform: "uppercase", marginRight: 8 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: "700" },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.surfaceAlt, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  tagLabel: { fontSize: 9, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase" },
  tagValue: { fontSize: 11, fontWeight: "700", color: Colors.text },
  companyTag: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, maxWidth: 140 },
  companyDot: { width: 5, height: 5, borderRadius: 3 },
  companyTagText: { fontSize: 11, fontWeight: "700" },
  regNo: { fontSize: 12, color: Colors.textSecondary },
  agentTagText: { fontSize: 12, fontWeight: "600", color: Colors.primary },
  feedbackRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  feedbackCodeBadge: { backgroundColor: Colors.accent + "20", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  feedbackCodeText: { fontSize: 11, fontWeight: "700", color: Colors.accent },
  feedback: { flex: 1, fontSize: 12, color: Colors.textSecondary, fontStyle: "italic" },
  cardActions: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 2 },
  viewDetail: { flexDirection: "row", alignItems: "center", gap: 4 },
  viewDetailText: { fontSize: 11, color: Colors.primary, fontWeight: "600" },
  transferCardBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#f3e8ff", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: "#c4b5fd" },
  transferCardBtnText: { fontSize: 11, color: "#7c3aed", fontWeight: "700" },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText: { fontSize: 15, color: Colors.textMuted, textAlign: "center" },
});

const agentModalStyles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, paddingTop: Platform.OS === "web" ? 67 : 56, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerTitle: { fontSize: 16, fontWeight: "700", color: Colors.text },
  headerSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  resetAllBtn: { backgroundColor: Colors.danger, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  resetAllBtnText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  caseRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: Colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border },
  caseInfo: { flex: 1, gap: 4 },
  caseName: { fontSize: 13, fontWeight: "700", color: Colors.text, textTransform: "uppercase", flex: 1 },
  caseLoan: { fontSize: 11, color: Colors.textSecondary, marginBottom: 2 },
  caseFeedback: { fontSize: 11, color: Colors.accent, fontStyle: "italic" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  statusText: { fontSize: 10, fontWeight: "700" },
  resetCaseBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: Colors.danger, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, minWidth: 70, justifyContent: "center", alignSelf: "flex-start" },
  resetCaseBtnText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  noFeedbackTag: { backgroundColor: Colors.surfaceAlt, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, alignSelf: "flex-start" },
  noFeedbackTagText: { fontSize: 11, color: Colors.textMuted, fontWeight: "600" },
});

const detailStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 14, gap: 10 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 16, fontWeight: "700", color: "#fff" },
  headerCompany: { fontSize: 11, marginTop: 2 },
  statusPill: { backgroundColor: "rgba(255,255,255,0.9)", borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4 },
  statusPillText: { fontSize: 11, fontWeight: "800" },
  sectionHeader: { backgroundColor: Colors.primary + "18", paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.primary + "30" },
  sectionHeaderText: { fontSize: 12, fontWeight: "800", color: Colors.primary, textTransform: "uppercase", letterSpacing: 0.8 },
  resetCaseBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.danger + "12", borderBottomWidth: 1, borderBottomColor: Colors.danger + "30", paddingHorizontal: 16, paddingVertical: 12 },
  resetCaseBtnText: { fontSize: 13, fontWeight: "700", color: Colors.danger },
  noFeedbackBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.surfaceAlt, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingHorizontal: 16, paddingVertical: 10 },
  noFeedbackText: { fontSize: 12, color: Colors.textMuted },
  transferBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 10, backgroundColor: "#7c3aed", borderRadius: 10, paddingVertical: 11, paddingHorizontal: 16 },
  transferBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.surface },
  labelCell: { width: "42%", backgroundColor: Colors.surfaceAlt, padding: 12, justifyContent: "center", borderRightWidth: 1, borderRightColor: Colors.border },
  labelText: { fontSize: 13, fontWeight: "700", color: Colors.primary },
  valueCell: { flex: 1, padding: 12, justifyContent: "center" },
  valueText: { fontSize: 13, color: Colors.text, fontWeight: "400" },
});

const intimStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: "#92400e" },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: "700", color: "#fff" },
  downloadBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  downloadBtnText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  letterContainer: { padding: 16 },
  editableCard: { backgroundColor: Colors.primary + "10", borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: Colors.primary + "30", gap: 10 },
  editableTitle: { fontSize: 13, fontWeight: "700", color: Colors.primary, marginBottom: 4 },
  editableRow: { gap: 4 },
  editableLabel: { fontSize: 12, fontWeight: "600", color: Colors.textSecondary },
  editableInput: { backgroundColor: "#fff", borderRadius: 8, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: Colors.text },
  tabRow:        { flexDirection: "row", backgroundColor: "#f3f4f6", borderBottomWidth: 1, borderBottomColor: Colors.border },
  tab:           { flex: 1, paddingVertical: 11, alignItems: "center" },
  tabActive:     { borderBottomWidth: 2, borderBottomColor: Colors.primary, backgroundColor: "#fff" },
  tabText:       { fontSize: 13, fontWeight: "600", color: Colors.textSecondary },
  tabTextActive: { color: Colors.primary },
  previewBtn:    { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#92400e", borderRadius: 10, paddingVertical: 12, marginTop: 12 },
  previewBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
});

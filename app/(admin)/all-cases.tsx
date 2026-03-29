import React, { useState, useMemo, useEffect } from "react";
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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { api, tokenStore } from "@/lib/api";
import { getApiUrl } from "@/lib/query-client";

const STATUS_COLORS: Record<string, string> = {
  Unpaid: Colors.statusUnpaid,
  PTP:    Colors.statusPTP,
  Paid:   Colors.statusPaid,
};

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

// ── FIX: show "—" instead of hiding empty rows ────────────────────────────
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

function PreIntimationModal({ item, onClose }: { item: any; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [downloading, setDownloading] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const today = new Date().toLocaleDateString("en-IN", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });

  // Editable fields
  const [policeStation, setPoliceStation] = useState("");
  const [tq, setTq]                       = useState("");

  // Reset editable fields when item changes
  useEffect(() => {
    setPoliceStation("");
    setTq("");
  }, [item?.id]);

  if (!item) return null;

  const customerName = item.customer_name   || "___________";
  const address      = item.address         || "___________";
  const appId        = item.app_id          || "___________";
  const loanNo       = item.loan_no         || "___________";
  const regNo        = item.registration_no || "___________";
  const assetMake    = item.asset_make      || "___________";
  const engineNo     = item.engine_no       || "___________";
  const chassisNo    = item.chassis_no      || "___________";

  const stationDisplay = policeStation.trim() || "________________________________";
  const tqDisplay      = tq.trim()            || "_____________";

  const handleDownload = async (format: "docx" | "pdf") => {
    const setter = format === "pdf" ? setDownloadingPdf : setDownloading;
    setter(true);
    try {
      const token = await tokenStore.get();
      const url   = new URL("/api/admin/generate-pre-intimation", getApiUrl()).toString();
      const res   = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          customer_name:   customerName,
          address, app_id: appId, loan_no: loanNo,
          registration_no: regNo, asset_make: assetMake,
          engine_no: engineNo, chassis_no: chassisNo,
          date: today,
          police_station: policeStation.trim() || "________________________________",
          tq: tq.trim() || "_____________",
          format,
        }),
      });

      if (!res.ok) throw new Error("Failed to generate document");
      const ext      = format === "pdf" ? "pdf" : "docx";
      const mimeType = format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const fileName = `Pre_Intimation_${customerName.replace(/\s+/g, "_")}.${ext}`;

      if (Platform.OS === "web") {
        const blob    = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a       = document.createElement("a");
        a.href = blobUrl; a.download = fileName; a.click();
        URL.revokeObjectURL(blobUrl);
      } else {
        const { FileSystem, Sharing } = await Promise.all([
          import("expo-file-system"), import("expo-sharing"),
        ]).then(([fs, sh]) => ({ FileSystem: fs, Sharing: sh }));
        const buffer = await res.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        const fileUri = FileSystem.documentDirectory + fileName;
        await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
        await Sharing.shareAsync(fileUri, { mimeType });
      }
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not generate document");
    } finally { setter(false); }
  };

  return (
    <Modal visible={!!item} transparent={false} animationType="slide" onRequestClose={onClose}>
      <View style={[intimStyles.screen, { paddingTop: insets.top }]}>

        {/* Header */}
        <View style={intimStyles.header}>
          <Pressable onPress={onClose} style={{ padding: 6 }}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          <Text style={intimStyles.headerTitle} numberOfLines={1}>Pre Intimation</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              style={[intimStyles.downloadBtn, { backgroundColor: "rgba(255,255,255,0.25)" }, downloading && { opacity: 0.6 }]}
              onPress={() => handleDownload("docx")} disabled={downloading || downloadingPdf}
            >
              {downloading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="document-outline" size={16} color="#fff" />}
              <Text style={intimStyles.downloadBtnText}>{downloading ? "…" : "DOCX"}</Text>
            </Pressable>
            <Pressable
              style={[intimStyles.downloadBtn, { backgroundColor: "#dc2626" }, downloadingPdf && { opacity: 0.6 }]}
              onPress={() => handleDownload("pdf")} disabled={downloading || downloadingPdf}
            >
              {downloadingPdf
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="document-text-outline" size={16} color="#fff" />}
              <Text style={intimStyles.downloadBtnText}>{downloadingPdf ? "…" : "PDF"}</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={intimStyles.letterContainer} showsVerticalScrollIndicator={false}>

          {/* Editable fields */}
          <View style={intimStyles.editableCard}>
            <Text style={intimStyles.editableTitle}>
              <Ionicons name="create-outline" size={14} color={Colors.primary} /> Fill in Police Station Details
            </Text>
            <View style={intimStyles.editableRow}>
              <Text style={intimStyles.editableLabel}>Police Station Name</Text>
              <TextInput
                style={intimStyles.editableInput}
                placeholder="Enter police station name"
                placeholderTextColor={Colors.textMuted}
                value={policeStation}
                onChangeText={setPoliceStation}
              />
            </View>
            <View style={intimStyles.editableRow}>
              <Text style={intimStyles.editableLabel}>TQ (Taluka)</Text>
              <TextInput
                style={intimStyles.editableInput}
                placeholder="Enter taluka name"
                placeholderTextColor={Colors.textMuted}
                value={tq}
                onChangeText={setTq}
              />
            </View>
          </View>

          <View style={intimStyles.letterCard}>
            <Text style={intimStyles.letterTitle}>Pre Repossession Intimation to Police Station</Text>
            <View style={intimStyles.divider} />
            <Text style={intimStyles.letterDate}>Date :- {today}</Text>

            <View style={intimStyles.toBlock}>
              <Text style={intimStyles.letterBodyText}>To,</Text>
              <Text style={intimStyles.letterBodyText}>The Senior Inspector,</Text>
              <Text style={[intimStyles.letterBodyText, intimStyles.boldText]}>{stationDisplay},</Text>
              <Text style={intimStyles.letterBodyText}>TQ. {tqDisplay}  Dist. Nanded</Text>
            </View>

            <View style={intimStyles.subjectBlock}>
              <Text style={intimStyles.letterBodyText}>
                <Text style={intimStyles.boldText}>Sub : </Text>
                Pre intimation of repossession of the vehicle from{" "}
                <Text style={intimStyles.boldText}>{customerName}</Text>
              </Text>
              <Text style={intimStyles.letterBodyText}>
                (Borrower) residing <Text style={intimStyles.boldText}>{address}</Text>
              </Text>
            </View>

            <Text style={[intimStyles.letterBodyText, { marginBottom: 10 }]}>Respected Sir,</Text>
            <Text style={[intimStyles.letterBodyText, { marginBottom: 14, lineHeight: 22 }]}>
              The afore mentioned borrower has taken a loan from Hero Fin-Corp Limited ("Company") for the purchase of the Vehicle having the below mentioned details and further the Borrower hypothecated the said vehicle to the Company in terms of loan-cum-hypothecation agreement executed between the borrower and the Company.
            </Text>

            <View style={intimStyles.detailsTable}>
              {[
                ["Name of the Borrower",        customerName, true],
                ["Address of Borrower",         address,      true],
                ["App ID",                      appId,        true],
                ["Loan cum Hypothecation No.",  loanNo,       true],
                ["Date",                        today,        true],
                ["Vehicle Registration No.",    regNo,        true],
                ["Model Make",                  assetMake,    true],
                ["Engine No.",                  engineNo,     true],
                ["Chassis No.",                 chassisNo,    true],
              ].map(([label, value, isBold], i) => (
                <View key={String(label)} style={[intimStyles.detailRow, i % 2 === 1 && { backgroundColor: "#f8f8f8" }]}>
                  <Text style={intimStyles.detailLabel}>{label}</Text>
                  <Text style={intimStyles.detailColon}>:</Text>
                  <Text style={[intimStyles.detailValue, isBold && { fontWeight: "700" }]}>{String(value)}</Text>
                </View>
              ))}
            </View>

            <Text style={[intimStyles.letterBodyText, { marginVertical: 14, lineHeight: 22 }]}>
              The Borrower has committed default on the scheduled payment of the Monthly Payments and/or other charges payable on the loan obtained by the Borrower from the Company in terms of the provisions of the aforesaid loan-cum-hypothecation agreement. In spite of Company's requests and reminders, the Borrower has not remitted the outstanding dues; as a result of which the company was left with no option but to enforce the terms and conditions of the said agreement. Under the said agreement, the said Borrower has specifically authorized Company or any of its authorized persons to take charge/repossession of the vehicle, in the event he fails to pay the loan amount when due to the Company. Pursuant to our right therein we are taking steps to recover possession of the said vehicle. This communication is for your record and to prevent confusion that may arise from any complaint that the borrower may lodge with respect to the aforesaid vehicle.
            </Text>

            <Text style={intimStyles.letterBodyText}>Thanking you,</Text>
            <Text style={intimStyles.letterBodyText}>Yours Sincerely,</Text>
            <View style={{ height: 40 }} />
            <Text style={[intimStyles.boldText, { marginBottom: 4 }]}>For, Hero Fin-Corp Limited</Text>
            <View style={intimStyles.divider} />
            <Text style={[intimStyles.letterBodyText, { textAlign: "center", fontSize: 11 }]}>
              Hero Fincorp Ltd. Corporate Office: 09, Basant Lok, Vasant Vihar, New Delhi-110057 India
            </Text>
          </View>
          <View style={{ height: insets.bottom + 24 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Status Action Bar ──────────────────────────────────────────────────────
function StatusActionBar({
  item, tableType, onUpdated, onPreIntimation,
}: {
  item: any;
  tableType: "loan" | "bkt";
  onUpdated: () => void;
  onPreIntimation?: (item: any) => void;
}) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleStatus = async (status: "Paid" | "Unpaid", rollback_yn?: boolean) => {
    const key = status + (rollback_yn !== undefined ? "_rb" : "");
    setLoading(key);
    try {
      await api.admin.updateCaseStatus(item.id, {
        status, rollback_yn: rollback_yn ?? null, table: tableType,
      });
      onUpdated();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(null);
    }
  };

  const isPaid     = item.status === "Paid";
  const isRollback = item.rollback_yn === true;

  return (
    <View style={actionStyles.bar}>
      {/* Mark Paid */}
      <Pressable
        style={[actionStyles.btn, isPaid ? actionStyles.btnActivePaid : actionStyles.btnInactive, loading === "Paid" && { opacity: 0.6 }]}
        onPress={() => handleStatus(isPaid ? "Unpaid" : "Paid")}
        disabled={!!loading}
      >
        {loading === "Paid" ? <ActivityIndicator size="small" color="#fff" /> : (
          <>
            <Ionicons name={isPaid ? "checkmark-circle" : "checkmark-circle-outline"} size={15} color={isPaid ? "#fff" : Colors.success} />
            <Text style={[actionStyles.btnText, isPaid && { color: "#fff" }]}>{isPaid ? "Paid ✓" : "Mark Paid"}</Text>
          </>
        )}
      </Pressable>

      {isPaid && (
        <Pressable
          style={[actionStyles.btn, actionStyles.btnUnpaid, loading === "Unpaid" && { opacity: 0.6 }]}
          onPress={() => handleStatus("Unpaid")}
          disabled={!!loading}
        >
          {loading === "Unpaid" ? <ActivityIndicator size="small" color="#fff" /> : (
            <>
              <Ionicons name="close-circle-outline" size={15} color="#fff" />
              <Text style={[actionStyles.btnText, { color: "#fff" }]}>Unpaid</Text>
            </>
          )}
        </Pressable>
      )}

      {/* Rollback */}
      <Pressable
        style={[actionStyles.btn, isRollback ? actionStyles.btnActiveRollback : actionStyles.btnInactive, loading === "Paid_rb" && { opacity: 0.6 }]}
        onPress={() => handleStatus(isPaid ? "Paid" : "Unpaid", !isRollback)}
        disabled={!!loading}
      >
        {loading === "Paid_rb" ? <ActivityIndicator size="small" color="#fff" /> : (
          <>
            <Ionicons name={isRollback ? "refresh-circle" : "refresh-circle-outline"} size={15} color={isRollback ? "#fff" : Colors.info} />
            <Text style={[actionStyles.btnText, isRollback && { color: "#fff" }]}>{isRollback ? "Rollback ✓" : "Rollback"}</Text>
          </>
        )}
      </Pressable>

      {/* Pre Intimation */}
      {onPreIntimation && (
        <Pressable
          style={[actionStyles.btn, actionStyles.btnPreIntimation]}
          onPress={() => onPreIntimation(item)}
          disabled={!!loading}
        >
          <Ionicons name="notifications-outline" size={15} color="#f59e0b" />
          <Text style={[actionStyles.btnText, { color: "#f59e0b" }]}>Pre Intimation</Text>
        </Pressable>
      )}
    </View>
  );
}

// ── Case Detail Modal ──────────────────────────────────────────────────────
function CaseDetailModal({
  item, tableType, onClose, onResetCase, onStatusUpdated, onPreIntimation,
}: {
  item: any;
  tableType: "loan" | "bkt";
  onClose: () => void;
  onResetCase: (id: number) => void;
  onStatusUpdated: () => Promise<void>;
  onPreIntimation: (item: any) => void;
}) {
  const insets = useSafeAreaInsets();
  const [resetting, setResetting] = useState(false);
  const [localItem, setLocalItem] = useState(item);

  useEffect(() => { if (item) setLocalItem(item); }, [item]);

  const statusColor = localItem ? STATUS_COLORS[localItem.status] || Colors.primary : Colors.primary;

  const rows = localItem ? [
    ...(localItem.feedback_code || localItem.latest_feedback || localItem.feedback_comments ||
    localItem.feedback_date || localItem.customer_available != null ||
    localItem.vehicle_available != null || localItem.third_party != null ||
    localItem.projection || localItem.non_starter != null || localItem.kyc_purchase != null ||
    localItem.workable != null || localItem.ptp_date || localItem.telecaller_ptp_date
  ? [
      { section: "Feedback" },
      ...(localItem.feedback_code         ? [{ label: "Feedback Code",   value: localItem.feedback_code }] : []),
      ...(localItem.latest_feedback       ? [{ label: "Detail Feedback", value: localItem.latest_feedback }] : []),
      ...(localItem.feedback_comments     ? [{ label: "Comments",        value: localItem.feedback_comments }] : []),
      ...(localItem.feedback_date         ? [{ label: "Feedback Date",   value: fmtDate(localItem.feedback_date) }] : []),
      ...(localItem.customer_available != null ? [{ label: "Customer Avail.", value: fmtBool(localItem.customer_available) }] : []),
      ...(localItem.vehicle_available  != null ? [{ label: "Vehicle Avail.",  value: fmtBool(localItem.vehicle_available) }] : []),
      ...(localItem.third_party != null   ? [{ label: "Third Party",     value: fmtBool(localItem.third_party) }] : []),
      ...(localItem.third_party === true || localItem.third_party === "true" || localItem.third_party === "t"
        ? [
            { label: "Third Party Name",   value: localItem.third_party_name },
            { label: "Third Party Number", value: localItem.third_party_number, phone: true },
          ] : []),
      ...(localItem.projection            ? [{ label: "Projection",   value: localItem.projection }] : []),
      ...(localItem.non_starter  != null  ? [{ label: "Non Starter",  value: fmtBool(localItem.non_starter) }] : []),
      ...(localItem.kyc_purchase != null  ? [{ label: "KYC Purchase", value: fmtBool(localItem.kyc_purchase) }] : []),
      ...(localItem.workable     != null  ? [{
        label: "Workable",
        value: localItem.workable === true || localItem.workable === "true" || localItem.workable === "t" ? "Workable"
             : localItem.workable === false || localItem.workable === "false" || localItem.workable === "f" ? "Non Workable" : "",
      }] : []),
      ...(localItem.ptp_date            ? [{ label: "PTP Date",       value: fmtDate(localItem.ptp_date) }] : []),
      ...(localItem.telecaller_ptp_date ? [{ label: "Telecaller PTP", value: fmtDate(localItem.telecaller_ptp_date) }] : []),
    ]
  : []
),

    { section: "Case Info" },
    { label: "Status",            value: localItem.status },
    { label: "FOS Agent",         value: localItem.agent_name },
    { label: "Company",           value: localItem.company_name },
    { label: "Customer Name",     value: localItem.customer_name },
    { label: "Loan No",           value: localItem.loan_no },
    { label: "APP ID",            value: localItem.app_id },
    { label: "BKT",               value: localItem.bkt },
    { label: "Mobile No",         value: localItem.mobile_no, phone: true },
    { label: "Address",           value: localItem.address },
    { label: "Ref Address",       value: localItem.reference_address },
    { label: "Ref 1 Name",        value: localItem.ref1_name },
    { label: "Ref 1 Mobile",      value: localItem.ref1_mobile, phone: true },
    { label: "Ref 2 Name",        value: localItem.ref2_name },
    { label: "Ref 2 Mobile",      value: localItem.ref2_mobile, phone: true },
    { label: "Ref Number",        value: localItem.ref_number },

    { section: "Financial" },
    { label: "POS",               value: fmt(localItem.pos, "₹") },
    { label: "EMI",               value: fmt(localItem.emi_amount, "₹") },
    { label: "EMI Due",           value: fmt(localItem.emi_due, "₹") },
    { label: "CBC",               value: fmt(localItem.cbc, "₹") },
    { label: "LPP",               value: fmt(localItem.lpp, "₹") },
    { label: "CBC + LPP",         value: fmt(localItem.cbc_lpp, "₹") },
    { label: "Rollback",          value: fmt(localItem.rollback, "₹") },
    { label: "Clearance",         value: fmt(localItem.clearance, "₹") },

    { section: "Vehicle" },
    { label: "Asset Name",        value: localItem.asset_name },
    { label: "Asset Make",        value: localItem.asset_make },
    { label: "Reg No",            value: localItem.registration_no },
    { label: "Engine No",         value: localItem.engine_no },
    { label: "Chassis No",        value: localItem.chassis_no },
    { label: "Tenor",             value: localItem.tenor },
    { label: "Product",           value: localItem.pro },
    { label: "First EMI Date",    value: fmtDate(localItem.first_emi_due_date) },
    { label: "Maturity Date",     value: fmtDate(localItem.loan_maturity_date) },
  ] : [];

  const handleResetCase = () => {
    Alert.alert(
      "Reset Feedback",
      `Reset feedback for ${localItem?.customer_name}? Status will be set to Unpaid.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset", style: "destructive",
          onPress: async () => {
            setResetting(true);
            try { await onResetCase(localItem.id); onClose(); }
            finally { setResetting(false); }
          },
        },
      ]
    );
  };

  return (
    <Modal visible={!!item} transparent={false} animationType="slide" onRequestClose={onClose}>
      <View style={[detailStyles.screen, { paddingTop: insets.top }]}>
        {localItem && (
          <>
            <View style={[detailStyles.header, { backgroundColor: statusColor }]}>
              <Pressable onPress={onClose} style={detailStyles.backBtn}>
                <Ionicons name="arrow-back" size={22} color="#fff" />
              </Pressable>
              <Text style={detailStyles.headerTitle} numberOfLines={1}>{localItem.customer_name}</Text>
              <View style={detailStyles.statusPill}>
                <Text style={[detailStyles.statusPillText, { color: statusColor }]}>{localItem.status}</Text>
              </View>
            </View>

            <View style={{ padding: 12, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
              <StatusActionBar
                item={localItem}
                tableType={tableType}
                onUpdated={() => { onStatusUpdated(); }}
                onPreIntimation={onPreIntimation}
              />
            </View>

            {localItem.latest_feedback || localItem.feedback_code ? (
              <Pressable
                style={[detailStyles.resetCaseBtn, resetting && { opacity: 0.6 }]}
                onPress={handleResetCase}
                disabled={resetting}
              >
                {resetting
                  ? <ActivityIndicator size="small" color={Colors.danger} />
                  : <Ionicons name="refresh" size={16} color={Colors.danger} />}
                <Text style={detailStyles.resetCaseBtnText}>
                  {resetting ? "Resetting..." : "Reset Feedback — Allow FOS to re-submit"}
                </Text>
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
                return (
                  <TableRow
                    key={r.label}
                    label={r.label!}
                    value={r.value}
                    phone={(r as any).phone}
                    even={i % 2 === 1}
                  />
                );
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
  const [search, setSearch]               = useState("");
  const [statusFilter, setStatusFilter]   = useState("All");
  const [selectedCase, setSelectedCase]   = useState<any>(null);
  const [intimationCase, setIntimationCase] = useState<any>(null);  // ← Pre Intimation
  const [selectedTableType]               = useState<"loan" | "bkt">("loan");
  const [resettingAgent, setResettingAgent] = useState<number | null>(null);
  const [agentCasesModal, setAgentCasesModal] = useState<{
    agentId: number; agentName: string; cases: any[];
  } | null>(null);
  const [resettingCaseId, setResettingCaseId] = useState<number | null>(null);

  const tableType = "loan";
  const queryKey  = ["/api/admin/cases"];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => api.admin.getCases(),
    refetchInterval: 15000,
  });

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

  const filtered = useMemo(() => {
    const cases = data?.cases || [];
    const q = search.toLowerCase().trim();
    return cases.filter((c: any) => {
      const matchStatus = statusFilter === "All" || c.status === statusFilter;
      const matchSearch =
        !q ||
        c.registration_no?.toLowerCase().includes(q) ||
        c.app_id?.toLowerCase().includes(q) ||
        c.loan_no?.toLowerCase().includes(q) ||
        c.customer_name?.toLowerCase().includes(q) ||
        c.agent_name?.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [data, search, statusFilter]);

  const agentGroups = useMemo(() => {
    const cases = data?.cases || [];
    const groups: Record<string, { agentId: number; agentName: string; count: number; feedbackCount: number }> = {};
    for (const c of cases) {
      const name = c.agent_name || "Unassigned";
      const id = c.agent_id || 0;
      if (!groups[name]) groups[name] = { agentId: id, agentName: name, count: 0, feedbackCount: 0 };
      groups[name].count++;
      if (c.latest_feedback || c.feedback_code) groups[name].feedbackCount++;
    }
    return Object.values(groups).sort((a, b) => a.agentName.localeCompare(b.agentName));
  }, [data]);

  const handleResetAgentFeedback = (agentId: number, agentName: string) => {
    Alert.alert(
      "Reset Agent Feedback",
      `Reset ALL feedback for ${agentName}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset All", style: "destructive",
          onPress: async () => {
            setResettingAgent(agentId);
            try {
              const token = await tokenStore.get();
              const url = new URL(`/api/admin/reset-feedback/agent/${agentId}`, getApiUrl()).toString();
              const res = await fetch(url, {
                method: "POST", credentials: "include",
                headers: token ? { Authorization: `Bearer ${token}` } : {},
              });
              const json: any = await res.json();
              if (!res.ok) throw new Error(json.message || "Reset failed");
              invalidateAll();
              Alert.alert("Done", `All feedback reset for ${agentName}`);
            } catch (e: any) {
              Alert.alert("Error", e.message);
            } finally {
              setResettingAgent(null);
            }
          },
        },
      ]
    );
  };

  const handleResetCase = async (caseId: number) => {
    try {
      const token = await tokenStore.get();
      const url = new URL(`/api/admin/reset-feedback/case/${caseId}`, getApiUrl()).toString();
      const res = await fetch(url, {
        method: "POST", credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ table: tableType }),
      });
      const json: any = await res.json();
      if (!res.ok) throw new Error(json.message || "Reset failed");
      invalidateAll();
      Alert.alert("Done", "Feedback reset. FOS can now re-submit.");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  const FILTERS = ["All", "Unpaid", "PTP", "Paid"];
  const paidCount   = (data?.cases || []).filter((c: any) => c.status === "Paid").length;
  const unpaidCount = (data?.cases || []).filter((c: any) => c.status !== "Paid" && c.status !== "PTP").length;
  const ptpCount    = (data?.cases || []).filter((c: any) => c.status === "PTP").length;

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
          <TextInput
            style={styles.searchInput}
            placeholder="Search by Reg No, App ID, Loan No, Agent..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />
          {search ? (
            <Pressable onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.filters}>
            {FILTERS.map((f) => (
              <Pressable
                key={f}
                style={[styles.filterChip, statusFilter === f && {
                  backgroundColor: f === "All" ? Colors.primary : STATUS_COLORS[f],
                  borderColor: "transparent",
                }]}
                onPress={() => setStatusFilter(f)}
              >
                <Text style={[styles.filterChipText, statusFilter === f && { color: "#fff" }]}>{f}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }, !filtered.length && { flex: 1 }]}
          ListHeaderComponent={
            <View style={{ gap: 12, marginBottom: 4 }}>
              <Text style={styles.count}>{filtered.length} case{filtered.length !== 1 ? "s" : ""}</Text>
              {agentGroups.length > 0 && (
                <View style={styles.resetPanel}>
                  <View style={styles.resetPanelHeader}>
                    <Ionicons name="refresh-circle" size={18} color={Colors.danger} />
                    <Text style={styles.resetPanelTitle}>Reset FOS Feedback</Text>
                  </View>
                  <Text style={styles.resetPanelSub}>Tap an agent to view and reset their feedback</Text>
                  {agentGroups.map((ag) => (
                    <Pressable
                      key={ag.agentId}
                      style={styles.agentResetRow}
                      onPress={() => {
                        const agentCases = (data?.cases || []).filter((c: any) => c.agent_id === ag.agentId);
                        setAgentCasesModal({ agentId: ag.agentId, agentName: ag.agentName, cases: agentCases });
                      }}
                    >
                      <View style={styles.agentResetInfo}>
                        <Text style={styles.agentResetName}>{ag.agentName}</Text>
                        <Text style={styles.agentResetCount}>{ag.feedbackCount}/{ag.count} feedback given · tap to view</Text>
                      </View>
                      {ag.feedbackCount > 0 ? (
                        <Pressable
                          style={[styles.resetBtn, resettingAgent === ag.agentId && { opacity: 0.5 }]}
                          onPress={(e) => { e.stopPropagation?.(); handleResetAgentFeedback(ag.agentId, ag.agentName); }}
                          disabled={resettingAgent === ag.agentId}
                        >
                          {resettingAgent === ag.agentId
                            ? <ActivityIndicator size="small" color="#fff" />
                            : (<><Ionicons name="refresh" size={13} color="#fff" /><Text style={styles.resetBtnText}>Reset All</Text></>)}
                        </Pressable>
                      ) : (
                        <View style={styles.noFeedbackBadge}>
                          <Text style={styles.noFeedbackBadgeText}>No feedback</Text>
                        </View>
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
                {item.loan_no && (
                  <View style={styles.tag}>
                    <Text style={styles.tagLabel}>LOAN</Text>
                    <Text style={styles.tagValue}>{item.loan_no}</Text>
                  </View>
                )}
                {item.app_id && (
                  <View style={styles.tag}>
                    <Text style={styles.tagLabel}>APP ID</Text>
                    <Text style={styles.tagValue}>{item.app_id}</Text>
                  </View>
                )}
                {item.bkt != null && (
                  <View style={[styles.tag, { backgroundColor: Colors.primary + "15" }]}>
                    <Text style={styles.tagLabel}>BKT</Text>
                    <Text style={[styles.tagValue, { color: Colors.primary }]}>{item.bkt}</Text>
                  </View>
                )}
                {item.pos && (
                  <View style={[styles.tag, { backgroundColor: Colors.info + "15" }]}>
                    <Text style={styles.tagLabel}>POS</Text>
                    <Text style={[styles.tagValue, { color: Colors.info }]}>
                      ₹{parseFloat(item.pos).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </Text>
                  </View>
                )}
              </View>

              {item.registration_no && <Text style={styles.regNo}>Reg: {item.registration_no}</Text>}
              {item.agent_name && <Text style={styles.agentTagText}>{item.agent_name}</Text>}

              {item.feedback_code || item.latest_feedback ? (
                <View style={styles.feedbackRow}>
                  {item.feedback_code && (
                    <View style={styles.feedbackCodeBadge}>
                      <Text style={styles.feedbackCodeText}>{item.feedback_code}</Text>
                    </View>
                  )}
                  {item.latest_feedback && (
                    <Text style={styles.feedback} numberOfLines={1}>{item.latest_feedback}</Text>
                  )}
                </View>
              ) : null}

              <StatusActionBar
                item={item}
                tableType="loan"
                onUpdated={invalidateAll}
                onPreIntimation={setIntimationCase}
              />

              <View style={styles.cardActions}>
                <Pressable style={styles.viewDetail} onPress={() => setSelectedCase(item)}>
                  <Ionicons name="eye-outline" size={14} color={Colors.primary} />
                  <Text style={styles.viewDetailText}>View Details</Text>
                </Pressable>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>{search ? `No cases matching "${search}"` : "No cases found"}</Text>
            </View>
          }
        />
      )}

      {/* Case Detail Modal */}
      <CaseDetailModal
        item={selectedCase}
        tableType={selectedTableType}
        onClose={() => setSelectedCase(null)}
        onResetCase={handleResetCase}
        onStatusUpdated={invalidateAndSyncSelected}
        onPreIntimation={setIntimationCase}
      />

      {/* Pre Intimation Modal */}
      <PreIntimationModal
        item={intimationCase}
        onClose={() => setIntimationCase(null)}
      />

      {/* Agent Cases Modal */}
      {agentCasesModal && (
        <Modal
          visible={true}
          transparent={false}
          animationType="slide"
          onRequestClose={() => setAgentCasesModal(null)}
        >
          <View style={{ flex: 1, backgroundColor: Colors.background }}>
            <View style={agentModalStyles.header}>
              <Pressable onPress={() => setAgentCasesModal(null)} style={{ padding: 8 }}>
                <Ionicons name="arrow-back" size={22} color={Colors.text} />
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={agentModalStyles.headerTitle}>{agentCasesModal.agentName}</Text>
                <Text style={agentModalStyles.headerSub}>{agentCasesModal.cases.length} cases</Text>
              </View>
              <Pressable
                style={[agentModalStyles.resetAllBtn, resettingAgent === agentCasesModal.agentId && { opacity: 0.5 }]}
                onPress={() => handleResetAgentFeedback(agentCasesModal.agentId, agentCasesModal.agentName)}
                disabled={resettingAgent === agentCasesModal.agentId}
              >
                {resettingAgent === agentCasesModal.agentId
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={agentModalStyles.resetAllBtnText}>Reset All</Text>}
              </Pressable>
            </View>

            <FlatList
              data={agentCasesModal.cases}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={{ padding: 12, gap: 10 }}
              renderItem={({ item }) => {
                const hasFeedback = !!(item.latest_feedback || item.feedback_code);
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
                      {hasFeedback && (
                        <Text style={agentModalStyles.caseFeedback} numberOfLines={1}>
                          {item.feedback_code ? item.feedback_code + " · " : ""}{item.latest_feedback || ""}
                        </Text>
                      )}
                      <StatusActionBar
                        item={item}
                        tableType="loan"
                        onUpdated={() => { invalidateAll(); setAgentCasesModal((prev) => prev ? { ...prev } : null); }}
                        onPreIntimation={setIntimationCase}
                      />
                    </View>
                    {hasFeedback ? (
                      <Pressable
                        style={[agentModalStyles.resetCaseBtn, resettingCaseId === item.id && { opacity: 0.5 }]}
                        disabled={resettingCaseId === item.id}
                        onPress={() => {
                          Alert.alert("Reset Feedback", `Reset feedback for ${item.customer_name}?`, [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Reset", style: "destructive",
                              onPress: async () => {
                                setResettingCaseId(item.id);
                                try {
                                  await handleResetCase(item.id);
                                  setAgentCasesModal((prev) =>
                                    prev
                                      ? { ...prev, cases: prev.cases.map((c) => c.id === item.id ? { ...c, latest_feedback: null, feedback_code: null, status: "Unpaid" } : c) }
                                      : null
                                  );
                                } finally {
                                  setResettingCaseId(null); }
                              },
                            },
                          ]);
                        }}
                      >
                        {resettingCaseId === item.id
                          ? <ActivityIndicator size="small" color="#fff" />
                          : (<><Ionicons name="refresh" size={13} color="#fff" /><Text style={agentModalStyles.resetCaseBtnText}>Reset</Text></>)}
                      </Pressable>
                    ) : (
                      <View style={agentModalStyles.noFeedbackTag}>
                        <Text style={agentModalStyles.noFeedbackTagText}>No feedback</Text>
                      </View>
                    )}
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={{ flex: 1, alignItems: "center", paddingTop: 60 }}>
                  <Text style={{ color: Colors.textMuted }}>No cases found</Text>
                </View>
              }
            />
          </View>
        </Modal>
      )}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const actionStyles = StyleSheet.create({
  bar:               { flexDirection: "row", gap: 6, marginTop: 4, flexWrap: "wrap" },
  btn:               { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: Colors.border },
  btnText:           { fontSize: 12, fontWeight: "700", color: Colors.text },
  btnInactive:       { backgroundColor: Colors.surfaceAlt, borderColor: Colors.border },
  btnActivePaid:     { backgroundColor: Colors.success, borderColor: Colors.success },
  btnUnpaid:         { backgroundColor: Colors.danger, borderColor: Colors.danger },
  btnActiveRollback: { backgroundColor: Colors.info, borderColor: Colors.info },
  btnPreIntimation:  { backgroundColor: "#fff7ed", borderColor: "#f59e0b" },
});

const styles = StyleSheet.create({
  filterBar:           { backgroundColor: Colors.surface, padding: 12, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  summaryRow:          { flexDirection: "row", gap: 8 },
  summaryChip:         { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  summaryChipText:     { fontSize: 12, fontWeight: "700" },
  searchBox:           { flexDirection: "row", alignItems: "center", backgroundColor: Colors.surfaceAlt, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: Colors.border },
  searchInput:         { flex: 1, fontSize: 14, color: Colors.text },
  filters:             { flexDirection: "row", gap: 8 },
  filterChip:          { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border },
  filterChipText:      { fontSize: 12, fontWeight: "600", color: Colors.textSecondary },
  count:               { fontSize: 13, color: Colors.textSecondary, fontWeight: "600" },
  list:                { padding: 12, gap: 10 },
  resetPanel:          { backgroundColor: Colors.surface, borderRadius: 14, padding: 14, gap: 10, borderWidth: 1, borderColor: Colors.danger + "30" },
  resetPanelHeader:    { flexDirection: "row", alignItems: "center", gap: 8 },
  resetPanelTitle:     { fontSize: 14, fontWeight: "700", color: Colors.danger },
  resetPanelSub:       { fontSize: 12, color: Colors.textSecondary },
  agentResetRow:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  agentResetInfo:      { flex: 1 },
  agentResetName:      { fontSize: 13, fontWeight: "700", color: Colors.text },
  agentResetCount:     { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  resetBtn:            { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: Colors.danger, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  resetBtnText:        { fontSize: 12, fontWeight: "700", color: "#fff" },
  noFeedbackBadge:     { backgroundColor: Colors.surfaceAlt, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  noFeedbackBadgeText: { fontSize: 11, color: Colors.textMuted, fontWeight: "600" },
  card:                { backgroundColor: Colors.surface, borderRadius: 14, padding: 14, gap: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  cardHeader:          { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  customerName:        { flex: 1, fontSize: 14, fontWeight: "700", color: Colors.text, textTransform: "uppercase", marginRight: 8 },
  statusBadge:         { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText:          { fontSize: 11, fontWeight: "700" },
  tagRow:              { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag:                 { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.surfaceAlt, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  tagLabel:            { fontSize: 9, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase" },
  tagValue:            { fontSize: 11, fontWeight: "700", color: Colors.text },
  regNo:               { fontSize: 12, color: Colors.textSecondary },
  agentTagText:        { fontSize: 12, fontWeight: "600", color: Colors.primary },
  feedbackRow:         { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  feedbackCodeBadge:   { backgroundColor: Colors.accent + "20", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  feedbackCodeText:    { fontSize: 11, fontWeight: "700", color: Colors.accent },
  feedback:            { flex: 1, fontSize: 12, color: Colors.textSecondary, fontStyle: "italic" },
  cardActions:         { flexDirection: "row", justifyContent: "flex-end", marginTop: 2 },
  viewDetail:          { flexDirection: "row", alignItems: "center", gap: 4 },
  viewDetailText:      { fontSize: 11, color: Colors.primary, fontWeight: "600" },
  empty:               { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText:           { fontSize: 15, color: Colors.textMuted, textAlign: "center" },
});

const agentModalStyles = StyleSheet.create({
  header:            { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingTop: 52 },
  headerTitle:       { fontSize: 16, fontWeight: "700", color: Colors.text },
  headerSub:         { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  resetAllBtn:       { backgroundColor: Colors.danger, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  resetAllBtnText:   { fontSize: 12, fontWeight: "700", color: "#fff" },
  caseRow:           { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: Colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border },
  caseInfo:          { flex: 1 },
  caseName:          { fontSize: 13, fontWeight: "700", color: Colors.text, textTransform: "uppercase", flex: 1 },
  caseLoan:          { fontSize: 11, color: Colors.textSecondary, marginBottom: 2 },
  caseFeedback:      { fontSize: 11, color: Colors.accent, fontStyle: "italic", marginBottom: 4 },
  statusBadge:       { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  statusText:        { fontSize: 10, fontWeight: "700" },
  resetCaseBtn:      { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: Colors.danger, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, minWidth: 70, justifyContent: "center", alignSelf: "flex-start" },
  resetCaseBtnText:  { fontSize: 12, fontWeight: "700", color: "#fff" },
  noFeedbackTag:     { backgroundColor: Colors.surfaceAlt, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, alignSelf: "flex-start" },
  noFeedbackTagText: { fontSize: 11, color: Colors.textMuted, fontWeight: "600" },
});

const detailStyles = StyleSheet.create({
  screen:            { flex: 1, backgroundColor: Colors.background },
  header:            { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 14, gap: 10 },
  backBtn:           { padding: 4 },
  headerTitle:       { flex: 1, fontSize: 16, fontWeight: "700", color: "#fff" },
  statusPill:        { backgroundColor: "rgba(255,255,255,0.9)", borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4 },
  statusPillText:    { fontSize: 11, fontWeight: "800" },
  sectionHeader:     { backgroundColor: Colors.primary + "18", paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.primary + "30" },
  sectionHeaderText: { fontSize: 12, fontWeight: "800", color: Colors.primary, textTransform: "uppercase", letterSpacing: 0.8 },
  resetCaseBtn:      { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.danger + "12", borderBottomWidth: 1, borderBottomColor: Colors.danger + "30", paddingHorizontal: 16, paddingVertical: 12 },
  resetCaseBtnText:  { fontSize: 13, fontWeight: "700", color: Colors.danger },
  noFeedbackBanner:  { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.surfaceAlt, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingHorizontal: 16, paddingVertical: 10 },
  noFeedbackText:    { fontSize: 12, color: Colors.textMuted },
  row:               { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.surface },
  labelCell:         { width: "42%", backgroundColor: Colors.surfaceAlt, padding: 12, justifyContent: "center", borderRightWidth: 1, borderRightColor: Colors.border },
  labelText:         { fontSize: 13, fontWeight: "700", color: Colors.primary },
  valueCell:         { flex: 1, padding: 12, justifyContent: "center" },
  valueText:         { fontSize: 13, color: Colors.text, fontWeight: "400" },
});

const intimStyles = StyleSheet.create({
  screen:          { flex: 1, backgroundColor: Colors.background },
  header:          { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: "#92400e" },
  headerTitle:     { flex: 1, fontSize: 16, fontWeight: "700", color: "#fff" },
  downloadBtn:     { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  downloadBtnText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  letterContainer: { padding: 16 },
  letterCard:      { backgroundColor: "#fff", borderRadius: 12, padding: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
  letterTitle:     { fontSize: 16, fontWeight: "800", color: "#1a1a1a", textAlign: "center", marginBottom: 8 },
  divider:         { height: 1, backgroundColor: "#e0e0e0", marginBottom: 14 },
  letterDate:      { fontSize: 13, fontWeight: "700", color: "#1a1a1a", marginBottom: 16 },
  toBlock:         { marginBottom: 14, paddingLeft: 16 },
  subjectBlock:    { marginBottom: 14 },
  letterBodyText:  { fontSize: 13, color: "#333", lineHeight: 20, marginBottom: 4 },
  boldText:        { fontWeight: "700", color: "#1a1a1a" },
  detailsTable:    { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, overflow: "hidden", marginVertical: 8 },
  detailRow:       { flexDirection: "row", paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#fff", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e5e5e5" },
  detailLabel:     { width: "40%", fontSize: 12, color: "#555", fontWeight: "600" },
  detailColon:     { width: 16, fontSize: 12, color: "#555", textAlign: "center" },
  detailValue:     { flex: 1, fontSize: 12, color: "#1a1a1a" },
  editableCard:    { backgroundColor: Colors.primary + "10", borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: Colors.primary + "30", gap: 10 },
  editableTitle:   { fontSize: 13, fontWeight: "700", color: Colors.primary, marginBottom: 4 },
  editableRow:     { gap: 4 },
  editableLabel:   { fontSize: 12, fontWeight: "600", color: Colors.textSecondary },
  editableInput:   { backgroundColor: "#fff", borderRadius: 8, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: Colors.text },
});

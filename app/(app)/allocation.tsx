import React, { useState, useMemo } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput, Linking, Alert, ActivityIndicator, Modal, ScrollView, Platform
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";

const TABS = ["Unpaid", "PTP", "Paid"];
const STATUS_COLORS: Record<string, string> = {
  Unpaid: Colors.statusUnpaid,
  PTP: Colors.statusPTP,
  Paid: Colors.statusPaid,
};

// ✅ Detail feedback options per status
const PAID_DETAIL_OPTIONS = ["PAID", "PART PAYMENT", "SETTLED"];
const PTP_DETAIL_OPTIONS = ["PTP DATE SET", "WILL PAY TOMORROW", "WILL ARRANGE FUNDS", "CALL LATER"];

const FEEDBACK_CODES = ["PAID", "RTP", "SKIP", "PTP", "CAVNA", "ANF", "EXP", "SFT", "VSL"];
const PROJECTION_OPTIONS = ["ST", "RF", "RB"];

function fmt(v: any, prefix = "") {
  if (v === null || v === undefined || v === "") return "—";
  const n = parseFloat(v);
  if (!isNaN(n)) return prefix + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return String(v);
}

function YNToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
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

function FeedbackModal({ visible, caseItem, onClose, onSave, isLocked = false }: any) {
  const [status, setStatus] = useState(caseItem?.status || "Unpaid");
  const [detailFeedback, setDetailFeedback] = useState(caseItem?.latest_feedback || "");
  const [feedbackCode, setFeedbackCode] = useState(caseItem?.feedback_code || "");
  const [comments, setComments] = useState(caseItem?.feedback_comments || "");
  const [ptpDate, setPtpDate] = useState(
    caseItem?.ptp_date ? String(caseItem.ptp_date).slice(0, 10) : ""
  );
  const [rollbackYn, setRollbackYn] = useState<boolean | null>(
    caseItem?.rollback_yn != null ? Boolean(caseItem.rollback_yn) : null
  );
  const [customerAvailable, setCustomerAvailable] = useState<boolean | null>(caseItem?.customer_available ?? null);
  const [vehicleAvailable, setVehicleAvailable] = useState<boolean | null>(caseItem?.vehicle_available ?? null);
  const [thirdParty, setThirdParty] = useState<boolean | null>(caseItem?.third_party ?? null);
  const [thirdPartyName, setThirdPartyName] = useState(caseItem?.third_party_name || "");
  const [thirdPartyNumber, setThirdPartyNumber] = useState(caseItem?.third_party_number || "");
  const [projection, setProjection] = useState(caseItem?.projection || "");
  const [nonStarter, setNonStarter] = useState<boolean | null>(caseItem?.non_starter ?? null);
  const [kycPurchase, setKycPurchase] = useState<boolean | null>(caseItem?.kyc_purchase ?? null);
  const [workable, setWorkable] = useState<boolean | null>(caseItem?.workable ?? null);
  const [loading, setLoading] = useState(false);

  const handleStatusChange = (newStatus: string) => {
    setStatus(newStatus);
    setDetailFeedback("");
  };

  const toIsoDate = (val: string) => {
    const parts = val.trim().split(/[-\/]/);
    if (parts.length === 3 && parts[2].length === 4)
      return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
    return val;
  };

  const save = async () => {
    if (!isLocked && !feedbackCode) {
      Alert.alert("Error", "Please select a Feedback Code");
      return;
    }
    if (status === "PTP" && !ptpDate) {
      Alert.alert("Error", "Please enter a PTP date");
      return;
    }
    setLoading(true);
    try {
      await api.updateFeedback(caseItem.id, {
        status,
        feedback: detailFeedback,
        comments,
        ptp_date: status === "PTP" ? toIsoDate(ptpDate) : null,
        rollback_yn: rollbackYn,
        customer_available: customerAvailable,
        vehicle_available: vehicleAvailable,
        third_party: thirdParty,
        third_party_name: thirdParty ? thirdPartyName : null,
        third_party_number: thirdParty ? thirdPartyNumber : null,
        feedback_code: feedbackCode,
        projection,
        non_starter: nonStarter,
        kyc_purchase: kycPurchase,
        workable,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSave();
      onClose();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  // Detail feedback options per status
  const detailOptions =
    status === "Paid" ? PAID_DETAIL_OPTIONS :
    status === "PTP"  ? PTP_DETAIL_OPTIONS  : null;

  // ✅ Show PTP options if feedback code is PTP (regardless of status)
  const showPtpOptions = feedbackCode === "PTP" || status === "PTP";

  const renderDetailOptions = (options: string[], activeColor: string) => (
    <View style={{ gap: 8, marginBottom: 12 }}>
      {options.map((opt) => (
        <Pressable
          key={opt}
          style={[
            fbStyles.detailOptionBtn,
            detailFeedback === opt && {
              backgroundColor: activeColor + "20",
              borderColor: activeColor,
            },
          ]}
          onPress={() => setDetailFeedback(detailFeedback === opt ? "" : opt)}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={[fbStyles.detailOptionDot, detailFeedback === opt && { backgroundColor: activeColor }]} />
            <Text style={[fbStyles.detailOptionText, detailFeedback === opt && { color: activeColor, fontWeight: "700" }]}>
              {opt}
            </Text>
          </View>
          {detailFeedback === opt && <Ionicons name="checkmark-circle" size={20} color={activeColor} />}
        </Pressable>
      ))}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={fbStyles.overlay}>
        <ScrollView style={fbStyles.sheet} showsVerticalScrollIndicator={false}>
          <View style={fbStyles.handle} />
          <Text style={fbStyles.title}>Update Feedback</Text>
          <Text style={fbStyles.customerName}>
            {caseItem?.customer_name} · {caseItem?.loan_no}
          </Text>

          {/* ✅ Locked banner */}
          {isLocked && (
            <View style={fbStyles.lockedBanner}>
              <Ionicons name="lock-closed" size={14} color={Colors.warning} />
              <Text style={fbStyles.lockedText}>Feedback locked. You can only change status to Paid or PTP.</Text>
            </View>
          )}

          {/* STATUS */}
          <Text style={fbStyles.sectionLabel}>Status</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {TABS.map((t) => {
                const disabled = isLocked && t === "Unpaid";
                return (
                  <Pressable
                    key={t}
                    style={[
                      fbStyles.tabChip,
                      status === t && { backgroundColor: STATUS_COLORS[t], borderColor: STATUS_COLORS[t] },
                      disabled && { opacity: 0.3 },
                    ]}
                    onPress={() => !disabled && handleStatusChange(t)}
                  >
                    <Text style={[fbStyles.tabChipText, status === t && { color: "#fff" }]}>{t}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {/* ====== PAID LAYOUT ====== */}
          {status === "Paid" && (
            <>
              <Text style={fbStyles.sectionLabel}>Detail Feedback</Text>
              {renderDetailOptions(PAID_DETAIL_OPTIONS, Colors.success)}

              {/* Rollback */}
              <YNToggle label="Rollback" value={rollbackYn} onChange={setRollbackYn} />

              {/* Comments */}
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

          {/* ====== PTP LAYOUT ====== */}
          {status === "PTP" && (
            <>
              <Text style={fbStyles.sectionLabel}>Detail Feedback</Text>
              {renderDetailOptions(PTP_DETAIL_OPTIONS, Colors.statusPTP)}

              {/* PTP Date */}
              <Text style={fbStyles.sectionLabel}>PTP Date</Text>
              <TextInput
                style={[fbStyles.commentInput, { minHeight: 44, marginBottom: 12 }]}
                placeholder="DD-MM-YYYY"
                placeholderTextColor={Colors.textMuted}
                value={ptpDate}
                onChangeText={setPtpDate}
                keyboardType="numeric"
              />

              {/* Rollback */}
              <YNToggle label="Rollback" value={rollbackYn} onChange={setRollbackYn} />

              {/* Comments */}
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

          {/* ====== UNPAID LAYOUT ====== */}
          {status === "Unpaid" && (
            <>
              {isLocked ? (
                /* ✅ Locked — show all fields as read-only display */
                <View style={fbStyles.lockedFieldsContainer}>
                  {[
                    { label: "Feedback Code", value: caseItem?.feedback_code },
                    { label: "Detail Feedback", value: caseItem?.latest_feedback },
                    { label: "Customer Available", value: caseItem?.customer_available === true ? "Y" : caseItem?.customer_available === false ? "N" : "" },
                    { label: "Vehicle Available", value: caseItem?.vehicle_available === true ? "Y" : caseItem?.vehicle_available === false ? "N" : "" },
                    { label: "Third Party", value: caseItem?.third_party === true ? "Y" : caseItem?.third_party === false ? "N" : "" },
                    { label: "Projection", value: caseItem?.projection },
                    { label: "Non Starter", value: caseItem?.non_starter === true ? "Y" : caseItem?.non_starter === false ? "N" : "" },
                    { label: "KYC Purchase", value: caseItem?.kyc_purchase === true ? "Y" : caseItem?.kyc_purchase === false ? "N" : "" },
                    { label: "Workable", value: caseItem?.workable === true ? "Workable" : caseItem?.workable === false ? "Non Workable" : "" },
                    { label: "Comments", value: caseItem?.feedback_comments },
                  ].filter(f => f.value).map(f => (
                    <View key={f.label} style={fbStyles.lockedField}>
                      <Text style={fbStyles.lockedFieldLabel}>{f.label}</Text>
                      <Text style={fbStyles.lockedFieldValue}>{f.value}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                /* ✅ Unlocked — full Unpaid form */
                <>
                  <YNToggle label="Customer Available" value={customerAvailable} onChange={setCustomerAvailable} />
                  <YNToggle label="Vehicle Available" value={vehicleAvailable} onChange={setVehicleAvailable} />
                  <YNToggle label="Third Party" value={thirdParty} onChange={setThirdParty} />

                  {thirdParty === true && (
                    <>
                      <Text style={fbStyles.sectionLabel}>Third Party Name</Text>
                      <TextInput
                        style={[fbStyles.commentInput, { minHeight: 44, marginBottom: 8 }]}
                        placeholder="Enter name"
                        placeholderTextColor={Colors.textMuted}
                        value={thirdPartyName}
                        onChangeText={setThirdPartyName}
                      />
                      <Text style={fbStyles.sectionLabel}>Third Party Number</Text>
                      <TextInput
                        style={[fbStyles.commentInput, { minHeight: 44, marginBottom: 8 }]}
                        placeholder="Enter number"
                        placeholderTextColor={Colors.textMuted}
                        value={thirdPartyNumber}
                        onChangeText={setThirdPartyNumber}
                        keyboardType="phone-pad"
                      />
                    </>
                  )}

                  {/* Feedback Code */}
                  <Text style={fbStyles.sectionLabel}>Feedback Code</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      {FEEDBACK_CODES.map((f) => (
                        <Pressable
                          key={f}
                          style={[
                            fbStyles.tabChip,
                            feedbackCode === f && { backgroundColor: Colors.accent, borderColor: Colors.accent },
                          ]}
                          onPress={() => setFeedbackCode(f)}
                        >
                          <Text style={[fbStyles.tabChipText, feedbackCode === f && { color: "#fff" }]}>{f}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </ScrollView>

                  {/* Detail Feedback — PTP options if feedback code is PTP, else free text */}
                  <Text style={fbStyles.sectionLabel}>Detail Feedback</Text>
                  {feedbackCode === "PTP" ? (
                    <>
                      {renderDetailOptions(PTP_DETAIL_OPTIONS, Colors.statusPTP)}
                      <Text style={fbStyles.sectionLabel}>PTP Date</Text>
                      <TextInput
                        style={[fbStyles.commentInput, { minHeight: 44, marginBottom: 12 }]}
                        placeholder="DD-MM-YYYY"
                        placeholderTextColor={Colors.textMuted}
                        value={ptpDate}
                        onChangeText={setPtpDate}
                        keyboardType="numeric"
                      />
                    </>
                  ) : (
                    <TextInput
                      style={fbStyles.commentInput}
                      placeholder="Enter details feedback..."
                      placeholderTextColor={Colors.textMuted}
                      value={detailFeedback}
                      onChangeText={setDetailFeedback}
                      multiline
                      numberOfLines={3}
                    />
                  )}

                  {/* Projection */}
                  <Text style={fbStyles.sectionLabel}>Projection</Text>
                  <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                    {PROJECTION_OPTIONS.map((p) => (
                      <Pressable
                        key={p}
                        style={[
                          fbStyles.feedbackOption,
                          { flex: 1, alignItems: "center" },
                          projection === p && { backgroundColor: Colors.primary, borderColor: Colors.primary },
                        ]}
                        onPress={() => setProjection(projection === p ? "" : p)}
                      >
                        <Text style={[fbStyles.feedbackOptionText, projection === p && { color: "#fff" }]}>{p}</Text>
                      </Pressable>
                    ))}
                  </View>

                  {/* Non Starter */}
                  <YNToggle label="Non Starter" value={nonStarter} onChange={setNonStarter} />

                  {/* KYC Purchase */}
                  <YNToggle label="KYC Purchase" value={kycPurchase} onChange={setKycPurchase} />

                  {/* Workable */}
                  <Text style={fbStyles.sectionLabel}>Workable</Text>
                  <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                    {(["Workable", "Non Workable"] as const).map((w) => {
                      const val = w === "Workable";
                      return (
                        <Pressable
                          key={w}
                          style={[
                            fbStyles.feedbackOption,
                            { flex: 1, alignItems: "center" },
                            workable === val && {
                              backgroundColor: val ? Colors.success : Colors.danger,
                              borderColor: val ? Colors.success : Colors.danger,
                            },
                          ]}
                          onPress={() => setWorkable(workable === val ? null : val)}
                        >
                          <Text style={[fbStyles.feedbackOptionText, workable === val && { color: "#fff" }]}>{w}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {/* Comments */}
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
            </>
          )}

          <View style={fbStyles.btnRow}>
            <Pressable style={fbStyles.cancelBtn} onPress={onClose}>
              <Text style={fbStyles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[fbStyles.saveBtn, { backgroundColor: STATUS_COLORS[status] }]}
              onPress={save}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={fbStyles.saveText}>Save</Text>}
            </Pressable>
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}


function CaseCard({ item, onFeedback }: { item: any; onFeedback: (item: any) => void }) {
  const call = () => {
    const phones = item.mobile_no?.split(",") || [];
    const num = phones[0]?.trim();
    if (!num) { Alert.alert("No number available"); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Linking.openURL(`tel:${num}`);
  };

  const statusColor = STATUS_COLORS[item.status] || Colors.textMuted;

  return (
    <View style={styles.card}>
      <Pressable
        style={styles.cardTapArea}
        onPress={() => router.push({ pathname: "/(app)/customer/[id]", params: { id: item.id } })}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardNameRow}>
            <Ionicons name="person-circle" size={20} color={Colors.primary} />
            <Text style={styles.cardName} numberOfLines={1}>{item.customer_name}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + "22" }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{item.status}</Text>
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
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>ROLLBACK</Text>
            <Text style={styles.infoValue}>{fmt(item.rollback, "₹")}</Text>
          </View>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>CLEARANCE</Text>
            <Text style={[styles.infoValue, { color: Colors.success }]}>{fmt(item.clearance, "₹")}</Text>
          </View>
          <View style={styles.infoCellSmall}>
            <Text style={styles.infoLabel}>TEN</Text>
            <Text style={styles.infoValue}>{item.tenor ?? "—"}</Text>
          </View>
        </View>
      </Pressable>

      {item.mobile_no && (
        <Pressable style={styles.phoneRow} onPress={call}>
          <Ionicons name="call" size={14} color={Colors.info} />
          <Text style={styles.phoneText}>{item.mobile_no}</Text>
        </Pressable>
      )}

      {/* ✅ Show feedback code + detail feedback */}
      {item.feedback_code && (
        <View style={styles.feedbackRow}>
          <Text style={styles.feedbackLabel}>FB Code: </Text>
          <Text style={styles.feedbackValue}>{item.feedback_code}</Text>
          {item.latest_feedback ? (
            <Text style={styles.feedbackValue}> · {item.latest_feedback}</Text>
          ) : null}
        </View>
      )}

      {/* ✅ Show PTP date prominently if set */}
      {item.ptp_date && (
        <View style={styles.ptpDateRow}>
          <Ionicons name="calendar" size={13} color={Colors.statusPTP} />
          <Text style={styles.ptpDateLabel}>PTP Date: </Text>
          <Text style={styles.ptpDateValue}>
            {String(item.ptp_date).slice(0, 10)}
          </Text>
        </View>
      )}

      {/* ✅ Show telecaller PTP date if set */}
      {item.telecaller_ptp_date && (
        <View style={styles.ptpDateRow}>
          <Ionicons name="calendar-outline" size={13} color={Colors.info} />
          <Text style={[styles.ptpDateLabel, { color: Colors.info }]}>Telecaller PTP: </Text>
          <Text style={[styles.ptpDateValue, { color: Colors.info }]}>
            {String(item.telecaller_ptp_date).slice(0, 10)}
          </Text>
        </View>
      )}

      <View style={styles.cardActions}>
        <Pressable style={[styles.actionBtn, styles.callBtn]} onPress={call}>
          <Ionicons name="call" size={16} color="#fff" />
          <Text style={styles.actionBtnText}>Call</Text>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, styles.detailBtn]}
          onPress={() => router.push({ pathname: "/(app)/customer/[id]", params: { id: item.id } })}
        >
          <Ionicons name="eye" size={16} color={Colors.textSecondary} />
          <Text style={[styles.actionBtnText, { color: Colors.textSecondary }]}>Details</Text>
        </Pressable>
        {item.status === "Unpaid" && item.latest_feedback ? (
          <Pressable style={[styles.actionBtn, styles.statusChangeBtn]} onPress={() => onFeedback(item)}>
            <Ionicons name="swap-horizontal" size={16} color="#fff" />
            <Text style={styles.actionBtnText}>Mark Paid/PTP</Text>
          </Pressable>
        ) : (
          <Pressable style={[styles.actionBtn, styles.feedbackBtn]} onPress={() => onFeedback(item)}>
            <Ionicons name="chatbox" size={16} color="#fff" />
            <Text style={styles.actionBtnText}>Feedback</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export default function AllocationScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("Unpaid");
  const [search, setSearch] = useState("");
  const [feedbackItem, setFeedbackItem] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/cases"],
    queryFn: () => api.getCases(),
  });

  const filtered = useMemo(() => {
    const cases = data?.cases || [];
    return cases
      .filter((c: any) => c.status === activeTab)
      .filter(
        (c: any) =>
          !search ||
          c.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
          c.loan_no?.toLowerCase().includes(search.toLowerCase()) ||
          c.app_id?.toLowerCase().includes(search.toLowerCase()) ||
          c.registration_no?.toLowerCase().includes(search.toLowerCase())
      );
  }, [data, activeTab, search]);

  const counts = useMemo(() => {
    const cases = data?.cases || [];
    return {
      Unpaid: cases.filter((c: any) => c.status === "Unpaid").length,
      PTP: cases.filter((c: any) => c.status === "PTP").length,
      Paid: cases.filter((c: any) => c.status === "Paid").length,
    };
  }, [data]);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={[styles.tabsContainer, { paddingTop: Platform.OS === "web" ? 67 : 12 }]}>
        {TABS.map((tab) => (
          <Pressable
            key={tab}
            style={[
              styles.tab,
              activeTab === tab && [styles.tabActive, { backgroundColor: STATUS_COLORS[tab] }],
            ]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
            <View
              style={[
                styles.tabCount,
                activeTab === tab && { backgroundColor: "rgba(255,255,255,0.3)" },
              ]}
            >
              <Text
                style={[
                  styles.tabCountText,
                  activeTab === tab && { color: "#fff" },
                ]}
              >
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
          renderItem={({ item }) => <CaseCard item={item} onFeedback={setFeedbackItem} />}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + 24 },
            filtered.length === 0 && { flex: 1 },
          ]}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No {activeTab} cases</Text>
            </View>
          }
          scrollEnabled={!!filtered.length}
        />
      )}

      {feedbackItem && (
        <FeedbackModal
          visible={!!feedbackItem}
          caseItem={feedbackItem}
          isLocked={feedbackItem?.status === "Unpaid" && !!feedbackItem?.latest_feedback}
          onClose={() => setFeedbackItem(null)}
          onSave={() => {
            qc.invalidateQueries({ queryKey: ["/api/cases"] });
            qc.invalidateQueries({ queryKey: ["/api/stats"] });
            qc.invalidateQueries({ queryKey: ["/api/bkt-perf-summary"] });
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabsContainer: {
    flexDirection: "row", backgroundColor: Colors.surface,
    paddingHorizontal: 12, paddingBottom: 12, gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1, alignItems: "center", paddingVertical: 10, paddingHorizontal: 4,
    borderRadius: 10, backgroundColor: Colors.surfaceAlt, gap: 4,
  },
  tabActive: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 3 },
  tabText: { fontSize: 12, fontWeight: "600", color: Colors.textSecondary, textAlign: "center" },
  tabTextActive: { color: "#fff" },
  tabCount: { backgroundColor: Colors.border, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1, minWidth: 20, alignItems: "center" },
  tabCountText: { fontSize: 11, fontWeight: "700", color: Colors.textSecondary },
  searchContainer: {
    flexDirection: "row", alignItems: "center", margin: 12,
    backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.text },
  list: { padding: 12, gap: 12 },
  card: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 14, gap: 8,
    borderWidth: 1, borderColor: Colors.border,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  cardTapArea: { gap: 8 },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardNameRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  cardName: { flex: 1, fontSize: 15, fontWeight: "700", color: Colors.text, textTransform: "uppercase" },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: "700" },
  infoRow: { flexDirection: "row", gap: 6 },
  infoCell: { flex: 1, backgroundColor: Colors.surfaceAlt, borderRadius: 8, padding: 8 },
  infoCellSmall: { width: 52, backgroundColor: Colors.surfaceAlt, borderRadius: 8, padding: 8 },
  infoLabel: { fontSize: 9, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase", marginBottom: 2 },
  infoValue: { fontSize: 12, fontWeight: "700", color: Colors.text },
  phoneRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 },
  phoneText: { fontSize: 13, color: Colors.info, fontWeight: "500" },
  feedbackRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  feedbackLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: "600" },
  feedbackValue: { fontSize: 12, color: Colors.text, fontWeight: "500" },
  // ✅ PTP date row
  ptpDateRow: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: Colors.statusPTP + "12", borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  ptpDateLabel: { fontSize: 12, color: Colors.statusPTP, fontWeight: "600" },
  ptpDateValue: { fontSize: 12, color: Colors.statusPTP, fontWeight: "700" },
  cardActions: { flexDirection: "row", gap: 8, marginTop: 4 },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 10, borderRadius: 10, gap: 5,
  },
  callBtn: { backgroundColor: Colors.primary },
  detailBtn: { backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.borderLight },
  feedbackBtn: { backgroundColor: Colors.accent },
  statusChangeBtn: { backgroundColor: Colors.statusPTP },
  actionBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText: { fontSize: 16, color: Colors.textMuted },
});

const fbStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, maxHeight: "90%",
  },
  handle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: "center", marginBottom: 12 },
  title: { fontSize: 20, fontWeight: "700", color: Colors.text, marginBottom: 4 },
  customerName: { fontSize: 13, color: Colors.textSecondary, marginBottom: 12, textTransform: "uppercase" },
  sectionLabel: { fontSize: 13, fontWeight: "700", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  tabChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border,
  },
  tabChipText: { fontSize: 13, fontWeight: "600", color: Colors.textSecondary },
  feedbackOption: {
    paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt,
  },
  feedbackOptionText: { fontSize: 14, fontWeight: "600", color: Colors.text },
  // ✅ New detail option button style
  detailOptionBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt,
  },
  detailOptionDot: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.border,
  },
  detailOptionText: { fontSize: 14, fontWeight: "600", color: Colors.text },
  commentInput: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 12,
    fontSize: 14, color: Colors.text, minHeight: 80, textAlignVertical: "top",
    backgroundColor: Colors.surfaceAlt, marginBottom: 12,
  },
  btnRow: { flexDirection: "row", gap: 12 },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1,
    borderColor: Colors.border, alignItems: "center",
  },
  cancelText: { fontSize: 15, fontWeight: "600", color: Colors.textSecondary },
  saveBtn: { flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  saveText: { fontSize: 15, fontWeight: "700", color: "#fff" },
});

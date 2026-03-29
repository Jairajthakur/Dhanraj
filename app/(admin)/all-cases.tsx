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

function TableRow({
  label,
  value,
  phone,
  even,
}: {
  label: string;
  value?: any;
  phone?: boolean;
  even?: boolean;
}) {
  const display =
    value !== null && value !== undefined && value !== ""
      ? String(value)
      : "";
  if (!display) return null;
  return (
    <View style={[detailStyles.row, even && { backgroundColor: Colors.surfaceAlt }]}>
      <View style={detailStyles.labelCell}>
        <Text style={detailStyles.labelText}>{label}</Text>
      </View>
      <View style={detailStyles.valueCell}>
        {phone && display ? (
          <Pressable
            onPress={() =>
              Linking.openURL(`tel:${display.split(",")[0].trim()}`)
            }
          >
            <Text
              style={[
                detailStyles.valueText,
                { color: Colors.info, textDecorationLine: "underline" },
              ]}
            >
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

function StatusActionBar({
  item,
  tableType,
  onUpdated,
}: {
  item: any;
  tableType: "loan" | "bkt";
  onUpdated: () => void;
}) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleStatus = async (
    status: "Paid" | "Unpaid",
    rollback_yn?: boolean
  ) => {
    const key = status + (rollback_yn !== undefined ? "_rb" : "");
    setLoading(key);
    try {
      await api.admin.updateCaseStatus(item.id, {
        status,
        rollback_yn: rollback_yn ?? null,
        table: tableType,
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
      <Pressable
        style={[
          actionStyles.btn,
          isPaid ? actionStyles.btnActivePaid : actionStyles.btnInactive,
          loading === "Paid" && { opacity: 0.6 },
        ]}
        onPress={() => handleStatus(isPaid ? "Unpaid" : "Paid")}
        disabled={!!loading}
      >
        {loading === "Paid" ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Ionicons
              name={isPaid ? "checkmark-circle" : "checkmark-circle-outline"}
              size={15}
              color={isPaid ? "#fff" : Colors.success}
            />
            <Text style={[actionStyles.btnText, isPaid && { color: "#fff" }]}>
              {isPaid ? "Paid ✓" : "Mark Paid"}
            </Text>
          </>
        )}
      </Pressable>

      {isPaid && (
        <Pressable
          style={[
            actionStyles.btn,
            actionStyles.btnUnpaid,
            loading === "Unpaid" && { opacity: 0.6 },
          ]}
          onPress={() => handleStatus("Unpaid")}
          disabled={!!loading}
        >
          {loading === "Unpaid" ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="close-circle-outline" size={15} color="#fff" />
              <Text style={[actionStyles.btnText, { color: "#fff" }]}>Unpaid</Text>
            </>
          )}
        </Pressable>
      )}

      <Pressable
        style={[
          actionStyles.btn,
          isRollback ? actionStyles.btnActiveRollback : actionStyles.btnInactive,
          loading === "Paid_rb" && { opacity: 0.6 },
        ]}
        onPress={() => handleStatus(isPaid ? "Paid" : "Unpaid", !isRollback)}
        disabled={!!loading}
      >
        {loading === "Paid_rb" ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Ionicons
              name={isRollback ? "refresh-circle" : "refresh-circle-outline"}
              size={15}
              color={isRollback ? "#fff" : Colors.info}
            />
            <Text style={[actionStyles.btnText, isRollback && { color: "#fff" }]}>
              {isRollback ? "Rollback ✓" : "Rollback"}
            </Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

function CaseDetailModal({
  item,
  tableType,
  onClose,
  onResetCase,
  onStatusUpdated,
}: {
  item: any;
  tableType: "loan" | "bkt";
  onClose: () => void;
  onResetCase: (id: number) => void;
  onStatusUpdated: () => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const [resetting, setResetting] = useState(false);
  const [localItem, setLocalItem] = useState(item);

  useEffect(() => {
    if (item) setLocalItem(item);
  }, [item]);

  const statusColor = localItem
    ? STATUS_COLORS[localItem.status] || Colors.primary
    : Colors.primary;

  const rows = localItem ? [
    { section: "Feedback" },
    { label: "Feedback Code",     value: localItem.feedback_code },
    { label: "Detail Feedback",   value: localItem.latest_feedback },
    { label: "Comments",          value: localItem.feedback_comments },
    { label: "Feedback Date",     value: fmtDate(localItem.feedback_date) },
    { label: "Customer Avail.",   value: fmtBool(localItem.customer_available) },
    { label: "Vehicle Avail.",    value: fmtBool(localItem.vehicle_available) },
    { label: "Third Party",       value: fmtBool(localItem.third_party) },
    ...(localItem.third_party === true || localItem.third_party === "true" || localItem.third_party === "t"
      ? [
          { label: "Third Party Name",   value: localItem.third_party_name },
          { label: "Third Party Number", value: localItem.third_party_number, phone: true },
        ]
      : []),
    { label: "Projection",        value: localItem.projection },
    { label: "Non Starter",       value: fmtBool(localItem.non_starter) },
    { label: "KYC Purchase",      value: fmtBool(localItem.kyc_purchase) },
    {
      label: "Workable",
      value: localItem.workable === true || localItem.workable === "true" || localItem.workable === "t"
        ? "Workable"
        : localItem.workable === false || localItem.workable === "false" || localItem.workable === "f"
        ? "Non Workable" : "",
    },
    { label: "PTP Date",          value: fmtDate(localItem.ptp_date) },
    { label: "Telecaller PTP",    value: fmtDate(localItem.telecaller_ptp_date) },

    { section: "Case Info" },
    { label: "Status",            value: localItem.status },
    { label: "FOS Agent",         value: localItem.agent_name },
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
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            setResetting(true);
            try {
              await onResetCase(localItem.id);
              onClose();
            } finally {
              setResetting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={!!item}
      transparent={false}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={[detailStyles.screen, { paddingTop: insets.top }]}>
        {localItem && (
          <>
            <View style={[detailStyles.header, { backgroundColor: statusColor }]}>
              <Pressable onPress={onClose} style={detailStyles.backBtn}>
                <Ionicons name="arrow-back" size={22} color="#fff" />
              </Pressable>
              <Text style={detailStyles.headerTitle} numberOfLines={1}>
                {localItem.customer_name}
              </Text>
              <View style={detailStyles.statusPill}>
                <Text style={[detailStyles.statusPillText, { color: statusColor }]}>
                  {localItem.status}
                </Text>
              </View>
            </View>

            <View style={{ padding: 12, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
              <StatusActionBar
                item={localItem}
                tableType={tableType}
                onUpdated={() => { onStatusUpdated(); }}
              />
            </View>

            {localItem.latest_feedback || localItem.feedback_code ? (
              <Pressable
                style={[detailStyles.resetCaseBtn, resetting && { opacity: 0.6 }]}
                onPress={handleResetCase}
                disabled={resetting}
              >
                {resetting ? (
                  <ActivityIndicator size="small" color={Colors.danger} />
                ) : (
                  <Ionicons name="refresh" size={16} color={Colors.danger} />
                )}
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

// ─── FOS Agent Cases Modal ────────────────────────────────────────────────────
function FosAgentCasesModal({
  agentId,
  agentName,
  cases,
  onClose,
  onUpdated,
  onResetCase,
  onResetAgent,
}: {
  agentId: number;
  agentName: string;
  cases: any[];
  onClose: () => void;
  onUpdated: () => void;
  // CHANGE 7: Updated prop type to accept optional caseType
  onResetCase: (id: number, caseType?: string) => Promise<void>;
  onResetAgent: (id: number, name: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedCase, setSelectedCase] = useState<any>(null);
  const [resettingCaseId, setResettingCaseId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return cases.filter((c) => {
      const matchStatus = statusFilter === "All" || c.status === statusFilter;
      const matchSearch =
        !q ||
        c.loan_no?.toLowerCase().includes(q) ||
        c.customer_name?.toLowerCase().includes(q) ||
        c.app_id?.toLowerCase().includes(q) ||
        c.registration_no?.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [cases, search, statusFilter]);

  const paidCount   = cases.filter((c) => c.status === "Paid").length;
  const unpaidCount = cases.filter((c) => c.status !== "Paid" && c.status !== "PTP").length;
  const ptpCount    = cases.filter((c) => c.status === "PTP").length;
  const totalPos    = cases.reduce((s, c) => s + (parseFloat(c.pos) || 0), 0);

  return (
    <>
      <Modal visible transparent={false} animationType="slide" onRequestClose={onClose}>
        <View style={{ flex: 1, backgroundColor: Colors.background, paddingTop: insets.top }}>
          {/* Header */}
          <View style={fosModal.header}>
            <Pressable onPress={onClose} style={{ padding: 8 }}>
              <Ionicons name="arrow-back" size={22} color={Colors.text} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={fosModal.headerTitle}>{agentName}</Text>
              <Text style={fosModal.headerSub}>{cases.length} cases · ₹{totalPos.toLocaleString("en-IN", { maximumFractionDigits: 0 })} POS</Text>
            </View>
            <Pressable
              style={fosModal.resetAllBtn}
              onPress={() => onResetAgent(agentId, agentName)}
            >
              <Ionicons name="refresh" size={14} color="#fff" />
              <Text style={fosModal.resetAllBtnText}>Reset All</Text>
            </Pressable>
          </View>

          {/* Stats Row */}
          <View style={fosModal.statsRow}>
            <View style={[fosModal.statCard, { borderTopColor: Colors.success }]}>
              <Text style={[fosModal.statNum, { color: Colors.success }]}>{paidCount}</Text>
              <Text style={fosModal.statLabel}>Paid</Text>
            </View>
            <View style={[fosModal.statCard, { borderTopColor: Colors.statusUnpaid }]}>
              <Text style={[fosModal.statNum, { color: Colors.statusUnpaid }]}>{unpaidCount}</Text>
              <Text style={fosModal.statLabel}>Unpaid</Text>
            </View>
            <View style={[fosModal.statCard, { borderTopColor: Colors.statusPTP }]}>
              <Text style={[fosModal.statNum, { color: Colors.statusPTP }]}>{ptpCount}</Text>
              <Text style={fosModal.statLabel}>PTP</Text>
            </View>
            <View style={[fosModal.statCard, { borderTopColor: Colors.primary }]}>
              <Text style={fosModal.statNum}>
                {paidCount > 0 ? Math.round((paidCount / cases.length) * 100) : 0}%
              </Text>
              <Text style={fosModal.statLabel}>Collection</Text>
            </View>
          </View>

          {/* Search */}
          <View style={fosModal.searchWrap}>
            <View style={fosModal.searchBox}>
              <Ionicons name="search" size={16} color={Colors.textMuted} />
              <TextInput
                style={fosModal.searchInput}
                placeholder="Search loan, customer, reg no..."
                placeholderTextColor={Colors.textMuted}
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
              />
              {search ? (
                <Pressable onPress={() => setSearch("")}>
                  <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
            {/* Status filter pills */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {["All", "Unpaid", "PTP", "Paid"].map((f) => (
                  <Pressable
                    key={f}
                    style={[
                      fosModal.filterPill,
                      statusFilter === f && {
                        backgroundColor: f === "All" ? Colors.primary : STATUS_COLORS[f],
                        borderColor: "transparent",
                      },
                    ]}
                    onPress={() => setStatusFilter(f)}
                  >
                    <Text style={[fosModal.filterPillText, statusFilter === f && { color: "#fff" }]}>{f}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>

          {/* Cases List */}
          <FlatList
            data={filtered}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: insets.bottom + 24 }}
            renderItem={({ item }) => {
              const hasFeedback = !!(item.latest_feedback || item.feedback_code);
              const statusColor = STATUS_COLORS[item.status] || Colors.textMuted;
              return (
                <View style={[fosModal.caseCard, { borderLeftColor: statusColor }]}>
                  <View style={fosModal.caseCardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={fosModal.caseName} numberOfLines={1}>{item.customer_name}</Text>
                      <View style={fosModal.caseTagRow}>
                        {item.loan_no && (
                          <View style={fosModal.tag}>
                            <Text style={fosModal.tagLabel}>LOAN</Text>
                            <Text style={fosModal.tagValue}>{item.loan_no}</Text>
                          </View>
                        )}
                        {item.bkt != null && (
                          <View style={[fosModal.tag, { backgroundColor: Colors.primary + "15" }]}>
                            <Text style={fosModal.tagLabel}>BKT</Text>
                            <Text style={[fosModal.tagValue, { color: Colors.primary }]}>{item.bkt}</Text>
                          </View>
                        )}
                        {item.pos && (
                          <View style={[fosModal.tag, { backgroundColor: Colors.info + "15" }]}>
                            <Text style={fosModal.tagLabel}>POS</Text>
                            <Text style={[fosModal.tagValue, { color: Colors.info }]}>
                              ₹{parseFloat(item.pos).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                            </Text>
                          </View>
                        )}
                      </View>
                      {item.mobile_no && (
                        <Text style={fosModal.caseMobile}>{item.mobile_no}</Text>
                      )}
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 6 }}>
                      <View style={[fosModal.statusBadge, { backgroundColor: statusColor + "22" }]}>
                        <Text style={[fosModal.statusText, { color: statusColor }]}>{item.status}</Text>
                      </View>
                      <Pressable
                        onPress={() => setSelectedCase(item)}
                        style={fosModal.detailBtn}
                      >
                        <Ionicons name="eye-outline" size={13} color={Colors.primary} />
                        <Text style={fosModal.detailBtnText}>Details</Text>
                      </Pressable>
                    </View>
                  </View>

                  {hasFeedback && (
                    <View style={fosModal.feedbackRow}>
                      {item.feedback_code && (
                        <View style={fosModal.fbCodeBadge}>
                          <Text style={fosModal.fbCodeText}>{item.feedback_code}</Text>
                        </View>
                      )}
                      {item.latest_feedback && (
                        <Text style={fosModal.fbText} numberOfLines={1}>{item.latest_feedback}</Text>
                      )}
                    </View>
                  )}

                  {/* CHANGE 5: Use correct tableType based on case_type */}
                  <StatusActionBar
                    item={item}
                    tableType={item.case_type === "bkt" ? "bkt" : "loan"}
                    onUpdated={onUpdated}
                  />

                  {hasFeedback && (
                    <Pressable
                      style={[fosModal.resetCaseBtn, resettingCaseId === item.id && { opacity: 0.5 }]}
                      disabled={resettingCaseId === item.id}
                      onPress={() => {
                        Alert.alert("Reset Feedback", `Reset feedback for ${item.customer_name}?`, [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Reset",
                            style: "destructive",
                            onPress: async () => {
                              setResettingCaseId(item.id);
                              // CHANGE 8a: Pass item.case_type to onResetCase
                              try { await onResetCase(item.id, item.case_type); }
                              finally { setResettingCaseId(null); }
                            },
                          },
                        ]);
                      }}
                    >
                      {resettingCaseId === item.id ? (
                        <ActivityIndicator size="small" color={Colors.danger} />
                      ) : (
                        <>
                          <Ionicons name="refresh" size={12} color={Colors.danger} />
                          <Text style={fosModal.resetCaseBtnText}>Reset Feedback</Text>
                        </>
                      )}
                    </Pressable>
                  )}
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={{ alignItems: "center", paddingTop: 60, gap: 8 }}>
                <Ionicons name="document-text-outline" size={40} color={Colors.textMuted} />
                <Text style={{ color: Colors.textMuted, fontSize: 14 }}>
                  {search ? `No cases matching "${search}"` : "No cases"}
                </Text>
              </View>
            }
          />
        </View>
      </Modal>

      {selectedCase && (
        <CaseDetailModal
          item={selectedCase}
          tableType={selectedCase.case_type === "bkt" ? "bkt" : "loan"}
          onClose={() => setSelectedCase(null)}
          // CHANGE 8b: Pass selectedCase?.case_type to onResetCase
          onResetCase={async (id) => { await onResetCase(id, selectedCase?.case_type); setSelectedCase(null); }}
          onStatusUpdated={async () => { onUpdated(); }}
        />
      )}
    </>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function AllCasesScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedFos, setSelectedFos] = useState<{
    agentId: number;
    agentName: string;
    cases: any[];
  } | null>(null);
  const [resettingAgent, setResettingAgent] = useState<number | null>(null);

  const tableType = "loan";
  // CHANGE 4: Updated queryKey to "/api/admin/cases/all"
  const queryKey = ["/api/admin/cases/all"];

  // CHANGE 2: Fetch both loan and bkt cases and combine them
  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const [loanData, bktData] = await Promise.all([
        api.admin.getCases(),
        api.admin.getBktCases(),
      ]);
      const loanCases = (loanData?.cases || []).map((c: any) => ({ ...c, case_type: "loan" }));
      const bktCases  = (bktData?.cases  || []).map((c: any) => ({
        ...c,
        case_type: "bkt",
        bkt: c.case_category || c.bkt,
      }));
      return { cases: [...loanCases, ...bktCases] };
    },
    refetchInterval: 15000,
  });

  // CHANGE 3: Invalidate the new queryKey as well
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["/api/admin/cases/all"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/cases"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/bkt-cases"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/bkt-performance"] });
    qc.invalidateQueries({ queryKey: ["/api/bkt-perf-summary"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/stats"] });
    refetch();
  };

  const allCases = data?.cases || [];

  // Group cases by FOS agent
  const fosGroups = useMemo(() => {
    const q = search.toLowerCase().trim();
    const groups: Record<string, {
      agentId: number;
      agentName: string;
      cases: any[];
      paidCount: number;
      unpaidCount: number;
      ptpCount: number;
      totalPos: number;
      feedbackCount: number;
    }> = {};

    for (const c of allCases) {
      const name = c.agent_name || "Unassigned";
      const id = c.agent_id || 0;
      if (!groups[name]) {
        groups[name] = { agentId: id, agentName: name, cases: [], paidCount: 0, unpaidCount: 0, ptpCount: 0, totalPos: 0, feedbackCount: 0 };
      }
      groups[name].cases.push(c);
      if (c.status === "Paid") groups[name].paidCount++;
      else if (c.status === "PTP") groups[name].ptpCount++;
      else groups[name].unpaidCount++;
      groups[name].totalPos += parseFloat(c.pos) || 0;
      if (c.latest_feedback || c.feedback_code) groups[name].feedbackCount++;
    }

    return Object.values(groups)
      .filter((g) => !q || g.agentName.toLowerCase().includes(q))
      .sort((a, b) => a.agentName.localeCompare(b.agentName));
  }, [allCases, search]);

  const totalPaid   = allCases.filter((c: any) => c.status === "Paid").length;
  const totalUnpaid = allCases.filter((c: any) => c.status !== "Paid" && c.status !== "PTP").length;
  const totalPtp    = allCases.filter((c: any) => c.status === "PTP").length;

  const handleResetAgentFeedback = (agentId: number, agentName: string) => {
    Alert.alert(
      "Reset Agent Feedback",
      `Reset ALL feedback for ${agentName}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset All",
          style: "destructive",
          onPress: async () => {
            setResettingAgent(agentId);
            try {
              const token = await tokenStore.get();
              const url = new URL(`/api/admin/reset-feedback/agent/${agentId}`, getApiUrl()).toString();
              const res = await fetch(url, {
                method: "POST",
                credentials: "include",
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

  // CHANGE 6: Updated handleResetCase to accept and use caseType
  const handleResetCase = async (caseId: number, caseType?: string) => {
    const token = await tokenStore.get();
    const url = new URL(`/api/admin/reset-feedback/case/${caseId}`, getApiUrl()).toString();
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ table: caseType === "bkt" ? "bkt" : "loan" }),
    });
    const json: any = await res.json();
    if (!res.ok) throw new Error(json.message || "Reset failed");
    invalidateAll();
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: Platform.OS === "web" ? 67 : 12 }]}>
        {/* Global stats */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryChip, { backgroundColor: Colors.success + "18" }]}>
            <Text style={[styles.summaryChipText, { color: Colors.success }]}>✓ {totalPaid} Paid</Text>
          </View>
          <View style={[styles.summaryChip, { backgroundColor: Colors.danger + "18" }]}>
            <Text style={[styles.summaryChipText, { color: Colors.danger }]}>✗ {totalUnpaid} Unpaid</Text>
          </View>
          <View style={[styles.summaryChip, { backgroundColor: Colors.statusPTP + "18" }]}>
            <Text style={[styles.summaryChipText, { color: Colors.statusPTP }]}>◷ {totalPtp} PTP</Text>
          </View>
          <View style={[styles.summaryChip, { backgroundColor: Colors.primary + "18" }]}>
            <Text style={[styles.summaryChipText, { color: Colors.primary }]}>{allCases.length} Total</Text>
          </View>
        </View>

        {/* Search agents */}
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={Colors.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search FOS agent name..."
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
      </View>

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={fosGroups}
          keyExtractor={(item) => String(item.agentId)}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }, !fosGroups.length && { flex: 1 }]}
          ListHeaderComponent={
            <Text style={styles.count}>{fosGroups.length} FOS agent{fosGroups.length !== 1 ? "s" : ""}</Text>
          }
          renderItem={({ item: group }) => {
            const collectionPct = group.cases.length > 0
              ? Math.round((group.paidCount / group.cases.length) * 100)
              : 0;
            const pctColor = collectionPct >= 70 ? Colors.success : collectionPct >= 40 ? Colors.warning : Colors.danger;

            return (
              <Pressable
                style={styles.fosCard}
                onPress={() => setSelectedFos({ agentId: group.agentId, agentName: group.agentName, cases: group.cases })}
              >
                {/* Avatar */}
                <View style={styles.fosAvatar}>
                  <Text style={styles.fosInitial}>
                    {(group.agentName || "?").charAt(0).toUpperCase()}
                  </Text>
                </View>

                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={styles.fosName}>{group.agentName}</Text>
                    <Text style={[styles.pctBadge, { color: pctColor }]}>{collectionPct}%</Text>
                  </View>

                  {/* Case count row */}
                  <View style={styles.statsRow}>
                    <View style={styles.statPill}>
                      <Text style={styles.statPillLabel}>Total</Text>
                      <Text style={styles.statPillVal}>{group.cases.length}</Text>
                    </View>
                    <View style={[styles.statPill, { backgroundColor: Colors.success + "18" }]}>
                      <Text style={[styles.statPillLabel, { color: Colors.success }]}>Paid</Text>
                      <Text style={[styles.statPillVal, { color: Colors.success }]}>{group.paidCount}</Text>
                    </View>
                    <View style={[styles.statPill, { backgroundColor: Colors.danger + "18" }]}>
                      <Text style={[styles.statPillLabel, { color: Colors.danger }]}>Unpaid</Text>
                      <Text style={[styles.statPillVal, { color: Colors.danger }]}>{group.unpaidCount}</Text>
                    </View>
                    {group.ptpCount > 0 && (
                      <View style={[styles.statPill, { backgroundColor: Colors.statusPTP + "18" }]}>
                        <Text style={[styles.statPillLabel, { color: Colors.statusPTP }]}>PTP</Text>
                        <Text style={[styles.statPillVal, { color: Colors.statusPTP }]}>{group.ptpCount}</Text>
                      </View>
                    )}
                  </View>

                  {/* POS */}
                  <Text style={styles.posText}>
                    POS: ₹{group.totalPos.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </Text>

                  {/* Progress bar */}
                  <View style={styles.progressBg}>
                    <View style={[styles.progressFill, { width: `${collectionPct}%` as any, backgroundColor: pctColor }]} />
                  </View>

                  {group.feedbackCount > 0 && (
                    <Text style={styles.feedbackHint}>{group.feedbackCount} feedback given</Text>
                  )}
                </View>

                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={52} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>
                {search ? `No agents matching "${search}"` : "No allocation data"}
              </Text>
              <Text style={styles.emptyText}>Import an allocation file to see FOS agent cases</Text>
            </View>
          }
        />
      )}

      {selectedFos && (
        <FosAgentCasesModal
          agentId={selectedFos.agentId}
          agentName={selectedFos.agentName}
          cases={selectedFos.cases}
          onClose={() => setSelectedFos(null)}
          onUpdated={() => {
            invalidateAll();
            // refresh selected modal cases from fresh data
            const fresh = qc.getQueryData<any>(queryKey);
            if (fresh?.cases && selectedFos) {
              const freshCases = fresh.cases.filter((c: any) => c.agent_id === selectedFos.agentId);
              setSelectedFos((prev) => prev ? { ...prev, cases: freshCases } : null);
            }
          }}
          // CHANGE 9: Pass caseType through to handleResetCase
          onResetCase={(id, caseType) => handleResetCase(id, caseType)}
          onResetAgent={(id, name) => {
            handleResetAgentFeedback(id, name);
            setSelectedFos(null);
          }}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const actionStyles = StyleSheet.create({
  bar:               { flexDirection: "row", gap: 6, marginTop: 4, flexWrap: "wrap" },
  btn:               { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: Colors.border },
  btnText:           { fontSize: 12, fontWeight: "700", color: Colors.text },
  btnInactive:       { backgroundColor: Colors.surfaceAlt, borderColor: Colors.border },
  btnActivePaid:     { backgroundColor: Colors.success, borderColor: Colors.success },
  btnUnpaid:         { backgroundColor: Colors.danger, borderColor: Colors.danger },
  btnActiveRollback: { backgroundColor: Colors.info, borderColor: Colors.info },
});

const styles = StyleSheet.create({
  topBar:          { backgroundColor: Colors.surface, padding: 12, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  summaryRow:      { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  summaryChip:     { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  summaryChipText: { fontSize: 12, fontWeight: "700" },
  searchBox:       { flexDirection: "row", alignItems: "center", backgroundColor: Colors.surfaceAlt, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: Colors.border },
  searchInput:     { flex: 1, fontSize: 14, color: Colors.text },
  count:           { fontSize: 13, color: Colors.textSecondary, fontWeight: "600", marginBottom: 4 },
  list:            { padding: 12, gap: 10 },
  fosCard:         {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 16,
    flexDirection: "row", alignItems: "center", gap: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  fosAvatar:       { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  fosInitial:      { fontSize: 20, fontWeight: "800", color: "#fff" },
  fosName:         { fontSize: 15, fontWeight: "700", color: Colors.text, flex: 1 },
  pctBadge:        { fontSize: 16, fontWeight: "800" },
  statsRow:        { flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" },
  statPill:        { flexDirection: "row", gap: 4, alignItems: "center", backgroundColor: Colors.surfaceAlt, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statPillLabel:   { fontSize: 10, fontWeight: "600", color: Colors.textSecondary },
  statPillVal:     { fontSize: 11, fontWeight: "800", color: Colors.text },
  posText:         { fontSize: 12, color: Colors.textSecondary, marginTop: 6, fontWeight: "600" },
  progressBg:      { height: 5, backgroundColor: Colors.border, borderRadius: 3, marginTop: 6, overflow: "hidden" },
  progressFill:    { height: 5, borderRadius: 3 },
  feedbackHint:    { fontSize: 11, color: Colors.textMuted, marginTop: 4 },
  empty:           { flex: 1, justifyContent: "center", alignItems: "center", gap: 8, paddingVertical: 60 },
  emptyTitle:      { fontSize: 16, fontWeight: "700", color: Colors.textMuted },
  emptyText:       { fontSize: 13, color: Colors.textMuted, textAlign: "center" },
});

const fosModal = StyleSheet.create({
  header:           { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerTitle:      { fontSize: 17, fontWeight: "800", color: Colors.text },
  headerSub:        { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  resetAllBtn:      { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: Colors.danger, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  resetAllBtnText:  { fontSize: 12, fontWeight: "700", color: "#fff" },
  statsRow:         { flexDirection: "row", gap: 8, padding: 12, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  statCard:         { flex: 1, backgroundColor: Colors.surfaceAlt, borderRadius: 10, padding: 10, borderTopWidth: 3, alignItems: "center", gap: 2 },
  statNum:          { fontSize: 16, fontWeight: "800", color: Colors.text },
  statLabel:        { fontSize: 9, color: Colors.textSecondary, fontWeight: "600" },
  searchWrap:       { backgroundColor: Colors.surface, padding: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  searchBox:        { flexDirection: "row", alignItems: "center", backgroundColor: Colors.surfaceAlt, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, gap: 8, borderWidth: 1, borderColor: Colors.border },
  searchInput:      { flex: 1, fontSize: 14, color: Colors.text },
  filterPill:       { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border },
  filterPillText:   { fontSize: 12, fontWeight: "600", color: Colors.textSecondary },
  caseCard:         { backgroundColor: Colors.surface, borderRadius: 14, padding: 14, gap: 8, borderLeftWidth: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  caseCardTop:      { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  caseName:         { fontSize: 14, fontWeight: "700", color: Colors.text, textTransform: "uppercase" },
  caseTagRow:       { flexDirection: "row", gap: 6, marginTop: 4, flexWrap: "wrap" },
  tag:              { flexDirection: "row", gap: 4, alignItems: "center", backgroundColor: Colors.surfaceAlt, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  tagLabel:         { fontSize: 9, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase" },
  tagValue:         { fontSize: 11, fontWeight: "700", color: Colors.text },
  caseMobile:       { fontSize: 12, color: Colors.textSecondary, marginTop: 4 },
  statusBadge:      { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText:       { fontSize: 11, fontWeight: "700" },
  detailBtn:        { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.primary + "12", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  detailBtnText:    { fontSize: 11, fontWeight: "700", color: Colors.primary },
  feedbackRow:      { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  fbCodeBadge:      { backgroundColor: Colors.accent + "20", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  fbCodeText:       { fontSize: 11, fontWeight: "700", color: Colors.accent },
  fbText:           { flex: 1, fontSize: 12, color: Colors.textSecondary, fontStyle: "italic" },
  resetCaseBtn:     { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: Colors.danger + "12", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  resetCaseBtnText: { fontSize: 11, fontWeight: "700", color: Colors.danger },
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

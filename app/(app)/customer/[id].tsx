import React, { useState, useMemo, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable,
  Alert, Linking, Modal, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
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

const TABS = ["All", "Unpaid", "PTP", "Paid"];

// ── Company color palette ──────────────────────────────────────────────────
const COMPANY_COLORS = [
  { bg: "#eeedfe", border: "#afa9ec", text: "#534ab7" },
  { bg: "#e1f5ee", border: "#5dcaa5", text: "#0f6e56" },
  { bg: "#faeeda", border: "#ef9f27", text: "#854f0b" },
  { bg: "#faece7", border: "#f0997b", text: "#993c1d" },
  { bg: "#e6f1fb", border: "#85b7eb", text: "#185fa5" },
  { bg: "#fbeaf0", border: "#ed93b1", text: "#993556" },
];
const companyColorCache: Record<string, typeof COMPANY_COLORS[0]> = {};
let colorIdx = 0;
function getCompanyColor(name: string) {
  if (!name) return COMPANY_COLORS[0];
  if (!companyColorCache[name]) { companyColorCache[name] = COMPANY_COLORS[colorIdx % COMPANY_COLORS.length]; colorIdx++; }
  return companyColorCache[name];
}

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

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt(v: any, prefix = "") {
  if (v === null || v === undefined || v === "") return "";
  const n = parseFloat(v);
  if (!isNaN(n) && prefix) return prefix + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return String(v);
}
function fmtDate(v: any) { return v ? String(v).slice(0, 10) : ""; }
function fmtBool(v: any) {
  if (v === true || v === "true" || v === "t") return "Yes";
  if (v === false || v === "false" || v === "f") return "No";
  return "";
}

interface TableRowProps { label: string; value?: any; phone?: boolean; even?: boolean; }
function TableRow({ label, value, phone, even }: TableRowProps) {
  const display = value !== null && value !== undefined && value !== "" ? String(value) : "—";
  return (
    <View style={[detailStyles.row, even && { backgroundColor: Colors.surfaceAlt }]}>
      <View style={detailStyles.labelCell}><Text style={detailStyles.labelText}>{label}</Text></View>
      <View style={detailStyles.valueCell}>
        {phone && display !== "—" ? (
          <Pressable onPress={() => Linking.openURL(`tel:${display.split(",")[0].trim()}`)}>
            <Text style={[detailStyles.valueText, { color: Colors.info, textDecorationLine: "underline" }]}>{display}</Text>
          </Pressable>
        ) : <Text style={detailStyles.valueText}>{display}</Text>}
      </View>
    </View>
  );
}

interface StatusActionBarProps { item: any; onUpdated: () => void; }
function StatusActionBar({ item, onUpdated }: StatusActionBarProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const tableType = item.case_type === "bkt" ? "bkt" : "loan";
  const handleStatus = async (status: "Paid" | "Unpaid", rollback_yn?: boolean) => {
    const key = status + (rollback_yn !== undefined ? "_rb" : "");
    setLoading(key);
    try { await api.admin.updateCaseStatus(item.id, { status, rollback_yn: rollback_yn ?? null, table: tableType }); onUpdated(); }
    catch (e: any) { Alert.alert("Error", e.message); }
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
    </View>
  );
}

interface CaseDetailModalProps { item: any; onClose: () => void; onResetCase: (id: number) => void; onStatusUpdated: () => void; }
function CaseDetailModal({ item, onClose, onResetCase, onStatusUpdated }: CaseDetailModalProps) {
  const insets = useSafeAreaInsets();
  const [resetting, setResetting] = useState(false);
  const [localItem, setLocalItem] = useState(item);
  useEffect(() => { if (item) setLocalItem(item); }, [item]);
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
          ...(localItem.telecaller_ptp_date ? [{ label: "Telecaller PTP", value: fmtDate(localItem.telecaller_ptp_date) }] : []),
        ]
      : []),
    { section: "Case Info" },
    { label: "Status", value: localItem.status },
    { label: "FOS Agent", value: localItem.agent_name },
    // Company row with special render flag
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
                {localItem.company_name && (
                  <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", marginTop: 1 }} numberOfLines={1}>{localItem.company_name}</Text>
                )}
              </View>
              <View style={detailStyles.statusPill}>
                <Text style={[detailStyles.statusPillText, { color: statusColor }]}>{localItem.status}</Text>
              </View>
            </View>
            <View style={{ padding: 12, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
              <StatusActionBar item={localItem} onUpdated={onStatusUpdated} />
            </View>
            {localItem.latest_feedback || localItem.feedback_code ? (
              <Pressable style={[detailStyles.resetCaseBtn, resetting && { opacity: 0.6 }]} onPress={handleResetCase} disabled={resetting}>
                {resetting ? <ActivityIndicator size="small" color={Colors.danger} /> : <Ionicons name="refresh" size={16} color={Colors.danger} />}
                <Text style={detailStyles.resetCaseBtnText}>{resetting ? "Resetting…" : "Reset Feedback — Allow FOS to re-submit"}</Text>
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
                // Company row highlighted with company colour
                if ((r as any).isCompany && companyColor) {
                  return (
                    <View key="company-row" style={[detailStyles.row, { backgroundColor: companyColor.bg }]}>
                      <View style={[detailStyles.labelCell, { backgroundColor: companyColor.bg, borderRightColor: companyColor.border }]}>
                        <Text style={[detailStyles.labelText, { color: companyColor.text }]}>Company</Text>
                      </View>
                      <View style={[detailStyles.valueCell, { flexDirection: "row", alignItems: "center", gap: 6 }]}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: companyColor.text }} />
                        <Text style={[detailStyles.valueText, { color: companyColor.text, fontWeight: "700" }]}>{r.value}</Text>
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
export default function AgentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("All");
  const [companyTab, setCompanyTab] = useState("All");
  const [selectedCase, setSelectedCase] = useState<any>(null);

  const { data: agentsData } = useQuery({ queryKey: ["/api/admin/agents"], queryFn: () => api.admin.getAgents(), staleTime: 0 });
  const { data: casesData, isLoading, refetch } = useQuery({ queryKey: ["/api/admin/cases/agent", id], queryFn: () => api.admin.getCasesByAgent(Number(id)), enabled: !!id, refetchInterval: 20000 });
  const { data: statsData } = useQuery({ queryKey: ["/api/admin/agent/stats", id], queryFn: () => api.admin.getAgentStats(Number(id)), enabled: !!id });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["/api/admin/cases/agent", id] });
    qc.invalidateQueries({ queryKey: ["/api/admin/agent/stats", id] });
    qc.invalidateQueries({ queryKey: ["/api/admin/cases"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/stats"] });
  };

  const invalidateAndSyncSelected = async () => {
    invalidateAll();
    if (selectedCase) {
      await refetch();
      const fresh = qc.getQueryData<any>(["/api/admin/cases/agent", id]);
      const freshItem = fresh?.cases?.find((c: any) => c.id === selectedCase.id);
      if (freshItem) setSelectedCase(freshItem);
    }
  };

  const handleResetCase = async (caseId: number) => {
    const tableType = selectedCase?.case_type === "bkt" ? "bkt" : "loan";
    try {
      const token = await tokenStore.get();
      const url = new URL(`/api/admin/reset-feedback/case/${caseId}`, getApiUrl()).toString();
      const res = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ table: tableType }) });
      const json: any = await res.json();
      if (!res.ok) throw new Error(json.message || "Reset failed");
      invalidateAll();
      Alert.alert("Done", "Feedback reset. FOS can now re-submit.");
    } catch (e: any) { Alert.alert("Error", e.message); }
  };

  // Get agent from agents list, or fall back to agent_name embedded in case rows
  const agent = agentsData?.agents?.find((a: any) => String(a.id) === id)
    ?? (cases.length > 0 ? { name: cases[0].agent_name, phone: cases[0].agent_phone ?? null } : null);
  const cases: any[] = casesData?.cases || [];

  // ── Distinct companies for this agent ────────────────────────────────────
  const agentCompanies = useMemo(() => {
    const all: string[] = cases.map((c) => c.company_name).filter(Boolean);
    return Array.from(new Set(all)).sort();
  }, [cases]);

  const stats = useMemo(() => ({
    total: cases.length || statsData?.total || 0,
    paid: cases.filter((c: any) => c.status === "Paid").length || statsData?.paid || 0,
    ptp: cases.filter((c: any) => c.status === "PTP").length || statsData?.ptp || 0,
    unpaid: cases.filter((c: any) => c.status !== "Paid" && c.status !== "PTP").length || statsData?.notProcess || 0,
  }), [cases, statsData]);

  // Company breakdown stats
  const companyStats = useMemo(() => {
    const map: Record<string, { total: number; paid: number }> = {};
    for (const c of cases) {
      const co = c.company_name || "Unknown";
      if (!map[co]) map[co] = { total: 0, paid: 0 };
      map[co].total++;
      if (c.status === "Paid") map[co].paid++;
    }
    return map;
  }, [cases]);

  const filtered = useMemo(() => {
    let result = activeTab === "All" ? cases : cases.filter((c: any) => c.status === activeTab);
    if (companyTab !== "All") result = result.filter((c: any) => c.company_name === companyTab);
    return result;
  }, [cases, activeTab, companyTab]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background }}>
        <ActivityIndicator color={Colors.primary} size="large" />
        <Text style={{ color: Colors.textMuted, marginTop: 12, fontSize: 13 }}>Loading cases…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 24, paddingTop: Platform.OS === "web" ? 67 : 0 }]}>

        {/* Agent header */}
        <View style={styles.agentHeader}>
          <View style={styles.avatar}><Ionicons name="person" size={32} color="#fff" /></View>
          <View style={styles.agentInfo}>
            <Text style={styles.agentName}>{agent?.name ?? `Agent #${id}`}</Text>
            {agent?.phone && <Text style={styles.agentPhone}>{agent.phone}</Text>}
            {/* Company count summary */}
            {agentCompanies.length > 0 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                {agentCompanies.map((co) => <CompanyBadge key={co} name={co} />)}
              </View>
            )}
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsGrid}>
          {[
            { label: "Total", value: stats.total, color: Colors.info },
            { label: "Paid", value: stats.paid, color: Colors.success },
            { label: "PTP", value: stats.ptp, color: Colors.statusPTP },
            { label: "Unpaid", value: stats.unpaid, color: Colors.danger },
          ].map((s) => (
            <View key={s.label} style={[styles.statCard, { borderTopColor: s.color }]}>
              <Text style={[styles.statNum, { color: s.color }]}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Company breakdown — only if multiple companies */}
        {agentCompanies.length > 1 && (
          <View style={styles.companyBreakdownCard}>
            <View style={styles.companyBreakdownHeader}>
              <Ionicons name="business-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.companyBreakdownTitle}>By Company</Text>
            </View>
            {agentCompanies.map((co) => {
              const cs = companyStats[co] || { total: 0, paid: 0 };
              const cc = getCompanyColor(co);
              const pct = cs.total > 0 ? Math.round((cs.paid / cs.total) * 100) : 0;
              return (
                <View key={co} style={styles.companyBreakdownRow}>
                  <View style={[styles.companyDot, { backgroundColor: cc.text }]} />
                  <Text style={[styles.companyBreakdownName, { color: cc.text }]} numberOfLines={1}>{co}</Text>
                  <View style={styles.companyBreakdownBar}>
                    <View style={[styles.companyBreakdownFill, { width: `${pct}%` as any, backgroundColor: cc.text + "80" }]} />
                  </View>
                  <Text style={[styles.companyBreakdownPct, { color: cc.text }]}>{pct}%</Text>
                  <Text style={styles.companyBreakdownCount}>{cs.paid}/{cs.total}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Status Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs}>
          {TABS.map((tab) => (
            <Pressable key={tab} style={[styles.tabChip, activeTab === tab && { backgroundColor: tab === "All" ? Colors.primary : STATUS_COLORS[tab], borderColor: "transparent" }]} onPress={() => setActiveTab(tab)}>
              <Text style={[styles.tabChipText, activeTab === tab && { color: "#fff" }]}>{tab}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Company Tabs — only if multiple companies */}
        {agentCompanies.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs}>
            <Pressable style={[styles.tabChip, styles.companyTabChip, companyTab === "All" && styles.companyTabActive]} onPress={() => setCompanyTab("All")}>
              <Ionicons name="business-outline" size={11} color={companyTab === "All" ? "#fff" : "#534ab7"} />
              <Text style={[styles.tabChipText, { color: companyTab === "All" ? "#fff" : "#534ab7" }]}>All</Text>
            </Pressable>
            {agentCompanies.map((co) => {
              const cc = getCompanyColor(co);
              const isActive = companyTab === co;
              return (
                <Pressable key={co} style={[styles.tabChip, styles.companyTabChip, { borderColor: cc.border, backgroundColor: isActive ? cc.text : cc.bg }]} onPress={() => setCompanyTab(isActive ? "All" : co)}>
                  <Text style={[styles.tabChipText, { color: isActive ? "#fff" : cc.text }]} numberOfLines={1}>{co}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        <Text style={styles.sectionTitle}>
          {filtered.length} Case{filtered.length !== 1 ? "s" : ""}
          {companyTab !== "All" ? ` · ${companyTab}` : ""}
          {activeTab !== "All" ? ` · ${activeTab}` : ""}
        </Text>

        {/* Case cards */}
        {filtered.map((c: any) => {
          const statusColor = STATUS_COLORS[c.status] || Colors.textMuted;
          return (
            <Pressable key={`${c.case_type}-${c.id}`} style={({ pressed }) => [styles.caseCard, pressed && { opacity: 0.85 }]} onPress={() => setSelectedCase(c)}>
              <View style={styles.caseHeader}>
                <Text style={styles.caseName} numberOfLines={1}>{c.customer_name}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  {c.case_type && <View style={[styles.typeBadge, { backgroundColor: Colors.accent + "22" }]}><Text style={[styles.typeText, { color: Colors.accent }]}>{c.case_type.toUpperCase()}</Text></View>}
                  <View style={[styles.statusBadge, { backgroundColor: statusColor + "22" }]}><Text style={[styles.statusText, { color: statusColor }]}>{c.status}</Text></View>
                </View>
              </View>
              <View style={styles.tagRow}>
                {c.loan_no && <View style={styles.tag}><Text style={styles.tagLabel}>LOAN</Text><Text style={styles.tagValue}>{c.loan_no}</Text></View>}
                {c.bkt != null && <View style={[styles.tag, { backgroundColor: Colors.primary + "15" }]}><Text style={styles.tagLabel}>BKT</Text><Text style={[styles.tagValue, { color: Colors.primary }]}>{c.bkt}</Text></View>}
                {c.pos && <View style={[styles.tag, { backgroundColor: Colors.info + "15" }]}><Text style={styles.tagLabel}>POS</Text><Text style={[styles.tagValue, { color: Colors.info }]}>₹{parseFloat(c.pos).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</Text></View>}
                {/* Company badge on card */}
                {c.company_name && <CompanyBadge name={c.company_name} />}
              </View>
              {c.mobile_no && (
                <Pressable style={styles.phoneRow} onPress={(e) => { e.stopPropagation?.(); Linking.openURL(`tel:${c.mobile_no.split(",")[0].trim()}`); }}>
                  <Ionicons name="call-outline" size={13} color={Colors.info} />
                  <Text style={styles.caseMobile}>{c.mobile_no}</Text>
                </Pressable>
              )}
              {(c.feedback_code || c.latest_feedback) && (
                <View style={styles.feedbackRow}>
                  {c.feedback_code && <View style={styles.feedbackCodeBadge}><Text style={styles.feedbackCodeText}>{c.feedback_code}</Text></View>}
                  {c.latest_feedback && <Text style={styles.caseFeedback} numberOfLines={1}>{c.latest_feedback}</Text>}
                </View>
              )}
              <View style={styles.viewDetailHint}>
                <Ionicons name="eye-outline" size={13} color={Colors.primary} />
                <Text style={styles.viewDetailHintText}>Tap to view full details</Text>
              </View>
            </Pressable>
          );
        })}

        {filtered.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>
              {cases.length === 0 ? "No cases assigned to this agent" : companyTab !== "All" ? `No ${companyTab} ${activeTab === "All" ? "" : activeTab} cases` : `No ${activeTab === "All" ? "" : activeTab} cases`}
            </Text>
          </View>
        )}
      </ScrollView>

      <CaseDetailModal item={selectedCase} onClose={() => setSelectedCase(null)} onResetCase={handleResetCase} onStatusUpdated={invalidateAndSyncSelected} />
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
});

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16 },
  agentHeader: { flexDirection: "row", gap: 16, alignItems: "flex-start", backgroundColor: Colors.surface, borderRadius: 16, padding: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  agentInfo: { flex: 1, gap: 4 },
  agentName: { fontSize: 18, fontWeight: "800", color: Colors.text },
  agentPhone: { fontSize: 13, color: Colors.textMuted },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statCard: { flex: 1, minWidth: "18%", backgroundColor: Colors.surface, borderRadius: 12, padding: 12, alignItems: "center", gap: 4, borderTopWidth: 3, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  statNum: { fontSize: 22, fontWeight: "800", color: Colors.text },
  statLabel: { fontSize: 10, color: Colors.textSecondary, fontWeight: "600" },
  // Company breakdown card
  companyBreakdownCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, gap: 10, borderWidth: 1, borderColor: Colors.border },
  companyBreakdownHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  companyBreakdownTitle: { fontSize: 12, fontWeight: "700", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  companyBreakdownRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  companyBreakdownName: { fontSize: 12, fontWeight: "600", width: 100 },
  companyBreakdownBar: { flex: 1, height: 5, backgroundColor: Colors.border, borderRadius: 3, overflow: "hidden" },
  companyBreakdownFill: { height: "100%", borderRadius: 3 },
  companyBreakdownPct: { fontSize: 11, fontWeight: "700", width: 32, textAlign: "right" },
  companyBreakdownCount: { fontSize: 10, color: Colors.textMuted, width: 36, textAlign: "right" },
  companyDot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  // Tabs
  tabs: { marginBottom: 4 },
  tabChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.surface, marginRight: 8, borderWidth: 1, borderColor: Colors.border },
  tabChipText: { fontSize: 13, fontWeight: "600", color: Colors.textSecondary },
  companyTabChip: { backgroundColor: "#eeedfe", borderColor: "#afa9ec" },
  companyTabActive: { backgroundColor: "#534ab7", borderColor: "transparent" },
  // Company tag
  companyTag: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, maxWidth: 140 },
  companyTagText: { fontSize: 11, fontWeight: "700" },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: Colors.textSecondary },
  caseCard: { backgroundColor: Colors.surface, borderRadius: 14, padding: 14, gap: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border },
  caseHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  caseName: { flex: 1, fontSize: 13, fontWeight: "800", color: Colors.text, textTransform: "uppercase", marginRight: 8 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 10, fontWeight: "700" },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  typeText: { fontSize: 9, fontWeight: "800" },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.surfaceAlt, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  tagLabel: { fontSize: 9, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase" },
  tagValue: { fontSize: 11, fontWeight: "700", color: Colors.text },
  phoneRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  caseMobile: { fontSize: 12, color: Colors.info, textDecorationLine: "underline" },
  feedbackRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  feedbackCodeBadge: { backgroundColor: Colors.accent + "20", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  feedbackCodeText: { fontSize: 11, fontWeight: "700", color: Colors.accent },
  caseFeedback: { flex: 1, fontSize: 11, color: Colors.textSecondary, fontStyle: "italic" },
  viewDetailHint: { flexDirection: "row", alignItems: "center", gap: 4, justifyContent: "flex-end", marginTop: 2 },
  viewDetailHintText: { fontSize: 11, color: Colors.primary, fontWeight: "600" },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText: { fontSize: 15, color: Colors.textMuted, textAlign: "center" },
});

const detailStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 14, gap: 10 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 16, fontWeight: "700", color: "#fff" },
  statusPill: { backgroundColor: "rgba(255,255,255,0.9)", borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4 },
  statusPillText: { fontSize: 11, fontWeight: "800" },
  sectionHeader: { backgroundColor: Colors.primary + "18", paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.primary + "30" },
  sectionHeaderText: { fontSize: 12, fontWeight: "800", color: Colors.primary, textTransform: "uppercase", letterSpacing: 0.8 },
  resetCaseBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.danger + "12", borderBottomWidth: 1, borderBottomColor: Colors.danger + "30", paddingHorizontal: 16, paddingVertical: 12 },
  resetCaseBtnText: { fontSize: 13, fontWeight: "700", color: Colors.danger },
  noFeedbackBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.surfaceAlt, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingHorizontal: 16, paddingVertical: 10 },
  noFeedbackText: { fontSize: 12, color: Colors.textMuted },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.surface },
  labelCell: { width: "42%", backgroundColor: Colors.surfaceAlt, padding: 12, justifyContent: "center", borderRightWidth: 1, borderRightColor: Colors.border },
  labelText: { fontSize: 13, fontWeight: "700", color: Colors.primary },
  valueCell: { flex: 1, padding: 12, justifyContent: "center" },
  valueText: { fontSize: 13, color: Colors.text, fontWeight: "400" },
});

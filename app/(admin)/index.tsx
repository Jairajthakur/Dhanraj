import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator,
  Platform, Alert
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";
import { getApiUrl } from "@/lib/query-client";
import { fetch as expoFetch } from "expo/fetch";
import { ImportModal, BktPerfImportModal } from "@/components/ImportModals";

function AgentCard({ agent }: { agent: any }) {
  const rate = agent.total > 0 ? ((agent.paid / agent.total) * 100).toFixed(0) : "0";
  return (
    <Pressable
      style={styles.agentCard}
      onPress={() => router.push({ pathname: "/(admin)/agent/[id]", params: { id: agent.id } })}
    >
      <View style={styles.agentCardTop}>
        <View style={styles.agentAvatar}>
          <Ionicons name="person" size={22} color="#fff" />
        </View>
        <View style={styles.agentInfo}>
          <Text style={styles.agentName} numberOfLines={1}>{agent.name}</Text>
        </View>
        <View style={[styles.rateCircle, { backgroundColor: parseInt(rate) >= 50 ? Colors.success + "20" : Colors.danger + "20" }]}>
          <Text style={[styles.rateText, { color: parseInt(rate) >= 50 ? Colors.success : Colors.danger }]}>{rate}%</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
      </View>
      <View style={styles.statsRow}>
        {[
          { label: "Total",  val: agent.total      || 0, color: Colors.text },
          { label: "Paid",   val: agent.paid        || 0, color: Colors.success },
          { label: "PTP",    val: agent.ptp         || 0, color: Colors.info },
          { label: "Unpaid", val: agent.notProcess  || 0, color: Colors.danger },
        ].map((s) => (
          <View key={s.label} style={styles.statPill}>
            <Text style={[styles.statPillNum, { color: s.color }]}>{s.val}</Text>
            <Text style={styles.statPillLabel}>{s.label}</Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

export default function AdminDashboard() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [importVisible, setImportVisible] = useState(false);
  const [bktPerfImportVisible, setBktPerfImportVisible] = useState(false);
  const [ptpDownloading, setPtpDownloading] = useState(false);
  const [feedbackDownloading, setFeedbackDownloading] = useState(false);
  const [ptpClearing, setPtpClearing] = useState(false);
  const [pushTesting, setPushTesting] = useState(false);
  const [pushExpanded, setPushExpanded] = useState(false);

  const { data: pushStatusData } = useQuery({
    queryKey: ["/api/admin/push-status"],
    queryFn: async () => {
      const url = new URL("/api/admin/push-status", getApiUrl()).toString();
      const res = await expoFetch(url, { credentials: "include" });
      return res.json() as Promise<{
        agents: { id: number; name: string; has_token: boolean; token_preview: string | null }[];
      }>;
    },
  });

  const handleTestPushAll = async () => {
    const agents = pushStatusData?.agents || [];
    const withToken = agents.filter(a => a.has_token);
    if (withToken.length === 0) {
      Alert.alert("No Tokens", "No FOS agents have registered push tokens yet.");
      return;
    }
    Alert.alert(
      "Send Test Notification",
      `Send test to ${withToken.length} agent${withToken.length !== 1 ? "s" : ""}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send", onPress: async () => {
            setPushTesting(true);
            try {
              const url = new URL("/api/admin/test-push-all", getApiUrl()).toString();
              const res = await expoFetch(url, { method: "POST", credentials: "include" });
              const json: any = await res.json();
              if (!res.ok) throw new Error(json.message || "Failed");
              Alert.alert("Sent!", `Delivered to ${json.sent}/${json.total} agents.`);
            } catch (e: any) {
              Alert.alert("Error", e.message || "Could not send");
            } finally { setPushTesting(false); }
          },
        },
      ]
    );
  };

  const handleTestPushOne = async (agentId: number, agentName: string) => {
    setPushTesting(true);
    try {
      const url = new URL(`/api/admin/test-push/${agentId}`, getApiUrl()).toString();
      const res = await expoFetch(url, { method: "POST", credentials: "include" });
      const json: any = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed");
      Alert.alert("Sent!", `Delivered to ${agentName}.`);
    } catch (e: any) { Alert.alert("Error", e.message); }
    finally { setPushTesting(false); }
  };

  const downloadExcel = async (
    apiPath: string,
    fileName: string,
    setLoading: (v: boolean) => void
  ) => {
    const url = new URL(apiPath, getApiUrl()).toString();
    setLoading(true);
    try {
      if (Platform.OS === "web") {
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error("Export failed");
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl; a.download = fileName;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      } else {
        const FileSystem = require("expo-file-system/legacy");
        const Sharing = require("expo-sharing");
        const res = await expoFetch(url, { credentials: "include" });
        if (!res.ok) throw new Error("Export failed");
        const ab = await res.arrayBuffer();
        const uint8 = new Uint8Array(ab);
        const CHUNK = 0x8000;
        let binary = "";
        for (let i = 0; i < uint8.length; i += CHUNK) {
          binary += String.fromCharCode(...(uint8.subarray(i, i + CHUNK) as any));
        }
        const base64 = btoa(binary);
        const fileUri = (FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "") + fileName;
        await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: "base64" });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(fileUri, {
            mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            dialogTitle: "Save Report",
            UTI: "com.microsoft.excel.xlsx",
          });
        } else {
          Alert.alert("Saved", `File: ${fileName}`);
        }
      }
    } catch (e: any) {
      Alert.alert("Download Failed", e.message || "Could not download report");
    } finally { setLoading(false); }
  };

  const handleDownloadPTP = () =>
    downloadExcel("/api/admin/ptp-export", `PTP_Report_${new Date().toISOString().slice(0, 10)}.xlsx`, setPtpDownloading);

  const handleDownloadFeedback = () =>
    downloadExcel("/api/admin/feedback-export", `Feedback_Report_${new Date().toISOString().slice(0, 10)}.xlsx`, setFeedbackDownloading);

  const handleClearPTP = () => {
    Alert.alert("Clear All PTP Dates", "This will remove all PTP dates and reset all PTP cases to Pending. Continue?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear", style: "destructive",
        onPress: async () => {
          setPtpClearing(true);
          try {
            const url = new URL("/api/admin/clear-ptp", getApiUrl()).toString();
            const res = await expoFetch(url, { method: "POST", credentials: "include" });
            if (!res.ok) throw new Error("Clear failed");
            qc.invalidateQueries({ queryKey: ["/api/admin/stats"] });
            Alert.alert("Done", "All PTP dates have been cleared.");
          } catch (e: any) { Alert.alert("Error", e.message || "Could not clear PTP dates"); }
          finally { setPtpClearing(false); }
        },
      },
    ]);
  };

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["/api/admin/stats"],
    queryFn: () => api.admin.getStats(),
    staleTime: 0,
    refetchOnMount: true,
    retry: 2,
  });

  const stats = (() => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray((data as any).stats))  return (data as any).stats;
    if (Array.isArray((data as any).agents)) return (data as any).agents;
    if (Array.isArray((data as any).data))   return (data as any).data;
    const firstArr = Object.values(data as object).find(v => Array.isArray(v));
    return (firstArr as any[]) || [];
  })();

  const totalAgents = stats.length;
  const totalCases  = stats.reduce((s: number, a: any) => s + (a.total      || 0), 0);
  const totalPaid   = stats.reduce((s: number, a: any) => s + (a.paid       || 0), 0);
  const totalPTP    = stats.reduce((s: number, a: any) => s + (a.ptp        || 0), 0);
  const totalUnpaid = stats.reduce((s: number, a: any) => s + (a.notProcess || 0), 0);

  if (isLoading) return (
    <View style={styles.centerScreen}>
      <ActivityIndicator color={Colors.primary} size="large" />
    </View>
  );

  if (isError) return (
    <View style={styles.centerScreen}>
      <Ionicons name="alert-circle-outline" size={48} color={Colors.danger} />
      <Text style={[styles.emptyText, { color: Colors.danger, marginTop: 12 }]}>Failed to load dashboard</Text>
      <Text style={[styles.emptyText, { fontSize: 12, marginTop: 4 }]}>{String(error)}</Text>
      <Pressable onPress={() => refetch()} style={styles.retryBtn}>
        <Text style={styles.retryBtnText}>Retry</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.outerWrap}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.container,
          { paddingBottom: insets.bottom + 24, paddingTop: Platform.OS === "web" ? 16 : 0 },
        ]}
      >
        {/* Import Allocation */}
        <Pressable style={styles.importBanner} onPress={() => setImportVisible(true)}>
          <View style={styles.importBannerLeft}>
            <Ionicons name="cloud-upload" size={28} color="#fff" />
            <View style={styles.importBannerText}>
              <Text style={styles.importBannerTitle}>Import Allocation Data</Text>
              <Text style={styles.importBannerSub}>Upload allocation file to sync cases & create FOS users. BKT1/2/3 performance auto-updates.</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.7)" />
        </Pressable>

        {/* Import Penal Performance */}
        <Pressable style={[styles.importBanner, { backgroundColor: "#7C3AED" }]} onPress={() => setBktPerfImportVisible(true)}>
          <View style={styles.importBannerLeft}>
            <Ionicons name="bar-chart-outline" size={28} color="#fff" />
            <View style={styles.importBannerText}>
              <Text style={styles.importBannerTitle}>Import Penal Performance</Text>
              <Text style={styles.importBannerSub}>Upload penal summary Excel: Fos_Name, Values, PAID, UNPAID, Grand Total, Percentage, Rollback</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.7)" />
        </Pressable>

        {/* Download PTP */}
        <Pressable
          style={[styles.importBanner, { backgroundColor: Colors.success }, ptpDownloading && { opacity: 0.7 }]}
          onPress={handleDownloadPTP}
          disabled={ptpDownloading}
        >
          <View style={styles.importBannerLeft}>
            {ptpDownloading
              ? <ActivityIndicator color="#fff" size="small" style={{ marginRight: 4 }} />
              : <Ionicons name="download-outline" size={28} color="#fff" />}
            <View style={styles.importBannerText}>
              <Text style={styles.importBannerTitle}>Download PTP Report</Text>
              <Text style={styles.importBannerSub}>{ptpDownloading ? "Preparing file…" : "Export all PTP cases with customer details as Excel"}</Text>
            </View>
          </View>
          {!ptpDownloading && <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.7)" />}
        </Pressable>

        {/* Download Feedback */}
        <Pressable
          style={[styles.importBanner, { backgroundColor: Colors.info }, feedbackDownloading && { opacity: 0.7 }]}
          onPress={handleDownloadFeedback}
          disabled={feedbackDownloading}
        >
          <View style={styles.importBannerLeft}>
            {feedbackDownloading
              ? <ActivityIndicator color="#fff" size="small" style={{ marginRight: 4 }} />
              : <Ionicons name="chatbox-outline" size={28} color="#fff" />}
            <View style={styles.importBannerText}>
              <Text style={styles.importBannerTitle}>Download Feedback Report</Text>
              <Text style={styles.importBannerSub}>{feedbackDownloading ? "Preparing file…" : "Export all FOS feedback with full details as Excel"}</Text>
            </View>
          </View>
          {!feedbackDownloading && <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.7)" />}
        </Pressable>

        {/* Clear PTP */}
        <Pressable
          style={[styles.importBanner, { backgroundColor: Colors.danger }, ptpClearing && { opacity: 0.7 }]}
          onPress={handleClearPTP}
          disabled={ptpClearing}
        >
          <View style={styles.importBannerLeft}>
            {ptpClearing
              ? <ActivityIndicator color="#fff" size="small" style={{ marginRight: 4 }} />
              : <Ionicons name="trash-outline" size={28} color="#fff" />}
            <View style={styles.importBannerText}>
              <Text style={styles.importBannerTitle}>Clear All PTP Dates</Text>
              <Text style={styles.importBannerSub}>{ptpClearing ? "Clearing…" : "Reset all PTP statuses and dates from the database"}</Text>
            </View>
          </View>
          {!ptpClearing && <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.7)" />}
        </Pressable>

        {/* Push Panel */}
        {(() => {
          const allAgents = pushStatusData?.agents || [];
          const tokenCount = allAgents.filter(a => a.has_token).length;
          return (
            <View style={styles.pushPanel}>
              <Pressable style={styles.pushPanelHeader} onPress={() => setPushExpanded(v => !v)}>
                <View style={styles.pushPanelLeft}>
                  <Ionicons name="notifications" size={20} color={Colors.primary} />
                  <View>
                    <Text style={styles.pushPanelTitle}>Push Notifications</Text>
                    <Text style={styles.pushPanelSub}>
                      {allAgents.length === 0 ? "Loading agent status…" : `${tokenCount}/${allAgents.length} agents registered`}
                    </Text>
                  </View>
                </View>
                <View style={styles.pushPanelRight}>
                  <Pressable style={[styles.testAllBtn, pushTesting && { opacity: 0.6 }]} onPress={handleTestPushAll} disabled={pushTesting}>
                    {pushTesting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.testAllBtnText}>Test All</Text>}
                  </Pressable>
                  <Ionicons name={pushExpanded ? "chevron-up" : "chevron-down"} size={16} color={Colors.textMuted} />
                </View>
              </Pressable>
              {pushExpanded && (
                <View style={styles.pushAgentList}>
                  {allAgents.length === 0 && <Text style={styles.pushAgentEmpty}>No FOS agents found.</Text>}
                  {allAgents.map(agent => (
                    <View key={agent.id} style={styles.pushAgentRow}>
                      <View style={[styles.pushDot, { backgroundColor: agent.has_token ? Colors.success : Colors.danger }]} />
                      <Text style={styles.pushAgentName} numberOfLines={1}>{agent.name}</Text>
                      <Text style={styles.pushAgentStatus}>{agent.has_token ? "Registered" : "No token"}</Text>
                      {agent.has_token && (
                        <Pressable style={styles.testOneBtn} onPress={() => handleTestPushOne(agent.id, agent.name)} disabled={pushTesting}>
                          <Ionicons name="send" size={14} color={Colors.primary} />
                        </Pressable>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })()}

        {/* Summary Grid */}
        <View style={styles.summaryGrid}>
          {[
            { icon: "people"           as const, num: totalAgents, label: "FOS Agents", color: Colors.primary },
            { icon: "document-text"    as const, num: totalCases,  label: "Total Cases", color: Colors.info },
            { icon: "checkmark-circle" as const, num: totalPaid,   label: "Paid",        color: Colors.success },
            { icon: "close-circle"     as const, num: totalUnpaid, label: "Unpaid",      color: Colors.danger },
            { icon: "calendar"         as const, num: totalPTP,    label: "PTP",         color: Colors.statusPTP },
          ].map((s) => (
            <View key={s.label} style={[styles.summaryCard, { borderTopColor: s.color }]}>
              <Ionicons name={s.icon} size={24} color={s.color} />
              <Text style={styles.summaryNum}>{s.num}</Text>
              <Text style={styles.summaryLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Quick Links */}
        <View style={styles.quickLinks}>
          {[
            { label: "All Cases",      icon: "list"             as const, screen: "/(admin)/all-cases"     },
            { label: "BKT Perf.",      icon: "layers"           as const, screen: "/(admin)/bkt-cases"     },
            { label: "Agency Target",  icon: "trophy"           as const, screen: "/(admin)/agency-target" },
            { label: "Salary",         icon: "wallet"           as const, screen: "/(admin)/salary"        },
            { label: "Depositions",    icon: "cash"             as const, screen: "/(admin)/depositions"   },
            { label: "Attendance",     icon: "checkmark-circle" as const, screen: "/(admin)/attendance"    },
          ].map((item) => (
            <Pressable key={item.label} style={({ pressed }) => [styles.quickLink, pressed && { opacity: 0.8 }]} onPress={() => router.push(item.screen as any)}>
              <Ionicons name={item.icon} size={22} color={Colors.primary} />
              <Text style={styles.quickLinkText}>{item.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionTitle}>FOS Agents Performance</Text>

        {stats.map((agent: any) => <AgentCard key={agent.id} agent={agent} />)}

        {stats.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No agents found. Import Excel to get started.</Text>
          </View>
        )}
      </ScrollView>

      <ImportModal
        visible={importVisible}
        onClose={() => setImportVisible(false)}
        endpoint="/api/admin/import"
        title="Import Allocation Excel"
        infoText="Excel columns: LOAN NO, APP ID, CUSTOMER NAME, EMI, EMI_DUE, CBC, LPP, CBC+LPP, POS, BKT, ROLLBACK, CLEARANCE, ADDRESS, FIRST_EMI_DUE_DATE, LOAN_MATURITY_DATE, ASSET_MAKE, REGISTRATION_NO, ENGINE_NO, CHASSIS_NO, REFERENCE_ADDRESS, TEN, NUMBER, PRO, FOS_NAME, STATUS, DETAIL FB"
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["/api/admin/stats"] });
          qc.invalidateQueries({ queryKey: ["/api/admin/cases"] });
          qc.invalidateQueries({ queryKey: ["/api/admin/agents"] });
          qc.invalidateQueries({ queryKey: ["/api/cases"] });
          qc.invalidateQueries({ queryKey: ["/api/stats"] });
          qc.invalidateQueries({ queryKey: ["/api/admin/bkt-cases"] });
          qc.invalidateQueries({ queryKey: ["/api/bkt-cases"] });
          qc.invalidateQueries({ queryKey: ["/api/admin/bkt-perf-summary"] });
          qc.invalidateQueries({ queryKey: ["/api/bkt-perf-summary"] });
          refetch();
        }}
      />
      <BktPerfImportModal
        visible={bktPerfImportVisible}
        onClose={() => setBktPerfImportVisible(false)}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["/api/admin/bkt-perf-summary"] });
          qc.invalidateQueries({ queryKey: ["/api/bkt-perf-summary"] });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  outerWrap:        { flex: 1, backgroundColor: Colors.background },
  scroll:           { flex: 1, backgroundColor: Colors.background },
  centerScreen:     { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background, padding: 24 },
  retryBtn:         { marginTop: 16, backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10 },
  retryBtnText:     { color: "#fff", fontWeight: "700", fontSize: 14 },
  container:        { padding: 16, gap: 16 },
  importBanner:     { backgroundColor: Colors.primary, borderRadius: 16, padding: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  importBannerLeft: { flexDirection: "row", alignItems: "center", gap: 14, flex: 1 },
  importBannerText: { flex: 1 },
  importBannerTitle:{ color: "#fff", fontSize: 16, fontWeight: "700" },
  importBannerSub:  { color: "rgba(255,255,255,0.8)", fontSize: 12, marginTop: 2, flexShrink: 1 },
  summaryGrid:      { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  summaryCard:      { flex: 1, minWidth: "28%", backgroundColor: Colors.surface, borderRadius: 14, padding: 14, alignItems: "center", gap: 6, borderTopWidth: 3, borderWidth: 1, borderColor: Colors.border, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  summaryNum:       { fontSize: 26, fontWeight: "800", color: Colors.text },
  summaryLabel:     { fontSize: 11, color: Colors.textSecondary, fontWeight: "600", textAlign: "center" },
  quickLinks:       { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  quickLink:        { minWidth: "30%", flex: 1, backgroundColor: Colors.surface, borderRadius: 14, padding: 14, alignItems: "center", gap: 6, borderWidth: 1, borderColor: Colors.border },
  quickLinkText:    { fontSize: 11, fontWeight: "600", color: Colors.textSecondary, textAlign: "center" },
  sectionTitle:     { fontSize: 18, fontWeight: "700", color: Colors.text },
  agentCard:        { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: Colors.border, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  agentCardTop:     { flexDirection: "row", alignItems: "center", gap: 12 },
  agentAvatar:      { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  agentInfo:        { flex: 1 },
  agentName:        { fontSize: 15, fontWeight: "700", color: Colors.text },
  rateCircle:       { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  rateText:         { fontSize: 12, fontWeight: "800" },
  statsRow:         { flexDirection: "row", gap: 6 },
  statPill:         { flex: 1, backgroundColor: Colors.surfaceAlt, borderRadius: 10, padding: 8, alignItems: "center", gap: 2 },
  statPillNum:      { fontSize: 16, fontWeight: "800", color: Colors.text },
  statPillLabel:    { fontSize: 9, fontWeight: "600", color: Colors.textSecondary },
  empty:            { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText:        { fontSize: 14, color: Colors.textMuted, textAlign: "center" },
  pushPanel:        { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 2 },
  pushPanelHeader:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  pushPanelLeft:    { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  pushPanelRight:   { flexDirection: "row", alignItems: "center", gap: 10 },
  pushPanelTitle:   { fontSize: 14, fontWeight: "700", color: Colors.text },
  pushPanelSub:     { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  testAllBtn:       { backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, minWidth: 70, alignItems: "center" },
  testAllBtnText:   { color: "#fff", fontSize: 12, fontWeight: "700" },
  pushAgentList:    { borderTopWidth: 1, borderTopColor: Colors.border },
  pushAgentRow:     { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  pushDot:          { width: 8, height: 8, borderRadius: 4 },
  pushAgentName:    { flex: 1, fontSize: 13, color: Colors.text, fontWeight: "600" },
  pushAgentStatus:  { fontSize: 11, color: Colors.textSecondary, fontWeight: "600" },
  pushAgentEmpty:   { padding: 16, color: Colors.textMuted, fontSize: 13, textAlign: "center" },
  testOneBtn:       { width: 30, height: 30, borderRadius: 8, backgroundColor: Colors.primary + "18", alignItems: "center", justifyContent: "center" },
});

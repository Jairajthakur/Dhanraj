import React, { useState, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator,
  Modal, Alert, Platform, Linking
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";
import { getApiUrl } from "@/lib/query-client";
import { fetch as expoFetch } from "expo/fetch";

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
          { label: "Total", val: agent.total || 0, color: Colors.text },
          { label: "Paid", val: agent.paid || 0, color: Colors.success },
          { label: "PTP", val: agent.ptp || 0, color: Colors.info },
          { label: "Unpaid", val: agent.notProcess || 0, color: Colors.danger },
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

function ImportModal({
  visible, onClose, onDone, endpoint, title, infoText,
}: {
  visible: boolean; onClose: () => void; onDone: () => void;
  endpoint: string; title: string; infoText: string;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [nativeFile, setNativeFile] = useState<any>(null);
  const fileInputRef = useRef<any>(null);

  const handleFilePick = async () => {
    if (Platform.OS === "web") {
      fileInputRef.current?.click();
    } else {
      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: [
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel",
            "text/csv",
            "application/octet-stream",
            "*/*",
          ],
          copyToCacheDirectory: true,
        });
        if (!result.canceled && result.assets?.[0]) {
          const asset = result.assets[0];
          setFileName(asset.name);
          setNativeFile({
            uri: asset.uri,
            name: asset.name,
            type: asset.mimeType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          });
          setResult(null);
        }
      } catch {
        Alert.alert("Error", "Could not open file picker. Please try again.");
      }
    }
  };

  const handleWebFileChange = (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setNativeFile(file);
    setResult(null);
  };

  const handleImport = async () => {
    if (!nativeFile) { Alert.alert("Error", "Please select an Excel file first."); return; }
    setLoading(true);
    setResult(null);
    try {
      const formData = new FormData();
      if (Platform.OS !== "web" && nativeFile.uri) {
        // On Android/iOS: read the local file:// URI as a Blob using global fetch
        // (expo/fetch / undici requires a real Blob, not React Native's {uri,name,type} shorthand)
        const fileRes = await (globalThis as any).fetch(nativeFile.uri);
        const blob = await fileRes.blob();
        formData.append("file", blob, nativeFile.name);
      } else {
        formData.append("file", nativeFile as any);
      }
      const url = new URL(endpoint, getApiUrl()).toString();
      const res = await expoFetch(url, { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) {
        const text = await res.text();
        let msg = text;
        try { msg = JSON.parse(text).message; } catch {}
        throw new Error(msg || "Import failed");
      }
      const data = await res.json();
      setResult(data);
      onDone();
    } catch (e: any) {
      Alert.alert("Import Failed", e.message);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setFileName(null);
    setNativeFile(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={importStyles.overlay}>
        <View style={importStyles.sheet}>
          <View style={importStyles.handle} />
          <View style={importStyles.header}>
            <Ionicons name="document-attach" size={22} color={Colors.primary} />
            <Text style={importStyles.title}>{title}</Text>
          </View>

          <View style={importStyles.infoBox}>
            <Ionicons name="information-circle" size={16} color={Colors.info} />
            <Text style={importStyles.infoText}>{infoText}</Text>
          </View>

          {/* Web file input */}
          {Platform.OS === "web" && (
            // @ts-ignore
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              style={{ display: "none" }}
              onChange={handleWebFileChange}
            />
          )}

          <Pressable style={importStyles.pickBtn} onPress={handleFilePick}>
            <Ionicons name="folder-open" size={20} color={Colors.primary} />
            <Text style={importStyles.pickBtnText}>
              {fileName ? fileName : "Choose Excel File (.xlsx)"}
            </Text>
            {fileName && (
              <Pressable onPress={reset}>
                <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
              </Pressable>
            )}
          </Pressable>

          {result && (
            <View style={importStyles.resultBox}>
              <Text style={importStyles.resultTitle}>Import Complete</Text>
              <View style={importStyles.resultGrid}>
                <View style={importStyles.resultItem}>
                  <Text style={[importStyles.resultNum, { color: Colors.success }]}>{result.imported}</Text>
                  <Text style={importStyles.resultLabel}>New Cases</Text>
                </View>
                <View style={importStyles.resultItem}>
                  <Text style={[importStyles.resultNum, { color: Colors.info }]}>{result.updated}</Text>
                  <Text style={importStyles.resultLabel}>Updated</Text>
                </View>
                <View style={importStyles.resultItem}>
                  <Text style={[importStyles.resultNum, { color: Colors.warning }]}>{result.skipped}</Text>
                  <Text style={importStyles.resultLabel}>Skipped</Text>
                </View>
                <View style={importStyles.resultItem}>
                  <Text style={[importStyles.resultNum, { color: Colors.primary }]}>{result.agentsCreated}</Text>
                  <Text style={importStyles.resultLabel}>FOS Created</Text>
                </View>
              </View>
              {result.errors?.length > 0 && (
                <View style={importStyles.errorList}>
                  <Text style={importStyles.errorTitle}>Errors ({result.errors.length}):</Text>
                  {result.errors.slice(0, 5).map((e: string, i: number) => (
                    <Text key={i} style={importStyles.errorItem}>• {e}</Text>
                  ))}
                </View>
              )}
            </View>
          )}

          <View style={importStyles.btnRow}>
            <Pressable style={importStyles.cancelBtn} onPress={() => { reset(); onClose(); }}>
              <Text style={importStyles.cancelText}>Close</Text>
            </Pressable>
            <Pressable
              style={[importStyles.importBtn, (!nativeFile || loading) && { opacity: 0.5 }]}
              onPress={handleImport}
              disabled={!nativeFile || loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="cloud-upload" size={18} color="#fff" />
                  <Text style={importStyles.importText}>Import</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const BKT_OPTIONS = ["Auto-detect", "1", "2", "3", "Penal"];

function BktPerfImportModal({
  visible, onClose, onDone,
}: {
  visible: boolean; onClose: () => void; onDone: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [nativeFile, setNativeFile] = useState<any>(null);
  const [selectedBkt, setSelectedBkt] = useState("Auto-detect");
  const fileInputRef = useRef<any>(null);

  const handleFilePick = async () => {
    if (Platform.OS === "web") {
      fileInputRef.current?.click();
    } else {
      try {
        const res = await DocumentPicker.getDocumentAsync({
          type: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "*/*"],
          copyToCacheDirectory: true,
        });
        if (!res.canceled && res.assets?.[0]) {
          const asset = res.assets[0];
          setFileName(asset.name);
          setNativeFile({ uri: asset.uri, name: asset.name, type: asset.mimeType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
          setResult(null);
        }
      } catch { Alert.alert("Error", "Could not open file picker."); }
    }
  };

  const handleWebFileChange = (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setNativeFile(file);
    setResult(null);
  };

  const handleImport = async () => {
    if (!nativeFile) { Alert.alert("Error", "Please select an Excel file first."); return; }
    setLoading(true);
    setResult(null);
    try {
      const formData = new FormData();
      if (Platform.OS !== "web" && nativeFile.uri) {
        const fileRes = await (globalThis as any).fetch(nativeFile.uri);
        const blob = await fileRes.blob();
        formData.append("file", blob, nativeFile.name);
      } else {
        formData.append("file", nativeFile as any);
      }
      if (selectedBkt !== "Auto-detect") {
        formData.append("bkt", selectedBkt);
      }
      const url = new URL("/api/admin/import-bkt-perf", getApiUrl()).toString();
      const res = await expoFetch(url, { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) {
        const text = await res.text();
        let msg = text;
        try { msg = JSON.parse(text).message; } catch {}
        throw new Error(msg || "Import failed");
      }
      const data = await res.json();
      setResult(data);
      onDone();
    } catch (e: any) {
      Alert.alert("Import Failed", e.message);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setFileName(null); setNativeFile(null); setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={importStyles.overlay}>
        <View style={importStyles.sheet}>
          <View style={importStyles.handle} />
          <View style={importStyles.header}>
            <Ionicons name="bar-chart" size={22} color={Colors.primary} />
            <Text style={importStyles.title}>Import BKT Performance Summary</Text>
          </View>

          <View style={importStyles.infoBox}>
            <Ionicons name="information-circle" size={16} color={Colors.info} />
            <Text style={importStyles.infoText}>Pivot table Excel with POS + Rollback data. Select BKT if auto-detection fails.</Text>
          </View>

          {/* BKT Selector */}
          <View style={bktSelStyles.container}>
            <Text style={bktSelStyles.label}>BKT / Sheet:</Text>
            <View style={bktSelStyles.row}>
              {BKT_OPTIONS.map(opt => (
                <Pressable
                  key={opt}
                  style={[bktSelStyles.chip, selectedBkt === opt && bktSelStyles.chipActive]}
                  onPress={() => setSelectedBkt(opt)}
                >
                  <Text style={[bktSelStyles.chipText, selectedBkt === opt && bktSelStyles.chipTextActive]}>{opt}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {Platform.OS === "web" && (
            // @ts-ignore
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={handleWebFileChange} />
          )}

          <Pressable style={importStyles.pickBtn} onPress={handleFilePick}>
            <Ionicons name="folder-open" size={20} color={Colors.primary} />
            <Text style={importStyles.pickBtnText}>{fileName ? fileName : "Choose Excel File (.xlsx)"}</Text>
            {fileName && <Pressable onPress={reset}><Ionicons name="close-circle" size={18} color={Colors.textMuted} /></Pressable>}
          </Pressable>

          {result && (
            <View style={importStyles.resultBox}>
              <Text style={importStyles.resultTitle}>Import Complete · BKT {result.bkt || selectedBkt}</Text>
              <View style={importStyles.resultGrid}>
                <View style={importStyles.resultItem}>
                  <Text style={[importStyles.resultNum, { color: Colors.success }]}>{result.imported}</Text>
                  <Text style={importStyles.resultLabel}>Imported</Text>
                </View>
                <View style={importStyles.resultItem}>
                  <Text style={[importStyles.resultNum, { color: Colors.warning }]}>{result.skipped}</Text>
                  <Text style={importStyles.resultLabel}>Skipped</Text>
                </View>
              </View>
            </View>
          )}

          <View style={importStyles.btnRow}>
            <Pressable style={importStyles.cancelBtn} onPress={() => { reset(); onClose(); }}>
              <Text style={importStyles.cancelText}>Close</Text>
            </Pressable>
            <Pressable
              style={[importStyles.importBtn, { backgroundColor: Colors.primary }, (!nativeFile || loading) && { opacity: 0.5 }]}
              onPress={handleImport}
              disabled={!nativeFile || loading}
            >
              {loading ? <ActivityIndicator color="#fff" size="small" /> : (
                <><Ionicons name="cloud-upload" size={18} color="#fff" /><Text style={importStyles.importText}>Import</Text></>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const bktSelStyles = StyleSheet.create({
  container: { gap: 6 },
  label: { fontSize: 12, fontWeight: "700", color: Colors.textSecondary },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: Colors.surfaceAlt, borderWidth: 1.5, borderColor: Colors.border },
  chipActive: { backgroundColor: Colors.primary + "20", borderColor: Colors.primary },
  chipText: { fontSize: 13, fontWeight: "600", color: Colors.textMuted },
  chipTextActive: { color: Colors.primary, fontWeight: "800" },
});

export default function AdminDashboard() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [importVisible, setImportVisible] = useState(false);
  const [bktPerfImportVisible, setBktPerfImportVisible] = useState(false);
  const [ptpDownloading, setPtpDownloading] = useState(false);
  const [ptpClearing, setPtpClearing] = useState(false);
  const [pushTesting, setPushTesting] = useState(false);
  const [pushExpanded, setPushExpanded] = useState(false);

  const { data: pushStatusData } = useQuery({
    queryKey: ["/api/admin/push-status"],
    queryFn: async () => {
      const url = new URL("/api/admin/push-status", getApiUrl()).toString();
      const res = await expoFetch(url, { credentials: "include" });
      return res.json() as Promise<{ agents: { id: number; name: string; has_token: boolean; token_preview: string | null }[] }>;
    },
  });

  const handleTestPushAll = async () => {
    const agents = pushStatusData?.agents || [];
    const withToken = agents.filter(a => a.has_token);
    if (withToken.length === 0) {
      Alert.alert("No Tokens", "No FOS agents have registered push tokens yet. They must log in on the APK device first.");
      return;
    }
    Alert.alert(
      "Send Test Notification",
      `Send a test push notification to ${withToken.length} agent${withToken.length !== 1 ? "s" : ""} with registered tokens?`,
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
              Alert.alert("Sent!", `Delivered to ${json.sent}/${json.total} agent${json.total !== 1 ? "s" : ""} successfully.`);
            } catch (e: any) {
              Alert.alert("Error", e.message || "Could not send test notifications");
            } finally {
              setPushTesting(false);
            }
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
      Alert.alert("Sent!", `Test notification delivered to ${agentName} successfully.`);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setPushTesting(false);
    }
  };

  const handleDownloadPTP = async () => {
    const url = new URL("/api/admin/ptp-export", getApiUrl()).toString();
    setPtpDownloading(true);
    try {
      if (Platform.OS === "web") {
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error((await res.json()).message || "Export failed");
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = `PTP_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      } else {
        const res = await expoFetch(url, { credentials: "include" });
        if (!res.ok) throw new Error((await res.json()).message || "Export failed");
        const ab = await res.arrayBuffer();
        const uint8 = new Uint8Array(ab);
        const CHUNK = 0x8000;
        let binary = "";
        for (let i = 0; i < uint8.length; i += CHUNK) {
          binary += String.fromCharCode(...(uint8.subarray(i, i + CHUNK) as any));
        }
        const base64 = btoa(binary);
        const fileName = `PTP_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
        const fileUri = (FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "") + fileName;
        await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: "base64" });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(fileUri, {
            mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            dialogTitle: "Save PTP Report",
            UTI: "com.microsoft.excel.xlsx",
          });
        } else {
          Alert.alert("Saved", `PTP Report saved.\n\nFile: ${fileName}`);
        }
      }
    } catch (e: any) {
      Alert.alert("Download Failed", e.message || "Could not download report");
    } finally {
      setPtpDownloading(false);
    }
  };

  const handleClearPTP = () => {
    Alert.alert(
      "Clear All PTP Dates",
      "This will remove all PTP dates and reset all PTP cases to Pending. This cannot be undone. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear", style: "destructive",
          onPress: async () => {
            setPtpClearing(true);
            try {
              const url = new URL("/api/admin/clear-ptp", getApiUrl()).toString();
              const res = await expoFetch(url, { method: "POST", credentials: "include" });
              if (!res.ok) throw new Error((await res.json()).message || "Clear failed");
              qc.invalidateQueries({ queryKey: ["/api/admin/stats"] });
              Alert.alert("Done", "All PTP dates have been cleared.");
            } catch (e: any) {
              Alert.alert("Error", e.message || "Could not clear PTP dates");
            } finally {
              setPtpClearing(false);
            }
          },
        },
      ]
    );
  };

  const { data, isLoading } = useQuery({
    queryKey: ["/api/admin/stats"],
    queryFn: () => api.admin.getStats(),
  });

  const stats = data?.stats || [];
  const totalAgents = stats.length;
  const totalCases = stats.reduce((s: number, a: any) => s + (a.total || 0), 0);
  const totalPaid = stats.reduce((s: number, a: any) => s + (a.paid || 0), 0);
  const totalPTP = stats.reduce((s: number, a: any) => s + (a.ptp || 0), 0);
  const totalUnpaid = stats.reduce((s: number, a: any) => s + (a.notProcess || 0), 0);

  if (isLoading) return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background }}>
      <ActivityIndicator color={Colors.primary} size="large" />
    </View>
  );

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 24, paddingTop: Platform.OS === "web" ? 67 : 0 }]}
      >
        {/* Import Excel Banner — Allocation */}
        <Pressable style={styles.importBanner} onPress={() => setImportVisible(true)}>
          <View style={styles.importBannerLeft}>
            <Ionicons name="cloud-upload" size={28} color="#fff" />
            <View>
              <Text style={styles.importBannerTitle}>Import Allocation Data</Text>
              <Text style={styles.importBannerSub}>Upload allocation file to sync cases & create FOS users</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.7)" />
        </Pressable>

        {/* Import Excel Banner — BKT Performance Summary */}
        <Pressable style={[styles.importBanner, { backgroundColor: Colors.primary }]} onPress={() => setBktPerfImportVisible(true)}>
          <View style={styles.importBannerLeft}>
            <Ionicons name="bar-chart-outline" size={28} color="#fff" />
            <View>
              <Text style={styles.importBannerTitle}>Import BKT Performance Summary</Text>
              <Text style={styles.importBannerSub}>Upload summary Excel: Fos_Name, Bkt, Values, PAID, UNPAID, Grand Total, Percentage, Rollback</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.7)" />
        </Pressable>

        {/* Download PTP Report */}
        <Pressable
          style={[styles.importBanner, { backgroundColor: Colors.success }, ptpDownloading && { opacity: 0.7 }]}
          onPress={handleDownloadPTP}
          disabled={ptpDownloading}
        >
          <View style={styles.importBannerLeft}>
            {ptpDownloading
              ? <ActivityIndicator color="#fff" size="small" style={{ marginRight: 4 }} />
              : <Ionicons name="download-outline" size={28} color="#fff" />}
            <View>
              <Text style={styles.importBannerTitle}>Download PTP Report</Text>
              <Text style={styles.importBannerSub}>{ptpDownloading ? "Preparing file…" : "Export all PTP cases with customer details as Excel"}</Text>
            </View>
          </View>
          {!ptpDownloading && <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.7)" />}
        </Pressable>

        {/* Clear PTP Dates */}
        <Pressable
          style={[styles.importBanner, { backgroundColor: Colors.danger }, ptpClearing && { opacity: 0.7 }]}
          onPress={handleClearPTP}
          disabled={ptpClearing}
        >
          <View style={styles.importBannerLeft}>
            {ptpClearing
              ? <ActivityIndicator color="#fff" size="small" style={{ marginRight: 4 }} />
              : <Ionicons name="trash-outline" size={28} color="#fff" />}
            <View>
              <Text style={styles.importBannerTitle}>Clear All PTP Dates</Text>
              <Text style={styles.importBannerSub}>{ptpClearing ? "Clearing…" : "Reset all PTP statuses and dates from the database"}</Text>
            </View>
          </View>
          {!ptpClearing && <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.7)" />}
        </Pressable>

        {/* Push Notification Test Panel */}
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
                      {allAgents.length === 0
                        ? "Loading agent status…"
                        : `${tokenCount}/${allAgents.length} agents registered`}
                    </Text>
                  </View>
                </View>
                <View style={styles.pushPanelRight}>
                  <Pressable
                    style={[styles.testAllBtn, pushTesting && { opacity: 0.6 }]}
                    onPress={handleTestPushAll}
                    disabled={pushTesting}
                  >
                    {pushTesting
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={styles.testAllBtnText}>Test All</Text>}
                  </Pressable>
                  <Ionicons name={pushExpanded ? "chevron-up" : "chevron-down"} size={16} color={Colors.textMuted} />
                </View>
              </Pressable>
              {pushExpanded && (
                <View style={styles.pushAgentList}>
                  {allAgents.length === 0 && (
                    <Text style={styles.pushAgentEmpty}>No FOS agents found.</Text>
                  )}
                  {allAgents.map(agent => (
                    <View key={agent.id} style={styles.pushAgentRow}>
                      <View style={[styles.pushDot, { backgroundColor: agent.has_token ? Colors.success : Colors.danger }]} />
                      <Text style={styles.pushAgentName} numberOfLines={1}>{agent.name}</Text>
                      <Text style={styles.pushAgentStatus}>{agent.has_token ? "Registered" : "No token"}</Text>
                      {agent.has_token && (
                        <Pressable
                          style={styles.testOneBtn}
                          onPress={() => handleTestPushOne(agent.id, agent.name)}
                          disabled={pushTesting}
                        >
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
            { icon: "people" as const, num: totalAgents, label: "FOS Agents", color: Colors.primary },
            { icon: "document-text" as const, num: totalCases, label: "Total Cases", color: Colors.info },
            { icon: "checkmark-circle" as const, num: totalPaid, label: "Paid", color: Colors.success },
            { icon: "close-circle" as const, num: totalUnpaid, label: "Unpaid", color: Colors.danger },
            { icon: "calendar" as const, num: totalPTP, label: "PTP", color: Colors.statusPTP },
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
            { label: "All Cases", icon: "list" as const, screen: "/(admin)/all-cases" },
            { label: "BKT Perf.", icon: "layers" as const, screen: "/(admin)/bkt-cases" },
            { label: "Salary", icon: "wallet" as const, screen: "/(admin)/salary" },
            { label: "Depositions", icon: "cash" as const, screen: "/(admin)/depositions" },
            { label: "Attendance", icon: "checkmark-circle" as const, screen: "/(admin)/attendance" },
          ].map((item) => (
            <Pressable
              key={item.label}
              style={({ pressed }) => [styles.quickLink, pressed && { opacity: 0.8 }]}
              onPress={() => router.push(item.screen as any)}
            >
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
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16 },
  importBanner: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  importBannerLeft: { flexDirection: "row", alignItems: "center", gap: 14, flex: 1 },
  importBannerTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  importBannerSub: { color: "rgba(255,255,255,0.8)", fontSize: 12, marginTop: 2, flexShrink: 1 },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  summaryCard: {
    flex: 1, minWidth: "28%", backgroundColor: Colors.surface, borderRadius: 14,
    padding: 14, alignItems: "center", gap: 6, borderTopWidth: 3,
    borderWidth: 1, borderColor: Colors.border,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  summaryNum: { fontSize: 26, fontWeight: "800", color: Colors.text },
  summaryLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: "600", textAlign: "center" },
  quickLinks: { flexDirection: "row", gap: 10 },
  quickLink: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: 14, padding: 14,
    alignItems: "center", gap: 6, borderWidth: 1, borderColor: Colors.border,
  },
  quickLinkText: { fontSize: 11, fontWeight: "600", color: Colors.textSecondary, textAlign: "center" },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: Colors.text },
  agentCard: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 16, gap: 12,
    borderWidth: 1, borderColor: Colors.border,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  agentCardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  agentAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  agentInfo: { flex: 1 },
  agentName: { fontSize: 15, fontWeight: "700", color: Colors.text },
  agentEmpId: { fontSize: 12, color: Colors.textSecondary },
  rateCircle: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  rateText: { fontSize: 12, fontWeight: "800" },
  statsRow: { flexDirection: "row", gap: 6 },
  statPill: { flex: 1, backgroundColor: Colors.surfaceAlt, borderRadius: 10, padding: 8, alignItems: "center", gap: 2 },
  statPillNum: { fontSize: 16, fontWeight: "800", color: Colors.text },
  statPillLabel: { fontSize: 9, fontWeight: "600", color: Colors.textSecondary },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: "center" },
  pushPanel: {
    backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border,
    overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 2,
  },
  pushPanelHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14, gap: 10,
  },
  pushPanelLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  pushPanelRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  pushPanelTitle: { fontSize: 14, fontWeight: "700", color: Colors.text },
  pushPanelSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  testAllBtn: {
    backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, minWidth: 70, alignItems: "center",
  },
  testAllBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  pushAgentList: { borderTopWidth: 1, borderTopColor: Colors.border },
  pushAgentRow: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10,
    gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  pushDot: { width: 8, height: 8, borderRadius: 4 },
  pushAgentName: { flex: 1, fontSize: 13, color: Colors.text, fontWeight: "600" },
  pushAgentStatus: { fontSize: 11, color: Colors.textSecondary, fontWeight: "600" },
  pushAgentEmpty: { padding: 16, color: Colors.textMuted, fontSize: 13, textAlign: "center" },
  testOneBtn: {
    width: 30, height: 30, borderRadius: 8, backgroundColor: Colors.primary + "18",
    alignItems: "center", justifyContent: "center",
  },
});

const importStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, gap: 16, maxHeight: "90%",
  },
  handle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: "center", marginBottom: 4 },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { fontSize: 20, fontWeight: "700", color: Colors.text },
  infoBox: {
    flexDirection: "row", gap: 8, backgroundColor: Colors.info + "15",
    borderRadius: 12, padding: 12, alignItems: "flex-start",
  },
  infoText: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  pickBtn: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: 2, borderColor: Colors.primary, borderStyle: "dashed",
    borderRadius: 12, padding: 16,
  },
  pickBtnText: { flex: 1, fontSize: 14, color: Colors.primary, fontWeight: "500" },
  resultBox: {
    backgroundColor: Colors.surfaceAlt, borderRadius: 12, padding: 16, gap: 12,
  },
  resultTitle: { fontSize: 15, fontWeight: "700", color: Colors.text },
  resultGrid: { flexDirection: "row", gap: 8 },
  resultItem: { flex: 1, alignItems: "center", gap: 4 },
  resultNum: { fontSize: 24, fontWeight: "800" },
  resultLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: "600", textAlign: "center" },
  errorList: { gap: 4 },
  errorTitle: { fontSize: 13, fontWeight: "700", color: Colors.danger },
  errorItem: { fontSize: 12, color: Colors.textSecondary },
  btnRow: { flexDirection: "row", gap: 12 },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center",
    borderWidth: 1, borderColor: Colors.border,
  },
  cancelText: { fontSize: 15, fontWeight: "600", color: Colors.textSecondary },
  importBtn: {
    flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: "center",
    backgroundColor: Colors.primary, flexDirection: "row", justifyContent: "center", gap: 8,
  },
  importText: { fontSize: 15, fontWeight: "700", color: "#fff" },
});

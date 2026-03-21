import React, { useState, useRef } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, Modal,
  TextInput, Alert, ScrollView, Platform, Image,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";
import { getApiUrl } from "@/lib/query-client";
import { tokenStore } from "@/lib/api";

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: any) => parseFloat(n || 0).toLocaleString("en-IN");
const fmtDateTime = (d: any) =>
  d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

async function apiReq(method: string, route: string, data?: any) {
  const base = getApiUrl();
  const token = Platform.OS !== "web" ? await tokenStore.get() : null;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${base}${route}`, {
    method, headers, credentials: "include",
    body: data ? JSON.stringify(data) : undefined,
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.message || `HTTP ${res.status}`);
  }
  return res.json();
}

async function uploadFile(uri: string, name: string, type: string, route: string): Promise<any> {
  const base = getApiUrl();
  const token = Platform.OS !== "web" ? await tokenStore.get() : null;
  const form = new FormData();
  form.append("file", { uri, name, type } as any);
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${base}${route}`, {
    method: "POST", body: form, credentials: "include",
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.message || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Payment Modal ────────────────────────────────────────────────────────────
function PaymentModal({ visible, item, onClose, onSaved }: any) {
  const [method, setMethod] = useState<"cash" | "online" | "both">("cash");
  const [cashAmt, setCashAmt] = useState("");
  const [onlineAmt, setOnlineAmt] = useState("");
  const [loading, setLoading] = useState(false);

  const save = async () => {
    const cash = parseFloat(cashAmt) || 0;
    const online = parseFloat(onlineAmt) || 0;
    if (method === "cash" && cash <= 0) { Alert.alert("Error", "Enter cash amount"); return; }
    if (method === "online" && online <= 0) { Alert.alert("Error", "Enter online amount"); return; }
    setLoading(true);
    try {
      await apiReq("PUT", `/api/admin/fos-depositions/${item.id}/payment`, {
        paymentMethod: method,
        cashAmount: method === "online" ? 0 : cash,
        onlineAmount: method === "cash" ? 0 : online,
      });
      onSaved(); onClose();
    } catch (e: any) { Alert.alert("Error", e.message); }
    finally { setLoading(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={ms.overlay}>
        <View style={ms.sheet}>
          <View style={ms.handle} />
          <Text style={ms.title}>Update Payment</Text>
          {item && (
            <View style={ms.infoRow}>
              <Text style={ms.infoName}>{item.customer_name || "—"}</Text>
              <Text style={ms.infoAmt}>₹{fmt(item.amount)}</Text>
            </View>
          )}
          <Text style={ms.label}>Payment Method</Text>
          <View style={ms.segRow}>
            {(["cash", "online", "both"] as const).map((m) => (
              <Pressable key={m} style={[ms.seg, method === m && ms.segActive]} onPress={() => setMethod(m)}>
                <Text style={[ms.segText, method === m && ms.segTextActive]}>
                  {m === "cash" ? "💵 Cash" : m === "online" ? "📲 Online" : "🔀 Both"}
                </Text>
              </Pressable>
            ))}
          </View>
          {(method === "cash" || method === "both") && (
            <><Text style={ms.label}>Cash Amount (₹)</Text>
            <TextInput style={ms.input} placeholder="0" placeholderTextColor={Colors.textMuted} value={cashAmt} onChangeText={setCashAmt} keyboardType="numeric" /></>
          )}
          {(method === "online" || method === "both") && (
            <><Text style={ms.label}>Online Amount (₹)</Text>
            <TextInput style={ms.input} placeholder="0" placeholderTextColor={Colors.textMuted} value={onlineAmt} onChangeText={setOnlineAmt} keyboardType="numeric" /></>
          )}
          <View style={ms.btnRow}>
            <Pressable style={ms.cancel} onPress={onClose}><Text style={ms.cancelTxt}>Cancel</Text></Pressable>
            <Pressable style={[ms.save, loading && { opacity: 0.6 }]} onPress={save} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={ms.saveTxt}>Save</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Add Deposition Modal ─────────────────────────────────────────────────────
function AddDepositionModal({ visible, onClose, onSaved, agents }: any) {
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [amount, setAmount] = useState("");
  const [cashAmt, setCashAmt] = useState("");
  const [onlineAmt, setOnlineAmt] = useState("");
  const [method, setMethod] = useState<"pending" | "cash" | "online" | "both">("pending");
  const [customerName, setCustomerName] = useState("");
  const [loanNo, setLoanNo] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setSelectedAgent(null); setAmount(""); setCashAmt(""); setOnlineAmt("");
    setNotes(""); setMethod("pending"); setCustomerName(""); setLoanNo("");
  };

  const save = async () => {
    if (!selectedAgent) { Alert.alert("Error", "Select a FOS agent"); return; }
    const totalAmt = parseFloat(amount) || (parseFloat(cashAmt || "0") + parseFloat(onlineAmt || "0"));
    if (!totalAmt) { Alert.alert("Error", "Enter amount"); return; }
    setLoading(true);
    try {
      await apiReq("POST", "/api/admin/fos-depositions", {
        agentId: selectedAgent.id,
        loanNo: loanNo || null,
        customerName: customerName || null,
        amount: totalAmt,
        cashAmount: parseFloat(cashAmt || "0"),
        onlineAmount: parseFloat(onlineAmt || "0"),
        paymentMethod: method,
        notes,
      });
      reset(); onSaved(); onClose();
    } catch (e: any) { Alert.alert("Error", e.message); }
    finally { setLoading(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { reset(); onClose(); }}>
      <View style={ms.overlay}>
        <ScrollView style={[ms.sheet, { maxHeight: "92%" }]} showsVerticalScrollIndicator={false}>
          <View style={ms.handle} />
          <Text style={ms.title}>Add Deposition Record</Text>

          <Text style={ms.label}>FOS Agent</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(agents || []).filter((a: any) => a.role === "fos").map((a: any) => (
                <Pressable key={a.id} style={[add.agentChip, selectedAgent?.id === a.id && add.agentChipActive]}
                  onPress={() => setSelectedAgent(a)}>
                  <Text style={[add.agentChipText, selectedAgent?.id === a.id && { color: "#fff" }]}>{a.name}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <Text style={ms.label}>Customer Name</Text>
          <TextInput style={ms.input} placeholder="Customer name" placeholderTextColor={Colors.textMuted}
            value={customerName} onChangeText={setCustomerName} />

          <Text style={ms.label}>Loan No (optional)</Text>
          <TextInput style={ms.input} placeholder="Loan number" placeholderTextColor={Colors.textMuted}
            value={loanNo} onChangeText={setLoanNo} />

          <Text style={ms.label}>Total Amount (₹)</Text>
          <TextInput style={ms.input} placeholder="0" placeholderTextColor={Colors.textMuted}
            value={amount} onChangeText={setAmount} keyboardType="numeric" />

          <Text style={ms.label}>Payment Method</Text>
          <View style={ms.segRow}>
            {(["pending", "cash", "online", "both"] as const).map((m) => (
              <Pressable key={m} style={[ms.seg, method === m && ms.segActive]} onPress={() => setMethod(m)}>
                <Text style={[ms.segText, method === m && ms.segTextActive]}>
                  {m === "pending" ? "⏳" : m === "cash" ? "💵" : m === "online" ? "📲" : "🔀"}{" "}{m.charAt(0).toUpperCase() + m.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>

          {(method === "cash" || method === "both") && (
            <><Text style={ms.label}>Cash Amount (₹)</Text>
            <TextInput style={ms.input} placeholder="0" placeholderTextColor={Colors.textMuted}
              value={cashAmt} onChangeText={setCashAmt} keyboardType="numeric" /></>
          )}
          {(method === "online" || method === "both") && (
            <><Text style={ms.label}>Online Amount (₹)</Text>
            <TextInput style={ms.input} placeholder="0" placeholderTextColor={Colors.textMuted}
              value={onlineAmt} onChangeText={setOnlineAmt} keyboardType="numeric" /></>
          )}

          <Text style={ms.label}>Notes (optional)</Text>
          <TextInput style={[ms.input, { minHeight: 56, textAlignVertical: "top" }]}
            placeholder="Notes..." placeholderTextColor={Colors.textMuted}
            value={notes} onChangeText={setNotes} multiline />

          <View style={[ms.btnRow, { marginBottom: 32 }]}>
            <Pressable style={ms.cancel} onPress={() => { reset(); onClose(); }}><Text style={ms.cancelTxt}>Cancel</Text></Pressable>
            <Pressable style={[ms.save, loading && { opacity: 0.6 }]} onPress={save} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={ms.saveTxt}>Save</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── FOS Detail Modal ─────────────────────────────────────────────────────────
// ✅ CHANGE: Removed "Paid Cases (Last 24hr)" section — admin no longer sees it here
function FosDetailModal({ visible, agentId, agentName, onClose, onUpdated }: any) {
  const [payItem, setPayItem] = useState<any>(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: [`/api/admin/fos-depositions/${agentId}`],
    queryFn: () => apiReq("GET", `/api/admin/fos-depositions/${agentId}`),
    enabled: visible && !!agentId,
  });

  // Only use depositions — paid cases are intentionally not rendered
  const depositions = data?.depositions || [];

  const handleDelete = (id: number) => {
    Alert.alert("Delete", "Remove this deposition record?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: async () => {
          try { await apiReq("DELETE", `/api/admin/fos-depositions/${id}`); refetch(); onUpdated(); }
          catch (e: any) { Alert.alert("Error", e.message); }
        }
      },
    ]);
  };

  const payMethodColor = (m: string) => {
    if (m === "cash") return Colors.success;
    if (m === "online") return "#2563eb";
    if (m === "both") return Colors.primary;
    return Colors.warning;
  };

  const payMethodLabel = (m: string) => {
    if (m === "cash") return "💵 Cash";
    if (m === "online") return "📲 Online";
    if (m === "both") return "🔀 Both";
    return "⏳ Pending";
  };

  // Summary totals
  const totalAmount = depositions.reduce((s: number, d: any) => s + parseFloat(d.amount || 0), 0);
  const totalCash = depositions.reduce((s: number, d: any) => s + parseFloat(d.cash_amount || 0), 0);
  const totalOnline = depositions.reduce((s: number, d: any) => s + parseFloat(d.online_amount || 0), 0);
  const pendingCount = depositions.filter((d: any) => d.payment_method === "pending").length;

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <View style={{ flex: 1, backgroundColor: Colors.background }}>
          {/* Header */}
          <View style={fd.header}>
            <Pressable onPress={onClose} style={fd.backBtn}>
              <Ionicons name="arrow-back" size={22} color={Colors.text} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={fd.headerTitle}>{agentName}</Text>
              <Text style={fd.headerSub}>{depositions.length} depositions</Text>
            </View>
          </View>

          {isLoading ? (
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
              <ActivityIndicator color={Colors.primary} size="large" />
            </View>
          ) : (
            <FlatList
              data={depositions}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
              ListHeaderComponent={
                depositions.length > 0 ? (
                  // Summary cards — totals only, no paid cases list
                  <View style={fd.summaryRow}>
                    <View style={[fd.sumCard, { borderTopColor: Colors.primary }]}>
                      <Text style={fd.sumNum}>₹{fmt(totalAmount)}</Text>
                      <Text style={fd.sumLabel}>Total</Text>
                    </View>
                    <View style={[fd.sumCard, { borderTopColor: Colors.success }]}>
                      <Ionicons name="cash-outline" size={14} color={Colors.success} />
                      <Text style={[fd.sumNum, { color: Colors.success }]}>₹{fmt(totalCash)}</Text>
                      <Text style={fd.sumLabel}>Cash</Text>
                    </View>
                    <View style={[fd.sumCard, { borderTopColor: "#2563eb" }]}>
                      <Ionicons name="phone-portrait-outline" size={14} color="#2563eb" />
                      <Text style={[fd.sumNum, { color: "#2563eb" }]}>₹{fmt(totalOnline)}</Text>
                      <Text style={fd.sumLabel}>Online</Text>
                    </View>
                    {pendingCount > 0 && (
                      <View style={[fd.sumCard, { borderTopColor: Colors.warning }]}>
                        <Ionicons name="time-outline" size={14} color={Colors.warning} />
                        <Text style={[fd.sumNum, { color: Colors.warning }]}>{pendingCount}</Text>
                        <Text style={fd.sumLabel}>Pending</Text>
                      </View>
                    )}
                  </View>
                ) : null
              }
              renderItem={({ item }) => {
                const color = payMethodColor(item.payment_method);
                const screenshotSrc = item.screenshot_url
                  ? (item.screenshot_url.startsWith("http") ? item.screenshot_url : `${getApiUrl()}${item.screenshot_url}`)
                  : null;
                return (
                  <View style={[fd.card, { borderLeftColor: color }]}>
                    <View style={fd.cardTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={fd.cardName}>{item.customer_name || "—"}</Text>
                        {item.loan_no && <Text style={fd.cardMeta}>{item.loan_no} · BKT {item.bkt || "—"}</Text>}
                        <Text style={fd.cardDate}>{fmtDateTime(item.created_at)}</Text>
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 6 }}>
                        <Text style={[fd.cardAmt, { color }]}>₹{fmt(item.amount)}</Text>
                        <Pressable onPress={() => handleDelete(item.id)}>
                          <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                        </Pressable>
                      </View>
                    </View>
                    <View style={fd.payRow}>
                      <View style={[fd.payBadge, { backgroundColor: color + "20" }]}>
                        <Text style={[fd.payBadgeText, { color }]}>{payMethodLabel(item.payment_method)}</Text>
                      </View>
                      {parseFloat(item.cash_amount) > 0 && (
                        <Text style={fd.subAmt}>Cash: ₹{fmt(item.cash_amount)}</Text>
                      )}
                      {parseFloat(item.online_amount) > 0 && (
                        <Text style={[fd.subAmt, { color: "#2563eb" }]}>Online: ₹{fmt(item.online_amount)}</Text>
                      )}
                    </View>
                    {screenshotSrc && (
                      <Pressable onPress={() => setScreenshotUrl(screenshotSrc)} style={fd.thumbRow}>
                        <Image source={{ uri: screenshotSrc }} style={fd.thumb} resizeMode="cover" />
                        <Text style={fd.thumbHint}>Tap to view screenshot</Text>
                      </Pressable>
                    )}
                    {item.notes && <Text style={fd.notes}>{item.notes}</Text>}
                    <Pressable style={fd.updatePayBtn} onPress={() => setPayItem(item)}>
                      <Ionicons name="pencil-outline" size={14} color={Colors.primary} />
                      <Text style={fd.updatePayText}>Update Payment</Text>
                    </Pressable>
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={fd.empty}>
                  <Ionicons name="receipt-outline" size={44} color={Colors.textMuted} />
                  <Text style={fd.emptyText}>No deposition records</Text>
                </View>
              }
            />
          )}
        </View>
      </Modal>

      <PaymentModal
        visible={!!payItem}
        item={payItem}
        onClose={() => setPayItem(null)}
        onSaved={() => { refetch(); onUpdated(); setPayItem(null); }}
      />

      {/* Screenshot lightbox */}
      <Modal visible={!!screenshotUrl} transparent animationType="fade" onRequestClose={() => setScreenshotUrl(null)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)", justifyContent: "center", alignItems: "center" }}
          onPress={() => setScreenshotUrl(null)}
        >
          <Image source={{ uri: screenshotUrl! }} style={{ width: "92%", height: "72%", borderRadius: 12 }} resizeMode="contain" />
          <Pressable
            style={{ marginTop: 20, backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 28, paddingVertical: 10, borderRadius: 20 }}
            onPress={() => setScreenshotUrl(null)}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Close</Text>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// ─── Import Modal ─────────────────────────────────────────────────────────────
function ImportModal({ visible, onClose, onImported }: any) {
  const [file, setFile] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const pickFile = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ["*/*"], copyToCacheDirectory: true });
      if (!r.canceled && r.assets?.[0]) {
        setFile({ uri: r.assets[0].uri, name: r.assets[0].name, type: r.assets[0].mimeType || "application/octet-stream" });
      }
    } catch { Alert.alert("Error", "Could not open file picker"); }
  };

  const doImport = async () => {
    if (!file) { Alert.alert("Error", "Select a file first"); return; }
    setLoading(true);
    try {
      const res = await uploadFile(file.uri, file.name, file.type, "/api/admin/import-depositions");
      setResult(res); onImported();
    } catch (e: any) { Alert.alert("Import Failed", e.message); }
    finally { setLoading(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={ms.overlay}>
        <View style={ms.sheet}>
          <View style={ms.handle} />
          <Text style={ms.title}>Import Depositions Excel</Text>
          <Text style={{ fontSize: 12, color: Colors.textSecondary, marginBottom: 12 }}>
            Columns: Date, FOS Name, Customer Name, Loan No, Amount, Cash Paid, Online Paid
          </Text>

          <Pressable style={imp.pickBtn} onPress={pickFile}>
            <Ionicons name="folder-open" size={20} color={Colors.primary} />
            <Text style={imp.pickText}>{file?.name ?? "Choose Excel File (.xlsx)"}</Text>
            {file && (
              <Pressable onPress={() => setFile(null)} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
              </Pressable>
            )}
          </Pressable>

          {result && (
            <View style={imp.result}>
              <Text style={imp.resultTitle}>✅ Import Complete</Text>
              <Text style={imp.resultText}>Imported: {result.imported} · Skipped: {result.skipped}</Text>
              {result.errors?.length > 0 && (
                <Text style={{ fontSize: 11, color: Colors.danger }}>{result.errors[0]}</Text>
              )}
            </View>
          )}

          <View style={ms.btnRow}>
            <Pressable style={ms.cancel} onPress={() => { setFile(null); setResult(null); onClose(); }}>
              <Text style={ms.cancelTxt}>Close</Text>
            </Pressable>
            <Pressable style={[ms.save, (!file || loading) && { opacity: 0.5 }]} onPress={doImport} disabled={!file || loading}>
              {loading ? <ActivityIndicator color="#fff" size="small" /> : (
                <><Ionicons name="cloud-upload" size={16} color="#fff" /><Text style={ms.saveTxt}> Import</Text></>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function AdminDepositionsScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [addVisible, setAddVisible] = useState(false);
  const [importVisible, setImportVisible] = useState(false);
  const [selectedFos, setSelectedFos] = useState<{ id: number; name: string } | null>(null);
  const [downloading, setDownloading] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/admin/fos-depositions"],
    queryFn: () => apiReq("GET", "/api/admin/fos-depositions"),
  });

  const { data: agentsData } = useQuery({
    queryKey: ["/api/admin/agents"],
    queryFn: () => api.admin.getAgents(),
  });

  const grouped: any[] = data?.grouped || [];
  const agents = agentsData?.agents || [];

  const totalAmount = grouped.reduce((s, g) => s + (g.totalAmount || 0), 0);
  const totalCash = grouped.reduce((s, g) => s + (g.totalCash || 0), 0);
  const totalOnline = grouped.reduce((s, g) => s + (g.totalOnline || 0), 0);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const base = getApiUrl();
      const token = Platform.OS !== "web" ? await tokenStore.get() : null;
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      if (Platform.OS === "web") {
        const a = document.createElement("a");
        a.href = `${base}/api/admin/fos-depositions-export`;
        a.download = `FOS_Depositions_${new Date().toISOString().slice(0, 10)}.xlsx`;
        a.click();
      } else {
        const fileName = `FOS_Depositions_${new Date().toISOString().slice(0, 10)}.xlsx`;
        const fileUri = `${FileSystem.documentDirectory}${fileName}`;

        const downloadResult = await FileSystem.downloadAsync(
          `${base}/api/admin/fos-depositions-export`,
          fileUri,
          { headers }
        );

        if (downloadResult.status === 200) {
          const canShare = await Sharing.isAvailableAsync();
          if (canShare) {
            await Sharing.shareAsync(downloadResult.uri, {
              mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              dialogTitle: "Save FOS Depositions Excel",
              UTI: "com.microsoft.excel.xlsx",
            });
          } else {
            Alert.alert("Downloaded", `File saved to: ${downloadResult.uri}`);
          }
        } else {
          Alert.alert("Error", "Download failed. Please try again.");
        }
      }
    } catch (e: any) { Alert.alert("Error", e.message); }
    finally { setDownloading(false); }
  };

  return (
    <>
      <View style={[scr.root, { paddingTop: Platform.OS === "web" ? 67 : 0 }]}>
        {/* Action Bar */}
        <View style={scr.actionBar}>
          <Pressable style={scr.actionBtn} onPress={() => setImportVisible(true)}>
            <Ionicons name="cloud-upload-outline" size={18} color={Colors.primary} />
            <Text style={scr.actionBtnText}>Import</Text>
          </Pressable>
          <Pressable style={scr.actionBtn} onPress={handleDownload} disabled={downloading}>
            {downloading
              ? <ActivityIndicator size="small" color={Colors.success} />
              : <Ionicons name="download-outline" size={18} color={Colors.success} />}
            <Text style={[scr.actionBtnText, { color: Colors.success }]}>Export Excel</Text>
          </Pressable>
          <Pressable style={[scr.actionBtn, { backgroundColor: Colors.primary }]} onPress={() => setAddVisible(true)}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={[scr.actionBtnText, { color: "#fff" }]}>Add</Text>
          </Pressable>
        </View>

        {/* Summary */}
        <View style={scr.summaryRow}>
          <View style={[scr.sumCard, { borderTopColor: Colors.primary }]}>
            <Text style={scr.sumNum}>₹{fmt(totalAmount)}</Text>
            <Text style={scr.sumLabel}>Total</Text>
          </View>
          <View style={[scr.sumCard, { borderTopColor: Colors.success }]}>
            <Ionicons name="cash-outline" size={16} color={Colors.success} />
            <Text style={[scr.sumNum, { color: Colors.success }]}>₹{fmt(totalCash)}</Text>
            <Text style={scr.sumLabel}>Cash</Text>
          </View>
          <View style={[scr.sumCard, { borderTopColor: "#2563eb" }]}>
            <Ionicons name="phone-portrait-outline" size={16} color="#2563eb" />
            <Text style={[scr.sumNum, { color: "#2563eb" }]}>₹{fmt(totalOnline)}</Text>
            <Text style={scr.sumLabel}>Online</Text>
          </View>
        </View>

        {/* FOS List */}
        {isLoading ? (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <ActivityIndicator color={Colors.primary} size="large" />
          </View>
        ) : (
          <FlatList
            data={grouped}
            keyExtractor={(item) => String(item.agentId || item.agentName)}
            contentContainerStyle={[scr.list, { paddingBottom: insets.bottom + 24 }]}
            renderItem={({ item }) => {
              const pending = item.depositions.filter((d: any) => d.payment_method === "pending").length;
              const displayName = item.agentName || item.depositions[0]?.agent_name || "Unknown";
              return (
                <Pressable
                  style={scr.fosCard}
                  onPress={() => setSelectedFos({ id: item.agentId, name: displayName })}
                >
                  <View style={scr.fosAvatar}>
                    <Text style={scr.fosInitial}>{(displayName || "?").charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={scr.fosName}>{displayName}</Text>
                    <View style={scr.fosMetaRow}>
                      <Text style={scr.fosMeta}>{item.depositions.length} records</Text>
                      {pending > 0 && (
                        <View style={scr.pendingPill}>
                          <Text style={scr.pendingPillText}>{pending} pending</Text>
                        </View>
                      )}
                    </View>
                    <View style={scr.amtRow}>
                      <Text style={scr.fosTotal}>₹{fmt(item.totalAmount)}</Text>
                      {item.totalCash > 0 && <Text style={scr.cashAmt}>💵 ₹{fmt(item.totalCash)}</Text>}
                      {item.totalOnline > 0 && <Text style={scr.onlineAmt}>📲 ₹{fmt(item.totalOnline)}</Text>}
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={scr.empty}>
                <MaterialIcons name="receipt-long" size={52} color={Colors.textMuted} />
                <Text style={scr.emptyTitle}>No Depositions Yet</Text>
                <Text style={scr.emptyText}>Import an Excel or add depositions manually</Text>
              </View>
            }
          />
        )}
      </View>

      {selectedFos && (
        <FosDetailModal
          visible={!!selectedFos}
          agentId={selectedFos.id}
          agentName={selectedFos.name}
          onClose={() => setSelectedFos(null)}
          onUpdated={() => refetch()}
        />
      )}

      <AddDepositionModal
        visible={addVisible}
        onClose={() => setAddVisible(false)}
        onSaved={() => { refetch(); qc.invalidateQueries({ queryKey: ["/api/admin/fos-depositions"] }); }}
        agents={agents}
      />

      <ImportModal
        visible={importVisible}
        onClose={() => setImportVisible(false)}
        onImported={() => refetch()}
      />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const scr = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  actionBar: { flexDirection: "row", gap: 8, padding: 16, paddingBottom: 8 },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: Colors.surface, borderRadius: 12, paddingVertical: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  actionBtnText: { fontSize: 13, fontWeight: "700", color: Colors.primary },
  summaryRow: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingBottom: 12 },
  sumCard: { flex: 1, backgroundColor: Colors.surface, borderRadius: 12, padding: 12, borderTopWidth: 3, alignItems: "center", gap: 2 },
  sumNum: { fontSize: 13, fontWeight: "800", color: Colors.text },
  sumLabel: { fontSize: 10, color: Colors.textSecondary, fontWeight: "600" },
  list: { padding: 16, paddingTop: 0, gap: 10 },
  fosCard: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 16,
    flexDirection: "row", alignItems: "center", gap: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  fosAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  fosInitial: { fontSize: 18, fontWeight: "800", color: "#fff" },
  fosName: { fontSize: 15, fontWeight: "700", color: Colors.text },
  fosMetaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  fosMeta: { fontSize: 12, color: Colors.textSecondary },
  pendingPill: { backgroundColor: Colors.warning + "20", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  pendingPillText: { fontSize: 10, fontWeight: "700", color: Colors.warning },
  amtRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  fosTotal: { fontSize: 16, fontWeight: "800", color: Colors.text },
  cashAmt: { fontSize: 12, fontWeight: "600", color: Colors.success },
  onlineAmt: { fontSize: 12, fontWeight: "600", color: "#2563eb" },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", gap: 8, paddingVertical: 60 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: Colors.textMuted },
  emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: "center" },
});

const ms = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 10 },
  handle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: "center", marginBottom: 8 },
  title: { fontSize: 20, fontWeight: "700", color: Colors.text, marginBottom: 4 },
  label: { fontSize: 11, fontWeight: "700", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: Colors.surfaceAlt, borderRadius: 10, padding: 12 },
  infoName: { fontSize: 14, fontWeight: "600", color: Colors.text },
  infoAmt: { fontSize: 16, fontWeight: "800", color: Colors.warning },
  segRow: { flexDirection: "row", gap: 8 },
  seg: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", backgroundColor: Colors.surfaceAlt, borderWidth: 1.5, borderColor: Colors.border },
  segActive: { backgroundColor: Colors.primary + "15", borderColor: Colors.primary },
  segText: { fontSize: 12, fontWeight: "700", color: Colors.textSecondary },
  segTextActive: { color: Colors.primary },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 14, fontSize: 15, color: Colors.text, backgroundColor: Colors.surfaceAlt },
  btnRow: { flexDirection: "row", gap: 12, marginTop: 8 },
  cancel: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, alignItems: "center" },
  cancelTxt: { fontSize: 15, fontWeight: "600", color: Colors.textSecondary },
  save: { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: Colors.primary, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 },
  saveTxt: { fontSize: 15, fontWeight: "700", color: "#fff" },
});

const add = StyleSheet.create({
  agentChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.surfaceAlt, borderWidth: 1.5, borderColor: Colors.border },
  agentChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  agentChipText: { fontSize: 13, fontWeight: "700", color: Colors.text },
});

const fd = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 16, paddingTop: Platform.OS === "web" ? 67 : 56,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: "800", color: Colors.text },
  headerSub: { fontSize: 12, color: Colors.textSecondary },
  summaryRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  sumCard: { flex: 1, backgroundColor: Colors.surface, borderRadius: 10, padding: 10, borderTopWidth: 3, alignItems: "center", gap: 2 },
  sumNum: { fontSize: 12, fontWeight: "800", color: Colors.text },
  sumLabel: { fontSize: 9, color: Colors.textSecondary, fontWeight: "600" },
  card: {
    backgroundColor: Colors.surface, borderRadius: 14, padding: 14,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2, borderLeftWidth: 4,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between" },
  cardName: { fontSize: 14, fontWeight: "700", color: Colors.text },
  cardMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  cardDate: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  cardAmt: { fontSize: 18, fontWeight: "800" },
  payRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" },
  payBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  payBadgeText: { fontSize: 11, fontWeight: "700" },
  subAmt: { fontSize: 12, fontWeight: "600", color: Colors.success },
  thumbRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  thumb: { width: 64, height: 64, borderRadius: 8 },
  thumbHint: { fontSize: 11, color: Colors.textMuted },
  notes: { fontSize: 12, color: Colors.textSecondary, fontStyle: "italic", marginTop: 6 },
  updatePayBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10,
    backgroundColor: Colors.primary + "10", borderRadius: 8,
    paddingVertical: 8, paddingHorizontal: 12, alignSelf: "flex-start",
  },
  updatePayText: { fontSize: 12, fontWeight: "700", color: Colors.primary },
  empty: { alignItems: "center", gap: 8, paddingVertical: 48 },
  emptyText: { fontSize: 14, color: Colors.textMuted },
});

const imp = StyleSheet.create({
  pickBtn: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 2, borderColor: Colors.primary, borderStyle: "dashed", borderRadius: 12, padding: 16 },
  pickText: { flex: 1, fontSize: 14, color: Colors.primary, fontWeight: "500" },
  result: { backgroundColor: Colors.success + "12", borderRadius: 10, padding: 12, gap: 4, borderWidth: 1, borderColor: Colors.success + "30" },
  resultTitle: { fontSize: 14, fontWeight: "700", color: Colors.success },
  resultText: { fontSize: 13, color: Colors.text },
});

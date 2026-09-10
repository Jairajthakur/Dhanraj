import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, Modal,
  TextInput, Image, ActivityIndicator, Platform, Alert, KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";
import { getApiUrl } from "@/lib/query-client";
import { tokenStore } from "@/lib/api";

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmtDate = (d: any) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "";

function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const base = getApiUrl().replace(/\/+$/, "");
  const path = url.startsWith("/") ? url : `/${url}`;
  return `${base}${path}`;
}

// Best-effort guess of a customer name from the original filename, so a bulk
// batch doesn't start with every field blank. Admin still reviews/edits each
// one before uploading — this is just a time-saving starting point.
function guessNameFromFilename(filename?: string | null): string {
  if (!filename) return "";
  let base = filename.replace(/\.[a-zA-Z0-9]+$/, "");
  base = base.replace(/^(IMG|WhatsApp\s*Image|WhatsApp|Screenshot|Photo|PXL|VID)[\s_\-]*/i, "");
  base = base.replace(/\d{4}[-_]?\d{2}[-_]?\d{2}.*/g, ""); // strip trailing date/time stamps
  base = base.replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!base || /^\d+$/.test(base)) return "";
  return base.replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Multipart upload — mirrors the pattern used elsewhere in the admin app ────
async function uploadReceiptImage(asset: any, customerName: string, notes?: string): Promise<any> {
  const base = getApiUrl();
  const token = Platform.OS !== "web" ? await tokenStore.get() : null;
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const form = new FormData();
  form.append("customerName", customerName);
  if (notes) form.append("notes", notes);

  if (Platform.OS === "web") {
    if (asset.file instanceof File) {
      form.append("image", asset.file, asset.fileName || "receipt.jpg");
    } else if (asset.uri?.startsWith("blob:") || asset.uri?.startsWith("data:")) {
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      form.append("image", blob, asset.fileName || "receipt.jpg");
    } else {
      throw new Error("Could not read the selected image. Please try again.");
    }
  } else {
    const ext = asset.uri.split(".").pop()?.toLowerCase() || "jpg";
    const mimeType = ext === "png" ? "image/png" : "image/jpeg";
    form.append("image", { uri: asset.uri, name: `receipt.${ext}`, type: mimeType } as any);
  }

  const res = await fetch(`${base}/api/admin/customer-receipts`, {
    method: "POST", body: form, credentials: "include",
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.message || `HTTP ${res.status}`);
  }
  return res.json();
}

type BulkStatus = "pending" | "uploading" | "done" | "error";
interface BulkItem {
  key: string;
  asset: any;
  name: string;
  status: BulkStatus;
  error?: string;
}

// ─── Upload sheet (single image, or bulk 100-200) ──────────────────────────────
function UploadModal({ visible, onClose, onUploaded }: { visible: boolean; onClose: () => void; onUploaded: () => void }) {
  const [mode, setMode] = useState<"single" | "bulk">("single");

  // single-mode state
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");
  const [asset, setAsset] = useState<any>(null);
  const [uploading, setUploading] = useState(false);

  // bulk-mode state
  const [items, setItems] = useState<BulkItem[]>([]);
  const [applyAllName, setApplyAllName] = useState("");
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkDone, setBulkDone] = useState(0);
  const cancelRef = useRef(false);

  const resetSingle = () => { setCustomerName(""); setNotes(""); setAsset(null); };
  const resetBulk = () => { setItems([]); setApplyAllName(""); setBulkDone(0); };
  const resetAll = () => { resetSingle(); resetBulk(); setMode("single"); };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (!result.canceled && result.assets?.[0]) setAsset(result.assets[0]);
  };

  const pickBulkImages = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"], quality: 0.85,
      allowsMultipleSelection: true, selectionLimit: 0,
    });
    if (result.canceled || !result.assets?.length) return;
    const newItems: BulkItem[] = result.assets.map((a, i) => ({
      key: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
      asset: a,
      name: guessNameFromFilename(a.fileName || a.uri?.split("/").pop()),
      status: "pending",
    }));
    setItems((prev) => [...prev, ...newItems]);
  };

  const updateItemName = (key: string, name: string) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, name } : it)));
  };

  const removeItem = (key: string) => {
    setItems((prev) => prev.filter((it) => it.key !== key));
  };

  const applyNameToAll = () => {
    if (!applyAllName.trim()) return;
    setItems((prev) => prev.map((it) => ({ ...it, name: applyAllName.trim() })));
  };

  const handleSingleUpload = async () => {
    if (!customerName.trim()) { Alert.alert("Missing name", "Enter the customer's name."); return; }
    if (!asset) { Alert.alert("Missing image", "Select a receipt image to upload."); return; }
    setUploading(true);
    try {
      await uploadReceiptImage(asset, customerName.trim(), notes.trim() || undefined);
      resetSingle();
      onUploaded();
      onClose();
    } catch (e: any) {
      Alert.alert("Upload failed", e.message || "Something went wrong");
    } finally {
      setUploading(false);
    }
  };

  const runBatch = async (batch: BulkItem[]) => {
    cancelRef.current = false;
    setBulkRunning(true);
    let ok = 0, failed = 0;
    for (let i = 0; i < batch.length; i++) {
      if (cancelRef.current) break;
      const it = batch[i];
      setItems((prev) => prev.map((p) => (p.key === it.key ? { ...p, status: "uploading" } : p)));
      try {
        await uploadReceiptImage(it.asset, it.name.trim());
        ok++;
        setItems((prev) => prev.map((p) => (p.key === it.key ? { ...p, status: "done" } : p)));
      } catch (e: any) {
        failed++;
        setItems((prev) => prev.map((p) => (p.key === it.key ? { ...p, status: "error", error: e.message } : p)));
      }
      setBulkDone((d) => d + 1);
    }
    setBulkRunning(false);
    onUploaded();
    return { ok, failed };
  };

  const handleBulkUpload = async () => {
    const missing = items.filter((it) => !it.name.trim());
    if (missing.length > 0) {
      Alert.alert("Missing names", `${missing.length} image(s) still need a customer name before uploading.`);
      return;
    }
    if (items.length === 0) return;
    setBulkDone(0);
    const { ok, failed } = await runBatch(items);
    if (failed === 0) {
      Alert.alert("Done", `Uploaded ${ok} receipt(s).`);
      resetAll();
      onClose();
    } else {
      Alert.alert("Finished with errors", `${ok} uploaded, ${failed} failed. Retry the failed ones or remove them.`);
    }
  };

  const retryFailed = async () => {
    const failedItems = items.filter((it) => it.status === "error");
    if (failedItems.length === 0) return;
    const { ok, failed } = await runBatch(failedItems);
    if (failed === 0) Alert.alert("Done", `Uploaded ${ok} more receipt(s).`);
  };

  const closeModal = () => {
    if (bulkRunning) cancelRef.current = true;
    resetAll();
    onClose();
  };

  const pendingCount = items.filter((it) => it.status === "pending").length;
  const doneCount = items.filter((it) => it.status === "done").length;
  const errorCount = items.filter((it) => it.status === "error").length;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={closeModal}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={m.overlay}>
          <View style={[m.sheet, mode === "bulk" && m.sheetTall]}>
            <View style={m.handle} />

            <View style={m.modeRow}>
              <Pressable style={[m.modeBtn, mode === "single" && m.modeBtnActive]} onPress={() => setMode("single")}>
                <Text style={[m.modeBtnText, mode === "single" && m.modeBtnTextActive]}>Single</Text>
              </Pressable>
              <Pressable style={[m.modeBtn, mode === "bulk" && m.modeBtnActive]} onPress={() => setMode("bulk")}>
                <Text style={[m.modeBtnText, mode === "bulk" && m.modeBtnTextActive]}>Bulk (multiple)</Text>
              </Pressable>
            </View>

            {mode === "single" ? (
              <>
                <Text style={m.label}>Customer name</Text>
                <TextInput
                  style={m.input}
                  placeholder="e.g. Rahul Sharma"
                  placeholderTextColor={Colors.textMuted}
                  value={customerName}
                  onChangeText={setCustomerName}
                  autoCapitalize="words"
                />

                <Text style={m.label}>Notes (optional)</Text>
                <TextInput
                  style={m.input}
                  placeholder="Loan no., BKT, or any reference"
                  placeholderTextColor={Colors.textMuted}
                  value={notes}
                  onChangeText={setNotes}
                />

                <Pressable style={m.pickBtn} onPress={pickImage}>
                  {asset ? (
                    <Image source={{ uri: asset.uri }} style={m.previewImg} resizeMode="cover" />
                  ) : (
                    <>
                      <Ionicons name="image-outline" size={26} color={Colors.textMuted} />
                      <Text style={m.pickText}>Tap to select receipt image</Text>
                    </>
                  )}
                </Pressable>

                <View style={m.actions}>
                  <Pressable style={m.cancelBtn} onPress={closeModal} disabled={uploading}>
                    <Text style={m.cancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable style={[m.uploadBtn, uploading && { opacity: 0.6 }]} onPress={handleSingleUpload} disabled={uploading}>
                    {uploading ? <ActivityIndicator color="#fff" /> : <Text style={m.uploadText}>Upload</Text>}
                  </Pressable>
                </View>
              </>
            ) : (
              <View style={{ flex: 1 }}>
                <Pressable style={m.bulkPickBtn} onPress={pickBulkImages} disabled={bulkRunning}>
                  <Ionicons name="images-outline" size={18} color={Colors.primary} />
                  <Text style={m.bulkPickText}>
                    {items.length === 0 ? "Select images (100–200 at once)" : `Add more images (${items.length} selected)`}
                  </Text>
                </Pressable>

                {items.length > 0 && (
                  <>
                    <View style={m.applyAllRow}>
                      <TextInput
                        style={[m.input, { flex: 1 }]}
                        placeholder="Apply one name to all selected"
                        placeholderTextColor={Colors.textMuted}
                        value={applyAllName}
                        onChangeText={setApplyAllName}
                        autoCapitalize="words"
                        editable={!bulkRunning}
                      />
                      <Pressable style={m.applyAllBtn} onPress={applyNameToAll} disabled={bulkRunning}>
                        <Text style={m.applyAllBtnText}>Apply</Text>
                      </Pressable>
                    </View>

                    <Text style={m.bulkSummary}>
                      {pendingCount} pending · {doneCount} uploaded{errorCount > 0 ? ` · ${errorCount} failed` : ""}
                    </Text>

                    <FlatList
                      data={items}
                      keyExtractor={(it) => it.key}
                      style={{ flex: 1 }}
                      contentContainerStyle={{ gap: 8, paddingBottom: 8 }}
                      renderItem={({ item }) => (
                        <View style={m.bulkRow}>
                          <Image source={{ uri: item.asset.uri }} style={m.bulkThumb} resizeMode="cover" />
                          <TextInput
                            style={m.bulkNameInput}
                            placeholder="Customer name"
                            placeholderTextColor={Colors.textMuted}
                            value={item.name}
                            onChangeText={(t) => updateItemName(item.key, t)}
                            autoCapitalize="words"
                            editable={!bulkRunning}
                          />
                          {item.status === "uploading" && <ActivityIndicator size="small" color={Colors.primary} />}
                          {item.status === "done" && <Ionicons name="checkmark-circle" size={20} color={Colors.success} />}
                          {item.status === "error" && <Ionicons name="alert-circle" size={20} color={Colors.danger} />}
                          {item.status === "pending" && !bulkRunning && (
                            <Pressable onPress={() => removeItem(item.key)} hitSlop={8}>
                              <Ionicons name="close-circle-outline" size={20} color={Colors.textMuted} />
                            </Pressable>
                          )}
                        </View>
                      )}
                    />
                  </>
                )}

                <View style={m.actions}>
                  <Pressable style={m.cancelBtn} onPress={closeModal}>
                    <Text style={m.cancelText}>{bulkRunning ? "Stop" : "Close"}</Text>
                  </Pressable>
                  {errorCount > 0 && !bulkRunning ? (
                    <Pressable style={[m.uploadBtn, { backgroundColor: Colors.warning }]} onPress={retryFailed}>
                      <Text style={m.uploadText}>Retry Failed</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      style={[m.uploadBtn, (bulkRunning || items.length === 0) && { opacity: 0.6 }]}
                      onPress={handleBulkUpload}
                      disabled={bulkRunning || items.length === 0}
                    >
                      {bulkRunning ? (
                        <Text style={m.uploadText}>Uploading {bulkDone}/{items.length}…</Text>
                      ) : (
                        <Text style={m.uploadText}>Upload All ({items.length})</Text>
                      )}
                    </Pressable>
                  )}
                </View>
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function ReceiptSearchScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [uploadVisible, setUploadVisible] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = (trimmed: string) => {
    if (trimmed.length < 2) { setResults([]); setSearched(false); setLoading(false); return; }
    setLoading(true);
    api.admin.searchCustomerReceipts(trimmed)
      .then((res: any) => setResults(res.receipts || []))
      .catch(() => setResults([]))
      .finally(() => { setLoading(false); setSearched(true); });
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    debounceRef.current = setTimeout(() => runSearch(trimmed), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const handleDelete = (id: number) => {
    const doDelete = async () => {
      try {
        await api.admin.deleteCustomerReceipt(id);
        setResults((prev) => prev.filter((r) => r.id !== id));
      } catch (e: any) {
        Alert.alert("Error", e.message || "Failed to delete");
      }
    };
    if (Platform.OS === "web") {
      if (window.confirm("Delete this receipt?")) doDelete();
    } else {
      Alert.alert("Delete Receipt", "Are you sure you want to delete this receipt?", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ]);
    }
  };

  return (
    <View style={[s.container, { paddingBottom: insets.bottom }]}>
      <View style={s.searchBar}>
        <Ionicons name="search" size={18} color={Colors.textMuted} />
        <TextInput
          style={s.searchInput}
          placeholder="Search customer name…"
          placeholderTextColor={Colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery("")} hitSlop={10}>
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </Pressable>
        )}
      </View>

      <Pressable style={s.uploadFab} onPress={() => setUploadVisible(true)}>
        <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
        <Text style={s.uploadFabText}>Upload Receipt</Text>
      </Pressable>

      {loading && (
        <View style={s.center}><ActivityIndicator color={Colors.primary} /></View>
      )}

      {!loading && query.trim().length > 0 && query.trim().length < 2 && (
        <View style={s.center}>
          <Text style={s.hintText}>Keep typing… (min 2 characters)</Text>
        </View>
      )}

      {!loading && searched && results.length === 0 && (
        <View style={s.center}>
          <Ionicons name="receipt-outline" size={40} color={Colors.textMuted} />
          <Text style={s.emptyText}>No receipts found for "{query.trim()}"</Text>
        </View>
      )}

      {!loading && !searched && query.trim().length === 0 && (
        <View style={s.center}>
          <Ionicons name="search-outline" size={40} color={Colors.textMuted} />
          <Text style={s.hintText}>Type a customer name to find their uploaded receipts</Text>
        </View>
      )}

      <FlatList
        data={results}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 14, gap: 12 }}
        renderItem={({ item }) => {
          const imgSrc = resolveImageUrl(item.image_url);
          return (
            <View style={s.card}>
              <Pressable onPress={() => imgSrc && setViewerUrl(imgSrc)} style={s.cardImgWrap}>
                {imgSrc && <Image source={{ uri: imgSrc }} style={s.cardImg} resizeMode="cover" />}
              </Pressable>
              <View style={s.cardBody}>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardName}>{item.customer_name}</Text>
                  {item.notes && <Text style={s.cardMeta}>{item.notes}</Text>}
                  <Text style={s.cardMeta}>{fmtDate(item.created_at)}</Text>
                </View>
                <Pressable onPress={() => handleDelete(item.id)} hitSlop={10}>
                  <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                </Pressable>
              </View>
            </View>
          );
        }}
      />

      {/* Full-screen image viewer */}
      <Modal visible={!!viewerUrl} transparent animationType="fade" onRequestClose={() => setViewerUrl(null)} statusBarTranslucent>
        <View style={s.viewerOverlay}>
          {viewerUrl && <Image source={{ uri: viewerUrl }} style={s.viewerImage} resizeMode="contain" />}
          <Pressable style={s.viewerCloseBtn} onPress={() => setViewerUrl(null)}>
            <Text style={s.viewerCloseText}>Close</Text>
          </Pressable>
        </View>
      </Modal>

      <UploadModal
        visible={uploadVisible}
        onClose={() => setUploadVisible(false)}
        onUploaded={() => runSearch(query.trim())}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: Colors.background },
  searchBar:      { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 14, marginTop: 14, backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: Platform.OS === "ios" ? 12 : 8, borderWidth: 1, borderColor: Colors.border },
  searchInput:    { flex: 1, fontSize: 15, color: Colors.text },
  uploadFab:      { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginHorizontal: 14, marginTop: 10, backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 11 },
  uploadFabText:  { color: "#fff", fontWeight: "700", fontSize: 13 },
  center:         { alignItems: "center", justifyContent: "center", paddingTop: 50, paddingHorizontal: 30, gap: 10 },
  hintText:       { color: Colors.textMuted, fontSize: 13, textAlign: "center" },
  emptyText:      { color: Colors.textMuted, fontSize: 13, textAlign: "center" },
  card:           { flexDirection: "row", backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, overflow: "hidden" },
  cardImgWrap:    { width: 84, height: 84, backgroundColor: Colors.border },
  cardImg:        { width: "100%", height: "100%" },
  cardBody:       { flex: 1, flexDirection: "row", alignItems: "flex-start", padding: 12, gap: 8 },
  cardName:       { fontSize: 15, fontWeight: "800", color: Colors.text },
  cardMeta:       { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  viewerOverlay:  { flex: 1, backgroundColor: "rgba(0,0,0,0.95)", justifyContent: "center", alignItems: "center" },
  viewerImage:    { width: "95%", height: "80%", borderRadius: 12 },
  viewerCloseBtn: { marginTop: 20, backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 28, paddingVertical: 12, borderRadius: 20 },
  viewerCloseText:{ color: "#fff", fontWeight: "700", fontSize: 14 },
});

const m = StyleSheet.create({
  overlay:        { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet:          { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 10 },
  sheetTall:      { height: "88%" },
  handle:         { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: "center", marginBottom: 4 },
  modeRow:        { flexDirection: "row", gap: 8, marginBottom: 4 },
  modeBtn:        { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 10, backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border },
  modeBtnActive:  { backgroundColor: Colors.primary, borderColor: Colors.primary },
  modeBtnText:    { fontSize: 12, fontWeight: "700", color: Colors.textSecondary },
  modeBtnTextActive: { color: "#fff" },
  label:          { fontSize: 12, fontWeight: "700", color: Colors.textSecondary, marginTop: 6 },
  input:          { backgroundColor: Colors.surfaceAlt, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.text },
  pickBtn:        { marginTop: 12, height: 140, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, borderStyle: "dashed", alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: Colors.surfaceAlt },
  pickText:       { fontSize: 12, color: Colors.textMuted, marginTop: 6 },
  previewImg:     { width: "100%", height: "100%" },
  actions:        { flexDirection: "row", gap: 10, marginTop: 12 },
  cancelBtn:      { flex: 1, alignItems: "center", paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: Colors.border },
  cancelText:     { color: Colors.textSecondary, fontWeight: "700" },
  uploadBtn:      { flex: 1, alignItems: "center", paddingVertical: 13, borderRadius: 12, backgroundColor: Colors.primary },
  uploadText:     { color: "#fff", fontWeight: "700" },
  bulkPickBtn:    { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.primary, borderStyle: "dashed", backgroundColor: Colors.primary + "10" },
  bulkPickText:   { fontSize: 13, fontWeight: "700", color: Colors.primary },
  applyAllRow:    { flexDirection: "row", gap: 8, marginTop: 10 },
  applyAllBtn:    { paddingHorizontal: 16, borderRadius: 10, backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center" },
  applyAllBtnText:{ fontSize: 12, fontWeight: "700", color: Colors.text },
  bulkSummary:    { fontSize: 11, color: Colors.textMuted, marginTop: 8, marginBottom: 4 },
  bulkRow:        { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: Colors.surfaceAlt, borderRadius: 10, padding: 8, borderWidth: 1, borderColor: Colors.border },
  bulkThumb:      { width: 44, height: 44, borderRadius: 8, backgroundColor: Colors.border },
  bulkNameInput:  { flex: 1, fontSize: 13, color: Colors.text, paddingVertical: 4 },
});

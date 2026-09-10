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

// ─── Upload sheet ───────────────────────────────────────────────────────────────
function UploadModal({ visible, onClose, onUploaded }: { visible: boolean; onClose: () => void; onUploaded: () => void }) {
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");
  const [asset, setAsset] = useState<any>(null);
  const [uploading, setUploading] = useState(false);

  const reset = () => { setCustomerName(""); setNotes(""); setAsset(null); };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (!result.canceled && result.assets?.[0]) setAsset(result.assets[0]);
  };

  const handleUpload = async () => {
    if (!customerName.trim()) { Alert.alert("Missing name", "Enter the customer's name."); return; }
    if (!asset) { Alert.alert("Missing image", "Select a receipt image to upload."); return; }
    setUploading(true);
    try {
      await uploadReceiptImage(asset, customerName.trim(), notes.trim() || undefined);
      reset();
      onUploaded();
      onClose();
    } catch (e: any) {
      Alert.alert("Upload failed", e.message || "Something went wrong");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={m.overlay}>
          <View style={m.sheet}>
            <View style={m.handle} />
            <Text style={m.title}>Upload Receipt</Text>

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
              <Pressable style={m.cancelBtn} onPress={() => { reset(); onClose(); }} disabled={uploading}>
                <Text style={m.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={[m.uploadBtn, uploading && { opacity: 0.6 }]} onPress={handleUpload} disabled={uploading}>
                {uploading ? <ActivityIndicator color="#fff" /> : <Text style={m.uploadText}>Upload</Text>}
              </Pressable>
            </View>
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
    const confirmed = Platform.OS === "web"
      ? window.confirm("Delete this receipt?")
      : undefined;
    const doDelete = async () => {
      try {
        await api.admin.deleteCustomerReceipt(id);
        setResults((prev) => prev.filter((r) => r.id !== id));
      } catch (e: any) {
        Alert.alert("Error", e.message || "Failed to delete");
      }
    };
    if (Platform.OS === "web") {
      if (confirmed) doDelete();
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
  overlay:      { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet:        { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 10 },
  handle:       { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: "center", marginBottom: 6 },
  title:        { fontSize: 17, fontWeight: "800", color: Colors.text, marginBottom: 4 },
  label:        { fontSize: 12, fontWeight: "700", color: Colors.textSecondary, marginTop: 6 },
  input:        { backgroundColor: Colors.surfaceAlt, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.text },
  pickBtn:      { marginTop: 12, height: 140, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, borderStyle: "dashed", alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: Colors.surfaceAlt },
  pickText:     { fontSize: 12, color: Colors.textMuted, marginTop: 6 },
  previewImg:   { width: "100%", height: "100%" },
  actions:      { flexDirection: "row", gap: 10, marginTop: 14 },
  cancelBtn:    { flex: 1, alignItems: "center", paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: Colors.border },
  cancelText:   { color: Colors.textSecondary, fontWeight: "700" },
  uploadBtn:    { flex: 1, alignItems: "center", paddingVertical: 13, borderRadius: 12, backgroundColor: Colors.primary },
  uploadText:   { color: "#fff", fontWeight: "700" },
});

import React, { useState, useRef } from "react";
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator,
  Modal, Alert, Platform,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
// ✅ FIXED: Use legacy import to avoid deprecated readAsStringAsync error in Expo SDK v54
import * as FileSystem from "expo-file-system/legacy";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { tokenStore } from "@/lib/api";
import { getApiUrl } from "@/lib/query-client";

// ─── Safe base64 → Uint8Array (no atob dependency) ───────────────────────────
function base64ToBytes(base64: string): Uint8Array {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
  const len = base64.length;
  let bufferLength = Math.floor(len * 0.75);
  if (base64[len - 1] === "=") bufferLength--;
  if (base64[len - 2] === "=") bufferLength--;
  const bytes = new Uint8Array(bufferLength);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const a = lookup[base64.charCodeAt(i)];
    const b = lookup[base64.charCodeAt(i + 1)];
    const c = lookup[base64.charCodeAt(i + 2)];
    const d = lookup[base64.charCodeAt(i + 3)];
    bytes[p++] = (a << 2) | (b >> 4);
    if (i + 2 < len && base64[i + 2] !== "=") bytes[p++] = ((b & 15) << 4) | (c >> 2);
    if (i + 3 < len && base64[i + 3] !== "=") bytes[p++] = ((c & 3) << 6) | d;
  }
  return bytes;
}

// ─── Shared file upload helper ────────────────────────────────────────────────
async function uploadExcelFile(
  nativeFile: any,
  endpoint: string,
  extraFields?: Record<string, string>
): Promise<any> {
  const url = new URL(endpoint, getApiUrl()).toString();
  const formData = new FormData();

  if (Platform.OS !== "web" && nativeFile.uri) {
    // ✅ FIXED: expo-file-system/legacy still supports readAsStringAsync safely
    const base64 = await FileSystem.readAsStringAsync(nativeFile.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const bytes = base64ToBytes(base64);
    const blob = new Blob([bytes], {
      type: nativeFile.type ||
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    formData.append("file", blob, nativeFile.name);
  } else {
    formData.append("file", nativeFile as any);
  }

  if (extraFields) {
    Object.entries(extraFields).forEach(([k, v]) => formData.append(k, v));
  }

  // ✅ Bearer token for APK auth
  const headers: Record<string, string> = {};
  if (Platform.OS !== "web") {
    const token = await tokenStore.get();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  // ✅ Use native fetch (not expoFetch) for FormData/Blob uploads
  // expoFetch does not handle Blob in FormData correctly on Android
  const res = await fetch(url, {
    method: "POST",
    body: formData,
    credentials: "include",
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = `HTTP ${res.status}`;
    try {
      const json = JSON.parse(text);
      msg = json.message || json.error || msg;
    } catch {
      if (text) msg = text;
    }
    throw new Error(msg || "Import failed");
  }

  return res.json();
}

// ─── Shared file picker hook ──────────────────────────────────────────────────
function useFilePicker() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [nativeFile, setNativeFile] = useState<any>(null);
  const fileInputRef = useRef<any>(null);

  const pickFile = async () => {
    if (Platform.OS === "web") {
      fileInputRef.current?.click();
      return;
    }
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
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
          type: asset.mimeType ||
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
      }
    } catch {
      Alert.alert("Error", "Could not open file picker. Please try again.");
    }
  };

  const onWebChange = (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setNativeFile(file);
  };

  const reset = () => {
    setFileName(null);
    setNativeFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return { fileName, nativeFile, fileInputRef, pickFile, onWebChange, reset };
}

// ─── ImportModal ──────────────────────────────────────────────────────────────
export function ImportModal({
  visible, onClose, onDone, endpoint, title, infoText,
}: {
  visible: boolean;
  onClose: () => void;
  onDone: () => void;
  endpoint: string;
  title: string;
  infoText: string;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { fileName, nativeFile, fileInputRef, pickFile, onWebChange, reset } = useFilePicker();

  const handleImport = async () => {
    if (!nativeFile) { Alert.alert("Error", "Please select an Excel file first."); return; }
    setLoading(true);
    setResult(null);
    try {
      const data = await uploadExcelFile(nativeFile, endpoint);
      setResult(data);
      onDone();
    } catch (e: any) {
      Alert.alert("Import Failed", e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => { reset(); setResult(null); onClose(); };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
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
          {Platform.OS === "web" && (
            // @ts-ignore
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv"
              style={{ display: "none" }} onChange={onWebChange} />
          )}
          <Pressable style={importStyles.pickBtn} onPress={pickFile}>
            <Ionicons name="folder-open" size={20} color={Colors.primary} />
            <Text style={importStyles.pickBtnText}>
              {fileName ?? "Choose Excel File (.xlsx)"}
            </Text>
            {fileName && (
              <Pressable onPress={reset} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
              </Pressable>
            )}
          </Pressable>

          {result && (
            <View style={importStyles.resultBox}>
              <Text style={importStyles.resultTitle}>✅ Import Complete</Text>
              <View style={importStyles.resultGrid}>
                {[
                  { label: "New Cases",   val: result.imported,      color: Colors.success },
                  { label: "Updated",     val: result.updated,       color: Colors.info },
                  { label: "Skipped",     val: result.skipped,       color: Colors.warning },
                  { label: "FOS Created", val: result.agentsCreated, color: Colors.primary },
                ].map((s) => (
                  <View key={s.label} style={importStyles.resultItem}>
                    <Text style={[importStyles.resultNum, { color: s.color }]}>
                      {s.val ?? 0}
                    </Text>
                    <Text style={importStyles.resultLabel}>{s.label}</Text>
                  </View>
                ))}
              </View>
              {result.errors?.length > 0 && (
                <View style={importStyles.errorList}>
                  <Text style={importStyles.errorTitle}>
                    Errors ({result.errors.length}):
                  </Text>
                  {result.errors.slice(0, 5).map((e: string, i: number) => (
                    <Text key={i} style={importStyles.errorItem}>• {e}</Text>
                  ))}
                </View>
              )}
            </View>
          )}

          <View style={importStyles.btnRow}>
            <Pressable style={importStyles.cancelBtn} onPress={handleClose}>
              <Text style={importStyles.cancelText}>Close</Text>
            </Pressable>
            <Pressable
              style={[importStyles.importBtn, (!nativeFile || loading) && { opacity: 0.5 }]}
              onPress={handleImport}
              disabled={!nativeFile || loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                    <Ionicons name="cloud-upload" size={18} color="#fff" />
                    <Text style={importStyles.importText}>Import</Text>
                  </>
              }
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── BktPerfImportModal ───────────────────────────────────────────────────────
const BKT_OPTIONS = ["Auto-detect", "1", "2", "3", "Penal"];

export function BktPerfImportModal({
  visible, onClose, onDone,
}: {
  visible: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [selectedBkt, setSelectedBkt] = useState("Auto-detect");
  const { fileName, nativeFile, fileInputRef, pickFile, onWebChange, reset } = useFilePicker();

  const handleImport = async () => {
    if (!nativeFile) { Alert.alert("Error", "Please select an Excel file first."); return; }
    setLoading(true);
    setResult(null);
    try {
      const extraFields =
        selectedBkt !== "Auto-detect" ? { bkt: selectedBkt } : undefined;
      const data = await uploadExcelFile(
        nativeFile, "/api/admin/import-bkt-perf", extraFields
      );
      setResult(data);
      onDone();
    } catch (e: any) {
      Alert.alert("Import Failed", e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => { reset(); setResult(null); onClose(); };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={importStyles.overlay}>
        <View style={importStyles.sheet}>
          <View style={importStyles.handle} />
          <View style={importStyles.header}>
            <Ionicons name="bar-chart" size={22} color={Colors.primary} />
            <Text style={importStyles.title}>Import BKT Performance Summary</Text>
          </View>
          <View style={importStyles.infoBox}>
            <Ionicons name="information-circle" size={16} color={Colors.info} />
            <Text style={importStyles.infoText}>
              Pivot table Excel with POS + Rollback data. Select BKT if auto-detection fails.
            </Text>
          </View>

          <View style={bktSelStyles.container}>
            <Text style={bktSelStyles.label}>BKT / Sheet:</Text>
            <View style={bktSelStyles.row}>
              {BKT_OPTIONS.map((opt) => (
                <Pressable
                  key={opt}
                  style={[bktSelStyles.chip, selectedBkt === opt && bktSelStyles.chipActive]}
                  onPress={() => setSelectedBkt(opt)}
                >
                  <Text style={[
                    bktSelStyles.chipText,
                    selectedBkt === opt && bktSelStyles.chipTextActive,
                  ]}>
                    {opt}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {Platform.OS === "web" && (
            // @ts-ignore
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls"
              style={{ display: "none" }} onChange={onWebChange} />
          )}

          <Pressable style={importStyles.pickBtn} onPress={pickFile}>
            <Ionicons name="folder-open" size={20} color={Colors.primary} />
            <Text style={importStyles.pickBtnText}>
              {fileName ?? "Choose Excel File (.xlsx)"}
            </Text>
            {fileName && (
              <Pressable onPress={reset} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
              </Pressable>
            )}
          </Pressable>

          {result && (
            <View style={importStyles.resultBox}>
              <Text style={importStyles.resultTitle}>
                ✅ Import Complete · BKT {result.bkt ?? selectedBkt}
              </Text>
              <View style={importStyles.resultGrid}>
                <View style={importStyles.resultItem}>
                  <Text style={[importStyles.resultNum, { color: Colors.success }]}>
                    {result.imported}
                  </Text>
                  <Text style={importStyles.resultLabel}>Imported</Text>
                </View>
                <View style={importStyles.resultItem}>
                  <Text style={[importStyles.resultNum, { color: Colors.warning }]}>
                    {result.skipped}
                  </Text>
                  <Text style={importStyles.resultLabel}>Skipped</Text>
                </View>
              </View>
            </View>
          )}

          <View style={importStyles.btnRow}>
            <Pressable style={importStyles.cancelBtn} onPress={handleClose}>
              <Text style={importStyles.cancelText}>Close</Text>
            </Pressable>
            <Pressable
              style={[
                importStyles.importBtn,
                { backgroundColor: Colors.primary },
                (!nativeFile || loading) && { opacity: 0.5 },
              ]}
              onPress={handleImport}
              disabled={!nativeFile || loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                    <Ionicons name="cloud-upload" size={18} color="#fff" />
                    <Text style={importStyles.importText}>Import</Text>
                  </>
              }
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const importStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 24,
    borderTopRightRadius: 24, padding: 24, gap: 16, maxHeight: "90%",
  },
  handle: {
    width: 40, height: 4, backgroundColor: Colors.border,
    borderRadius: 2, alignSelf: "center", marginBottom: 4,
  },
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
  resultLabel: {
    fontSize: 11, color: Colors.textSecondary,
    fontWeight: "600", textAlign: "center",
  },
  errorList: { gap: 4 },
  errorTitle: { fontSize: 13, fontWeight: "700", color: Colors.danger },
  errorItem: { fontSize: 12, color: Colors.textSecondary },
  btnRow: { flexDirection: "row", gap: 12 },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    alignItems: "center", borderWidth: 1, borderColor: Colors.border,
  },
  cancelText: { fontSize: 15, fontWeight: "600", color: Colors.textSecondary },
  importBtn: {
    flex: 2, paddingVertical: 14, borderRadius: 12,
    alignItems: "center", backgroundColor: Colors.primary,
    flexDirection: "row", justifyContent: "center", gap: 8,
  },
  importText: { fontSize: 15, fontWeight: "700", color: "#fff" },
});

const bktSelStyles = StyleSheet.create({
  container: { gap: 6 },
  label: { fontSize: 12, fontWeight: "700", color: Colors.textSecondary },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: Colors.surfaceAlt, borderWidth: 1.5, borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.primary + "20", borderColor: Colors.primary },
  chipText: { fontSize: 13, fontWeight: "600", color: Colors.textMuted },
  chipTextActive: { color: Colors.primary, fontWeight: "800" },
});

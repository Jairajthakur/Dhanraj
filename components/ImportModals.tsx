import React, { useState, useRef } from "react";
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator,
  Modal, Alert, Platform,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { tokenStore } from "@/lib/api";
import { getApiUrl } from "@/lib/query-client";

// ─── Shared file upload helper ────────────────────────────────────────────────
async function uploadExcelFile(
  nativeFile: any,
  endpoint: string,
  extraFields?: Record<string, string>
): Promise<any> {
  const url = new URL(endpoint, getApiUrl()).toString();

  if (Platform.OS === "web") {
    const formData = new FormData();
    formData.append("file", nativeFile as any);
    if (extraFields) {
      Object.entries(extraFields).forEach(([k, v]) => formData.append(k, v));
    }
    const res = await fetch(url, {
      method: "POST",
      body: formData,
      credentials: "include",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let msg = `HTTP ${res.status}`;
      try { const json = JSON.parse(text); msg = json.message || json.error || msg; } catch { if (text) msg = text; }
      throw new Error(msg);
    }
    return res.json();
  }

  const token = await tokenStore.get();

  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", {
      uri: nativeFile.uri,
      name: nativeFile.name,
      type: nativeFile.type ||
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    } as any);
    if (extraFields) {
      Object.entries(extraFields).forEach(([k, v]) => formData.append(k, v));
    }
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); }
        catch { resolve({}); }
      } else {
        let msg = `HTTP ${xhr.status}`;
        try { const json = JSON.parse(xhr.responseText); msg = json.message || json.error || msg; } catch {}
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));
    xhr.timeout = 60000;
    xhr.send(formData);
  });
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

// ─── BktPerfImportModal — Penal Only ─────────────────────────────────────────
export function BktPerfImportModal({
  visible, onClose, onDone,
}: {
  visible: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { fileName, nativeFile, fileInputRef, pickFile, onWebChange, reset } = useFilePicker();

  const handleImport = async () => {
    if (!nativeFile) { Alert.alert("Error", "Please select an Excel file first."); return; }
    setLoading(true);
    setResult(null);
    try {
      // Always penal — no BKT selector needed
      const data = await uploadExcelFile(
        nativeFile, "/api/admin/import-bkt-perf", { bkt: "Penal" }
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

          {/* Header */}
          <View style={importStyles.header}>
            <Ionicons name="bar-chart" size={22} color="#7C3AED" />
            <Text style={importStyles.title}>Import Penal Performance</Text>
          </View>

          {/* Info */}
          <View style={importStyles.infoBox}>
            <Ionicons name="information-circle" size={16} color={Colors.info} />
            <Text style={importStyles.infoText}>
              Upload penal pivot table Excel with POS + Rollback data.
              BKT1/2/3 are calculated automatically from allocation. This imports Penal only.
            </Text>
          </View>

          {/* Penal badge */}
          <View style={penalStyles.badge}>
            <Ionicons name="checkmark-circle" size={16} color="#7C3AED" />
            <Text style={penalStyles.badgeText}>Penal Performance</Text>
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
              <Text style={importStyles.resultTitle}>✅ Penal Import Complete</Text>
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
            <Pressable style={importStyles.cancelBtn} onPress={handleClose}>
              <Text style={importStyles.cancelText}>Close</Text>
            </Pressable>
            <Pressable
              style={[
                importStyles.importBtn,
                { backgroundColor: "#7C3AED" },
                (!nativeFile || loading) && { opacity: 0.5 },
              ]}
              onPress={handleImport}
              disabled={!nativeFile || loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                    <Ionicons name="cloud-upload" size={18} color="#fff" />
                    <Text style={importStyles.importText}>Import Penal</Text>
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

const penalStyles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#7C3AED18",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#7C3AED40",
    alignSelf: "flex-start",
  },
  badgeText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#7C3AED",
  },
});

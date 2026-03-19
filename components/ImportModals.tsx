import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
  Alert,
  Platform,
  Linking,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { api, tokenStore } from "@/lib/api";
import { getApiUrl } from "@/lib/query-client";
import { fetch as expoFetch } from "expo/fetch";

// ─── atob polyfill for Android (not available on older API levels) ──────────
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

// ─── Shared file upload helper ──────────────────────────────────────────────
async function uploadExcelFile(
  nativeFile: any,
  endpoint: string,
  extraFields?: Record<string, string>
): Promise<any> {
  const url = new URL(endpoint, getApiUrl()).toString();
  const formData = new FormData();

  if (Platform.OS !== "web" && nativeFile.uri) {
    // ✅ Native: read as base64, convert using safe polyfill (no atob dependency)
    const base64 = await FileSystem.readAsStringAsync(nativeFile.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const bytes = base64ToBytes(base64);
    const blob = new Blob([bytes], {
      type:
        nativeFile.type ||
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    formData.append("file", blob, nativeFile.name);
  } else {
    // Web: file object works directly
    formData.append("file", nativeFile as any);
  }

  if (extraFields) {
    Object.entries(extraFields).forEach(([k, v]) => formData.append(k, v));
  }

  // Attach Bearer token on native for APK auth
  const headers: Record<string, string> = {};
  if (Platform.OS !== "web") {
    const token = await tokenStore.get();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await expoFetch(url, {
    method: "POST",
    body: formData,
    credentials: "include",
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      msg = JSON.parse(text).message;
    } catch {}
    throw new Error(msg || "Import failed");
  }

  return res.json();
}

// ─── Shared file picker hook ─────────────────────────────────────────────────
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
          type:
            asset.mimeType ||
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

// ─── ImportModal ─────────────────────────────────────────────────────────────
function ImportModal({
  visible,
  onClose,
  onDone,
  endpoint,
  title,
  infoText,
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
  const { fileName, nativeFile, fileInputRef, pickFile, onWebChange, reset } =
    useFilePicker();

  const handleImport = async () => {
    if (!nativeFile) {
      Alert.alert("Error", "Please select an Excel file first.");
      return;
    }
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

  const handleClose = () => {
    reset();
    setResult(null);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
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
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              style={{ display: "none" }}
              onChange={onWebChange}
            />
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
              <Text style={importStyles.resultTitle}>Import Complete</Text>
              <View style={importStyles.resultGrid}>
                {[
                  { label: "New Cases", val: result.imported, color: Colors.success },
                  { label: "Updated", val: result.updated, color: Colors.info },
                  { label: "Skipped", val: result.skipped, color: Colors.warning },
                  {
                    label: "FOS Created",
                    val: result.agentsCreated,
                    color: Colors.primary,
                  },
                ].map((s) => (
                  <View key={s.label} style={importStyles.resultItem}>
                    <Text style={[importStyles.resultNum, { color: s.color }]}>
                      {s.val}
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
                    <Text key={i} style={importStyles.errorItem}>
                      • {e}
                    </Text>
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
                (!nativeFile || loading) && { opacity: 0.5 },
              ]}
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

// ─── BktPerfImportModal ───────────────────────────────────────────────────────
const BKT_OPTIONS = ["Auto-detect", "1", "2", "3", "Penal"];

function BktPerfImportModal({
  visible,
  onClose,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [selectedBkt, setSelectedBkt] = useState("Auto-detect");
  const { fileName, nativeFile, fileInputRef, pickFile, onWebChange, reset } =
    useFilePicker();

  const handleImport = async () => {
    if (!nativeFile) {
      Alert.alert("Error", "Please select an Excel file first.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const extraFields =
        selectedBkt !== "Auto-detect" ? { bkt: selectedBkt } : undefined;
      const data = await uploadExcelFile(
        nativeFile,
        "/api/admin/import-bkt-perf",
        extraFields
      );
      setResult(data);
      onDone();
    } catch (e: any) {
      Alert.alert("Import Failed", e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    reset();
    setResult(null);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
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
              Pivot table Excel with POS + Rollback data. Select BKT if
              auto-detection fails.
            </Text>
          </View>

          <View style={bktSelStyles.container}>
            <Text style={bktSelStyles.label}>BKT / Sheet:</Text>
            <View style={bktSelStyles.row}>
              {BKT_OPTIONS.map((opt) => (
                <Pressable
                  key={opt}
                  style={[
                    bktSelStyles.chip,
                    selectedBkt === opt && bktSelStyles.chipActive,
                  ]}
                  onPress={() => setSelectedBkt(opt)}
                >
                  <Text
                    style={[
                      bktSelStyles.chipText,
                      selectedBkt === opt && bktSelStyles.chipTextActive,
                    ]}
                  >
                    {opt}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {Platform.OS === "web" && (
            // @ts-ignore
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              style={{ display: "none" }}
              onChange={onWebChange}
            />
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
                Import Complete · BKT {result.bkt ?? selectedBkt}
              </Text>
              <View style={importStyles.resultGrid}>
                <View style={importStyles.resultItem}>
                  <Text
                    style={[importStyles.resultNum, { color: Colors.success }]}
                  >
                    {result.imported}
                  </Text>
                  <Text style={importStyles.resultLabel}>Imported</Text>
                </View>
                <View style={importStyles.resultItem}>
                  <Text
                    style={[importStyles.resultNum, { color: Colors.warning }]}
                  >
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

// ─── Styles ──────────────────────────────────────────────────────────────────
const importStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: "#ddd",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111",
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: "#f0f8ff",
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: "#444",
    lineHeight: 18,
  },
  pickBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderStyle: "dashed",
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
  },
  pickBtnText: {
    flex: 1,
    fontSize: 14,
    color: Colors.primary,
  },
  resultBox: {
    backgroundColor: "#f9f9f9",
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111",
    marginBottom: 10,
  },
  resultGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  resultItem: {
    alignItems: "center",
    minWidth: 70,
  },
  resultNum: {
    fontSize: 22,
    fontWeight: "700",
  },
  resultLabel: {
    fontSize: 11,
    color: "#888",
    marginTop: 2,
  },
  errorList: {
    marginTop: 10,
  },
  errorTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#c00",
    marginBottom: 4,
  },
  errorItem: {
    fontSize: 12,
    color: "#555",
    lineHeight: 18,
  },
  btnRow: {
    flexDirection: "row",
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    alignItems: "center",
  },
  cancelText: {
    fontSize: 15,
    color: "#555",
    fontWeight: "500",
  },
  importBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    borderRadius: 10,
    backgroundColor: Colors.primary,
  },
  importText: {
    fontSize: 15,
    color: "#fff",
    fontWeight: "600",
  },
});

const bktSelStyles = StyleSheet.create({
  container: {
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#555",
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#f5f5f5",
  },
  chipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + "15",
  },
  chipText: {
    fontSize: 13,
    color: "#555",
  },
  chipTextActive: {
    color: Colors.primary,
    fontWeight: "600",
  },
});

export { ImportModal, BktPerfImportModal };

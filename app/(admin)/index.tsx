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

// ─── Shared file upload helper ─────────────────────────────────────────────
// Builds a FormData with the file correctly on both web and native,
// then POSTs it to the given endpoint. Returns parsed JSON.
async function uploadExcelFile(
  nativeFile: any,
  endpoint: string,
  extraFields?: Record<string, string>
): Promise<any> {
  const url = new URL(endpoint, getApiUrl()).toString();
  const formData = new FormData();

  if (Platform.OS !== "web" && nativeFile.uri) {
    // ✅ Native: read as base64 via FileSystem, convert to Blob
    // This is reliable on Android/iOS unlike globalThis.fetch(uri)
    const base64 = await FileSystem.readAsStringAsync(nativeFile.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    // Convert base64 → binary string → Uint8Array → Blob
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], {
      type: nativeFile.type ||
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    formData.append("file", blob, nativeFile.name);
  } else {
    // Web: file object works directly
    formData.append("file", nativeFile as any);
  }

  // Append any extra fields (e.g. bkt selector)
  if (extraFields) {
    Object.entries(extraFields).forEach(([k, v]) => formData.append(k, v));
  }

  const res = await expoFetch(url, {
    method: "POST",
    body: formData,
    credentials: "include",
  });

  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try { msg = JSON.parse(text).message; } catch {}
    throw new Error(msg || "Import failed");
  }

  return res.json();
}

// ─── Shared file picker hook ────────────────────────────────────────────────
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

// ─── ImportModal ────────────────────────────────────────────────────────────
function ImportModal({
  visible, onClose, onDone, endpoint, title, infoText,
}: {
  visible: boolean; onClose: () => void; onDone: () => void;
  endpoint: string; title: string; infoText: string;
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
                  { label: "Updated",   val: result.updated,  color: Colors.info },
                  { label: "Skipped",   val: result.skipped,  color: Colors.warning },
                  { label: "FOS Created", val: result.agentsCreated, color: Colors.primary },
                ].map(s => (
                  <View key={s.label} style={importStyles.resultItem}>
                    <Text style={[importStyles.resultNum, { color: s.color }]}>{s.val}</Text>
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

// ─── BktPerfImportModal ─────────────────────────────────────────────────────
const BKT_OPTIONS = ["Auto-detect", "1", "2", "3", "Penal"];

function BktPerfImportModal({
  visible, onClose, onDone,
}: {
  visible: boolean; onClose: () => void; onDone: () => void;
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
              {BKT_OPTIONS.map(opt => (
                <Pressable
                  key={opt}
                  style={[bktSelStyles.chip, selectedBkt === opt && bktSelStyles.chipActive]}
                  onPress={() => setSelectedBkt(opt)}
                >
                  <Text style={[bktSelStyles.chipText, selectedBkt === opt && bktSelStyles.chipTextActive]}>
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

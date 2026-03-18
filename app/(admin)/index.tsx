import React, { useState, useRef } from "react";
import {
  View, Text, Pressable, ActivityIndicator,
  Modal, Alert, Platform
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

// ─── FIXED UPLOAD FUNCTION (NO CRASH) ───────────────────────────────────────
async function uploadExcelFile(
  nativeFile: any,
  endpoint: string,
  extraFields?: Record<string, string>
): Promise<any> {
  const url = new URL(endpoint, getApiUrl()).toString();
  const formData = new FormData();

  // ✅ Works on Android, iOS, Web
  formData.append("file", {
    uri: nativeFile.uri,
    name: nativeFile.name,
    type:
      nativeFile.type ||
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  } as any);

  if (extraFields) {
    Object.entries(extraFields).forEach(([k, v]) =>
      formData.append(k, v)
    );
  }

  const res = await fetch(url, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Upload failed");
  }

  return res.json();
}

// ─── FILE PICKER ────────────────────────────────────────────────────────────
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
          "*/*",
        ],
      });

      if (!result.canceled && result.assets?.[0]) {
        const file = result.assets[0];
        setFileName(file.name);
        setNativeFile({
          uri: file.uri,
          name: file.name,
          type: file.mimeType,
        });
      }
    } catch {
      Alert.alert("Error", "File picker failed");
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
  };

  return { fileName, nativeFile, fileInputRef, pickFile, onWebChange, reset };
}

// ─── IMPORT MODAL ───────────────────────────────────────────────────────────
function ImportModal({
  visible,
  onClose,
  endpoint,
}: any) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const {
    fileName,
    nativeFile,
    fileInputRef,
    pickFile,
    onWebChange,
    reset,
  } = useFilePicker();

  const handleImport = async () => {
    if (!nativeFile) {
      Alert.alert("Select file first");
      return;
    }

    setLoading(true);

    try {
      const data = await uploadExcelFile(nativeFile, endpoint);
      setResult(data);
      Alert.alert("Success", "File imported");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }

    setLoading(false);
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={{ flex: 1, justifyContent: "center", padding: 20, backgroundColor: "#00000088" }}>
        <View style={{ backgroundColor: "#fff", padding: 20, borderRadius: 10 }}>

          <Text style={{ fontSize: 18, marginBottom: 10 }}>
            Import Excel
          </Text>

          {Platform.OS === "web" && (
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: "none" }}
              onChange={onWebChange}
            />
          )}

          <Pressable onPress={pickFile}>
            <Text style={{ marginBottom: 10 }}>
              {fileName || "Choose File"}
            </Text>
          </Pressable>

          <Pressable
            onPress={handleImport}
            disabled={!nativeFile || loading}
            style={{ backgroundColor: "blue", padding: 10 }}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: "#fff" }}>Upload</Text>
            )}
          </Pressable>

          <Pressable onPress={onClose}>
            <Text style={{ marginTop: 10 }}>Close</Text>
          </Pressable>

        </View>
      </View>
    </Modal>
  );
}

// ─── MAIN ADMIN SCREEN ──────────────────────────────────────────────────────
export default function AdminScreen() {
  const [showModal, setShowModal] = useState(false);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>

      <Text style={{ fontSize: 20 }}>Admin Panel</Text>

      <Pressable
        onPress={() => setShowModal(true)}
        style={{ marginTop: 20, backgroundColor: "black", padding: 10 }}
      >
        <Text style={{ color: "#fff" }}>Import Excel</Text>
      </Pressable>

      <ImportModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        endpoint="/api/admin/import"
      />

    </View>
  );
}

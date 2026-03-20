function ImportModal({ visible, onClose, onImported }: any) {
  const [file, setFile] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  // ✅ PICK FILE (FIXED)
  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
        ],
        copyToCacheDirectory: true,
      });

      if (res.canceled) return;

      const picked = res.assets[0];

      const fileData = {
        uri: picked.uri,
        name: picked.name || "file.xlsx",
        type:
          picked.mimeType ||
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      };

      console.log("Picked File:", fileData); // debug

      setFile(fileData);
    } catch (e) {
      console.error("Picker error:", e);
      Alert.alert("Error", "Failed to pick file");
    }
  };

  // ✅ IMPORT FILE (FIXED)
  const doImport = async () => {
    if (!file) {
      Alert.alert("Error", "Please select file first");
      return;
    }

    setLoading(true);

    try {
      const form = new FormData();

      form.append("file", {
        uri: file.uri,
        name: file.name,
        type: file.type,
      } as any);

      const base = getApiUrl();
      const token = Platform.OS !== "web" ? await tokenStore.get() : null;

      const res = await fetch(`${base}/api/admin/import-depositions`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: form,
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.message || "Import failed");
      }

      setResult(json);
      onImported();

      Alert.alert("Success", "Excel imported successfully ✅");
    } catch (e: any) {
      console.error("Import error:", e);
      Alert.alert("Import Failed", e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={ms.overlay}>
        <View style={ms.sheet}>
          <View style={ms.handle} />

          <Text style={ms.title}>Import Depositions Excel</Text>

          <Text style={{ fontSize: 12, color: Colors.textSecondary, marginBottom: 12 }}>
            Expected columns: FOS Name, Customer Name, Loan No, Amount, Cash, Online, Date
          </Text>

          {/* PICK FILE */}
          <Pressable style={imp.pickBtn} onPress={pickFile}>
            <Ionicons name="folder-open" size={20} color={Colors.primary} />
            <Text style={imp.pickText}>
              {file?.name ?? "Choose Excel File (.xlsx)"}
            </Text>

            {file && (
              <Pressable onPress={() => setFile(null)}>
                <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
              </Pressable>
            )}
          </Pressable>

          {/* RESULT */}
          {result && (
            <View style={imp.result}>
              <Text style={imp.resultTitle}>✅ Import Complete</Text>
              <Text style={imp.resultText}>
                Imported: {result.imported} · Skipped: {result.skipped}
              </Text>
            </View>
          )}

          {/* BUTTONS */}
          <View style={ms.btnRow}>
            <Pressable
              style={ms.cancel}
              onPress={() => {
                setFile(null);
                setResult(null);
                onClose();
              }}
            >
              <Text style={ms.cancelTxt}>Close</Text>
            </Pressable>

            <Pressable
              style={[ms.save, (!file || loading) && { opacity: 0.5 }]}
              onPress={doImport}
              disabled={!file || loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="cloud-upload" size={16} color="#fff" />
                  <Text style={ms.saveTxt}> Import</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

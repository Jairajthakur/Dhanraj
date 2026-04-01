import React, { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable,
  Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";

// ✅ MOVED OUTSIDE — inline component definitions cause unmount/remount
// on every state change, which dismisses the keyboard
interface InputFieldProps {
  label: string;
  value: string;
  onChange: (text: string) => void;
  show: boolean;
  setShow: (v: boolean) => void;
}

const InputField = React.memo(({ label, value, onChange, show, setShow }: InputFieldProps) => (
  <View style={styles.fieldGroup}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <View style={styles.inputWrapper}>
      <Ionicons
        name="lock-closed-outline"
        size={20}
        color={Colors.textSecondary}
        style={{ marginRight: 10 }}
      />
      <TextInput
        style={{ flex: 1, fontSize: 16, color: Colors.text, paddingVertical: 16 }}
        value={value}
        onChangeText={onChange}
        secureTextEntry={!show}
        autoCapitalize="none"
        placeholder="••••••••"
        placeholderTextColor={Colors.textMuted}
        // ✅ Prevent keyboard dismissal
        blurOnSubmit={false}
        returnKeyType="next"
      />
      <Pressable onPress={() => setShow(!show)} style={{ padding: 4 }}>
        <Ionicons
          name={show ? "eye-off-outline" : "eye-outline"}
          size={20}
          color={Colors.textSecondary}
        />
      </Pressable>
    </View>
  </View>
));

export default function ChangePasswordScreen() {
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleChange = async () => {
    if (!current || !newPass || !confirm) {
      Alert.alert("Error", "Please fill all fields");
      return;
    }
    if (newPass !== confirm) {
      Alert.alert("Error", "New passwords do not match");
      return;
    }
    if (newPass.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      await api.changePassword(current, newPass);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Password changed successfully", [
        { text: "OK", onPress: () => { setCurrent(""); setNewPass(""); setConfirm(""); } }
      ]);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingBottom: insets.bottom + 24, paddingTop: Platform.OS === "web" ? 67 : 20 }
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
      >
        <View style={styles.iconSection}>
          <View style={styles.iconBox}>
            <Ionicons name="lock-closed" size={36} color={Colors.primary} />
          </View>
          <Text style={styles.sectionTitle}>Change Password</Text>
          <Text style={styles.sectionSub}>Update your account password to keep it secure</Text>
        </View>

        <View style={styles.card}>
          <InputField
            label="Current Password"
            value={current}
            onChange={setCurrent}
            show={showCurrent}
            setShow={setShowCurrent}
          />
          <InputField
            label="New Password"
            value={newPass}
            onChange={setNewPass}
            show={showNew}
            setShow={setShowNew}
          />
          <InputField
            label="Confirm New Password"
            value={confirm}
            onChange={setConfirm}
            show={showConfirm}
            setShow={setShowConfirm}
          />
        </View>

        <Pressable
          style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }]}
          onPress={handleChange}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.saveBtnText}>Update Password</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 24 },
  iconSection: { alignItems: "center", gap: 8 },
  iconBox: {
    width: 80, height: 80, borderRadius: 24, backgroundColor: Colors.primary + "15",
    alignItems: "center", justifyContent: "center", marginBottom: 8,
  },
  sectionTitle: { fontSize: 24, fontWeight: "700", color: Colors.text },
  sectionSub: { fontSize: 14, color: Colors.textSecondary, textAlign: "center" },
  card: {
    backgroundColor: Colors.surface, borderRadius: 20, padding: 20, gap: 16,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  fieldGroup: { gap: 8 },
  fieldLabel: {
    fontSize: 13, fontWeight: "700", color: Colors.textSecondary,
    textTransform: "uppercase", letterSpacing: 0.5,
  },
  inputWrapper: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: Colors.surfaceAlt, borderRadius: 14, paddingHorizontal: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: 16, paddingVertical: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  saveBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
});

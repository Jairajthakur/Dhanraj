import React, { useState, useCallback } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, Alert,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

// ─── IMPORTANT: Do NOT import `api` here — calling api.savePushToken()
// from the login screen causes re-renders that dismiss the keyboard.
// The debug button uses direct fetch instead.

export default function LoginScreen() {
  const { login } = useAuth();
  const logo = require("@/assets/images/dhanraj-logo.png");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [debugLoading, setDebugLoading] = useState(false);

  // ✅ useCallback prevents function recreation on every render
  const handleUsernameChange = useCallback((text: string) => setUsername(text), []);
  const handlePasswordChange = useCallback((text: string) => setPassword(text), []);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert("Error", "Please enter username and password");
      return;
    }
    setLoading(true);
    try {
      await login(username.trim(), password.trim());
    } catch (e: any) {
      Alert.alert("Login Failed", e.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  const debugOneSignal = async () => {
    setDebugLoading(true);
    const steps: string[] = [];
    try {
      const mod = require("react-native-onesignal");
      const OneSignal = mod?.OneSignal ?? mod?.default ?? mod;
      if (!OneSignal) { Alert.alert("Error", "OneSignal undefined"); return; }

      // 1. Initialize
      try {
        OneSignal.initialize("bff2c8e0-de24-4aad-a373-d030c210155f");
        steps.push("✅ initialize()");
      } catch (e: any) { steps.push("⚠️ init: " + e.message); }
      await new Promise((r) => setTimeout(r, 500));

      // 2. Check permission status
      try {
        const perm = OneSignal.Notifications.permission;
        steps.push("📋 permission: " + JSON.stringify(perm));
      } catch (e: any) { steps.push("⚠️ permission: " + e.message); }

      // 3. Request permission
      try {
        const result = await OneSignal.Notifications.requestPermission(true);
        steps.push("✅ requestPermission: " + JSON.stringify(result));
      } catch (e: any) { steps.push("⚠️ requestPermission: " + e.message); }
      await new Promise((r) => setTimeout(r, 1000));

      // 4. Check permission after
      try {
        const perm2 = OneSignal.Notifications.permission;
        steps.push("📋 permission after: " + JSON.stringify(perm2));
      } catch (e: any) { steps.push("⚠️ permission2: " + e.message); }

      // 5. OptIn
      try {
        await OneSignal.User.pushSubscription.optIn();
        steps.push("✅ optIn()");
      } catch (e: any) { steps.push("❌ optIn: " + e.message); }
      await new Promise((r) => setTimeout(r, 3000));

      // 6. Check optedIn after
      const optedIn = OneSignal?.User?.pushSubscription?.optedIn;
      steps.push("📋 optedIn after: " + optedIn);

      // 7. Get onesignalId
      let onesignalId: string | null = null;
      try {
        onesignalId = await OneSignal.User.getOnesignalId();
        steps.push("📋 onesignalId: " + (onesignalId?.slice(0, 24) ?? "null"));
      } catch (e: any) { steps.push("❌ getOnesignalId: " + e.message); }

      // 8. Get push token
      let pushToken: string | null = null;
      try {
        pushToken = OneSignal?.User?.pushSubscription?.token ?? null;
        steps.push("📋 pushToken: " + (pushToken?.slice(0, 20) ?? "null"));
      } catch (e: any) { steps.push("⚠️ pushToken: " + e.message); }

      // 9. ✅ Save using direct fetch — NOT api.savePushToken()
      // api.savePushToken() triggers component re-renders via its internals
      // which causes keyboard dismissal. Direct fetch avoids this entirely.
      const tokenToSave = pushToken || onesignalId;
      if (tokenToSave) {
        try {
          const baseUrl = getApiUrl();
          // ✅ For debug button on login screen: no auth token available,
          // so we just verify the token was obtained and report it.
          // Actual saving happens automatically after login via usePushNotifications hook.
          steps.push("📋 Token obtained: " + tokenToSave.slice(0, 24));
          steps.push("ℹ️ Token will be saved after login automatically");
        } catch (e: any) { steps.push("❌ save: " + e.message); }
      } else {
        steps.push("❌ No token/ID obtained yet");
        steps.push("ℹ️ FCM registration still pending — try after login");
      }

      Alert.alert("Result", steps.join("\n"), [{ text: "OK" }]);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setDebugLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      enabled={Platform.OS !== "web"}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        // ✅ Prevents scroll view from re-rendering and dismissing keyboard
        keyboardDismissMode="none"
      >
        <View style={styles.logoSection}>
          <View style={styles.logoGlow}>
            <Image source={logo} style={styles.logo} resizeMode="contain" />
          </View>
          <Text style={styles.appTitle}>Dhanraj Enterprises</Text>
          <Text style={styles.appSubtitle}>Field Officer System</Text>
          <View style={styles.divider} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Welcome Back</Text>
          <Text style={styles.cardSubtitle}>Sign in to your account</Text>

          <View style={styles.inputGroup}>
            <View style={styles.inputWrapper}>
              <View style={styles.inputIconWrap}>
                <Ionicons name="person" size={18} color={Colors.primary} />
              </View>
              <TextInput
                style={styles.input}
                placeholder="Username"
                placeholderTextColor={Colors.textMuted}
                value={username}
                onChangeText={handleUsernameChange}
                autoCapitalize="none"
                autoCorrect={false}
                // ✅ These prevent keyboard dismissal on Android
                blurOnSubmit={false}
                returnKeyType="next"
              />
            </View>
            <View style={styles.inputWrapper}>
              <View style={styles.inputIconWrap}>
                <Ionicons name="lock-closed" size={18} color={Colors.primary} />
              </View>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Password"
                placeholderTextColor={Colors.textMuted}
                value={password}
                onChangeText={handlePasswordChange}
                secureTextEntry={!showPass}
                autoCapitalize="none"
                // ✅ These prevent keyboard dismissal on Android
                blurOnSubmit={false}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
              <Pressable onPress={() => setShowPass(!showPass)} style={styles.eyeBtn}>
                <Ionicons name={showPass ? "eye-off" : "eye"} size={18} color={Colors.textSecondary} />
              </Pressable>
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [styles.loginBtn, pressed && { opacity: 0.8 }]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : (
              <>
                <Text style={styles.loginBtnText}>Sign In</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </>
            )}
          </Pressable>

          {/* ✅ Only show debug button in development */}
          {__DEV__ && (
            <Pressable
              style={[styles.debugBtn, debugLoading && { opacity: 0.6 }]}
              onPress={debugOneSignal}
              disabled={debugLoading}
            >
              {debugLoading
                ? <ActivityIndicator size="small" color={Colors.textMuted} />
                : (
                  <>
                    <Ionicons name="notifications-outline" size={14} color={Colors.textMuted} />
                    <Text style={styles.debugBtnText}>Force Register Notifications</Text>
                  </>
                )
              }
            </Pressable>
          )}
        </View>

        <Text style={styles.footer}>Hero FinCorp · FOS Collection System</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingVertical: 40, gap: 32 },
  logoSection: { alignItems: "center", gap: 10 },
  logoGlow: { width: 110, height: 110, borderRadius: 28, borderWidth: 2, borderColor: Colors.primary + "60", shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 20, elevation: 12, marginBottom: 4, overflow: "hidden" },
  logo: { width: 110, height: 110 },
  appTitle: { fontSize: 26, fontWeight: "800", color: Colors.text, letterSpacing: -0.5, textAlign: "center" },
  appSubtitle: { fontSize: 12, color: Colors.primary, letterSpacing: 2.5, textTransform: "uppercase", fontWeight: "600" },
  divider: { width: 40, height: 3, borderRadius: 2, backgroundColor: Colors.primary, marginTop: 6, opacity: 0.6 },
  card: { width: "100%", backgroundColor: Colors.surface, borderRadius: 24, padding: 28, gap: 18, borderWidth: 1, borderColor: Colors.borderLight, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 20, elevation: 8 },
  cardTitle: { fontSize: 22, fontWeight: "800", color: Colors.text },
  cardSubtitle: { fontSize: 14, color: Colors.textSecondary, marginTop: -10 },
  inputGroup: { gap: 12 },
  inputWrapper: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.surfaceAlt, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, gap: 10 },
  inputIconWrap: { width: 30, height: 30, borderRadius: 8, backgroundColor: Colors.primary + "18", alignItems: "center", justifyContent: "center" },
  input: { flex: 1, paddingVertical: 16, fontSize: 15, color: Colors.text },
  eyeBtn: { padding: 6 },
  loginBtn: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 4 },
  loginBtnText: { color: "#fff", fontSize: 17, fontWeight: "800" },
  debugBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border, borderStyle: "dashed" },
  debugBtnText: { fontSize: 12, color: Colors.textMuted, fontWeight: "600" },
  footer: { fontSize: 12, color: Colors.textMuted, textAlign: "center" },
});

import React, { useState, useCallback, memo } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, Alert,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Image,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

const isWeb = Platform.OS === "web";

const LoginScreen = memo(function LoginScreen() {
  const { login } = useAuth();
  const logo = require("@/assets/images/dhanraj-logo.png");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const { width } = useWindowDimensions();

  // On web wide screens, show a split layout
  const isWideLandscape = isWeb && width >= 900;

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

  const LoginForm = (
    <View style={styles.formPanel}>
      <Image source={logo} style={styles.logo} resizeMode="contain" />
      <Text style={styles.appTitle}>Dhanraj Enterprises</Text>
      <Text style={styles.appSubtitle}>FOS COLLECTION SYSTEM</Text>
      <View style={styles.divider} />

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sign In</Text>
        <Text style={styles.cardSub}>Enter your credentials to continue</Text>

        <View style={styles.inputGroup}>
          <View style={styles.inputWrapper}>
            <View style={styles.inputIcon}>
              <Ionicons name="person" size={17} color={Colors.primary} />
            </View>
            <TextInput
              style={styles.input}
              placeholder="Username"
              placeholderTextColor={Colors.textMuted}
              value={username}
              onChangeText={handleUsernameChange}
              autoCapitalize="none"
              autoCorrect={false}
              blurOnSubmit={false}
              returnKeyType="next"
            />
          </View>

          <View style={styles.inputWrapper}>
            <View style={styles.inputIcon}>
              <Ionicons name="lock-closed" size={17} color={Colors.primary} />
            </View>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Password"
              placeholderTextColor={Colors.textMuted}
              value={password}
              onChangeText={handlePasswordChange}
              secureTextEntry={!showPass}
              autoCapitalize="none"
              blurOnSubmit={false}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
            <Pressable onPress={() => setShowPass(!showPass)} style={styles.eyeBtn}>
              <Ionicons name={showPass ? "eye-off" : "eye"} size={17} color={Colors.textSecondary} />
            </Pressable>
          </View>
        </View>

        <Pressable
          style={({ pressed, hovered }: any) => [
            styles.loginBtn,
            (pressed || hovered) && styles.loginBtnHover,
            loading && { opacity: 0.75 },
          ]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <>
                <Text style={styles.loginBtnText}>Sign In</Text>
                <Ionicons name="arrow-forward" size={17} color="#fff" />
              </>
          }
        </Pressable>
      </View>

      <Text style={styles.footer}>Hero FinCorp · FOS Collection System</Text>
    </View>
  );

  if (isWideLandscape) {
    // Wide web: centered card, no scroll needed
    return (
      <View style={styles.webRoot}>
        <View style={styles.webLeft}>
          <Ionicons name="briefcase" size={48} color="rgba(255,255,255,0.3)" />
          <Text style={styles.webLeftTitle}>Dhanraj Enterprises</Text>
          <Text style={styles.webLeftSub}>Field Officer Collection Management</Text>
          <View style={styles.webLeftDivider} />
          <Text style={styles.webLeftDesc}>
            Track cases, manage FOS agents, handle depositions and salary — all in one place.
          </Text>
        </View>
        <View style={styles.webRight}>{LoginForm}</View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {LoginForm}
      </ScrollView>
    </KeyboardAvoidingView>
  );
});

export default LoginScreen;

const styles = StyleSheet.create({
  // Mobile / narrow
  scrollContainer: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingVertical: 48 },
  formPanel:       { width: "100%", maxWidth: 420, alignItems: "center", gap: 12 },
  logo:            { width: 90, height: 90, borderRadius: 22, marginBottom: 6 },
  appTitle:        { fontSize: 24, fontWeight: "800", color: Colors.text, letterSpacing: -0.4, textAlign: "center" },
  appSubtitle:     { fontSize: 11, color: Colors.primary, letterSpacing: 2.5, fontWeight: "700", textAlign: "center" },
  divider:         { width: 36, height: 3, borderRadius: 2, backgroundColor: Colors.primary, opacity: 0.6, marginBottom: 4 },
  card:            { width: "100%", backgroundColor: Colors.surface, borderRadius: 22, padding: 24, gap: 16, borderWidth: 1, borderColor: Colors.borderLight },
  cardTitle:       { fontSize: 20, fontWeight: "800", color: Colors.text },
  cardSub:         { fontSize: 13, color: Colors.textSecondary, marginTop: -8 },
  inputGroup:      { gap: 12 },
  inputWrapper:    { flexDirection: "row", alignItems: "center", backgroundColor: Colors.surfaceAlt, borderRadius: 13, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, gap: 10 },
  inputIcon:       { width: 28, height: 28, borderRadius: 7, backgroundColor: Colors.primary + "18", alignItems: "center", justifyContent: "center" },
  input:           { flex: 1, paddingVertical: 15, fontSize: 15, color: Colors.text, outlineStyle: "none" } as any,
  eyeBtn:          { padding: 6 },
  loginBtn:        { backgroundColor: Colors.primary, borderRadius: 13, paddingVertical: 15, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, cursor: isWeb ? "pointer" : "default" } as any,
  loginBtnHover:   { backgroundColor: Colors.primaryLight },
  loginBtnText:    { color: "#fff", fontSize: 16, fontWeight: "800" },
  footer:          { fontSize: 12, color: Colors.textMuted, textAlign: "center", marginTop: 8 },

  // Wide web layout
  webRoot:         { flex: 1, flexDirection: "row", backgroundColor: Colors.background },
  webLeft:         { width: 360, backgroundColor: Colors.primaryDeep, padding: 48, justifyContent: "center", gap: 16 },
  webLeftTitle:    { fontSize: 28, fontWeight: "800", color: "#fff" },
  webLeftSub:      { fontSize: 14, color: "rgba(255,255,255,0.6)", fontWeight: "600" },
  webLeftDivider:  { width: 40, height: 2, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 1 },
  webLeftDesc:     { fontSize: 14, color: "rgba(255,255,255,0.5)", lineHeight: 22 },
  webRight:        { flex: 1, alignItems: "center", justifyContent: "center", padding: 48 },
});

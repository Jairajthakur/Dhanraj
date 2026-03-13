import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Stack, router } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";

export default function RepoLayout() {
  const { logout } = useAuth();

  const handleLogout = async () => {
    try { await logout(); router.replace("/login"); } catch {}
  };

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.surface },
        headerTintColor: Colors.text,
        headerTitleStyle: { fontWeight: "700" },
        headerShadowVisible: false,
        headerTitle: () => (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={styles.iconWrap}>
              <MaterialCommunityIcons name="eye-outline" size={16} color={Colors.primary} />
            </View>
            <Text style={{ color: Colors.text, fontSize: 15, fontWeight: "800" }}>Repo View</Text>
          </View>
        ),
        headerRight: () => (
          <Pressable onPress={handleLogout} style={styles.logoutBtn}>
            <View style={styles.logoutWrap}>
              <Ionicons name="log-out-outline" size={18} color={Colors.danger} />
            </View>
          </Pressable>
        ),
      }}
    >
      <Stack.Screen name="index" />
    </Stack>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.primary + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  logoutBtn: { marginRight: -4 },
  logoutWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.danger + "18",
    alignItems: "center",
    justifyContent: "center",
  },
});

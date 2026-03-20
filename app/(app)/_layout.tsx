import React, { useState } from "react";
import {
  View, Text, Pressable, StyleSheet, Modal,
  Animated, ScrollView, Platform, Alert,
} from "react-native";
import { Stack, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";

// ✅ expo-notifications and registerPushToken completely removed
// OneSignal handles everything via usePushNotifications() in root _layout.tsx

// ─── Menu items ──────────────────────────────────────────────────────────────
const MENU_ITEMS = [
  { key: "dashboard",       label: "Dashboard",       icon: "home"             as const, screen: "/(app)/dashboard" },
  { key: "allocation",      label: "My Cases",        icon: "list"             as const, screen: "/(app)/allocation" },
  { key: "ready-payment",   label: "Ready Payment",   icon: "phone-portrait"   as const, screen: "/(app)/ready-payment" },
  { key: "deposition",      label: "Deposition",      icon: "cash"             as const, screen: "/(app)/deposition" },
  { key: "performance",     label: "Performance",     icon: "stats-chart"      as const, screen: "/(app)/performance" },
  { key: "id-card",         label: "ID Card",         icon: "card"             as const, screen: "/(app)/id-card" },
  { key: "attendance",      label: "Attendance",      icon: "checkmark-circle" as const, screen: "attendance" },
  { key: "salary",          label: "Salary",          icon: "wallet"           as const, screen: "/(app)/salary" },
  { key: "change-password", label: "Change Password", icon: "lock-closed"      as const, screen: "/(app)/change-password" },
];

// ─── Attendance Modal ────────────────────────────────────────────────────────
function AttendanceModal({
  visible, onClose,
}: { visible: boolean; onClose: () => void }) {
  const [loading, setLoading] = useState(false);

  const handle = async (type: "in" | "out") => {
    setLoading(true);
    try {
      if (type === "in") {
        await api.checkIn();
        Alert.alert("Success", "Checked in successfully!");
      } else {
        await api.checkOut();
        Alert.alert("Success", "Checked out successfully!");
      }
      onClose();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <View style={styles.attendanceCard}>
          <View style={styles.attHeader}>
            <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />
            <Text style={styles.attTitle}>Mark Attendance</Text>
          </View>
          <Pressable
            style={[styles.attBtn, { borderTopWidth: 1, borderTopColor: Colors.border }]}
            onPress={() => handle("in")}
            disabled={loading}
          >
            <Ionicons name="log-in-outline" size={20} color={Colors.success} />
            <Text style={[styles.attBtnText, { color: Colors.success }]}>CHECK IN</Text>
          </Pressable>
          <Pressable
            style={[styles.attBtn, { borderTopWidth: 1, borderTopColor: Colors.border }]}
            onPress={() => handle("out")}
            disabled={loading}
          >
            <Ionicons name="log-out-outline" size={20} color={Colors.warning} />
            <Text style={[styles.attBtnText, { color: Colors.warning }]}>CHECK OUT</Text>
          </Pressable>
          <Pressable
            style={[styles.attBtn, { borderTopWidth: 1, borderTopColor: Colors.border }]}
            onPress={onClose}
          >
            <Text style={[styles.attBtnText, { color: Colors.textSecondary }]}>CANCEL</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

// ─── Drawer ──────────────────────────────────────────────────────────────────
function Drawer({
  visible, onClose, agentName,
}: { visible: boolean; onClose: () => void; agentName: string }) {
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();
  const [attVisible, setAttVisible] = useState(false);

  const handleNav = (item: typeof MENU_ITEMS[0]) => {
    if (Platform.OS !== "web") {
      try {
        const Haptics = require("expo-haptics");
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (_) {}
    }
    onClose();
    if (item.key === "attendance") {
      setTimeout(() => setAttVisible(true), 300);
    } else {
      router.push(item.screen as any);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      router.replace("/login");
    } catch {}
  };

  const initials = agentName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <>
      <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
        <View style={styles.drawerOverlay}>
          <Pressable style={styles.drawerBackdrop} onPress={onClose} />
          <Animated.View style={[styles.drawerContainer, { paddingBottom: insets.bottom + 16 }]}>
            <View style={[styles.drawerHeader, { paddingTop: insets.top + 20 }]}>
              <View style={styles.drawerAvatarCircle}>
                <Text style={styles.drawerAvatarText}>{initials}</Text>
              </View>
              <View style={styles.drawerHeaderInfo}>
                <Text style={styles.drawerName} numberOfLines={1}>{agentName}</Text>
                <View style={styles.drawerRoleBadge}>
                  <Text style={styles.drawerRoleText}>Field Officer</Text>
                </View>
              </View>
            </View>
            <ScrollView style={styles.drawerMenu} showsVerticalScrollIndicator={false}>
              <View style={styles.menuSection}>
                {MENU_ITEMS.map((item) => (
                  <Pressable
                    key={item.key}
                    style={({ pressed }) => [
                      styles.drawerItem,
                      pressed && styles.drawerItemPressed,
                    ]}
                    onPress={() => handleNav(item)}
                  >
                    <View style={styles.drawerIconWrap}>
                      <Ionicons name={item.icon} size={18} color={Colors.primary} />
                    </View>
                    <Text style={styles.drawerItemText}>{item.label}</Text>
                    <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
                  </Pressable>
                ))}
              </View>
              <View style={[styles.menuSection, { marginTop: 8 }]}>
                <Pressable
                  style={({ pressed }) => [
                    styles.drawerItem,
                    pressed && styles.drawerItemPressed,
                  ]}
                  onPress={handleLogout}
                >
                  <View style={[styles.drawerIconWrap, { backgroundColor: Colors.danger + "18" }]}>
                    <Ionicons name="log-out-outline" size={18} color={Colors.danger} />
                  </View>
                  <Text style={[styles.drawerItemText, { color: Colors.danger }]}>Logout</Text>
                </Pressable>
              </View>
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
      <AttendanceModal visible={attVisible} onClose={() => setAttVisible(false)} />
    </>
  );
}

// ─── App Layout ──────────────────────────────────────────────────────────────
export default function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { agent } = useAuth();

  // ✅ Push token registration is handled by OneSignal in root _layout.tsx
  // via usePushNotifications() hook — no need to do anything here

  return (
    <>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: Colors.surface },
          headerTintColor: Colors.text,
          headerTitleStyle: { fontWeight: "700", fontSize: 16, color: Colors.text },
          headerShadowVisible: false,
          headerLeft: () => (
            <Pressable
              onPress={() => setDrawerOpen(true)}
              style={styles.headerMenuBtn}
            >
              <Ionicons name="menu" size={24} color={Colors.text} />
            </Pressable>
          ),
          headerTitle: () => (
            <Text
              style={{
                color: Colors.primary,
                fontSize: 15,
                fontWeight: "800",
                letterSpacing: 0.5,
              }}
              numberOfLines={1}
            >
              {agent?.name?.toUpperCase() || "FOS"}
            </Text>
          ),
          headerRight: () => (
            <View style={styles.headerLogo}>
              <Ionicons name="logo-usd" size={16} color={Colors.primary} />
            </View>
          ),
        }}
      >
        <Stack.Screen name="dashboard" />
        <Stack.Screen name="allocation" />
        <Stack.Screen
          name="customer/[id]"
          options={{ headerLeft: undefined, headerBackTitle: "Back" }}
        />
        <Stack.Screen name="performance" />
        <Stack.Screen name="salary" />
        <Stack.Screen name="id-card" />
        <Stack.Screen name="ready-payment" />
        <Stack.Screen name="deposition" />
        <Stack.Screen name="depositions" />
        <Stack.Screen name="change-password" />
      </Stack>
      <Drawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        agentName={agent?.name || "Agent"}
      />
    </>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  headerMenuBtn: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
    backgroundColor: Colors.surfaceAlt, marginLeft: -4,
  },
  headerLogo: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
    backgroundColor: Colors.primary + "18",
  },
  drawerOverlay: { flex: 1, flexDirection: "row" },
  drawerBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)" },
  drawerContainer: {
    width: "82%", maxWidth: 310, backgroundColor: Colors.surface,
    position: "absolute", left: 0, top: 0, bottom: 0,
    borderRightWidth: 1, borderRightColor: Colors.borderLight,
  },
  drawerHeader: {
    backgroundColor: Colors.background, paddingHorizontal: 20,
    paddingBottom: 24, flexDirection: "row", alignItems: "center",
    gap: 14, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  drawerAvatarCircle: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: Colors.surfaceElevated,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: Colors.border,
  },
  drawerAvatarText: { color: Colors.text, fontSize: 20, fontWeight: "800" },
  drawerHeaderInfo: { flex: 1, gap: 6 },
  drawerName: { color: Colors.text, fontSize: 16, fontWeight: "800", letterSpacing: -0.2 },
  drawerRoleBadge: {
    backgroundColor: Colors.border, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start",
  },
  drawerRoleText: {
    color: Colors.textSecondary, fontSize: 11,
    fontWeight: "700", letterSpacing: 0.5,
  },
  drawerMenu: { flex: 1, paddingTop: 8 },
  menuSection: {
    marginHorizontal: 12, backgroundColor: Colors.surfaceAlt,
    borderRadius: 14, overflow: "hidden",
    borderWidth: 1, borderColor: Colors.border,
  },
  drawerItem: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 14, gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  drawerItemPressed: { backgroundColor: Colors.border },
  drawerIconWrap: {
    width: 32, height: 32, borderRadius: 9,
    backgroundColor: Colors.primary + "18",
    alignItems: "center", justifyContent: "center",
  },
  drawerItemText: { flex: 1, fontSize: 14, color: Colors.text, fontWeight: "600" },
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center", alignItems: "center",
  },
  attendanceCard: {
    width: 300, backgroundColor: Colors.surface,
    borderRadius: 20, overflow: "hidden",
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  attHeader: {
    flexDirection: "row", alignItems: "center",
    gap: 10, padding: 20, paddingBottom: 18,
  },
  attTitle: { fontSize: 17, fontWeight: "700", color: Colors.text },
  attBtn: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 10, paddingVertical: 18,
  },
  attBtnText: { fontSize: 14, fontWeight: "800", letterSpacing: 1 },
});

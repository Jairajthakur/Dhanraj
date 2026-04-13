import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, Modal, ScrollView } from "react-native";
import { Stack, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import * as Haptics from "expo-haptics";

const ADMIN_MENU = [
  { key: "dashboard",   label: "Dashboard",        icon: "home"             as const, screen: "/(admin)"                },
  { key: "cases",       label: "All Cases",         icon: "list"             as const, screen: "/(admin)/all-cases"      },
  { key: "bkt",         label: "BKT Performance",   icon: "layers"           as const, screen: "/(admin)/bkt-cases"      },
  { key: "drr",         label: "DRR / Targets",     icon: "trending-up"      as const, screen: "/(admin)/drr"            },
  { key: "agency",      label: "Agency Target",     icon: "trophy"           as const, screen: "/(admin)/agency-target"  },
  { key: "salary",      label: "Salary Management", icon: "wallet"           as const, screen: "/(admin)/salary"         },
  { key: "depositions", label: "Depositions",       icon: "cash"             as const, screen: "/(admin)/depositions"    },
  { key: "attendance",  label: "Attendance",        icon: "checkmark-circle" as const, screen: "/(admin)/attendance"     },
  { key: "receipts",      label: "Receipt Requests", icon: "receipt-outline"    as const, screen: "/(admin)/receipt-requests" },
  { key: "live-activity", label: "Live Activity",    icon: "pulse"              as const, screen: "/(admin)/live-activity" },
  { key: "field-visits", label: "Field Visits", icon: "map", screen: "/(admin)/field-visits" }
];

function AdminDrawer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();

  const handleNav = (screen: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
    router.push(screen as any);
  };

  const handleLogout = async () => {
    try { await logout(); router.replace("/login"); } catch {}
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.drawerOverlay}>
        <Pressable style={styles.drawerBackdrop} onPress={onClose} />
        <View style={[styles.drawerContainer, { paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.drawerHeader, { paddingTop: insets.top + 20 }]}>
            <View style={styles.drawerAvatarCircle}>
              <MaterialIcons name="admin-panel-settings" size={26} color="#fff" />
            </View>
            <View style={styles.drawerHeaderInfo}>
              <Text style={styles.drawerName}>Admin Panel</Text>
              <View style={styles.drawerRoleBadge}>
                <Text style={styles.drawerRoleText}>Administrator</Text>
              </View>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ paddingTop: 8 }}>
            <View style={styles.menuSection}>
              {ADMIN_MENU.map((item) => (
                <Pressable
                  key={item.key}
                  style={({ pressed }) => [styles.drawerItem, pressed && styles.drawerItemPressed]}
                  onPress={() => handleNav(item.screen)}
                >
                  <View style={[
                    styles.drawerIconWrap,
                    item.key === "drr" && { backgroundColor: Colors.primary + "25" },
                  ]}>
                    <Ionicons name={item.icon} size={18} color={Colors.primary} />
                  </View>
                  <Text style={styles.drawerItemText}>{item.label}</Text>
                  <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
                </Pressable>
              ))}
            </View>

            <View style={[styles.menuSection, { marginTop: 8 }]}>
              <Pressable
                style={({ pressed }) => [styles.drawerItem, pressed && styles.drawerItemPressed]}
                onPress={handleLogout}
              >
                <View style={[styles.drawerIconWrap, { backgroundColor: Colors.danger + "18" }]}>
                  <Ionicons name="log-out-outline" size={18} color={Colors.danger} />
                </View>
                <Text style={[styles.drawerItemText, { color: Colors.danger }]}>Logout</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function AdminLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: Colors.surface },
          headerTintColor: Colors.text,
          headerTitleStyle: { fontWeight: "700", color: Colors.text },
          headerShadowVisible: false,
          headerLeft: () => (
            <Pressable onPress={() => setDrawerOpen(true)} style={styles.headerMenuBtn}>
              <Ionicons name="menu" size={24} color={Colors.text} />
            </Pressable>
          ),
          headerTitle: () => (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={styles.headerIconWrap}>
                <MaterialIcons name="admin-panel-settings" size={16} color={Colors.primary} />
              </View>
              <Text style={{ color: Colors.text, fontSize: 15, fontWeight: "800" }}>Admin Panel</Text>
            </View>
          ),
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="all-cases" />
        <Stack.Screen name="bkt-cases" />
        <Stack.Screen name="drr" options={{ title: "DRR / Targets" }} />
        <Stack.Screen name="agency-target" />
        <Stack.Screen name="salary" />
        <Stack.Screen name="depositions" />
        <Stack.Screen name="attendance" />
        <Stack.Screen name="live-activity" options={{ title: "Live Activity" }} />
        <Stack.Screen name="agent/[id]" options={{ headerLeft: undefined, headerBackTitle: "Back" }} />
        <Stack.Screen name="receipt-requests" options={{ title: "Receipt Requests" }} />
      </Stack>
      <AdminDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  headerMenuBtn: {
    width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center",
    backgroundColor: Colors.surfaceAlt, marginLeft: -4,
  },
  headerIconWrap: {
    width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.primary + "18",
    alignItems: "center", justifyContent: "center",
  },
  drawerOverlay:    { flex: 1, flexDirection: "row" },
  drawerBackdrop:   { flex: 1, backgroundColor: "rgba(0,0,0,0.65)" },
  drawerContainer:  { width: "82%", maxWidth: 310, backgroundColor: Colors.surface, position: "absolute", left: 0, top: 0, bottom: 0, borderRightWidth: 1, borderRightColor: Colors.borderLight },
  drawerHeader:     { backgroundColor: Colors.primaryDeep, paddingHorizontal: 20, paddingBottom: 24, flexDirection: "row", alignItems: "center", gap: 14, borderBottomWidth: 1, borderBottomColor: Colors.primary + "30" },
  drawerAvatarCircle: { width: 54, height: 54, borderRadius: 27, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center", shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 6 },
  drawerHeaderInfo: { flex: 1, gap: 6 },
  drawerName:       { color: Colors.text, fontSize: 16, fontWeight: "800", letterSpacing: -0.2 },
  drawerRoleBadge:  { backgroundColor: Colors.accent + "25", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start" },
  drawerRoleText:   { color: Colors.accent, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  menuSection:      { marginHorizontal: 12, backgroundColor: Colors.surfaceAlt, borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: Colors.border },
  drawerItem:       { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 14, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  drawerItemPressed:{ backgroundColor: Colors.border },
  drawerIconWrap:   { width: 32, height: 32, borderRadius: 9, backgroundColor: Colors.primary + "18", alignItems: "center", justifyContent: "center" },
  drawerItemText:   { flex: 1, fontSize: 14, color: Colors.text, fontWeight: "600" },
  newBadge:         { backgroundColor: Colors.accent, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  newBadgeText:     { fontSize: 9, fontWeight: "800", color: "#fff", letterSpacing: 0.5 },
});

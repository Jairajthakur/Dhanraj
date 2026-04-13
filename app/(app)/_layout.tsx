// app/(app)/_layout.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  Animated,
  ScrollView,
  Platform,
  Alert,
} from "react-native";
import { Stack, Tabs, router, useSegments } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";

// ─── Drawer menu items ────────────────────────────────────────────────────────
const MENU_ITEMS = [
  { key: "dashboard",         label: "Dashboard",          icon: "home"             as const, screen: "/(app)/dashboard" },
  { key: "drr",               label: "DRR / Targets",      icon: "trending-up"      as const, screen: "/(app)/drr" },
  { key: "ready-payment",     label: "Ready Payment",      icon: "phone-portrait"   as const, screen: "/(app)/ready-payment" },
  { key: "deposition",        label: "Deposition",         icon: "cash"             as const, screen: "/(app)/deposition" },
  { key: "performance",       label: "Performance",        icon: "stats-chart"      as const, screen: "/(app)/performance" },
  { key: "id-card",           label: "ID Card",            icon: "card"             as const, screen: "/(app)/id-card" },
  { key: "attendance",        label: "Attendance",         icon: "checkmark-circle" as const, screen: "attendance" },
  { key: "salary",            label: "Salary",             icon: "wallet"           as const, screen: "/(app)/salary" },
  { key: "change-password",   label: "Change Password",    icon: "lock-closed"      as const, screen: "/(app)/change-password" },
  { key: "online-collection", label: "Online Collection",  icon: "card"             as const, screen: "/(app)/online-collection" },
  { key: "visit-log",         label: "Visit Log",          icon: "map"              as const, screen: "/(app)/visit-log" },
];

// ─── Attendance Modal ─────────────────────────────────────────────────────────
function AttendanceModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const handle = async (type: "in" | "out") => {
    setLoading(true);
    try {
      if (type === "in") { await api.checkIn();  Alert.alert("Success", "Checked in successfully!"); }
      else               { await api.checkOut(); Alert.alert("Success", "Checked out successfully!"); }
      onClose();
    } catch (e: any) { Alert.alert("Error", e.message); }
    finally { setLoading(false); }
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <View style={styles.attendanceCard}>
          <View style={styles.attHeader}>
            <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />
            <Text style={styles.attTitle}>Mark Attendance</Text>
          </View>
          <Pressable style={[styles.attBtn, { borderTopWidth: 1, borderTopColor: Colors.border }]} onPress={() => handle("in")} disabled={loading}>
            <Ionicons name="log-in-outline" size={20} color={Colors.success} />
            <Text style={[styles.attBtnText, { color: Colors.success }]}>CHECK IN</Text>
          </Pressable>
          <Pressable style={[styles.attBtn, { borderTopWidth: 1, borderTopColor: Colors.border }]} onPress={() => handle("out")} disabled={loading}>
            <Ionicons name="log-out-outline" size={20} color={Colors.warning} />
            <Text style={[styles.attBtnText, { color: Colors.warning }]}>CHECK OUT</Text>
          </Pressable>
          <Pressable style={[styles.attBtn, { borderTopWidth: 1, borderTopColor: Colors.border }]} onPress={onClose}>
            <Text style={[styles.attBtnText, { color: Colors.textSecondary }]}>CANCEL</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

// ─── Drawer ───────────────────────────────────────────────────────────────────
function Drawer({
  visible,
  onClose,
  agentName,
}: {
  visible: boolean;
  onClose: () => void;
  agentName: string;
}) {
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();
  const [attVisible, setAttVisible] = useState(false);

  const handleNav = (item: (typeof MENU_ITEMS)[0]) => {
    if (Platform.OS !== "web") {
      try { const Haptics = require("expo-haptics"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (_) {}
    }
    onClose();
    if (item.key === "attendance") { setTimeout(() => setAttVisible(true), 300); }
    else { router.push(item.screen as any); }
  };

  const handleLogout = async () => {
    try { await logout(); router.replace("/(app)/login"); } catch {}
  };

  const initials = agentName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

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
                  <Pressable key={item.key} style={({ pressed }) => [styles.drawerItem, pressed && styles.drawerItemPressed]} onPress={() => handleNav(item)}>
                    <View style={styles.drawerIconWrap}>
                      <Ionicons name={item.icon} size={18} color={Colors.primary} />
                    </View>
                    <Text style={styles.drawerItemText}>{item.label}</Text>
                    <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
                  </Pressable>
                ))}
              </View>
              <View style={[styles.menuSection, { marginTop: 8 }]}>
                <Pressable style={({ pressed }) => [styles.drawerItem, pressed && styles.drawerItemPressed]} onPress={handleLogout}>
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

// ─── Custom Tab Bar ───────────────────────────────────────────────────────────
// Only shown on the three main tabs, hidden on drill-down screens.
function CustomTabBar({
  state,
  descriptors,
  navigation,
  unreadCount,
}: {
  state: any;
  descriptors: any;
  navigation: any;
  unreadCount: number;
}) {
  const insets = useSafeAreaInsets();

  const TAB_CONFIG = [
    { name: "allocation", label: "My Cases",    icon: "list" as const },
    { name: "visit-log",  label: "Visit Log",   icon: "map" as const },
    { name: "notifications", label: "Alerts",  icon: "notifications" as const },
  ];

  return (
    <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {TAB_CONFIG.map((tab, idx) => {
        const route = state.routes.find((r: any) => r.name === tab.name);
        if (!route) return null;
        const routeIdx = state.routes.indexOf(route);
        const isFocused = state.index === routeIdx;
        const color = isFocused ? Colors.primary : Colors.textMuted;
        const hasUnread = tab.name === "notifications" && unreadCount > 0;

        const onPress = () => {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <Pressable
            key={tab.name}
            style={({ pressed }) => [styles.tabItem, pressed && { opacity: 0.7 }]}
            onPress={onPress}
            accessibilityLabel={tab.label}
          >
            <View style={styles.tabIconWrap}>
              <Ionicons
                name={isFocused ? tab.icon : (`${tab.icon}-outline` as any)}
                size={24}
                color={color}
              />
              {hasUnread && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.tabText, { color }]}>{tab.label}</Text>
            {isFocused && <View style={[styles.tabIndicator, { backgroundColor: Colors.primary }]} />}
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Root Layout ──────────────────────────────────────────────────────────────
export default function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { agent } = useAuth();
  const segments = useSegments();

  // Unread notification count for badge
  const { data: notifData } = useQuery<any[]>({
    queryKey: ["/api/agent/notifications"],
    queryFn: async () => {
      const res = await api.getAgentNotifications();
      return res.notifications ?? [];
    },
    refetchInterval: 60_000,
    enabled: !!agent,
  });
  const unreadCount = (notifData ?? []).filter((n: any) => !n.read).length;

  // Shared header options
  const sharedHeader = {
    headerStyle:      { backgroundColor: Colors.surface },
    headerTintColor:  Colors.text,
    headerTitleStyle: { fontWeight: "700" as const, fontSize: 16, color: Colors.text },
    headerShadowVisible: false,
    headerLeft: () => (
      <Pressable onPress={() => setDrawerOpen(true)} style={styles.headerMenuBtn}>
        <Ionicons name="menu" size={24} color={Colors.text} />
      </Pressable>
    ),
    headerTitle: () => (
      <Text style={{ color: Colors.primary, fontSize: 15, fontWeight: "800", letterSpacing: 0.5 }} numberOfLines={1}>
        {agent?.name?.toUpperCase() || "FOS"}
      </Text>
    ),
    headerRight: () => (
      <View style={styles.headerLogo}>
        <Ionicons name="logo-usd" size={16} color={Colors.primary} />
      </View>
    ),
  };

  return (
    <>
      {/*
        ── Bottom Tabs for the three main screens ──────────────────────────────
        All other screens (customer detail, deposition, etc.) are stacked on
        top via <Stack.Screen> inside each tab screen OR via push navigation,
        so the tab bar hides automatically when you go deeper.
      */}
      <Tabs
        tabBar={(props) => (
          <CustomTabBar {...props} unreadCount={unreadCount} />
        )}
        screenOptions={sharedHeader}
      >
        {/* Tab 1 — My Cases */}
        <Tabs.Screen
          name="allocation"
          options={{ title: "My Cases" }}
        />

        {/* Tab 2 — Visit Log */}
        <Tabs.Screen
          name="visit-log"
          options={{ title: "Visit Log" }}
        />

        {/* Tab 3 — Notifications */}
        <Tabs.Screen
          name="notifications"
          options={{ title: "Notifications", headerShown: false }}
        />

        {/* ── Non-tab screens (hidden from tab bar) ── */}
        <Tabs.Screen name="login"             options={{ href: null, headerShown: false }} />
        <Tabs.Screen name="dashboard"         options={{ href: null }} />
        <Tabs.Screen name="drr"               options={{ href: null, title: "DRR & Targets" }} />
        <Tabs.Screen name="customer/[id]"     options={{ href: null, headerLeft: undefined, headerBackTitle: "Back" }} />
        <Tabs.Screen name="performance"       options={{ href: null }} />
        <Tabs.Screen name="salary"            options={{ href: null }} />
        <Tabs.Screen name="id-card"           options={{ href: null }} />
        <Tabs.Screen name="ready-payment"     options={{ href: null }} />
        <Tabs.Screen name="deposition"        options={{ href: null }} />
        <Tabs.Screen name="depositions"       options={{ href: null }} />
        <Tabs.Screen name="change-password"   options={{ href: null }} />
        <Tabs.Screen name="online-collection" options={{ href: null, title: "Online Collection" }} />
        <Tabs.Screen name="bkt-cases"         options={{ href: null }} />
        <Tabs.Screen name="foreclose"         options={{ href: null }} />
      </Tabs>

      <Drawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        agentName={agent?.name || "Agent"}
      />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Header
  headerMenuBtn:      { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: Colors.surfaceAlt, marginLeft: -4 },
  headerLogo:         { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: Colors.primary + "18" },

  // Tab bar
  tabBar: {
    flexDirection: "row",
    flexWrap: "nowrap",
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 12,
  },
  tabItem:       { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
  tabIconWrap:   { position: "relative" },
  tabBadge:      { position: "absolute", top: -4, right: -8, backgroundColor: Colors.danger, borderRadius: 8, minWidth: 16, height: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  tabBadgeText:  { fontSize: 9, fontWeight: "800", color: "#fff" },
  tabText:       { fontSize: 10, fontWeight: "600" },
  tabIndicator:  { position: "absolute", top: -8, width: 20, height: 3, borderRadius: 2 },

  // Drawer
  drawerOverlay:      { flex: 1, flexDirection: "row" },
  drawerBackdrop:     { flex: 1, backgroundColor: "rgba(0,0,0,0.65)" },
  drawerContainer:    { width: "82%", maxWidth: 310, backgroundColor: Colors.surface, position: "absolute", left: 0, top: 0, bottom: 0, borderRightWidth: 1, borderRightColor: Colors.borderLight },
  drawerHeader:       { backgroundColor: Colors.background, paddingHorizontal: 20, paddingBottom: 24, flexDirection: "row", alignItems: "center", gap: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  drawerAvatarCircle: { width: 54, height: 54, borderRadius: 27, backgroundColor: Colors.surfaceElevated, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: Colors.border },
  drawerAvatarText:   { color: Colors.text, fontSize: 20, fontWeight: "800" },
  drawerHeaderInfo:   { flex: 1, gap: 6 },
  drawerName:         { color: Colors.text, fontSize: 16, fontWeight: "800", letterSpacing: -0.2 },
  drawerRoleBadge:    { backgroundColor: Colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start" },
  drawerRoleText:     { color: Colors.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  drawerMenu:         { flex: 1, paddingTop: 8 },
  menuSection:        { marginHorizontal: 12, backgroundColor: Colors.surfaceAlt, borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: Colors.border },
  drawerItem:         { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 14, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  drawerItemPressed:  { backgroundColor: Colors.border },
  drawerIconWrap:     { width: 32, height: 32, borderRadius: 9, backgroundColor: Colors.primary + "18", alignItems: "center", justifyContent: "center" },
  drawerItemText:     { flex: 1, fontSize: 14, color: Colors.text, fontWeight: "600" },

  // Attendance modal
  modalOverlay:       { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "center", alignItems: "center" },
  attendanceCard:     { width: 300, backgroundColor: Colors.surface, borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: Colors.borderLight },
  attHeader:          { flexDirection: "row", alignItems: "center", gap: 10, padding: 20, paddingBottom: 18 },
  attTitle:           { fontSize: 17, fontWeight: "700", color: Colors.text },
  attBtn:             { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 18 },
  attBtnText:         { fontSize: 14, fontWeight: "800", letterSpacing: 1 },
});

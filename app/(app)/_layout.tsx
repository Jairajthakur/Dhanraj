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
import { CompanyProvider, useCompany } from "@/context/CompanyContext";
import BlockingActionModal, { BlockingItem } from "@/components/BlockingActionModal";
import { useBlocking } from "@/context/BlockingContext";
import { api } from "@/lib/api"

// ─── Menu Items ───────────────────────────────────────────────────────────────
const MENU_ITEMS = [
  { key: "dashboard",       label: "Dashboard",       icon: "home"             as const, screen: "/(app)/dashboard" },
  { key: "allocation",      label: "My Cases",        icon: "list"             as const, screen: "/(app)/allocation" },
  { key: "drr",             label: "DRR / Targets",   icon: "trending-up"      as const, screen: "/(app)/drr" },
  { key: "ready-payment",   label: "Ready Payment",   icon: "phone-portrait"   as const, screen: "/(app)/ready-payment" },
  { key: "deposition",      label: "Deposition",      icon: "cash"             as const, screen: "/(app)/deposition" },
  { key: "performance",     label: "Performance",     icon: "stats-chart"      as const, screen: "/(app)/performance" },
  { key: "id-card",         label: "ID Card",         icon: "card"             as const, screen: "/(app)/id-card" },
  { key: "attendance",      label: "Attendance",      icon: "checkmark-circle" as const, screen: "attendance" },
  { key: "salary",          label: "Salary",          icon: "wallet"           as const, screen: "/(app)/salary" },
  { key: "change-password", label: "Change Password", icon: "lock-closed"      as const, screen: "/(app)/change-password" },
];

// ─── Attendance Modal ─────────────────────────────────────────────────────────
function AttendanceModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const handle = async (type: "in" | "out") => {
    setLoading(true);
    try {
      if (type === "in") { await api.checkIn(); Alert.alert("Success", "Checked in successfully!"); }
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

// ─── Company Badge in Header ──────────────────────────────────────────────────
function CompanyHeaderBadge({ onPress }: { onPress: () => void }) {
  const { selectedCompany, companies } = useCompany();
  if (companies.length < 2) return null;
  return (
    <Pressable style={styles.companyBadge} onPress={onPress}>
      <Ionicons name="business" size={12} color={Colors.primary} />
      <Text style={styles.companyBadgeText} numberOfLines={1}>
        {selectedCompany ?? "All"}
      </Text>
      <Ionicons name="chevron-down" size={11} color={Colors.primary} />
    </Pressable>
  );
}

// ─── Company Picker Modal ─────────────────────────────────────────────────────
function CompanyPickerModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { companies, selectedCompany, setSelectedCompany } = useCompany();

  const handleSelect = (c: string | null) => {
    setSelectedCompany(c);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.companyPickerCard} onPress={() => {}}>
          <View style={styles.attHeader}>
            <Ionicons name="business" size={22} color={Colors.primary} />
            <Text style={styles.attTitle}>Select Company</Text>
          </View>

          {/* "All" option */}
          <Pressable
            style={[styles.companyOption, selectedCompany === null && styles.companyOptionActive]}
            onPress={() => handleSelect(null)}
          >
            <Ionicons
              name={selectedCompany === null ? "checkmark-circle" : "ellipse-outline"}
              size={18}
              color={selectedCompany === null ? Colors.primary : Colors.textMuted}
            />
            <Text style={[styles.companyOptionText, selectedCompany === null && styles.companyOptionTextActive]}>
              All Companies
            </Text>
          </Pressable>

          {companies.map((c) => (
            <Pressable
              key={c}
              style={[styles.companyOption, selectedCompany === c && styles.companyOptionActive]}
              onPress={() => handleSelect(c)}
            >
              <Ionicons
                name={selectedCompany === c ? "checkmark-circle" : "ellipse-outline"}
                size={18}
                color={selectedCompany === c ? Colors.primary : Colors.textMuted}
              />
              <Text style={[styles.companyOptionText, selectedCompany === c && styles.companyOptionTextActive]}>
                {c}
              </Text>
            </Pressable>
          ))}

          <Pressable style={[styles.attBtn, { borderTopWidth: 1, borderTopColor: Colors.border, marginTop: 4 }]} onPress={onClose}>
            <Text style={[styles.attBtnText, { color: Colors.textSecondary }]}>CANCEL</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Drawer ───────────────────────────────────────────────────────────────────
function Drawer({
  visible, onClose, agentName,
  onOpenCompanyPicker,
}: {
  visible: boolean;
  onClose: () => void;
  agentName: string;
  onOpenCompanyPicker: () => void;
}) {
  const insets                          = useSafeAreaInsets();
  const { logout }                      = useAuth();
  const { selectedCompany, companies }  = useCompany();
  const [attVisible, setAttVisible]     = useState(false);

  const handleNav = (item: typeof MENU_ITEMS[0]) => {
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
            {/* Header */}
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

            {/* Company selector (only shown if multiple companies) */}
            {companies.length >= 2 && (
              <Pressable style={styles.companyDrawerRow} onPress={() => { onClose(); setTimeout(onOpenCompanyPicker, 300); }}>
                <View style={[styles.drawerIconWrap, { backgroundColor: Colors.primary + "20" }]}>
                  <Ionicons name="business" size={18} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.drawerItemText}>Company</Text>
                  <Text style={styles.companyDrawerSub}>{selectedCompany ?? "All Companies"}</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
              </Pressable>
            )}

            <ScrollView style={styles.drawerMenu} showsVerticalScrollIndicator={false}>
              <View style={styles.menuSection}>
                {MENU_ITEMS.map((item) => (
                  <Pressable
                    key={item.key}
                    style={({ pressed }) => [styles.drawerItem, pressed && styles.drawerItemPressed]}
                    onPress={() => handleNav(item)}
                  >
                    <View style={[styles.drawerIconWrap, item.key === "drr" && { backgroundColor: Colors.primary + "25" }]}>
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
          </Animated.View>
        </View>
      </Modal>
      <AttendanceModal visible={attVisible} onClose={() => setAttVisible(false)} />
    </>
  );
}

// ─── Inner Layout (has access to CompanyContext) ──────────────────────────────
function AppLayoutInner() {
  const [drawerOpen,        setDrawerOpen]        = useState(false);
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const { agent }                                  = useAuth();
  const { items: blockingItems, isBlocking, snooze } = useBlocking();

  const handleBlockingItemPress = (item: BlockingItem) => {
    // Snooze the modal so the agent can actually see and interact with the case.
    // The modal will reappear after 1 hour (or immediately on next refetch if
    // the PTP is still unresolved). Once the agent submits updated feedback the
    // broken_ptp flag is cleared on the server and the modal won't come back.
    snooze();
    if (item.type === "overdue_deposition") {
      router.push("/(app)/deposition" as any);
    } else {
      // Pass ALL broken PTP ids (comma-separated) so allocation highlights every
      // unresolved broken-PTP case — not just the one the agent tapped.
      const allBrokenPtpIds = blockingItems
        .filter((i) => i.type === "broken_ptp")
        .map((i) => i.id)
        .join(",");
      router.push({
        pathname: "/(app)/allocation" as any,
        params:   { brokenPtpIds: allBrokenPtpIds },
      });
    }
  };
  return (
    <>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: Colors.surface },
          headerTintColor: Colors.text,
          headerTitleStyle: { fontWeight: "700", fontSize: 16, color: Colors.text },
          headerShadowVisible: false,
          headerLeft: () => (
            <Pressable onPress={() => setDrawerOpen(true)} style={styles.headerMenuBtn}>
              <Ionicons name="menu" size={24} color={Colors.text} />
            </Pressable>
          ),
          headerTitle: () => (
            <View style={{ alignItems: "center", gap: 1 }}>
              <Text style={{ color: Colors.primary, fontSize: 15, fontWeight: "800", letterSpacing: 0.5 }} numberOfLines={1}>
                {agent?.name?.toUpperCase() || "FOS"}
              </Text>
              <CompanyHeaderBadge onPress={() => setCompanyPickerOpen(true)} />
            </View>
          ),
          headerRight: () => (
            <View style={styles.headerLogo}>
              <Ionicons name="logo-usd" size={16} color={Colors.primary} />
            </View>
          ),
        }}
      >
        <Stack.Screen name="login"            options={{ headerShown: false }} />
        <Stack.Screen name="dashboard" />
        <Stack.Screen name="allocation" />
        <Stack.Screen name="drr"              options={{ title: "DRR & Targets" }} />
        <Stack.Screen name="customer/[id]"    options={{ headerLeft: undefined, headerBackTitle: "Back" }} />
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
        onOpenCompanyPicker={() => setCompanyPickerOpen(true)}
      />

      <CompanyPickerModal
        visible={companyPickerOpen}
        onClose={() => setCompanyPickerOpen(false)}
      />

      {!!agent && agent.role === "fos" && (
        <BlockingActionModal
          visible={isBlocking}
          items={blockingItems}
          onDismiss={snooze}
          onGoToCase={handleBlockingItemPress}
        />
      )}
    </>
  );
}

// ─── Root Layout Export ───────────────────────────────────────────────────────
export default function AppLayout() {
  return (
    <CompanyProvider>
      <AppLayoutInner />
    </CompanyProvider>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  headerMenuBtn:        { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: Colors.surfaceAlt, marginLeft: -4 },
  headerLogo:           { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: Colors.primary + "18" },

  // Company badge in header
  companyBadge:         { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: Colors.primary + "12", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + "30" },
  companyBadgeText:     { fontSize: 10, fontWeight: "700", color: Colors.primary, maxWidth: 90 },

  // Drawer
  drawerOverlay:        { flex: 1, flexDirection: "row" },
  drawerBackdrop:       { flex: 1, backgroundColor: "rgba(0,0,0,0.65)" },
  drawerContainer:      { width: "82%", maxWidth: 310, backgroundColor: Colors.surface, position: "absolute", left: 0, top: 0, bottom: 0, borderRightWidth: 1, borderRightColor: Colors.borderLight },
  drawerHeader:         { backgroundColor: Colors.background, paddingHorizontal: 20, paddingBottom: 24, flexDirection: "row", alignItems: "center", gap: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  drawerAvatarCircle:   { width: 54, height: 54, borderRadius: 27, backgroundColor: Colors.surfaceElevated, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: Colors.border },
  drawerAvatarText:     { color: Colors.text, fontSize: 20, fontWeight: "800" },
  drawerHeaderInfo:     { flex: 1, gap: 6 },
  drawerName:           { color: Colors.text, fontSize: 16, fontWeight: "800", letterSpacing: -0.2 },
  drawerRoleBadge:      { backgroundColor: Colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start" },
  drawerRoleText:       { color: Colors.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  drawerMenu:           { flex: 1, paddingTop: 8 },
  menuSection:          { marginHorizontal: 12, backgroundColor: Colors.surfaceAlt, borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: Colors.border },
  drawerItem:           { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 14, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  drawerItemPressed:    { backgroundColor: Colors.border },
  drawerIconWrap:       { width: 32, height: 32, borderRadius: 9, backgroundColor: Colors.primary + "18", alignItems: "center", justifyContent: "center" },
  drawerItemText:       { flex: 1, fontSize: 14, color: Colors.text, fontWeight: "600" },

  // Company drawer row
  companyDrawerRow:     { flexDirection: "row", alignItems: "center", marginHorizontal: 12, marginTop: 10, marginBottom: 4, backgroundColor: Colors.primary + "08", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, gap: 12, borderWidth: 1, borderColor: Colors.primary + "25" },
  companyDrawerSub:     { fontSize: 11, color: Colors.primary, fontWeight: "600", marginTop: 1 },

  // Modals
  modalOverlay:         { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "center", alignItems: "center" },
  attendanceCard:       { width: 300, backgroundColor: Colors.surface, borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: Colors.borderLight },
  attHeader:            { flexDirection: "row", alignItems: "center", gap: 10, padding: 20, paddingBottom: 18 },
  attTitle:             { fontSize: 17, fontWeight: "700", color: Colors.text },
  attBtn:               { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 18 },
  attBtnText:           { fontSize: 14, fontWeight: "800", letterSpacing: 1 },

  // Company picker
  companyPickerCard:    { width: "88%", maxWidth: 340, backgroundColor: Colors.surface, borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: Colors.border },
  companyOption:        { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  companyOptionActive:  { backgroundColor: Colors.primary + "08" },
  companyOptionText:    { fontSize: 14, color: Colors.text, fontWeight: "600", flex: 1 },
  companyOptionTextActive: { color: Colors.primary, fontWeight: "700" },
});

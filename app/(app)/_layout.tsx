import React, { useState } from "react";
import {
  View, Text, Pressable, StyleSheet, Modal,
  ScrollView, Platform, Alert, useWindowDimensions,
} from "react-native";
import { Stack, router, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { CompanyProvider, useCompany } from "@/context/CompanyContext";
import BlockingActionModal, { BlockingItem } from "@/components/BlockingActionModal";
import { useBlocking } from "@/context/BlockingContext";
import { api } from "@/lib/api";

const isWeb = Platform.OS === "web";

const MENU_ITEMS = [
  { key: "dashboard",       label: "Dashboard",       icon: "home"             as const, screen: "/(app)/dashboard" },
  { key: "allocation",      label: "My Cases",        icon: "list"             as const, screen: "/(app)/allocation" },
  { key: "drr",             label: "DRR / Targets",   icon: "trending-up"      as const, screen: "/(app)/drr" },
  { key: "ready-payment",   label: "Ready Payment",   icon: "phone-portrait"   as const, screen: "/(app)/ready-payment" },
  { key: "deposition",      label: "Deposition",      icon: "cash"             as const, screen: "/(app)/deposition" },
  { key: "performance",     label: "Performance",     icon: "stats-chart"      as const, screen: "/(app)/performance" },
  { key: "id-card",         label: "ID Card",         icon: "card"             as const, screen: "/(app)/id-card" },
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
            <View style={styles.attIconWrap}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
            </View>
            <Text style={styles.attTitle}>Mark Attendance</Text>
          </View>
          {[
            { type: "in" as const, label: "CHECK IN",  icon: "log-in-outline"  as const, color: Colors.success },
            { type: "out" as const, label: "CHECK OUT", icon: "log-out-outline" as const, color: Colors.warning },
          ].map((btn) => (
            <Pressable
              key={btn.type}
              style={({ pressed, hovered }: any) => [styles.attBtn, (pressed || hovered) && styles.attBtnHover]}
              onPress={() => handle(btn.type)}
              disabled={loading}
            >
              <Ionicons name={btn.icon} size={18} color={btn.color} />
              <Text style={[styles.attBtnText, { color: btn.color }]}>{btn.label}</Text>
            </Pressable>
          ))}
          <Pressable style={[styles.attBtn, { borderTopWidth: 1, borderTopColor: Colors.border }]} onPress={onClose}>
            <Text style={[styles.attBtnText, { color: Colors.textSecondary }]}>CANCEL</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

// ─── Sidebar Content ──────────────────────────────────────────────────────────
function SidebarContent({
  onClose,
  currentPath,
  onAttendance,
}: {
  onClose?: () => void;
  currentPath?: string;
  onAttendance: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { logout, agent } = useAuth();
  const { selectedCompany, companies, setSelectedCompany } = useCompany();

  const handleNav = (screen: string) => {
    onClose?.();
    router.push(screen as any);
  };

  const handleLogout = async () => {
    try { await logout(); router.replace("/login"); } catch {}
  };

  return (
    <View style={[sb.container, isWeb && sb.containerWeb]}>
      {/* Header */}
      <View style={[sb.header, !isWeb && { paddingTop: insets.top + 20 }]}>
        <View style={sb.avatarCircle}>
          <Text style={sb.avatarText}>
            {agent?.name?.charAt(0)?.toUpperCase() ?? "F"}
          </Text>
        </View>
        <View style={sb.headerInfo}>
          <Text style={sb.headerName} numberOfLines={1}>{agent?.name ?? "FOS Agent"}</Text>
          <View style={sb.roleBadge}>
            <Text style={sb.roleText}>Field Officer</Text>
          </View>
          {selectedCompany && selectedCompany !== "All" && (
            <Text style={sb.companyText} numberOfLines={1}>{selectedCompany}</Text>
          )}
        </View>
        {onClose && !isWeb && (
          <Pressable onPress={onClose} style={sb.closeBtn}>
            <Ionicons name="close" size={20} color="rgba(255,255,255,0.7)" />
          </Pressable>
        )}
      </View>

      {/* Company filter */}
      {companies.length >= 2 && (
        <View style={sb.companyStrip}>
          <Text style={sb.companyStripLabel}>Company</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, flexDirection: "row" }}>
            <Pressable
              style={[sb.chip, (selectedCompany === "All" || !selectedCompany) && sb.chipActive]}
              onPress={() => setSelectedCompany("All")}
            >
              <Text style={[sb.chipText, (selectedCompany === "All" || !selectedCompany) && sb.chipTextActive]}>All</Text>
            </Pressable>
            {companies.map((c) => (
              <Pressable key={c} style={[sb.chip, selectedCompany === c && sb.chipActive]} onPress={() => setSelectedCompany(c)}>
                <Text style={[sb.chipText, selectedCompany === c && sb.chipTextActive]} numberOfLines={1}>{c}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1, paddingTop: 6 }}>
        <View style={sb.menuSection}>
          {MENU_ITEMS.map((item, i) => {
            const isActive = currentPath?.includes(item.key) || currentPath === item.screen;
            return (
              <Pressable
                key={item.key}
                style={({ pressed, hovered }: any) => [
                  sb.menuItem,
                  i < MENU_ITEMS.length - 1 && sb.menuItemBorder,
                  isActive && sb.menuItemActive,
                  (pressed || hovered) && !isActive && sb.menuItemHover,
                ]}
                onPress={() => handleNav(item.screen)}
              >
                <View style={[sb.iconWrap, isActive && sb.iconWrapActive]}>
                  <Ionicons name={item.icon} size={17} color={isActive ? "#fff" : Colors.primary} />
                </View>
                <Text style={[sb.menuItemText, isActive && sb.menuItemTextActive]}>{item.label}</Text>
                {isActive && <View style={sb.activeDot} />}
              </Pressable>
            );
          })}

          {/* Attendance */}
          <Pressable
            style={({ pressed, hovered }: any) => [sb.menuItem, (pressed || hovered) && sb.menuItemHover]}
            onPress={() => { onClose?.(); onAttendance(); }}
          >
            <View style={sb.iconWrap}>
              <Ionicons name="checkmark-circle" size={17} color={Colors.primary} />
            </View>
            <Text style={sb.menuItemText}>Attendance</Text>
          </Pressable>
        </View>

        <View style={[sb.menuSection, { marginTop: 8, marginBottom: 24 }]}>
          <Pressable
            style={({ pressed, hovered }: any) => [sb.menuItem, (pressed || hovered) && sb.menuItemHover]}
            onPress={handleLogout}
          >
            <View style={[sb.iconWrap, { backgroundColor: Colors.danger + "18" }]}>
              <Ionicons name="log-out-outline" size={17} color={Colors.danger} />
            </View>
            <Text style={[sb.menuItemText, { color: Colors.danger }]}>Logout</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const sb = StyleSheet.create({
  container:        { flex: 1, backgroundColor: Colors.surface, borderRightWidth: 1, borderRightColor: Colors.border },
  containerWeb:     { width: 240 },
  header:           { backgroundColor: Colors.primaryDeep, paddingHorizontal: 18, paddingTop: 28, paddingBottom: 20, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: Colors.primary + "30" },
  avatarCircle:     { width: 46, height: 46, borderRadius: 23, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  avatarText:       { color: "#fff", fontSize: 20, fontWeight: "800" },
  headerInfo:       { flex: 1, gap: 5 },
  headerName:       { color: "#fff", fontSize: 15, fontWeight: "800" },
  roleBadge:        { backgroundColor: Colors.accent + "25", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, alignSelf: "flex-start" },
  roleText:         { color: Colors.accent, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  companyText:      { color: "rgba(255,255,255,0.6)", fontSize: 11 },
  closeBtn:         { padding: 4 },
  companyStrip:     { marginHorizontal: 10, marginTop: 10, marginBottom: 4, backgroundColor: Colors.surfaceAlt, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: Colors.border, gap: 8 },
  companyStripLabel:{ fontSize: 10, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  chip:             { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  chipActive:       { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText:         { fontSize: 11, fontWeight: "600", color: Colors.textSecondary },
  chipTextActive:   { color: "#fff" },
  menuSection:      { marginHorizontal: 10, backgroundColor: Colors.surfaceAlt, borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: Colors.border, marginBottom: 4 },
  menuItem:         { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 12, gap: 10 },
  menuItemBorder:   { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  menuItemActive:   { backgroundColor: Colors.primary + "10" },
  menuItemHover:    { backgroundColor: Colors.border },
  menuItemText:     { flex: 1, fontSize: 13, color: Colors.text, fontWeight: "600" },
  menuItemTextActive:{ color: Colors.primary, fontWeight: "700" },
  iconWrap:         { width: 30, height: 30, borderRadius: 8, backgroundColor: Colors.primary + "18", alignItems: "center", justifyContent: "center" },
  iconWrapActive:   { backgroundColor: Colors.primary },
  activeDot:        { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary },
});

// ─── Mobile Drawer ────────────────────────────────────────────────────────────
function MobileDrawer({
  visible, onClose, currentPath, onAttendance,
}: {
  visible: boolean; onClose: () => void; currentPath: string; onAttendance: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.drawerOverlay}>
        <Pressable style={styles.drawerBackdrop} onPress={onClose} />
        <View style={styles.drawerPanel}>
          <SidebarContent onClose={onClose} currentPath={currentPath} onAttendance={onAttendance} />
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Layout ──────────────────────────────────────────────────────────────
function AppLayoutInner() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [attVisible, setAttVisible] = useState(false);
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const { selectedCompany, companies } = useCompany();
  const { blockingItems } = useBlocking();

  const showSidebar = isWeb && width >= 768;

  const headerLeft = () => (
    showSidebar ? null : (
      <Pressable
        onPress={() => setDrawerOpen(true)}
        style={({ hovered }: any) => [styles.headerBtn, hovered && styles.headerBtnHover]}
      >
        <Ionicons name="menu" size={22} color={Colors.text} />
      </Pressable>
    )
  );

  const headerRight = () => (
    companies.length >= 2 && !showSidebar ? (
      <Pressable style={styles.companyBadge} onPress={() => setDrawerOpen(true)}>
        <Ionicons name="business" size={11} color={Colors.primary} />
        <Text style={styles.companyBadgeText} numberOfLines={1}>{selectedCompany ?? "All"}</Text>
        <Ionicons name="chevron-down" size={10} color={Colors.primary} />
      </Pressable>
    ) : null
  );

  return (
    <View style={styles.root}>
      {showSidebar && (
        <SidebarContent
          currentPath={pathname}
          onAttendance={() => setAttVisible(true)}
        />
      )}

      <View style={styles.content}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: Colors.surface },
            headerTintColor: Colors.text,
            headerTitleStyle: { fontWeight: "700", color: Colors.text },
            headerShadowVisible: false,
            headerLeft,
            headerRight,
          }}
        >
          <Stack.Screen name="dashboard" options={{ title: "Dashboard" }} />
          <Stack.Screen name="allocation" options={{ title: "My Cases" }} />
          <Stack.Screen name="customer/[id]" options={{ title: "Customer Details", headerLeft: undefined }} />
          <Stack.Screen name="drr" options={{ title: "DRR / Targets" }} />
          <Stack.Screen name="ready-payment" options={{ title: "Ready Payment" }} />
          <Stack.Screen name="deposition" options={{ title: "Deposition" }} />
          <Stack.Screen name="depositions" options={{ title: "Depositions" }} />
          <Stack.Screen name="performance" options={{ title: "Performance" }} />
          <Stack.Screen name="id-card" options={{ title: "ID Card" }} />
          <Stack.Screen name="salary" options={{ title: "Salary" }} />
          <Stack.Screen name="change-password" options={{ title: "Change Password" }} />
          <Stack.Screen name="bkt-cases" options={{ title: "BKT Cases" }} />
          <Stack.Screen name="foreclose" options={{ title: "Foreclose" }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
        </Stack>

        {blockingItems?.length > 0 && <BlockingActionModal items={blockingItems as BlockingItem[]} />}
      </View>

      {!showSidebar && (
        <MobileDrawer
          visible={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          currentPath={pathname}
          onAttendance={() => setAttVisible(true)}
        />
      )}

      <AttendanceModal visible={attVisible} onClose={() => setAttVisible(false)} />
    </View>
  );
}

export default function AppLayout() {
  return (
    <CompanyProvider>
      <AppLayoutInner />
    </CompanyProvider>
  );
}

const styles = StyleSheet.create({
  root:            { flex: 1, flexDirection: "row", backgroundColor: Colors.background },
  content:         { flex: 1 },
  headerBtn:       { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: Colors.surfaceAlt, marginLeft: -4 },
  headerBtnHover:  { backgroundColor: Colors.border },
  companyBadge:    { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.primary + "12", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, marginRight: 4 },
  companyBadgeText:{ fontSize: 11, fontWeight: "700", color: Colors.primary, maxWidth: 100 },
  drawerOverlay:   { flex: 1, flexDirection: "row" },
  drawerBackdrop:  { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  drawerPanel:     { width: "82%", maxWidth: 300, position: "absolute", left: 0, top: 0, bottom: 0 },
  modalOverlay:    { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 24 },
  attendanceCard:  { width: "100%", maxWidth: 340, backgroundColor: Colors.surface, borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: Colors.border },
  attHeader:       { flexDirection: "row", alignItems: "center", gap: 10, padding: 18 },
  attIconWrap:     { width: 32, height: 32, borderRadius: 9, backgroundColor: Colors.primary + "15", alignItems: "center", justifyContent: "center" },
  attTitle:        { fontSize: 16, fontWeight: "800", color: Colors.text },
  attBtn:          { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderTopWidth: 1, borderTopColor: Colors.border },
  attBtnHover:     { backgroundColor: Colors.surfaceAlt },
  attBtnText:      { fontSize: 14, fontWeight: "800", letterSpacing: 0.5 },
});

import React, { useState, useEffect } from "react";
import {
  View, Text, Pressable, StyleSheet, Modal, ScrollView,
  Platform, useWindowDimensions,
} from "react-native";
import { Stack, router, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import * as Haptics from "expo-haptics";
import { CompanyFilterProvider, useCompanyFilter } from "@/context/CompanyFilterContext";

const ADMIN_MENU = [
  { key: "dashboard",    label: "Dashboard",        icon: "home"             as const, screen: "/(admin)"                  },
  { key: "cases",        label: "All Cases",         icon: "list"             as const, screen: "/(admin)/all-cases"        },
  { key: "bkt",          label: "BKT Performance",   icon: "layers"           as const, screen: "/(admin)/bkt-cases"        },
  { key: "drr",          label: "DRR / Targets",     icon: "trending-up"      as const, screen: "/(admin)/drr"              },
  { key: "agency",       label: "Agency Target",     icon: "trophy"           as const, screen: "/(admin)/agency-target"    },
  { key: "fos-payout",  label: "FOS Payout",         icon: "cash-outline"     as const, screen: "/(admin)/fos-payout"       },
  { key: "salary",       label: "Salary Mgmt",       icon: "wallet"           as const, screen: "/(admin)/salary"           },
  { key: "depositions",  label: "Depositions",       icon: "cash"             as const, screen: "/(admin)/depositions"      },
  { key: "attendance",   label: "Attendance",        icon: "checkmark-circle" as const, screen: "/(admin)/attendance"       },
  { key: "receipts",     label: "Receipt Requests",  icon: "receipt-outline"  as const, screen: "/(admin)/receipt-requests" },
  { key: "field-visits", label: "Field Visits",      icon: "location"         as const, screen: "/(admin)/field-visits"     },
  { key: "call-logs",    label: "Call Logs",          icon: "call"             as const, screen: "/(admin)/call-logs"        },
  { key: "daily-report", label: "Daily Report",      icon: "bar-chart"        as const, screen: "/(admin)/daily-report"     },
];

// ─── Company Selector ─────────────────────────────────────────────────────────
function CompanySelectorStrip({ onClose }: { onClose?: () => void }) {
  const { companies, selectedCompany, setSelectedCompany, isLoading } = useCompanyFilter();
  if (isLoading || companies.length === 0) return null;
  const pick = (c: string | null) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedCompany(c);
    onClose?.();
  };
  return (
    <View style={cs.wrap}>
      <View style={cs.labelRow}>
        <Ionicons name="business-outline" size={11} color={Colors.textMuted} />
        <Text style={cs.label}>Filter by Company</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={cs.chipRow}>
        <Pressable style={[cs.chip, selectedCompany === null && cs.chipActive]} onPress={() => pick(null)}>
          <Text style={[cs.chipText, selectedCompany === null && cs.chipTextActive]}>All</Text>
        </Pressable>
        {companies.map((c) => (
          <Pressable key={c} style={[cs.chip, selectedCompany === c && cs.chipActive]} onPress={() => pick(c)}>
            <Text style={[cs.chipText, selectedCompany === c && cs.chipTextActive]} numberOfLines={1}>{c}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const cs = StyleSheet.create({
  wrap:          { marginHorizontal: 12, marginBottom: 8, backgroundColor: Colors.surfaceAlt, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: Colors.border },
  labelRow:      { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 8 },
  label:         { fontSize: 10, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  chipRow:       { flexDirection: "row", gap: 6 },
  chip:          { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  chipActive:    { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText:      { fontSize: 11, fontWeight: "600", color: Colors.textSecondary },
  chipTextActive:{ color: "#fff" },
});

// ─── Sidebar Content (shared by web sidebar + mobile modal) ──────────────────
function SidebarContent({
  onClose,
  currentPath,
}: {
  onClose?: () => void;
  currentPath?: string;
}) {
  const insets = useSafeAreaInsets();
  const { logout, agent } = useAuth();
  const { selectedCompany } = useCompanyFilter();

  const handleNav = (screen: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose?.();
    router.push(screen as any);
  };

  const handleLogout = async () => {
    try { await logout(); router.replace("/login"); } catch {}
  };

  return (
    <View style={[sb.container, Platform.OS === "web" && sb.containerWeb]}>
      {/* Header */}
      <View style={[sb.header, Platform.OS !== "web" && { paddingTop: insets.top + 20 }]}>
        <View style={sb.avatarCircle}>
          <MaterialIcons name="admin-panel-settings" size={24} color="#fff" />
        </View>
        <View style={sb.headerInfo}>
          <Text style={sb.headerName}>Admin Panel</Text>
          <View style={sb.roleBadge}>
            <Text style={sb.roleText}>Administrator</Text>
          </View>
          {selectedCompany && (
            <View style={sb.companyBadge}>
              <Ionicons name="business" size={10} color={Colors.accent} />
              <Text style={sb.companyBadgeText} numberOfLines={1}>{selectedCompany}</Text>
            </View>
          )}
        </View>
        {onClose && Platform.OS !== "web" && (
          <Pressable onPress={onClose} style={sb.closeBtn}>
            <Ionicons name="close" size={20} color="rgba(255,255,255,0.7)" />
          </Pressable>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1, paddingTop: 8 }}>
        <CompanySelectorStrip onClose={onClose} />

        <View style={sb.menuSection}>
          {ADMIN_MENU.map((item, i) => {
            const isActive = currentPath === item.screen ||
              (item.screen === "/(admin)" && currentPath === "/(admin)/index");
            return (
              <Pressable
                key={item.key}
                style={({ pressed, hovered }: any) => [
                  sb.menuItem,
                  i < ADMIN_MENU.length - 1 && sb.menuItemBorder,
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
  headerInfo:       { flex: 1, gap: 5 },
  headerName:       { color: "#fff", fontSize: 15, fontWeight: "800" },
  roleBadge:        { backgroundColor: Colors.accent + "25", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, alignSelf: "flex-start" },
  roleText:         { color: Colors.accent, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  companyBadge:     { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.accent + "15", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, alignSelf: "flex-start" },
  companyBadgeText: { color: Colors.accent, fontSize: 10, fontWeight: "700", maxWidth: 140 },
  closeBtn:         { padding: 4 },
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
  visible,
  onClose,
  currentPath,
}: {
  visible: boolean;
  onClose: () => void;
  currentPath: string;
}) {
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={md.overlay}>
        <Pressable style={md.backdrop} onPress={onClose} />
        <View style={md.panel}>
          <SidebarContent onClose={onClose} currentPath={currentPath} />
        </View>
      </View>
    </Modal>
  );
}

const md = StyleSheet.create({
  overlay:  { flex: 1, flexDirection: "row" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  panel:    { width: "82%", maxWidth: 300, position: "absolute", left: 0, top: 0, bottom: 0 },
});

// ─── Main Layout ──────────────────────────────────────────────────────────────
function AdminLayoutInner() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const { selectedCompany, refreshCompanies } = useCompanyFilter();
  const { agent } = useAuth();

  const isWeb = Platform.OS === "web";
  // Show persistent sidebar on web when screen is wide enough
  const showSidebar = isWeb && width >= 768;

  useEffect(() => {
    if (agent) refreshCompanies();
  }, [agent, refreshCompanies]);

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

  const headerTitle = () => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View style={styles.headerIconWrap}>
        <MaterialIcons name="admin-panel-settings" size={15} color={Colors.primary} />
      </View>
      <View>
        <Text style={{ color: Colors.text, fontSize: 15, fontWeight: "800" }}>Admin Panel</Text>
        {selectedCompany && (
          <Text style={{ color: Colors.primary, fontSize: 10, fontWeight: "700" }} numberOfLines={1}>
            {selectedCompany}
          </Text>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      {/* Persistent sidebar (web wide) */}
      {showSidebar && <SidebarContent currentPath={pathname} />}

      {/* Main content area */}
      <View style={styles.content}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: Colors.surface },
            headerTintColor: Colors.text,
            headerTitleStyle: { fontWeight: "700", color: Colors.text },
            headerShadowVisible: false,
            headerLeft,
            headerTitle,
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="all-cases" />
          <Stack.Screen name="bkt-cases" />
          <Stack.Screen name="drr" options={{ title: "DRR / Targets" }} />
          <Stack.Screen name="agency-target" />
          <Stack.Screen name="fos-payout" options={{ title: "FOS Payout" }} />
          <Stack.Screen name="salary" />
          <Stack.Screen name="depositions" />
          <Stack.Screen name="attendance" />
          <Stack.Screen name="agent/[id]" options={{ headerLeft: undefined, headerBackTitle: "Back" }} />
          <Stack.Screen name="receipt-requests" options={{ title: "Receipt Requests" }} />
          <Stack.Screen name="field-visits" options={{ title: "Field Visit Tracker" }} />
          <Stack.Screen name="call-logs" options={{ title: "Call Logs" }} />
          <Stack.Screen name="daily-report" options={{ title: "Daily Report" }} />
        </Stack>
      </View>

      {/* Mobile drawer */}
      {!showSidebar && (
        <MobileDrawer
          visible={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          currentPath={pathname}
        />
      )}
    </View>
  );
}

export default function AdminLayout() {
  return (
    <CompanyFilterProvider>
      <AdminLayoutInner />
    </CompanyFilterProvider>
  );
}

const styles = StyleSheet.create({
  root:          { flex: 1, flexDirection: "row", backgroundColor: Colors.background },
  content:       { flex: 1 },
  headerBtn:     { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: Colors.surfaceAlt, marginLeft: -4 },
  headerBtnHover:{ backgroundColor: Colors.border },
  headerIconWrap:{ width: 26, height: 26, borderRadius: 7, backgroundColor: Colors.primary + "18", alignItems: "center", justifyContent: "center" },
});

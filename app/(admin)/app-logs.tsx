import React, { useState, useMemo } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  ActivityIndicator, TextInput, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────
type LogType =
  | "login"
  | "logout"
  | "app_open"
  | "call_log"
  | "field_visit"
  | "attendance_in"
  | "attendance_out"
  | "deposition"
  | "receipt_request"
  | "fos_deposition";

interface AppLog {
  id: string;
  type: LogType;
  agent_name: string | null;
  title: string;
  subtitle: string | null;
  detail: string | null;
  timestamp: string | null;
  status?: string | null;
  statusColor?: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────
const TYPE_CONFIG: Record<LogType, { label: string; icon: any; color: string }> = {
  login:           { label: "Login",        icon: "log-in-outline",       color: "#16A34A" },
  logout:          { label: "Logout",       icon: "log-out-outline",      color: "#DC2626" },
  app_open:        { label: "App Open",     icon: "phone-portrait-outline",color: "#2563EB" },
  call_log:        { label: "Call Log",     icon: "call-outline",          color: Colors.info },
  field_visit:     { label: "Field Visit",  icon: "location-outline",      color: "#059669" },
  attendance_in:   { label: "Check-In",     icon: "checkmark-circle-outline", color: Colors.success },
  attendance_out:  { label: "Check-Out",    icon: "exit-outline",          color: Colors.warning },
  deposition:      { label: "Deposition",   icon: "cash-outline",          color: "#7C3AED" },
  receipt_request: { label: "Receipt Req.", icon: "receipt-outline",       color: Colors.accent },
  fos_deposition:  { label: "FOS Deposit",  icon: "wallet-outline",        color: "#D97706" },
};

const ALL_TYPES = Object.keys(TYPE_CONFIG) as LogType[];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDateTime(v: any) {
  if (!v) return "—";
  const d = new Date(v);
  return (
    d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) +
    "  " +
    d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })
  );
}

function relativeTime(v: any): string {
  if (!v) return "";
  const diff = Date.now() - new Date(v).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Normalisers ─────────────────────────────────────────────────────────────
function normActivityLogs(raw: any[]): AppLog[] {
  return raw.map((l) => ({
    id: `act_${l.id}`,
    type: l.event_type as LogType,
    agent_name: l.agent_name_live ?? l.agent_name ?? null,
    title:
      l.event_type === "login"
        ? "Logged In"
        : l.event_type === "logout"
        ? "Logged Out"
        : "App Opened",
    subtitle: l.platform ? `Platform: ${l.platform}` : null,
    detail: l.ip_address ? `IP: ${l.ip_address}` : null,
    timestamp: l.created_at ?? null,
    status: l.event_type === "login" ? "Login" : l.event_type === "logout" ? "Logout" : "App Open",
    statusColor:
      l.event_type === "login"
        ? "#16A34A"
        : l.event_type === "logout"
        ? "#DC2626"
        : "#2563EB",
  }));
}

function normCallLogs(raw: any[]): AppLog[] {
  return raw.map((l) => ({
    id: `call_${l.id}`,
    type: "call_log" as LogType,
    agent_name: l.agent_name ?? null,
    title: l.customer_name ?? "Unknown Customer",
    subtitle: l.loan_no ? `Loan: ${l.loan_no}` : null,
    detail: l.outcome ?? null,
    timestamp: l.logged_at ?? null,
    status: l.status ?? null,
    statusColor:
      l.status === "Paid" ? Colors.success : l.status === "PTP" ? Colors.statusPTP : Colors.danger,
  }));
}

function normFieldVisits(raw: any[]): AppLog[] {
  return raw.map((v) => ({
    id: `fv_${v.id}`,
    type: "field_visit" as LogType,
    agent_name: v.agent_name ?? null,
    title: v.customer_name ?? v.loan_no ?? "Field Visit",
    subtitle: v.loan_no ? `Loan: ${v.loan_no}` : null,
    detail: v.visit_outcome ?? v.visit_remarks ?? null,
    timestamp: v.visited_at ?? v.created_at ?? null,
    status: v.visit_outcome ?? null,
    statusColor: Colors.success,
  }));
}

function normAttendance(raw: any[]): AppLog[] {
  const logs: AppLog[] = [];
  raw.forEach((a) => {
    if (a.check_in)
      logs.push({
        id: `att_in_${a.id}`,
        type: "attendance_in",
        agent_name: a.agent_name ?? null,
        title: "Checked In",
        subtitle: null,
        detail: null,
        timestamp: a.check_in,
        status: "Present",
        statusColor: Colors.success,
      });
    if (a.check_out)
      logs.push({
        id: `att_out_${a.id}`,
        type: "attendance_out",
        agent_name: a.agent_name ?? null,
        title: "Checked Out",
        subtitle: null,
        detail: null,
        timestamp: a.check_out,
        status: "Done",
        statusColor: Colors.warning,
      });
  });
  return logs;
}

function normDepositions(raw: any[]): AppLog[] {
  return raw.map((d) => ({
    id: `dep_${d.id}`,
    type: "deposition" as LogType,
    agent_name: d.agent_name ?? null,
    title: `₹${Number(d.amount ?? 0).toLocaleString("en-IN")} Deposition`,
    subtitle: d.description ?? null,
    detail: d.payment_mode ?? null,
    timestamp: d.created_at ?? null,
    status: d.status ?? null,
    statusColor: d.status === "verified" ? Colors.success : Colors.warning,
  }));
}

function normReceiptRequests(raw: any[]): AppLog[] {
  return raw.map((r) => ({
    id: `rr_${r.id}`,
    type: "receipt_request" as LogType,
    agent_name: r.agent_name ?? null,
    title: r.customer_name ?? "Receipt Request",
    subtitle: r.loan_no ? `Loan: ${r.loan_no}` : null,
    detail: r.notes ?? null,
    timestamp: r.requested_at ?? r.created_at ?? null,
    status: r.status ?? "pending",
    statusColor:
      r.status === "approved" ? Colors.success : r.status === "rejected" ? Colors.danger : Colors.warning,
  }));
}

function normFosDepositions(raw: any[]): AppLog[] {
  return raw.map((f) => ({
    id: `fos_${f.id}`,
    type: "fos_deposition" as LogType,
    agent_name: f.agent_name ?? null,
    title: `₹${Number(f.amount ?? 0).toLocaleString("en-IN")} FOS Deposit`,
    subtitle: f.description ?? null,
    detail: f.payment_mode ?? null,
    timestamp: f.created_at ?? null,
    status: f.status ?? null,
    statusColor: f.status === "verified" ? Colors.success : Colors.warning,
  }));
}

// ─── Log Card ─────────────────────────────────────────────────────────────────
function LogCard({ log }: { log: AppLog }) {
  const cfg = TYPE_CONFIG[log.type];
  return (
    <View style={card.wrap}>
      <View style={[card.accent, { backgroundColor: cfg.color }]} />
      <View style={card.body}>
        {/* Type badge + relative time */}
        <View style={card.topRow}>
          <View style={[card.typeBadge, { backgroundColor: cfg.color + "18" }]}>
            <Ionicons name={cfg.icon} size={11} color={cfg.color} />
            <Text style={[card.typeText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
          <Text style={card.relTime}>{relativeTime(log.timestamp)}</Text>
        </View>

        {/* Title + status */}
        <View style={card.titleRow}>
          <Text style={card.title} numberOfLines={1}>{log.title}</Text>
          {log.status && (
            <View style={[card.statusBadge, { backgroundColor: (log.statusColor ?? Colors.info) + "22" }]}>
              <Text style={[card.statusText, { color: log.statusColor ?? Colors.info }]}>{log.status}</Text>
            </View>
          )}
        </View>

        {log.subtitle ? <Text style={card.sub} numberOfLines={1}>{log.subtitle}</Text> : null}
        {log.detail   ? <Text style={card.detail} numberOfLines={2}>{log.detail}</Text>   : null}

        {/* Footer */}
        <View style={card.footer}>
          <View style={card.agentChip}>
            <Ionicons name="person-outline" size={11} color={Colors.primary} />
            <Text style={card.agentText} numberOfLines={1}>{log.agent_name ?? "—"}</Text>
          </View>
          <View style={card.timeChip}>
            <Ionicons name="time-outline" size={10} color={Colors.textMuted} />
            <Text style={card.timeText}>{fmtDateTime(log.timestamp)}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────
function StatsBar({ logs }: { logs: AppLog[] }) {
  const c = useMemo(() => {
    const m: Record<string, number> = {};
    logs.forEach((l) => (m[l.type] = (m[l.type] ?? 0) + 1));
    return m;
  }, [logs]);

  const items = [
    { label: "Logins",   value: c.login    ?? 0, color: "#16A34A" },
    { label: "App Opens",value: c.app_open ?? 0, color: Colors.info },
    { label: "Calls",    value: c.call_log ?? 0, color: Colors.accent },
    { label: "Visits",   value: c.field_visit ?? 0, color: "#059669" },
    { label: "Deposits", value: (c.deposition ?? 0) + (c.fos_deposition ?? 0), color: "#7C3AED" },
  ];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
      <View style={{ flexDirection: "row", gap: 8, paddingRight: 16 }}>
        {items.map((it) => (
          <View key={it.label} style={[s.statCard, { borderTopColor: it.color }]}>
            <Text style={[s.statNum, { color: it.color }]}>{it.value}</Text>
            <Text style={s.statLabel}>{it.label}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ─── Group label ──────────────────────────────────────────────────────────────
const GROUPS: { key: LogType | "All"; label: string; icon: any; color: string }[] = [
  { key: "All",            label: "All",         icon: "apps-outline",          color: Colors.primary },
  { key: "login",          label: "Login",        icon: "log-in-outline",        color: "#16A34A" },
  { key: "logout",         label: "Logout",       icon: "log-out-outline",       color: "#DC2626" },
  { key: "app_open",       label: "App Open",     icon: "phone-portrait-outline",color: "#2563EB" },
  { key: "call_log",       label: "Call Logs",    icon: "call-outline",          color: Colors.info },
  { key: "field_visit",    label: "Field Visits", icon: "location-outline",      color: "#059669" },
  { key: "attendance_in",  label: "Check-In",     icon: "checkmark-circle-outline",color: Colors.success },
  { key: "attendance_out", label: "Check-Out",    icon: "exit-outline",          color: Colors.warning },
  { key: "deposition",     label: "Depositions",  icon: "cash-outline",          color: "#7C3AED" },
  { key: "receipt_request",label: "Receipts",     icon: "receipt-outline",       color: Colors.accent },
  { key: "fos_deposition", label: "FOS Deposits", icon: "wallet-outline",        color: "#D97706" },
];

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function AppLogsScreen() {
  const insets = useSafeAreaInsets();
  const [search, setSearch]         = useState("");
  const [typeFilter, setTypeFilter] = useState<LogType | "All">("All");
  const [agentFilter, setAgentFilter] = useState("All");

  // ── Fetch all sources ────────────────────────────────────────────────────
  const activityQ = useQuery({
    queryKey: ["/api/admin/activity-logs"],
    queryFn:  () => api.admin.getActivityLogs(500),
    refetchInterval: 30000,
  });
  const callLogsQ = useQuery({
    queryKey: ["/api/admin/call-logs"],
    queryFn:  () => api.admin.getCallLogs(500),
    refetchInterval: 60000,
  });
  const fieldVisitsQ = useQuery({
    queryKey: ["/api/admin/field-visits"],
    queryFn:  () => api.admin.getAdminFieldVisits({}),
    refetchInterval: 60000,
  });
  const attendanceQ = useQuery({
    queryKey: ["/api/admin/attendance"],
    queryFn:  () => api.admin.getAllAttendance(),
    refetchInterval: 60000,
  });
  const depositionsQ = useQuery({
    queryKey: ["/api/admin/depositions"],
    queryFn:  () => api.admin.getAllDepositions(),
    refetchInterval: 60000,
  });
  const receiptQ = useQuery({
    queryKey: ["/api/admin/receipt-requests"],
    queryFn:  () => api.admin.getReceiptRequests(),
    refetchInterval: 60000,
  });
  const fosQ = useQuery({
    queryKey: ["/api/admin/fos-depositions"],
    queryFn:  () => api.admin.getFosDepositions(),
    refetchInterval: 60000,
  });

  const isLoading =
    activityQ.isLoading || callLogsQ.isLoading || fieldVisitsQ.isLoading ||
    attendanceQ.isLoading || depositionsQ.isLoading || receiptQ.isLoading || fosQ.isLoading;

  // ── Merge + sort ─────────────────────────────────────────────────────────
  const allLogs = useMemo<AppLog[]>(() => {
    const merged: AppLog[] = [
      ...normActivityLogs(activityQ.data?.logs ?? []),
      ...normCallLogs(callLogsQ.data?.logs ?? []),
      ...normFieldVisits(
        Array.isArray(fieldVisitsQ.data) ? fieldVisitsQ.data : fieldVisitsQ.data?.visits ?? [],
      ),
      ...normAttendance(
        Array.isArray(attendanceQ.data) ? attendanceQ.data : attendanceQ.data?.records ?? [],
      ),
      ...normDepositions(
        Array.isArray(depositionsQ.data) ? depositionsQ.data : depositionsQ.data?.depositions ?? [],
      ),
      ...normReceiptRequests(
        Array.isArray(receiptQ.data) ? receiptQ.data : receiptQ.data?.requests ?? [],
      ),
      ...normFosDepositions(
        Array.isArray(fosQ.data) ? fosQ.data : fosQ.data?.depositions ?? [],
      ),
    ];
    merged.sort((a, b) => {
      if (!a.timestamp) return 1;
      if (!b.timestamp) return -1;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
    return merged;
  }, [
    activityQ.data, callLogsQ.data, fieldVisitsQ.data,
    attendanceQ.data, depositionsQ.data, receiptQ.data, fosQ.data,
  ]);

  const agents = useMemo(() => {
    const names = Array.from(new Set(allLogs.map((l) => l.agent_name).filter(Boolean))).sort() as string[];
    return ["All", ...names];
  }, [allLogs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allLogs.filter((l) => {
      if (typeFilter !== "All" && l.type !== typeFilter) return false;
      if (agentFilter !== "All" && l.agent_name !== agentFilter) return false;
      if (q) {
        const hay = `${l.title} ${l.subtitle ?? ""} ${l.detail ?? ""} ${l.agent_name ?? ""} ${l.status ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allLogs, typeFilter, agentFilter, search]);

  const refetchAll = () => {
    activityQ.refetch(); callLogsQ.refetch(); fieldVisitsQ.refetch();
    attendanceQ.refetch(); depositionsQ.refetch(); receiptQ.refetch(); fosQ.refetch();
  };

  const isRefetching =
    activityQ.isRefetching || callLogsQ.isRefetching || fieldVisitsQ.isRefetching ||
    attendanceQ.isRefetching || depositionsQ.isRefetching || receiptQ.isRefetching || fosQ.isRefetching;

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background }}>
        <ActivityIndicator color={Colors.primary} size="large" />
        <Text style={{ color: Colors.textMuted, marginTop: 12, fontSize: 13 }}>Loading application logs…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView
        contentContainerStyle={[
          s.container,
          { paddingBottom: insets.bottom + 32, paddingTop: Platform.OS === "web" ? 67 : 0 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Search + Refresh */}
        <View style={s.searchRow}>
          <View style={s.searchBox}>
            <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
            <TextInput
              style={s.searchInput}
              placeholder="Search logs, agent, IP…"
              placeholderTextColor={Colors.textMuted}
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")}>
                <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
              </Pressable>
            )}
          </View>
          <Pressable
            style={[s.refreshBtn, isRefetching && { opacity: 0.4 }]}
            onPress={refetchAll}
            disabled={isRefetching}
          >
            <Ionicons name="refresh-outline" size={18} color={Colors.primary} />
          </Pressable>
        </View>

        {/* Stats */}
        <StatsBar logs={filtered} />

        {/* Type filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRow}>
          {GROUPS.map((g) => {
            const active = typeFilter === g.key;
            return (
              <Pressable
                key={g.key}
                style={[
                  s.chip,
                  {
                    borderColor: g.color + "66",
                    backgroundColor: active ? g.color : g.color + "15",
                  },
                ]}
                onPress={() => setTypeFilter(g.key as LogType | "All")}
              >
                <Ionicons name={g.icon} size={11} color={active ? "#fff" : g.color} />
                <Text style={[s.chipText, { color: active ? "#fff" : g.color }]}>{g.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Agent filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRow}>
          {agents.map((a) => {
            const active = agentFilter === a;
            return (
              <Pressable
                key={a}
                style={[
                  s.chip,
                  s.agentChipBase,
                  active && { backgroundColor: Colors.primary, borderColor: Colors.primary },
                ]}
                onPress={() => setAgentFilter(a)}
              >
                <Ionicons name="person-outline" size={11} color={active ? "#fff" : Colors.primary} />
                <Text style={[s.chipText, { color: active ? "#fff" : Colors.primary }]} numberOfLines={1}>{a}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Count */}
        <Text style={s.sectionTitle}>
          {filtered.length} Log{filtered.length !== 1 ? "s" : ""}
          {typeFilter !== "All" ? ` · ${TYPE_CONFIG[typeFilter]?.label ?? typeFilter}` : ""}
          {agentFilter !== "All" ? ` · ${agentFilter}` : ""}
        </Text>

        {/* Cards */}
        {filtered.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
            <Text style={s.emptyText}>
              {allLogs.length === 0 ? "No activity logs yet." : "No logs match your filters."}
            </Text>
          </View>
        ) : (
          filtered.map((log) => <LogCard key={log.id} log={log} />)
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:     { padding: 16, gap: 12 },
  searchRow:     { flexDirection: "row", gap: 8, alignItems: "center" },
  searchBox: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1,
    borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput:   { flex: 1, fontSize: 14, color: Colors.text },
  refreshBtn: {
    width: 42, height: 42, borderRadius: 12, backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center",
  },
  statCard: {
    width: 80, backgroundColor: Colors.surface, borderRadius: 12, padding: 10,
    alignItems: "center", gap: 3, borderTopWidth: 3, borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border, shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  statNum:    { fontSize: 18, fontWeight: "800" },
  statLabel:  { fontSize: 9, color: Colors.textSecondary, fontWeight: "600", textAlign: "center" },
  filterRow:  { marginBottom: 0 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1, marginRight: 8,
  },
  chipText:      { fontSize: 12, fontWeight: "600" },
  agentChipBase: { backgroundColor: Colors.primary + "12", borderColor: Colors.primary + "44" },
  sectionTitle:  { fontSize: 13, fontWeight: "700", color: Colors.textSecondary },
  empty:         { paddingVertical: 60, alignItems: "center", gap: 14 },
  emptyText:     { fontSize: 14, color: Colors.textMuted, textAlign: "center", lineHeight: 22 },
});

const card = StyleSheet.create({
  wrap: {
    flexDirection: "row", backgroundColor: Colors.surface, borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border, overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04,
    shadowRadius: 6, elevation: 1,
  },
  accent: { width: 4, flexShrink: 0 },
  body:   { flex: 1, padding: 13, gap: 6 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  typeBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  typeText:  { fontSize: 10, fontWeight: "700" },
  relTime:   { fontSize: 10, color: Colors.textMuted, fontWeight: "500" },
  titleRow:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  title:     { flex: 1, fontSize: 13, fontWeight: "800", color: Colors.text, textTransform: "uppercase" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusText:  { fontSize: 10, fontWeight: "700" },
  sub:         { fontSize: 11, color: Colors.textMuted },
  detail:      { fontSize: 12, color: Colors.textSecondary, fontStyle: "italic", lineHeight: 17 },
  footer: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border, marginTop: 2,
  },
  agentChip: { flexDirection: "row", alignItems: "center", gap: 4 },
  agentText: { fontSize: 11, fontWeight: "700", color: Colors.primary },
  timeChip:  { flexDirection: "row", alignItems: "center", gap: 4 },
  timeText:  { fontSize: 10, color: Colors.textMuted },
});

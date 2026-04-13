import React, { useState } from "react";
import {
  View, Text, StyleSheet, Pressable, TextInput, Alert,
  ActivityIndicator, RefreshControl, ScrollView, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

function timeSince(ts: string | null) {
  if (!ts) return "No activity today";
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1)  return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return "Yesterday+";
}

function isActive(ts: string | null) {
  if (!ts) return false;
  return (Date.now() - new Date(ts).getTime()) < 30 * 60 * 1000;
}

export default function LiveActivityScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"agents" | "zero" | "report" | "broadcast">("agents");
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [broadcasting, setBroadcasting] = useState(false);

  const sendBroadcast = async () => {
    if (!broadcastMsg.trim()) { Alert.alert("Error", "Please enter a message"); return; }
    setBroadcasting(true);
    try {
      const url = new URL("/api/admin/broadcast", getApiUrl()).toString();
      const res = await fetch(url, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: broadcastTitle.trim() || "Admin Message", message: broadcastMsg.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed");
      Alert.alert("Sent!", `Message delivered to ${data.sent} agent${data.sent !== 1 ? "s" : ""}.`);
      setBroadcastTitle(""); setBroadcastMsg("");
    } catch (e: any) { Alert.alert("Error", e.message); }
    finally { setBroadcasting(false); }
  };

  const { data: activityData, isLoading: actLoading } = useQuery({
    queryKey: ["/api/admin/live-activity"],
    queryFn: async () => {
      const url = new URL("/api/admin/live-activity", getApiUrl()).toString();
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 60000,
  });

  const { data: zeroData, isLoading: zeroLoading } = useQuery({
    queryKey: ["/api/admin/zero-feedback"],
    queryFn: async () => {
      const url = new URL("/api/admin/zero-feedback", getApiUrl()).toString();
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: reportData, isLoading: reportLoading } = useQuery({
    queryKey: ["/api/admin/daily-report"],
    queryFn: async () => {
      const url = new URL("/api/admin/daily-report", getApiUrl()).toString();
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 120000,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await qc.invalidateQueries({ queryKey: ["/api/admin/live-activity"] });
    await qc.invalidateQueries({ queryKey: ["/api/admin/zero-feedback"] });
    await qc.invalidateQueries({ queryKey: ["/api/admin/daily-report"] });
    setRefreshing(false);
  };

  const agents: any[] = activityData?.agents || [];
  const zeroCases: any[] = zeroData?.cases || [];
  const report: any[] = reportData?.report || [];

  const activeCount = agents.filter((a) => isActive(a.last_feedback_at)).length;

  const isLoading = actLoading || zeroLoading || reportLoading;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={[styles.header, { paddingTop: Platform.OS === "web" ? 67 : insets.top + 8 }]}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryBox}>
            <Text style={[styles.summaryVal, { color: Colors.success }]}>{activeCount}</Text>
            <Text style={styles.summaryLbl}>Active now</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={[styles.summaryVal, { color: Colors.primary }]}>{agents.length}</Text>
            <Text style={styles.summaryLbl}>Total agents</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={[styles.summaryVal, { color: Colors.danger }]}>{zeroCases.length}</Text>
            <Text style={styles.summaryLbl}>Stale cases</Text>
          </View>
        </View>
        <View style={styles.tabRow}>
          {([["agents", "Agents"], ["zero", "Stale"], ["report", "Report"], ["broadcast", "Broadcast"]] as const).map(([key, label]) => (
            <Pressable key={key} style={[styles.tab, activeTab === key && styles.tabActive]} onPress={() => setActiveTab(key)}>
              <Text style={[styles.tabText, activeTab === key && styles.tabTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {isLoading && !refreshing ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
        >
          {activeTab === "agents" && agents.map((agent) => {
            const active = isActive(agent.last_feedback_at);
            return (
              <View key={agent.id} style={styles.agentCard}>
                <View style={styles.agentTop}>
                  <View style={[styles.avatar, { backgroundColor: active ? Colors.success + "20" : Colors.surfaceAlt }]}>
                    <Text style={[styles.avatarText, { color: active ? Colors.success : Colors.textSecondary }]}>
                      {(agent.name || "?").split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.agentName}>{agent.name}</Text>
                    <Text style={styles.agentMeta}>Last update: {timeSince(agent.last_feedback_at)}</Text>
                  </View>
                  <View style={[styles.activeDot, { backgroundColor: active ? Colors.success : Colors.border }]} />
                </View>
                <View style={styles.agentStats}>
                  {[
                    { label: "Cases today", value: agent.cases_today, color: Colors.primary },
                    { label: "Visits", value: agent.visits_today, color: Colors.info },
                  ].map((s) => (
                    <View key={s.label} style={styles.agentStat}>
                      <Text style={[styles.agentStatVal, { color: s.color }]}>{s.value}</Text>
                      <Text style={styles.agentStatLbl}>{s.label}</Text>
                    </View>
                  ))}
                  <View style={[styles.agentStat, { backgroundColor: active ? Colors.success + "10" : Colors.surfaceAlt }]}>
                    <Text style={[styles.agentStatVal, { color: active ? Colors.success : Colors.textMuted }]}>
                      {active ? "Active" : "Inactive"}
                    </Text>
                    <Text style={styles.agentStatLbl}>Status</Text>
                  </View>
                </View>
              </View>
            );
          })}

          {activeTab === "zero" && (zeroCases.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="checkmark-circle" size={48} color={Colors.success} />
              <Text style={styles.emptyText}>All cases have recent feedback</Text>
            </View>
          ) : zeroCases.map((c) => (
            <View key={c.id} style={[styles.zeroCard, { borderLeftColor: c.days_no_feedback >= 5 ? Colors.danger : Colors.warning }]}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.zeroName}>{c.customer_name}</Text>
                  <Text style={styles.zeroMeta}>{c.loan_no}{c.bkt ? ` · BKT ${c.bkt}` : ""} · {c.agent_name}</Text>
                </View>
                <View style={[styles.daysBadge, { backgroundColor: c.days_no_feedback >= 5 ? Colors.danger + "18" : Colors.warning + "18" }]}>
                  <Text style={[styles.daysBadgeText, { color: c.days_no_feedback >= 5 ? Colors.danger : Colors.warning }]}>
                    {c.days_no_feedback}d
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                <View style={[styles.miniChip, { backgroundColor: Colors.surfaceAlt }]}>
                  <Text style={styles.miniChipText}>POS ₹{Number(c.pos || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</Text>
                </View>
                <View style={[styles.miniChip, { backgroundColor: Colors.surfaceAlt }]}>
                  <Text style={styles.miniChipText}>{c.status}</Text>
                </View>
              </View>
            </View>
          )))}

          {activeTab === "report" && report.map((r) => {
            const performance = r.collected_today > 50000 ? "Good" : r.collected_today > 0 ? "Avg" : r.visited_today === 0 ? "Alert" : "Low";
            const perfColor = performance === "Good" ? Colors.success : performance === "Avg" ? Colors.warning : Colors.danger;
            return (
              <View key={r.id} style={styles.reportCard}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <View style={[styles.avatar, { backgroundColor: Colors.primary + "18" }]}>
                    <Text style={[styles.avatarText, { color: Colors.primary }]}>
                      {(r.agent_name || "?").split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2)}
                    </Text>
                  </View>
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: Colors.text }}>{r.agent_name}</Text>
                  <View style={[styles.perfBadge, { backgroundColor: perfColor + "18" }]}>
                    <Text style={[styles.perfBadgeText, { color: perfColor }]}>{performance}</Text>
                  </View>
                </View>
                <View style={styles.reportStats}>
                  {[
                    { label: "Visited", value: r.visited_today, color: Colors.info },
                    { label: "Paid", value: r.paid_today, color: Colors.success },
                    { label: "Calls", value: r.calls_today, color: Colors.warning },
                  ].map((s) => (
                    <View key={s.label} style={styles.reportStat}>
                      <Text style={[styles.reportStatVal, { color: s.color }]}>{s.value}</Text>
                      <Text style={styles.reportStatLbl}>{s.label}</Text>
                    </View>
                  ))}
                </View>
                {r.collected_today > 0 && (
                  <View style={styles.collectedRow}>
                    <Ionicons name="cash" size={13} color={Colors.success} />
                    <Text style={styles.collectedText}>₹{Number(r.collected_today).toLocaleString("en-IN", { maximumFractionDigits: 0 })} collected today</Text>
                  </View>
                )}
              </View>
            );
          })}
          {activeTab === "broadcast" && (
            <View style={{ gap: 12 }}>
              <View style={styles.broadcastCard}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <Ionicons name="megaphone" size={18} color={Colors.warning} />
                  <Text style={{ fontSize: 14, fontWeight: "700", color: Colors.text }}>Send to all agents</Text>
                </View>
                <Text style={styles.fieldLabel}>Title (optional)</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="e.g. Today's Target"
                  placeholderTextColor={Colors.textMuted}
                  value={broadcastTitle}
                  onChangeText={setBroadcastTitle}
                />
                <Text style={styles.fieldLabel}>Message *</Text>
                <TextInput
                  style={[styles.fieldInput, { minHeight: 90, textAlignVertical: "top" }]}
                  placeholder="Type your message to all agents..."
                  placeholderTextColor={Colors.textMuted}
                  value={broadcastMsg}
                  onChangeText={setBroadcastMsg}
                  multiline
                />
                <Pressable
                  style={[styles.broadcastBtn, broadcasting && { opacity: 0.6 }]}
                  onPress={sendBroadcast}
                  disabled={broadcasting}
                >
                  {broadcasting
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <><Ionicons name="send" size={16} color="#fff" /><Text style={styles.broadcastBtnText}>Send to all {agents.length} agents</Text></>
                  }
                </Pressable>
              </View>

              <View style={styles.broadcastCard}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <Ionicons name="information-circle" size={16} color={Colors.info} />
                  <Text style={{ fontSize: 12, fontWeight: "700", color: Colors.info }}>Auto notifications already running</Text>
                </View>
                {[
                  { icon: "alarm", text: "8 AM — PTP reminder to agents with cases due today", color: Colors.warning },
                  { icon: "checkmark-circle", text: "Auto — Case marked Paid when online collection submitted", color: Colors.success },
                  { icon: "alert-circle", text: "6 PM — Alert to agents with pending depositions", color: Colors.danger },
                  { icon: "bar-chart", text: "7 PM — End of day summary to all agents", color: Colors.primary },
                ].map((n) => (
                  <View key={n.text} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 8 }}>
                    <Ionicons name={n.icon as any} size={14} color={n.color} style={{ marginTop: 1 }} />
                    <Text style={{ flex: 1, fontSize: 11, color: Colors.textSecondary, lineHeight: 16 }}>{n.text}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header:       { backgroundColor: Colors.surface, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border, gap: 12 },
  summaryRow:   { flexDirection: "row", gap: 8 },
  summaryBox:   { flex: 1, backgroundColor: Colors.surfaceAlt, borderRadius: 10, padding: 10, alignItems: "center" },
  summaryVal:   { fontSize: 22, fontWeight: "800" },
  summaryLbl:   { fontSize: 10, color: Colors.textMuted, fontWeight: "600", marginTop: 1 },
  tabRow:       { flexDirection: "row", gap: 6 },
  tab:          { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.surfaceAlt, alignItems: "center" },
  tabActive:    { backgroundColor: Colors.primary },
  tabText:      { fontSize: 11, fontWeight: "600", color: Colors.textSecondary },
  tabTextActive:{ color: "#fff" },
  list:         { padding: 12, gap: 10 },
  agentCard:    { backgroundColor: Colors.surface, borderRadius: 14, padding: 14, gap: 10, borderWidth: 1, borderColor: Colors.border },
  agentTop:     { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar:       { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avatarText:   { fontSize: 14, fontWeight: "700" },
  agentName:    { fontSize: 14, fontWeight: "700", color: Colors.text },
  agentMeta:    { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  activeDot:    { width: 10, height: 10, borderRadius: 5 },
  agentStats:   { flexDirection: "row", gap: 6 },
  agentStat:    { flex: 1, backgroundColor: Colors.surfaceAlt, borderRadius: 8, padding: 8, alignItems: "center" },
  agentStatVal: { fontSize: 16, fontWeight: "800" },
  agentStatLbl: { fontSize: 9, color: Colors.textMuted, fontWeight: "600", marginTop: 1 },
  zeroCard:     { backgroundColor: Colors.surface, borderRadius: 12, padding: 12, borderLeftWidth: 3, borderWidth: 1, borderColor: Colors.border },
  zeroName:     { fontSize: 13, fontWeight: "700", color: Colors.text },
  zeroMeta:     { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  daysBadge:    { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  daysBadgeText:{ fontSize: 13, fontWeight: "800" },
  miniChip:     { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  miniChipText: { fontSize: 10, fontWeight: "600", color: Colors.textSecondary },
  reportCard:   { backgroundColor: Colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.border },
  reportStats:  { flexDirection: "row", gap: 6, marginBottom: 8 },
  reportStat:   { flex: 1, backgroundColor: Colors.surfaceAlt, borderRadius: 8, padding: 8, alignItems: "center" },
  reportStatVal:{ fontSize: 18, fontWeight: "800" },
  reportStatLbl:{ fontSize: 9, color: Colors.textMuted, fontWeight: "600", marginTop: 1 },
  collectedRow: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.success + "10", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  collectedText:{ fontSize: 12, fontWeight: "700", color: Colors.success },
  perfBadge:    { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  perfBadgeText:{ fontSize: 11, fontWeight: "700" },
  empty:        { alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 60 },
  broadcastCard: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border },
  fieldLabel:   { fontSize: 11, fontWeight: "700", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6, marginTop: 4 },
  fieldInput:   { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, padding: 12, fontSize: 14, color: Colors.text, backgroundColor: Colors.surfaceAlt, marginBottom: 10 },
  broadcastBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, marginTop: 4 },
  broadcastBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  emptyText:    { fontSize: 14, color: Colors.textMuted, fontWeight: "600" },
});

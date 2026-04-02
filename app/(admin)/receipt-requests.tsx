import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  ActivityIndicator, Alert, Switch, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";

const STATUS_COLORS: Record<string, string> = {
  pending:  "#F59E0B",
  approved: "#22C55E",
  rejected: "#EF4444",
};

const STATUS_ICONS: Record<string, string> = {
  pending:  "time-outline",
  approved: "checkmark-circle",
  rejected: "close-circle",
};

const TABS = ["Requests", "Permissions"];

// ─── Receipt Request Card ──────────────────────────────────────────────────────
function RequestCard({ req, onResolve }: { req: any; onResolve: () => void }) {
  const [loading, setLoading] = useState<string | null>(null);
  const qc = useQueryClient();

  const handleResolve = async (status: "approved" | "rejected") => {
    const confirmed = Platform.OS === "web"
      ? window.confirm(`${status === "approved" ? "Approve" : "Reject"} receipt request from ${req.agent_name}?`)
      : await new Promise<boolean>((resolve) => {
          Alert.alert(
            status === "approved" ? "Approve Request" : "Reject Request",
            `${status === "approved" ? "Approve" : "Reject"} receipt request from ${req.agent_name}?`,
            [
              { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
              { text: status === "approved" ? "Approve" : "Reject",
                style: status === "rejected" ? "destructive" : "default",
                onPress: () => resolve(true) },
            ]
          );
        });

    if (!confirmed) return;

    setLoading(status);
    try {
      await api.admin.resolveReceiptRequest(req.id, status);
      qc.invalidateQueries({ queryKey: ["/api/admin/receipt-requests"] });
      onResolve();
    } catch (e: any) {
      if (Platform.OS === "web") window.alert("Error: " + e.message);
      else Alert.alert("Error", e.message);
    } finally {
      setLoading(null);
    }
  };

  const statusColor = STATUS_COLORS[req.status] || Colors.textMuted;
  const isPending   = req.status === "pending";
  const dateStr     = req.requested_at ? new Date(req.requested_at).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  }) : "";

  return (
    <View style={styles.requestCard}>
      {/* Header */}
      <View style={styles.requestCardHeader}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.agentName}>{req.agent_name || "Unknown FOS"}</Text>
          <Text style={styles.requestDate}>{dateStr}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + "20" }]}>
          <Ionicons name={STATUS_ICONS[req.status] as any} size={12} color={statusColor} />
          <Text style={[styles.statusText, { color: statusColor }]}>
            {req.status.toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Case Info */}
      <View style={styles.caseInfoRow}>
        {req.customer_name && (
          <View style={styles.infoChip}>
            <Ionicons name="person-outline" size={12} color={Colors.textSecondary} />
            <Text style={styles.infoChipText} numberOfLines={1}>{req.customer_name}</Text>
          </View>
        )}
        {req.loan_no && (
          <View style={[styles.infoChip, { backgroundColor: Colors.primary + "12" }]}>
            <Ionicons name="document-text-outline" size={12} color={Colors.primary} />
            <Text style={[styles.infoChipText, { color: Colors.primary }]}>{req.loan_no}</Text>
          </View>
        )}
      </View>

    {/* Amount Details */}
      {(req.emi_amount || req.cbc || req.lpp) && (
        <View style={styles.amountRow}>
          {req.emi_amount && (
            <View style={styles.amountChip}>
              <Text style={styles.amountLabel}>EMI</Text>
              <Text style={styles.amountValue}>₹{parseFloat(req.emi_amount).toLocaleString("en-IN")}</Text>
            </View>
          )}
          {req.cbc && (
            <View style={styles.amountChip}>
              <Text style={styles.amountLabel}>CBC</Text>
              <Text style={styles.amountValue}>₹{parseFloat(req.cbc).toLocaleString("en-IN")}</Text>
            </View>
          )}
          {req.lpp && (
            <View style={styles.amountChip}>
              <Text style={styles.amountLabel}>LPP</Text>
              <Text style={styles.amountValue}>₹{parseFloat(req.lpp).toLocaleString("en-IN")}</Text>
            </View>
          )}
        </View>
      )}

      {/* Notes */}
      {req.notes && (
        <View style={styles.notesRow}>
          <Ionicons name="chatbubble-outline" size={13} color={Colors.textMuted} />
          <Text style={styles.notesText}>{req.notes}</Text>
        </View>
      )}

      {/* Action buttons — only for pending */}
      {isPending && (
        <View style={styles.actionRow}>
          <Pressable
            style={[styles.actionBtn, styles.rejectBtn, loading === "rejected" && { opacity: 0.6 }]}
            onPress={() => handleResolve("rejected")}
            disabled={!!loading}
          >
            {loading === "rejected"
              ? <ActivityIndicator size="small" color={Colors.danger} />
              : <>
                  <Ionicons name="close-circle-outline" size={16} color={Colors.danger} />
                  <Text style={[styles.actionBtnText, { color: Colors.danger }]}>Reject</Text>
                </>
            }
          </Pressable>
          <Pressable
            style={[styles.actionBtn, styles.approveBtn, loading === "approved" && { opacity: 0.6 }]}
            onPress={() => handleResolve("approved")}
            disabled={!!loading}
          >
            {loading === "approved"
              ? <ActivityIndicator size="small" color="#fff" />
              : <>
                  <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                  <Text style={[styles.actionBtnText, { color: "#fff" }]}>Approve</Text>
                </>
            }
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ─── Agent Permission Row ─────────────────────────────────────────────────────
function AgentPermissionRow({ agent }: { agent: any }) {
  const [enabled, setEnabled]   = useState(agent.can_request_receipt === true);
  const [loading, setLoading]   = useState(false);
  const qc = useQueryClient();

  const toggle = async (val: boolean) => {
    setLoading(true);
    try {
      await api.admin.setReceiptPermission(agent.id, val);
      setEnabled(val);
      qc.invalidateQueries({ queryKey: ["/api/admin/agents"] });
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.permissionRow}>
      <View style={styles.agentAvatar}>
        <Ionicons name="person" size={18} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.permAgentName}>{agent.name}</Text>
        <Text style={[
          styles.permStatus,
          { color: enabled ? Colors.success : Colors.textMuted },
        ]}>
          {enabled ? "✓ Can request receipts" : "Receipt requests disabled"}
        </Text>
      </View>
      {loading
        ? <ActivityIndicator size="small" color={Colors.primary} />
        : <Switch
            value={enabled}
            onValueChange={toggle}
            trackColor={{ false: Colors.border, true: Colors.primary + "80" }}
            thumbColor={enabled ? Colors.primary : Colors.textMuted}
          />
      }
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ReceiptRequestsScreen() {
  const insets  = useSafeAreaInsets();
  const qc      = useQueryClient();
  const [activeTab, setActiveTab] = useState("Requests");

  const { data: requestsData, isLoading: reqLoading, refetch } = useQuery({
    queryKey: ["/api/admin/receipt-requests"],
    queryFn:  () => api.admin.getReceiptRequests(),
    refetchInterval: 30000,
  });

  const { data: agentsData, isLoading: agentsLoading } = useQuery({
    queryKey: ["/api/admin/agents"],
    queryFn:  () => api.admin.getAgents(),
  });

  const requests: any[] = requestsData?.requests || [];
  const agents:   any[] = (agentsData?.agents || []).filter((a: any) => a.role === "fos");

  const pending  = requests.filter(r => r.status === "pending");
  const resolved = requests.filter(r => r.status !== "pending");

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {/* Tab bar */}
      <View style={[styles.tabBar, { paddingTop: Platform.OS === "web" ? 67 : 12 }]}>
        {TABS.map((tab) => (
          <Pressable
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab}
            </Text>
            {tab === "Requests" && pending.length > 0 && (
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingBadgeText}>{pending.length}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>

      {/* ══ REQUESTS TAB ══ */}
      {activeTab === "Requests" && (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          {reqLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={Colors.primary} size="large" />
            </View>
          ) : requests.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="receipt-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No Receipt Requests</Text>
              <Text style={styles.emptySubtitle}>
                FOS agents with permission can request receipts from the case detail screen.
              </Text>
            </View>
          ) : (
            <>
              {/* Pending section */}
              {pending.length > 0 && (
                <>
                  <View style={styles.sectionHeader}>
                    <View style={[styles.sectionDot, { backgroundColor: "#F59E0B" }]} />
                    <Text style={styles.sectionTitle}>
                      Pending ({pending.length})
                    </Text>
                  </View>
                  {pending.map((req) => (
                    <RequestCard key={req.id} req={req} onResolve={refetch} />
                  ))}
                </>
              )}

              {/* Resolved section */}
              {resolved.length > 0 && (
                <>
                  <View style={styles.sectionHeader}>
                    <View style={[styles.sectionDot, { backgroundColor: Colors.textMuted }]} />
                    <Text style={styles.sectionTitle}>
                      Resolved ({resolved.length})
                    </Text>
                  </View>
                  {resolved.map((req) => (
                    <RequestCard key={req.id} req={req} onResolve={refetch} />
                  ))}
                </>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* ══ PERMISSIONS TAB ══ */}
      {activeTab === "Permissions" && (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.permInfoBox}>
            <Ionicons name="shield-checkmark-outline" size={18} color={Colors.primary} />
            <Text style={styles.permInfoText}>
              Enable the toggle to allow a FOS agent to see and use the "Request Receipt" button on case detail screens.
            </Text>
          </View>

          <View style={styles.permissionsCard}>
            {agentsLoading ? (
              <ActivityIndicator color={Colors.primary} style={{ margin: 24 }} />
            ) : agents.length === 0 ? (
              <Text style={[styles.emptySubtitle, { margin: 24, textAlign: "center" }]}>
                No FOS agents found.
              </Text>
            ) : (
              agents.map((agent, i) => (
                <View key={agent.id}>
                  <AgentPermissionRow agent={agent} />
                  {i < agents.length - 1 && <View style={styles.divider} />}
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  tabBar: {
    flexDirection: "row", backgroundColor: Colors.surface,
    paddingHorizontal: 8, paddingBottom: 12, gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1, alignItems: "center", paddingVertical: 10,
    borderRadius: 10, backgroundColor: Colors.surfaceAlt,
    flexDirection: "row", justifyContent: "center", gap: 6,
  },
  tabActive: { backgroundColor: Colors.primary },
  tabText:   { fontSize: 13, fontWeight: "600", color: Colors.textSecondary },
  tabTextActive: { color: "#fff" },
  pendingBadge: {
    backgroundColor: "#EF4444", borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 1, minWidth: 18, alignItems: "center",
  },
  pendingBadgeText: { fontSize: 10, fontWeight: "800", color: "#fff" },

  list:    { padding: 12, gap: 10 },
  centered:{ flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 80 },

  empty:        { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingTop: 80 },
  emptyTitle:   { fontSize: 16, fontWeight: "700", color: Colors.text },
  emptySubtitle:{ fontSize: 13, color: Colors.textMuted, textAlign: "center", lineHeight: 20 },

  sectionHeader: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 4, paddingHorizontal: 4, marginTop: 8,
  },
  sectionDot:  { width: 8, height: 8, borderRadius: 4 },
  sectionTitle:{ fontSize: 12, fontWeight: "700", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },

  // Request card
  requestCard: {
    backgroundColor: Colors.surface, borderRadius: 14,
    padding: 14, gap: 10,
    borderWidth: 1, borderColor: Colors.border,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  requestCardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  agentName: { fontSize: 14, fontWeight: "800", color: Colors.text },
  requestDate:{ fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  statusBadge:{
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 16,
  },
  statusText: { fontSize: 10, fontWeight: "700" },

  caseInfoRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  infoChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: Colors.surfaceAlt, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border,
    maxWidth: "100%",
  },
  infoChipText: { fontSize: 12, fontWeight: "600", color: Colors.textSecondary },

  notesRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: Colors.surfaceAlt, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  notesText: { flex: 1, fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },

  actionRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 6,
    paddingVertical: 11, borderRadius: 10,
  },
  rejectBtn: {
    backgroundColor: Colors.danger + "12",
    borderWidth: 1, borderColor: Colors.danger + "40",
  },
  approveBtn: { backgroundColor: Colors.success },
  actionBtnText: { fontSize: 13, fontWeight: "700" },

  // Permissions
  permInfoBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    backgroundColor: Colors.primary + "10", borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: Colors.primary + "30", marginBottom: 4,
  },
  permInfoText: { flex: 1, fontSize: 13, color: Colors.primary, lineHeight: 18 },
  permissionsCard: {
    backgroundColor: Colors.surface, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border, overflow: "hidden",
  },
  permissionRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  agentAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center",
  },
 divider:       { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border, marginLeft: 68 },

  amountRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  amountChip: {
    flex: 1, minWidth: 80,
    backgroundColor: Colors.surfaceAlt, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border,
    alignItems: "center",
  },
  amountLabel: { fontSize: 10, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  amountValue: { fontSize: 13, fontWeight: "800", color: Colors.text, marginTop: 2 },
});

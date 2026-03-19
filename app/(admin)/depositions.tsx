import React, { useState } from "react";
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, Pressable, Modal,
  TextInput, Alert, ScrollView, Platform, Image
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";
import { getApiUrl } from "@/lib/query-client";

type Tab = "required" | "history";

// ─── Add Deposit Modal ────────────────────────────────────────────────────────
function AddDepositModal({
  visible, onClose, agents,
}: { visible: boolean; onClose: () => void; agents: any[] }) {
  const qc = useQueryClient();
  const [agentId, setAgentId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  const save = async () => {
    if (!agentId) { Alert.alert("Error", "Please select an agent"); return; }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      Alert.alert("Error", "Enter a valid amount"); return;
    }
    setLoading(true);
    try {
      await api.admin.createRequiredDeposit({
        agentId: Number(agentId), amount: Number(amount), description,
      });
      setAgentId(""); setAmount(""); setDescription("");
      onClose();
      qc.invalidateQueries({ queryKey: ["/api/admin/required-deposits"] });
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <ScrollView style={modalStyles.sheet} showsVerticalScrollIndicator={false}>
          <View style={modalStyles.handle} />
          <Text style={modalStyles.title}>Add Required Deposit</Text>
          <Text style={modalStyles.subtitle}>Assign a deposit amount to a FOS agent</Text>

          <Text style={modalStyles.label}>Select FOS Agent</Text>
          <View style={{ gap: 6, marginBottom: 4 }}>
            {agents.map((a) => (
              <Pressable
                key={a.id}
                style={[
                  modalStyles.agentItem,
                  agentId === String(a.id) && modalStyles.agentItemSelected,
                ]}
                onPress={() => setAgentId(String(a.id))}
              >
                <Ionicons
                  name="person-circle" size={20}
                  color={agentId === String(a.id) ? "#fff" : Colors.primary}
                />
                <Text style={[
                  modalStyles.agentItemText,
                  agentId === String(a.id) && { color: "#fff" },
                ]}>
                  {a.name}
                </Text>
                {agentId === String(a.id) && (
                  <Ionicons name="checkmark-circle" size={18} color="#fff" />
                )}
              </Pressable>
            ))}
          </View>

          <Text style={modalStyles.label}>Amount (₹)</Text>
          <TextInput
            style={modalStyles.input}
            placeholder="Enter amount to deposit"
            placeholderTextColor={Colors.textMuted}
            keyboardType="numeric"
            value={amount}
            onChangeText={setAmount}
          />

          <Text style={modalStyles.label}>Description (Optional)</Text>
          <TextInput
            style={modalStyles.input}
            placeholder="e.g. Cash collected 01-03-2026"
            placeholderTextColor={Colors.textMuted}
            value={description}
            onChangeText={setDescription}
          />

          <View style={modalStyles.btnRow}>
            <Pressable style={modalStyles.cancelBtn} onPress={onClose}>
              <Text style={modalStyles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[modalStyles.saveBtn, loading && { opacity: 0.6 }]}
              onPress={save}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={modalStyles.saveText}>Add Deposit</Text>
              }
            </Pressable>
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function AdminDepositionsScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("required");
  const [addVisible, setAddVisible] = useState(false);
  const [screenshotModalUrl, setScreenshotModalUrl] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const { data: reqData, isLoading: reqLoading } = useQuery({
    queryKey: ["/api/admin/required-deposits"],
    queryFn: () => api.admin.getRequiredDeposits(),
  });

  const { data: agentsData } = useQuery({
    queryKey: ["/api/admin/agents"],
    queryFn: () => api.admin.getAgents(),
  });

  const required: any[] = reqData?.deposits || [];
  const agents = (agentsData?.agents || []).filter((a: any) => a.role !== "admin");

  // ✅ Split into pending and history
  const pendingDeposits = required.filter(
    (d) => !d.cash_collected && !d.alarm_scheduled
  );
  const screenshotUploaded = required.filter(
    (d) => d.screenshot_url && !d.alarm_scheduled && !d.cash_collected
  );
  const historyDeposits = required.filter(
    (d) => d.cash_collected || d.alarm_scheduled
  );

  const totalPending = required
    .filter((d) => !d.cash_collected)
    .reduce((s: number, d: any) => s + parseFloat(d.amount || 0), 0);
  const totalCollected = historyDeposits
    .reduce((s: number, d: any) => s + parseFloat(d.amount || 0), 0);

  // ─── Handlers ───────────────────────────────────────────────────────────────
  const handleDelete = (id: number) => {
    Alert.alert("Delete Deposit", "Remove this required deposit?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            await api.admin.deleteRequiredDeposit(id);
            qc.invalidateQueries({ queryKey: ["/api/admin/required-deposits"] });
          } catch (e: any) {
            Alert.alert("Error", e.message);
          }
        },
      },
    ]);
  };

  const handleVerify = async (id: number) => {
    setActionLoading(id);
    try {
      await api.admin.verifyScreenshot(id);
      qc.invalidateQueries({ queryKey: ["/api/admin/required-deposits"] });
      Alert.alert("✅ Verified", "Screenshot verified. FOS agent notified.");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setActionLoading(null);
    }
  };

  // ✅ NEW: Cash collected
  const handleCashCollected = (id: number, agentName: string, amount: string) => {
    const amtStr = parseFloat(amount).toLocaleString("en-IN");
    Alert.alert(
      "💵 Mark Cash Collected",
      `Confirm ₹${amtStr} cash collected from ${agentName}?\n\nThis will stop all hourly reminders to the agent.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            setActionLoading(id);
            try {
              await api.admin.markCashCollected(id);
              qc.invalidateQueries({ queryKey: ["/api/admin/required-deposits"] });
              Alert.alert("✅ Done", `Cash collected from ${agentName}. Reminders stopped.`);
            } catch (e: any) {
              Alert.alert("Error", e.message);
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  const showScreenshot = (url: string) => {
    const fullUrl = url.startsWith("http") ? url : `${getApiUrl()}${url}`;
    setScreenshotModalUrl(fullUrl);
  };

  // ─── Deposit Card ────────────────────────────────────────────────────────────
  const renderDepositCard = ({ item }: { item: any }) => {
    const hasScreenshot = !!item.screenshot_url;
    const screenshotSrc = hasScreenshot
      ? (item.screenshot_url.startsWith("http")
          ? item.screenshot_url
          : `${getApiUrl()}${item.screenshot_url}`)
      : null;
    const isVerified = item.alarm_scheduled === true;
    const isCashCollected = item.cash_collected === true;
    const isLoading = actionLoading === item.id;

    // Border color logic
    let borderColor = Colors.warning;
    if (isCashCollected) borderColor = Colors.success;
    else if (isVerified) borderColor = Colors.info;
    else if (hasScreenshot) borderColor = Colors.primary;

    return (
      <View style={[styles.reqCard, { borderLeftColor: borderColor }]}>

        {/* ── Top row: avatar + info + amount + delete ── */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={styles.reqLeft}>
            <View style={styles.agentAvatar}>
              <Ionicons name="person" size={18} color="#fff" />
            </View>
            <View style={styles.reqInfo}>
              <Text style={styles.reqAgent}>{item.agent_name}</Text>
              {item.description
                ? <Text style={styles.reqDesc}>{item.description}</Text>
                : null}
              <Text style={styles.reqDate}>
                Added: {item.created_at
                  ? new Date(item.created_at).toLocaleDateString("en-IN")
                  : ""}
              </Text>
              {hasScreenshot && item.screenshot_uploaded_at && (
                <Text style={[styles.reqDate, { color: Colors.info }]}>
                  Screenshot: {new Date(item.screenshot_uploaded_at).toLocaleString("en-IN", {
                    day: "2-digit", month: "short",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </Text>
              )}
              {isCashCollected && item.cash_collected_at && (
                <Text style={[styles.reqDate, { color: Colors.success }]}>
                  Collected: {new Date(item.cash_collected_at).toLocaleString("en-IN", {
                    day: "2-digit", month: "short",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.reqRight}>
            <Text style={styles.reqAmount}>
              ₹{parseFloat(item.amount).toLocaleString("en-IN")}
            </Text>
            {!isCashCollected && (
              <Pressable onPress={() => handleDelete(item.id)} style={styles.deleteBtn}>
                <Ionicons name="trash-outline" size={18} color={Colors.danger} />
              </Pressable>
            )}
          </View>
        </View>

        {/* ── Status badges ── */}
        <View style={styles.badgesRow}>
          {isCashCollected && (
            <View style={[styles.statusBadge, { backgroundColor: Colors.success + "20" }]}>
              <Ionicons name="cash" size={12} color={Colors.success} />
              <Text style={[styles.statusBadgeText, { color: Colors.success }]}>
                Cash Collected
              </Text>
            </View>
          )}
          {isVerified && (
            <View style={[styles.statusBadge, { backgroundColor: Colors.info + "20" }]}>
              <Ionicons name="shield-checkmark" size={12} color={Colors.info} />
              <Text style={[styles.statusBadgeText, { color: Colors.info }]}>
                Screenshot Verified
              </Text>
            </View>
          )}
          {!hasScreenshot && !isCashCollected && (
            <View style={[styles.statusBadge, { backgroundColor: Colors.warning + "20" }]}>
              <Ionicons name="time-outline" size={12} color={Colors.warning} />
              <Text style={[styles.statusBadgeText, { color: Colors.warning }]}>
                Awaiting Screenshot
              </Text>
            </View>
          )}
        </View>

        {/* ── Screenshot thumbnail ── */}
        {hasScreenshot && screenshotSrc && (
          <View style={styles.screenshotRow}>
            <Pressable
              onPress={() => showScreenshot(item.screenshot_url)}
              style={styles.thumbWrap}
            >
              <Image source={{ uri: screenshotSrc }} style={styles.thumb} resizeMode="cover" />
              <View style={styles.thumbOverlay}>
                <Ionicons name="eye-outline" size={16} color="#fff" />
              </View>
            </Pressable>
            <View style={styles.verifyCol}>
              {!isVerified && !isCashCollected && (
                <Pressable
                  style={[styles.verifyBtn, isLoading && { opacity: 0.6 }]}
                  onPress={() => handleVerify(item.id)}
                  disabled={isLoading}
                >
                  {isLoading
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <>
                        <Ionicons name="shield-checkmark-outline" size={14} color="#fff" />
                        <Text style={styles.verifyBtnText}>Verify Screenshot</Text>
                      </>
                  }
                </Pressable>
              )}
              {isVerified && !isCashCollected && (
                <View style={styles.verifiedBadge}>
                  <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                  <Text style={styles.verifiedText}>Screenshot Verified</Text>
                </View>
              )}
              {isCashCollected && (
                <View style={styles.verifiedBadge}>
                  <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                  <Text style={styles.verifiedText}>Cash Collected ✓</Text>
                </View>
              )}
              <Text style={styles.verifyHint}>Check date on screenshot</Text>
            </View>
          </View>
        )}

        {!hasScreenshot && !isCashCollected && (
          <View style={styles.noScreenshot}>
            <Ionicons name="camera-outline" size={13} color={Colors.textMuted} />
            <Text style={styles.noScreenshotText}>Awaiting payment screenshot</Text>
          </View>
        )}

        {/* ✅ Cash Collected button — shown when not yet collected */}
        {!isCashCollected && (
          <Pressable
            style={[
              styles.cashCollectedBtn,
              isLoading && { opacity: 0.6 },
            ]}
            onPress={() => handleCashCollected(item.id, item.agent_name, item.amount)}
            disabled={isLoading}
          >
            {isLoading
              ? <ActivityIndicator color="#fff" size="small" />
              : <>
                  <Ionicons name="cash-outline" size={16} color="#fff" />
                  <Text style={styles.cashCollectedBtnText}>Mark Cash Collected</Text>
                </>
            }
          </Pressable>
        )}
      </View>
    );
  };

  // ─── History Card ────────────────────────────────────────────────────────────
  const renderHistoryCard = ({ item }: { item: any }) => {
    const screenshotSrc = item.screenshot_url
      ? (item.screenshot_url.startsWith("http")
          ? item.screenshot_url
          : `${getApiUrl()}${item.screenshot_url}`)
      : null;

    return (
      <View style={styles.histCard}>
        <View style={styles.histHeader}>
          <View style={styles.amountBadge}>
            <Text style={styles.amountText}>
              ₹{parseFloat(item.amount).toLocaleString("en-IN")}
            </Text>
          </View>
          <Text style={styles.histDate}>
            {item.cash_collected_at
              ? new Date(item.cash_collected_at).toLocaleDateString("en-IN")
              : item.created_at
                ? new Date(item.created_at).toLocaleDateString("en-IN")
                : ""}
          </Text>
        </View>

        {item.agent_name && (
          <View style={styles.agentTag}>
            <MaterialIcons name="person" size={13} color={Colors.primary} />
            <Text style={styles.agentTagText}>{item.agent_name}</Text>
          </View>
        )}

        {item.description && (
          <Text style={styles.histNotes}>{item.description}</Text>
        )}

        {screenshotSrc && (
          <Pressable
            onPress={() => showScreenshot(item.screenshot_url)}
            style={[styles.thumbWrap, { marginTop: 8 }]}
          >
            <Image source={{ uri: screenshotSrc }} style={styles.thumb} resizeMode="cover" />
            <View style={styles.thumbOverlay}>
              <Ionicons name="eye-outline" size={16} color="#fff" />
            </View>
          </Pressable>
        )}

        <View style={{ flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          {item.cash_collected && (
            <View style={[styles.statusBadge, { backgroundColor: Colors.success + "20" }]}>
              <Ionicons name="cash" size={12} color={Colors.success} />
              <Text style={[styles.statusBadgeText, { color: Colors.success }]}>
                Cash Collected
              </Text>
            </View>
          )}
          {item.alarm_scheduled && (
            <View style={[styles.statusBadge, { backgroundColor: Colors.info + "20" }]}>
              <Ionicons name="shield-checkmark" size={12} color={Colors.info} />
              <Text style={[styles.statusBadgeText, { color: Colors.info }]}>
                Screenshot Verified
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      <View style={[styles.root, { paddingTop: Platform.OS === "web" ? 67 : 0 }]}>

        {/* Summary row */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { borderTopColor: Colors.warning }]}>
            <Ionicons name="time" size={20} color={Colors.warning} />
            <Text style={styles.summaryNum}>{pendingDeposits.length}</Text>
            <Text style={styles.summaryLabel}>Pending</Text>
          </View>
          <View style={[styles.summaryCard, { borderTopColor: Colors.info }]}>
            <Ionicons name="camera" size={20} color={Colors.info} />
            <Text style={styles.summaryNum}>{screenshotUploaded.length}</Text>
            <Text style={styles.summaryLabel}>To Verify</Text>
          </View>
          <View style={[styles.summaryCard, { borderTopColor: Colors.success }]}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
            <Text style={styles.summaryNum}>
              ₹{totalCollected.toLocaleString("en-IN")}
            </Text>
            <Text style={styles.summaryLabel}>Collected</Text>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          <Pressable
            style={[styles.tabBtn, tab === "required" && styles.tabBtnActive]}
            onPress={() => setTab("required")}
          >
            <Ionicons
              name="time" size={16}
              color={tab === "required" ? "#fff" : Colors.textSecondary}
            />
            <Text style={[styles.tabText, tab === "required" && styles.tabTextActive]}>
              Required
            </Text>
            {required.filter((d) => !d.cash_collected).length > 0 && (
              <View style={[
                styles.badge,
                tab === "required" && { backgroundColor: "rgba(255,255,255,0.3)" },
              ]}>
                <Text style={[
                  styles.badgeText,
                  tab === "required" && { color: "#fff" },
                ]}>
                  {required.filter((d) => !d.cash_collected).length}
                </Text>
              </View>
            )}
          </Pressable>

          <Pressable
            style={[styles.tabBtn, tab === "history" && styles.tabBtnActive]}
            onPress={() => setTab("history")}
          >
            <Ionicons
              name="checkmark-circle" size={16}
              color={tab === "history" ? "#fff" : Colors.textSecondary}
            />
            <Text style={[styles.tabText, tab === "history" && styles.tabTextActive]}>
              Collected
            </Text>
            {historyDeposits.length > 0 && (
              <View style={[
                styles.badge,
                tab === "history" && { backgroundColor: "rgba(255,255,255,0.3)" },
              ]}>
                <Text style={[
                  styles.badgeText,
                  tab === "history" && { color: "#fff" },
                ]}>
                  {historyDeposits.length}
                </Text>
              </View>
            )}
          </Pressable>
        </View>

        {tab === "required" ? (
          <>
            <Pressable style={styles.addBtn} onPress={() => setAddVisible(true)}>
              <Ionicons name="add-circle" size={20} color="#fff" />
              <Text style={styles.addBtnText}>Add Required Deposit</Text>
            </Pressable>

            {reqLoading ? (
              <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                <ActivityIndicator color={Colors.primary} size="large" />
              </View>
            ) : (
              <FlatList
                data={required.filter((d) => !d.cash_collected)}
                keyExtractor={(item) => String(item.id)}
                contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
                renderItem={renderDepositCard}
                ListEmptyComponent={
                  <View style={styles.empty}>
                    <Ionicons name="wallet-outline" size={52} color={Colors.textMuted} />
                    <Text style={styles.emptyTitle}>No Pending Deposits</Text>
                    <Text style={styles.emptyText}>
                      All deposits collected or no deposits assigned yet.
                    </Text>
                  </View>
                }
              />
            )}
          </>
        ) : (
          <FlatList
            data={historyDeposits}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
            renderItem={renderHistoryCard}
            ListEmptyComponent={
              reqLoading ? (
                <View style={{ padding: 60, alignItems: "center" }}>
                  <ActivityIndicator color={Colors.primary} size="large" />
                </View>
              ) : (
                <View style={styles.empty}>
                  <Ionicons name="checkmark-circle-outline" size={52} color={Colors.textMuted} />
                  <Text style={styles.emptyTitle}>No Collected Deposits</Text>
                  <Text style={styles.emptyText}>
                    Deposits marked as cash collected will appear here.
                  </Text>
                </View>
              )
            }
          />
        )}
      </View>

      {/* Full-screen screenshot modal */}
      <Modal
        visible={!!screenshotModalUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setScreenshotModalUrl(null)}
      >
        <Pressable
          style={{
            flex: 1, backgroundColor: "rgba(0,0,0,0.92)",
            justifyContent: "center", alignItems: "center",
          }}
          onPress={() => setScreenshotModalUrl(null)}
        >
          <Image
            source={{ uri: screenshotModalUrl! }}
            style={{ width: "92%", height: "75%", borderRadius: 12 }}
            resizeMode="contain"
          />
          <Pressable
            onPress={() => setScreenshotModalUrl(null)}
            style={{
              marginTop: 20, backgroundColor: "rgba(255,255,255,0.15)",
              paddingHorizontal: 28, paddingVertical: 10, borderRadius: 20,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Close</Text>
          </Pressable>
        </Pressable>
      </Modal>

      <AddDepositModal
        visible={addVisible}
        onClose={() => setAddVisible(false)}
        agents={agents}
      />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  summaryRow: { flexDirection: "row", gap: 10, padding: 16, paddingBottom: 0 },
  summaryCard: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: 12, padding: 12,
    borderTopWidth: 3, alignItems: "center", gap: 4,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  summaryNum: { fontSize: 13, fontWeight: "800", color: Colors.text },
  summaryLabel: { fontSize: 10, color: Colors.textSecondary, fontWeight: "600" },
  tabs: { flexDirection: "row", margin: 16, marginBottom: 0, gap: 8 },
  tabBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12,
    backgroundColor: Colors.surfaceAlt, alignItems: "center",
    flexDirection: "row", justifyContent: "center", gap: 6,
  },
  tabBtnActive: { backgroundColor: Colors.primary },
  tabText: { fontSize: 13, fontWeight: "700", color: Colors.textSecondary },
  tabTextActive: { color: "#fff" },
  badge: {
    backgroundColor: Colors.border, borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 1, minWidth: 20, alignItems: "center",
  },
  badgeText: { fontSize: 11, fontWeight: "700", color: Colors.textSecondary },
  addBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    margin: 16, marginBottom: 8, backgroundColor: Colors.primary,
    borderRadius: 12, padding: 14, justifyContent: "center",
  },
  addBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  list: { padding: 16, paddingTop: 8, gap: 10 },
  reqCard: {
    backgroundColor: Colors.surface, borderRadius: 14, padding: 14,
    flexDirection: "column", gap: 0,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
    borderLeftWidth: 4, borderLeftColor: Colors.warning,
  },
  reqLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  agentAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center",
  },
  reqInfo: { flex: 1 },
  reqAgent: { fontSize: 14, fontWeight: "700", color: Colors.text },
  reqDesc: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  reqDate: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  reqRight: { alignItems: "flex-end", gap: 8 },
  reqAmount: { fontSize: 18, fontWeight: "800", color: Colors.warning },
  deleteBtn: { padding: 4 },
  badgesRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 8 },
  statusBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20,
  },
  statusBadgeText: { fontSize: 11, fontWeight: "700" },
  screenshotRow: {
    flexDirection: "row", gap: 12, marginTop: 10, alignItems: "flex-start",
  },
  thumbWrap: {
    position: "relative", width: 72, height: 72,
    borderRadius: 8, overflow: "hidden",
  },
  thumb: { width: 72, height: 72, borderRadius: 8 },
  thumbOverlay: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: 24,
    backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center",
  },
  verifyCol: { flex: 1, gap: 6, justifyContent: "center" },
  verifiedBadge: { flexDirection: "row", alignItems: "center", gap: 6 },
  verifiedText: { fontSize: 13, fontWeight: "700", color: Colors.success },
  verifyBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: Colors.info, borderRadius: 8,
    paddingVertical: 8, paddingHorizontal: 12, alignSelf: "flex-start",
  },
  verifyBtnText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  verifyHint: { fontSize: 10, color: Colors.textMuted, lineHeight: 14 },
  noScreenshot: {
    flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8,
  },
  noScreenshotText: { fontSize: 11, color: Colors.textMuted, fontStyle: "italic" },

  // ✅ NEW: Cash collected button
  cashCollectedBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: Colors.success, borderRadius: 10,
    paddingVertical: 11, paddingHorizontal: 16, marginTop: 12,
  },
  cashCollectedBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },

  histCard: {
    backgroundColor: Colors.surface, borderRadius: 14, padding: 14, gap: 6,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
    borderLeftWidth: 4, borderLeftColor: Colors.success,
  },
  histHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  amountBadge: {
    backgroundColor: Colors.success + "15",
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  amountText: { fontSize: 16, fontWeight: "800", color: Colors.success },
  histDate: { fontSize: 12, color: Colors.textSecondary },
  agentTag: { flexDirection: "row", alignItems: "center", gap: 4 },
  agentTagText: { fontSize: 12, fontWeight: "600", color: Colors.primary },
  histNotes: { fontSize: 12, color: Colors.textSecondary, fontStyle: "italic" },
  empty: {
    flex: 1, justifyContent: "center", alignItems: "center",
    gap: 8, paddingVertical: 60, paddingHorizontal: 32,
  },
  emptyTitle: { fontSize: 16, color: Colors.textMuted, fontWeight: "700" },
  emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: "center" },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 24,
    borderTopRightRadius: 24, padding: 24, maxHeight: "90%",
  },
  handle: {
    width: 40, height: 4, backgroundColor: Colors.border,
    borderRadius: 2, alignSelf: "center", marginBottom: 12,
  },
  title: { fontSize: 20, fontWeight: "700", color: Colors.text },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginBottom: 12 },
  label: {
    fontSize: 12, fontWeight: "700", color: Colors.textSecondary,
    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, marginTop: 8,
  },
  agentItem: {
    flexDirection: "row", alignItems: "center", gap: 10, padding: 12,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt,
  },
  agentItemSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  agentItemText: { flex: 1, fontSize: 14, fontWeight: "600", color: Colors.text },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 14,
    fontSize: 15, color: Colors.text, backgroundColor: Colors.surfaceAlt, marginBottom: 4,
  },
  btnRow: { flexDirection: "row", gap: 12, marginTop: 8 },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, alignItems: "center",
  },
  cancelText: { fontSize: 15, fontWeight: "600", color: Colors.textSecondary },
  saveBtn: {
    flex: 2, paddingVertical: 14, borderRadius: 12,
    backgroundColor: Colors.primary, alignItems: "center",
  },
  saveText: { fontSize: 15, fontWeight: "700", color: "#fff" },
});

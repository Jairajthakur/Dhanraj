import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, Modal, Pressable,
  TextInput, ActivityIndicator, Alert, ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";
 
// ─── Types ────────────────────────────────────────────────────────────────────
interface Agent {
  id: number;
  name: string;
  case_count?: number;
}
 
interface Props {
  item: any | null;        // the case object; null = closed
  onClose: () => void;
  onSuccess: () => void;
}
 
// ─── Component ────────────────────────────────────────────────────────────────
export function ReassignCaseModal({ item, onClose, onSuccess }: Props) {
  const insets = useSafeAreaInsets();
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
 
  // Reset whenever modal opens for a new case
  useEffect(() => {
    if (item) {
      setSelectedAgentId(null);
      setReason("");
      setDone(false);
    }
  }, [item?.id]);
 
  // ── Fetch all agents ──
  const { data: agentData, isLoading: loadingAgents } = useQuery<{ agents: Agent[] }>({
    queryKey: ["/api/admin/agents"],
    queryFn:  () => api.admin.getAgents(),
    staleTime: 60_000,
    enabled:  !!item,
  });
 
  const agents = (agentData?.agents ?? []).filter(
    (a) => a.id !== item?.agent_id          // exclude current agent
  );
 
  const selectedAgent = agents.find((a) => a.id === selectedAgentId);
 
  // ── Submit ──
  const handleConfirm = async () => {
    if (!selectedAgentId) {
      Alert.alert("Select Agent", "Please choose an agent to reassign to.");
      return;
    }
    setSubmitting(true);
    try {
      await api.admin.reassignCase(item.id, {
        to_agent_id: selectedAgentId,
        case_type:   item.case_type ?? "loan",
        reason:      reason.trim() || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDone(true);
      onSuccess();
    } catch (e: any) {
      Alert.alert("Reassign Failed", e.message || "Could not reassign case.");
    } finally {
      setSubmitting(false);
    }
  };
 
  const handleClose = () => {
    setDone(false);
    onClose();
  };
 
  if (!item) return null;
 
  return (
    <Modal
      visible={!!item}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.handle} />
 
          {done ? (
            /* ── Success State ── */
            <View style={styles.successContainer}>
              <View style={styles.successIcon}>
                <Ionicons name="checkmark-circle" size={48} color={Colors.success} />
              </View>
              <Text style={styles.successTitle}>Case Reassigned!</Text>
              <Text style={styles.successMsg}>
                <Text style={{ fontWeight: "700" }}>{item.customer_name}</Text>
                {" "}has been reassigned to{" "}
                <Text style={{ fontWeight: "700" }}>{selectedAgent?.name ?? "new agent"}</Text>.
                {"\n"}The reassignment has been logged.
              </Text>
              <Pressable style={styles.doneBtn} onPress={handleClose}>
                <Text style={styles.doneBtnText}>Done</Text>
              </Pressable>
            </View>
          ) : (
            /* ── Form State ── */
            <>
              {/* Header */}
              <View style={styles.headerRow}>
                <View style={styles.headerIcon}>
                  <Ionicons name="swap-horizontal-outline" size={22} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>Reassign Case</Text>
                  <Text style={styles.subtitle} numberOfLines={1}>
                    {item.customer_name} · {item.loan_no}
                  </Text>
                </View>
              </View>
 
              {/* Current agent info box */}
              <View style={styles.infoBox}>
                <Ionicons name="person-outline" size={15} color={Colors.textSecondary} />
                <Text style={styles.infoText}>
                  Currently assigned to{" "}
                  <Text style={{ fontWeight: "700", color: Colors.text }}>
                    {item.agent_name ?? "Unassigned"}
                  </Text>
                </Text>
              </View>
 
              {/* Agent picker */}
              <Text style={styles.pickerLabel}>Select New Agent</Text>
 
              {loadingAgents ? (
                <ActivityIndicator color={Colors.primary} style={{ marginVertical: 12 }} />
              ) : (
                <ScrollView
                  style={styles.agentList}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                >
                  {agents.map((agent) => (
                    <Pressable
                      key={agent.id}
                      style={[
                        styles.agentRow,
                        selectedAgentId === agent.id && styles.agentRowSelected,
                      ]}
                      onPress={() => setSelectedAgentId(agent.id)}
                    >
                      <View style={styles.agentAvatar}>
                        <Text style={styles.agentAvatarText}>
                          {agent.name.slice(0, 2).toUpperCase()}
                        </Text>
                      </View>
                      <Text style={styles.agentName}>{agent.name}</Text>
                      {agent.case_count != null && (
                        <Text style={styles.agentCaseCount}>
                          {agent.case_count} cases
                        </Text>
                      )}
                      {selectedAgentId === agent.id && (
                        <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
                      )}
                    </Pressable>
                  ))}
                </ScrollView>
              )}
 
              {/* Reason input */}
              <TextInput
                style={styles.reasonInput}
                placeholder="Reason for reassign (optional)"
                placeholderTextColor={Colors.textMuted}
                value={reason}
                onChangeText={setReason}
                maxLength={200}
                multiline
              />
 
              {/* Buttons */}
              <View style={styles.btnRow}>
                <Pressable style={styles.cancelBtn} onPress={handleClose}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.confirmBtn,
                    (!selectedAgentId || submitting) && { opacity: 0.5 },
                  ]}
                  onPress={handleConfirm}
                  disabled={!selectedAgentId || submitting}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="swap-horizontal-outline" size={16} color="#fff" />
                      <Text style={styles.confirmText}>
                        Confirm Reassign
                        {selectedAgent ? ` → ${selectedAgent.name.split(" ")[0]}` : ""}
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
 
// ─── Styles ───────────────────────────────────────────────────────────────────
// Mirrors rrStyles from customer/[id].tsx exactly
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 14,
    maxHeight: "85%",
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 4,
  },
 
  // ── Header ──
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
 
  // ── Info box ──
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
 
  // ── Agent picker ──
  pickerLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  agentList: {
    maxHeight: 180,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    overflow: "hidden",
  },
  agentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  agentRowSelected: {
    backgroundColor: Colors.primary + "0D",
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  agentAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.surfaceElevated ?? Colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  agentAvatarText: {
    fontSize: 11,
    fontWeight: "800",
    color: Colors.text,
  },
  agentName: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: Colors.text,
  },
  agentCaseCount: {
    fontSize: 11,
    color: Colors.textMuted,
    marginRight: 4,
  },
 
  // ── Reason input ──
  reasonInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: Colors.text,
    minHeight: 56,
    textAlignVertical: "top",
    backgroundColor: Colors.surfaceAlt,
  },
 
  // ── Buttons ──
  btnRow: {
    flexDirection: "row",
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  confirmBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  confirmText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
 
  // ── Success ──
  successContainer: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 16,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.success + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: Colors.text,
  },
  successMsg: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  doneBtn: {
    marginTop: 8,
    paddingVertical: 14,
    paddingHorizontal: 40,
    backgroundColor: Colors.success,
    borderRadius: 14,
    alignItems: "center",
  },
  doneBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
});
 

import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Modal,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";

interface FosAssignmentRow {
  id: number;
  name: string;
  username: string;
  phone: string | null;
  assigned_telecaller_id: number | null;
  telecaller_name: string | null;
}

interface Telecaller {
  id: number;
  name: string;
  username: string;
  phone: string | null;
}

function FosPickerModal({
  visible,
  telecaller,
  allFos,
  onClose,
  onToggle,
  pendingId,
}: {
  visible: boolean;
  telecaller: Telecaller | null;
  allFos: FosAssignmentRow[];
  onClose: () => void;
  onToggle: (fos: FosAssignmentRow) => void;
  pendingId: number | null;
}) {
  const insets = useSafeAreaInsets();
  if (!telecaller) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <View style={[modalStyles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={modalStyles.header}>
            <View style={{ flex: 1 }}>
              <Text style={modalStyles.title}>{telecaller.name}</Text>
              <Text style={modalStyles.subtitle}>Select dedicated FOS agents</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </Pressable>
          </View>

          <FlatList
            data={allFos}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={{ padding: 16, gap: 10 }}
            renderItem={({ item }) => {
              const isMine = item.assigned_telecaller_id === telecaller.id;
              const isOthers = !!item.assigned_telecaller_id && !isMine;
              const isPending = pendingId === item.id;
              return (
                <Pressable
                  style={[
                    modalStyles.fosRow,
                    isMine && modalStyles.fosRowSelected,
                  ]}
                  disabled={isPending}
                  onPress={() => {
                    if (isOthers) {
                      Alert.alert(
                        "Reassign FOS?",
                        `${item.name} is currently dedicated to ${item.telecaller_name}. Reassign to ${telecaller.name}?`,
                        [
                          { text: "Cancel", style: "cancel" },
                          { text: "Reassign", onPress: () => onToggle(item) },
                        ]
                      );
                    } else {
                      onToggle(item);
                    }
                  }}
                >
                  <View
                    style={[
                      modalStyles.checkbox,
                      isMine && modalStyles.checkboxChecked,
                    ]}
                  >
                    {isMine ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={modalStyles.fosName}>{item.name}</Text>
                    {isOthers ? (
                      <Text style={modalStyles.fosMeta}>
                        Currently with {item.telecaller_name}
                      </Text>
                    ) : (
                      <Text style={modalStyles.fosMeta}>@{item.username}</Text>
                    )}
                  </View>
                  {isPending ? <ActivityIndicator size="small" color={Colors.primary} /> : null}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <Text style={modalStyles.emptyText}>No FOS agents found.</Text>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

export default function TelecallerAssignmentScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [pickerTelecaller, setPickerTelecaller] = useState<Telecaller | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);

  const {
    data: telecallersData,
    isLoading: loadingTelecallers,
  } = useQuery({
    queryKey: ["/api/admin/telecallers"],
    queryFn: () => api.admin.getTelecallers(),
  });

  const {
    data: assignmentsData,
    isLoading: loadingAssignments,
  } = useQuery({
    queryKey: ["/api/admin/fos-assignments"],
    queryFn: () => api.admin.getFosAssignments(),
  });

  const telecallers: Telecaller[] = telecallersData?.telecallers || [];
  const fosAgents: FosAssignmentRow[] = assignmentsData?.agents || [];

  const assignMutation = useMutation({
    mutationFn: ({ fosId, telecallerId }: { fosId: number; telecallerId: number | null }) =>
      api.admin.assignFosToTelecaller(fosId, telecallerId),
    onMutate: ({ fosId }) => setPendingId(fosId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fos-assignments"] });
    },
    onError: (e: any) => {
      Alert.alert("Error", e?.message || "Could not update assignment");
    },
    onSettled: () => setPendingId(null),
  });

  const fosByTelecaller = useMemo(() => {
    const map: Record<number, FosAssignmentRow[]> = {};
    for (const fos of fosAgents) {
      if (fos.assigned_telecaller_id) {
        if (!map[fos.assigned_telecaller_id]) map[fos.assigned_telecaller_id] = [];
        map[fos.assigned_telecaller_id].push(fos);
      }
    }
    return map;
  }, [fosAgents]);

  const unassignedCount = useMemo(
    () => fosAgents.filter((f) => !f.assigned_telecaller_id).length,
    [fosAgents]
  );

  const handleToggle = (fos: FosAssignmentRow) => {
    if (!pickerTelecaller) return;
    const isMine = fos.assigned_telecaller_id === pickerTelecaller.id;
    assignMutation.mutate({
      fosId: fos.id,
      telecallerId: isMine ? null : pickerTelecaller.id,
    });
  };

  const isLoading = loadingTelecallers || loadingAssignments;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={telecallers}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 24 }}
          ListHeaderComponent={
            <View style={{ marginBottom: 4 }}>
              <Text style={styles.headerTitle}>FOS → Telecaller Assignment</Text>
              <Text style={styles.headerSubtitle}>
                Assign field officers to a dedicated telecaller. Telecallers only see cases
                belonging to their assigned FOS agents.
                {unassignedCount > 0
                  ? `  ${unassignedCount} FOS agent${unassignedCount !== 1 ? "s" : ""} unassigned.`
                  : ""}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const assigned = fosByTelecaller[item.id] || [];
            return (
              <Pressable
                style={styles.card}
                onPress={() => setPickerTelecaller(item)}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.avatarCircle}>
                    <Ionicons name="headset" size={18} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardName}>{item.name}</Text>
                    <Text style={styles.cardMeta}>@{item.username}</Text>
                  </View>
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>{assigned.length}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                </View>

                {assigned.length > 0 ? (
                  <View style={styles.chipsRow}>
                    {assigned.map((fos) => (
                      <View key={fos.id} style={styles.chip}>
                        <Text style={styles.chipText}>{fos.name}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.noneText}>No FOS agents assigned yet</Text>
                )}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="headset-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No telecallers found</Text>
              <Text style={styles.emptySubtext}>
                Create a telecaller account (role: telecaller) to assign FOS agents to it.
              </Text>
            </View>
          }
        />
      )}

      <FosPickerModal
        visible={!!pickerTelecaller}
        telecaller={pickerTelecaller}
        allFos={fosAgents}
        onClose={() => setPickerTelecaller(null)}
        onToggle={handleToggle}
        pendingId={pendingId}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerTitle: { fontSize: 18, fontWeight: "800", color: Colors.text },
  headerSubtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 6, lineHeight: 18 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  cardName: { fontSize: 15, fontWeight: "700", color: Colors.text },
  cardMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
  countBadge: {
    backgroundColor: Colors.primary + "18",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  countBadgeText: { fontSize: 12, fontWeight: "800", color: Colors.primary },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: { fontSize: 12, fontWeight: "600", color: Colors.text },
  noneText: { fontSize: 12, color: Colors.textMuted, fontStyle: "italic" },
  empty: { alignItems: "center", gap: 8, paddingVertical: 60, paddingHorizontal: 24 },
  emptyText: { fontSize: 16, color: Colors.textMuted, fontWeight: "600" },
  emptySubtext: { fontSize: 13, color: Colors.textMuted, textAlign: "center" },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "85%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: { fontSize: 17, fontWeight: "800", color: Colors.text },
  subtitle: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  fosRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  fosRowSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary + "0D" },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  fosName: { fontSize: 14, fontWeight: "700", color: Colors.text },
  fosMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
  emptyText: { textAlign: "center", color: Colors.textMuted, marginTop: 40 },
});

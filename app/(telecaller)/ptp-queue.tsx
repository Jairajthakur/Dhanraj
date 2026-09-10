import React, { useMemo, useState } from "react";
import {
  View, Text, StyleSheet, SectionList, Pressable, ActivityIndicator, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";
import { PtpQueueCard, CaseDetailModal } from "@/components/TelecallerShared";

export default function PtpQueueScreen() {
  const insets = useSafeAreaInsets();
  const [selectedCase, setSelectedCase] = useState<any>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/telecaller/ptp-queue"],
    queryFn: () => api.telecaller.getPtpQueue(),
  });

  const overdue: any[] = data?.overdue || [];
  const dueToday: any[] = data?.dueToday || [];
  const dueTomorrow: any[] = data?.dueTomorrow || [];

  const sections = useMemo(() => {
    const list = [];
    if (overdue.length) list.push({ title: "Overdue", key: "overdue", data: overdue });
    if (dueToday.length) list.push({ title: "Due Today", key: "dueToday", data: dueToday });
    if (dueTomorrow.length) list.push({ title: "Due Tomorrow", key: "dueTomorrow", data: dueTomorrow });
    return list;
  }, [overdue, dueToday, dueTomorrow]);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={[styles.header, { paddingTop: insets.top + (Platform.OS === "web" ? 20 : 8) }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>PTP Follow-ups</Text>
          <Text style={styles.headerSub}>{overdue.length} overdue · {dueToday.length} due today · {dueTomorrow.length} due tomorrow</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => `${item.case_type}-${item.id}`}
          renderItem={({ item, section }) => (
            <PtpQueueCard item={item} variant={section.key as any} onDetails={setSelectedCase} />
          )}
          renderSectionHeader={({ section }) => {
            const headerColor = section.key === "overdue" ? Colors.danger : section.key === "dueTomorrow" ? Colors.warning : Colors.statusPTP;
            return (
              <View style={[styles.sectionHeader, { backgroundColor: headerColor + "18" }]}>
                <Text style={[styles.sectionHeaderText, { color: headerColor }]}>
                  {section.title} ({section.data.length})
                </Text>
              </View>
            );
          }}
          stickySectionHeadersEnabled
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }, sections.length === 0 && { flex: 1 }]}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="checkmark-done-circle-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No broken, due-today, or due-tomorrow PTPs — nice work.</Text>
            </View>
          }
        />
      )}

      <CaseDetailModal item={selectedCase} onClose={() => setSelectedCase(null)} onUpdated={refetch} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingBottom: 14, backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: "800", color: Colors.text },
  headerSub: { fontSize: 12, color: Colors.textMuted, marginTop: 1, fontWeight: "500" },
  list: { padding: 12, gap: 12 },
  sectionHeader: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, marginBottom: 10, marginTop: 2 },
  sectionHeaderText: { fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText: { fontSize: 15, color: Colors.textMuted, textAlign: "center", paddingHorizontal: 30 },
});

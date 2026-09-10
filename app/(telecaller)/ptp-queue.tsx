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
import { PtpQueueCard, CaseDetailModal, BulkWhatsAppModal, groupCasesByAgent } from "@/components/TelecallerShared";

type PtpSection = {
  title: string;
  key: string;
  variant: "overdue" | "dueToday" | "dueTomorrow";
  data: any[];
};

export default function PtpQueueScreen() {
  const insets = useSafeAreaInsets();
  const [selectedCase, setSelectedCase] = useState<any>(null);
  const [bulkTarget, setBulkTarget] = useState<{ title: string; items: any[] } | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/telecaller/ptp-queue"],
    queryFn: () => api.telecaller.getPtpQueue(),
  });

  const overdue: any[] = data?.overdue || [];
  const dueToday: any[] = data?.dueToday || [];
  const dueTomorrow: any[] = data?.dueTomorrow || [];

  // Tomorrow's PTPs are the ones telecallers get ahead of with a WhatsApp
  // reminder, so they're grouped agent-wise — one section per FOS agent —
  // and each group (plus the whole day) gets a "Send All" bulk-WhatsApp entry point.
  const dueTomorrowByAgent = useMemo(() => groupCasesByAgent(dueTomorrow), [dueTomorrow]);

  const sections = useMemo<PtpSection[]>(() => {
    const list: PtpSection[] = [];
    if (overdue.length) list.push({ title: "Overdue", key: "overdue", variant: "overdue", data: overdue });
    if (dueToday.length) list.push({ title: "Due Today", key: "dueToday", variant: "dueToday", data: dueToday });
    for (const group of dueTomorrowByAgent) {
      list.push({
        title: group.agentName,
        key: `dueTomorrow-${group.agentId}`,
        variant: "dueTomorrow",
        data: group.items,
      });
    }
    return list;
  }, [overdue, dueToday, dueTomorrowByAgent]);

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

      {dueTomorrow.length > 0 ? (
        <Pressable
          style={styles.bulkBanner}
          onPress={() => setBulkTarget({ title: "Tomorrow's PTP Reminders", items: dueTomorrow })}
        >
          <Ionicons name="logo-whatsapp" size={20} color="#fff" />
          <Text style={styles.bulkBannerText}>
            Send all {dueTomorrow.length} tomorrow's PTP{dueTomorrow.length !== 1 ? "s" : ""} on WhatsApp ({dueTomorrowByAgent.length} agent{dueTomorrowByAgent.length !== 1 ? "s" : ""})
          </Text>
          <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.85)" />
        </Pressable>
      ) : null}

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => `${item.case_type}-${item.id}`}
          renderItem={({ item, section }) => (
            <PtpQueueCard item={item} variant={(section as PtpSection).variant} onDetails={setSelectedCase} />
          )}
          renderSectionHeader={({ section }) => {
            const s = section as PtpSection;
            const headerColor = s.variant === "overdue" ? Colors.danger : s.variant === "dueTomorrow" ? Colors.warning : Colors.statusPTP;
            return (
              <View style={[styles.sectionHeader, { backgroundColor: headerColor + "18" }]}>
                <Text style={[styles.sectionHeaderText, { color: headerColor }]} numberOfLines={1}>
                  {s.variant === "dueTomorrow" ? `${s.title} · Due Tomorrow` : s.title} ({s.data.length})
                </Text>
                {s.variant === "dueTomorrow" ? (
                  <Pressable
                    style={styles.sectionSendAllBtn}
                    onPress={() => setBulkTarget({ title: `${s.title} — Tomorrow's PTPs`, items: s.data })}
                  >
                    <Ionicons name="logo-whatsapp" size={13} color="#fff" />
                    <Text style={styles.sectionSendAllText}>Send All</Text>
                  </Pressable>
                ) : null}
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
      <BulkWhatsAppModal
        visible={!!bulkTarget}
        title={bulkTarget?.title || ""}
        items={bulkTarget?.items || []}
        onClose={() => setBulkTarget(null)}
      />
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
  bulkBanner: {
    flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 12, marginTop: 12,
    backgroundColor: "#25D366", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    shadowColor: "#25D366", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 3,
  },
  bulkBannerText: { flex: 1, color: "#fff", fontSize: 12.5, fontWeight: "700" },
  list: { padding: 12, gap: 12 },
  sectionHeader: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, marginBottom: 10, marginTop: 2,
  },
  sectionHeaderText: { flex: 1, fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 },
  sectionSendAllBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#25D366", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
  },
  sectionSendAllText: { color: "#fff", fontSize: 10.5, fontWeight: "800", textTransform: "uppercase" },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText: { fontSize: 15, color: Colors.textMuted, textAlign: "center", paddingHorizontal: 30 },
});

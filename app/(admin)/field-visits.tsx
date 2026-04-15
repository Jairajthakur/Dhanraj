/**
 * Admin — Field Visit Tracker
 * Route: /(admin)/field-visits
 *
 * Shows every GPS check-in recorded by agents, with:
 *   • Date picker  (defaults to today)
 *   • Agent filter (All or a specific FOS)
 *   • Summary bar  (total visits, unique agents, unique cases)
 *   • Per-visit card with Google Maps deep-link
 *   • Pull-to-refresh + auto-refresh every 60 s
 */

import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Linking,
  RefreshControl,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────

interface FieldVisit {
  id: number;
  case_id: number;
  case_type: "loan" | "bkt" | string;
  agent_id: number;
  agent_name: string | null;
  lat: number;
  lng: number;
  accuracy: number | null;
  visited_at: string;
  customer_name: string | null;
  loan_no: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayISO(): string {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().split("T")[0];
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Shift YYYY-MM-DD by +/- N days */
function shiftDate(iso: string, delta: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + delta);
  return d.toISOString().split("T")[0];
}

function openInMaps(lat: number, lng: number, label?: string | null) {
  const query = label ? encodeURIComponent(label) : `${lat},${lng}`;
  const url =
    Platform.OS === "ios"
      ? `maps:0,0?q=${query}@${lat},${lng}`
      : `geo:${lat},${lng}?q=${lat},${lng}(${query})`;
  Linking.openURL(url).catch(() =>
    Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
    )
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SummaryBar({
  visits,
}: {
  visits: FieldVisit[];
}) {
  const uniqueAgents = new Set(visits.map((v) => v.agent_id)).size;
  const uniqueCases = new Set(visits.map((v) => v.case_id)).size;

  const pills = [
    { label: "Visits", value: visits.length, icon: "location", color: Colors.info },
    { label: "Agents", value: uniqueAgents, icon: "people", color: Colors.success },
    { label: "Cases",  value: uniqueCases,  icon: "briefcase", color: Colors.warning },
  ] as const;

  return (
    <View style={styles.summaryBar}>
      {pills.map((p) => (
        <View key={p.label} style={[styles.summaryPill, { borderColor: p.color + "40" }]}>
          <Ionicons name={p.icon as any} size={16} color={p.color} />
          <Text style={[styles.summaryValue, { color: p.color }]}>{p.value}</Text>
          <Text style={styles.summaryLabel}>{p.label}</Text>
        </View>
      ))}
    </View>
  );
}

function VisitCard({ visit }: { visit: FieldVisit }) {
  const accText =
    visit.accuracy != null ? `±${Math.round(visit.accuracy)} m` : null;
  const caseLabel =
    visit.customer_name || (visit.loan_no ? `Loan ${visit.loan_no}` : `Case #${visit.case_id}`);
  const typeTag = visit.case_type === "bkt" ? "BKT" : "Loan";
  const typeColor = visit.case_type === "bkt" ? Colors.warning : Colors.info;

  return (
    <View style={styles.card}>
      {/* Top row */}
      <View style={styles.cardHeader}>
        <View style={styles.cardLeft}>
          <View style={[styles.typeBadge, { backgroundColor: typeColor + "18" }]}>
            <Text style={[styles.typeText, { color: typeColor }]}>{typeTag}</Text>
          </View>
          <Text style={styles.agentName} numberOfLines={1}>
            {visit.agent_name ?? `Agent #${visit.agent_id}`}
          </Text>
        </View>
        <Text style={styles.timeText}>{fmtTime(visit.visited_at)}</Text>
      </View>

      {/* Case name */}
      <Text style={styles.caseName} numberOfLines={1}>
        {caseLabel}
      </Text>

      {/* GPS row */}
      <View style={styles.gpsRow}>
        <Ionicons name="location-outline" size={13} color={Colors.textMuted} />
        <Text style={styles.coordText}>
          {visit.lat.toFixed(5)}, {visit.lng.toFixed(5)}
          {accText ? ` · ${accText}` : ""}
        </Text>

        <Pressable
          style={({ pressed }) => [
            styles.mapBtn,
            pressed && { opacity: 0.7 },
          ]}
          onPress={() => openInMaps(visit.lat, visit.lng, caseLabel)}
          hitSlop={8}
        >
          <Ionicons name="map-outline" size={13} color={Colors.primary} />
          <Text style={styles.mapBtnText}>Map</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function AdminFieldVisitsScreen() {
  const insets = useSafeAreaInsets();

  const [selectedDate, setSelectedDate] = useState<string>(todayISO());
  const [agentFilter, setAgentFilter] = useState<number | null>(null); // null = All

  // ── Data ──────────────────────────────────────────────────────────────────

  const visitsQuery = useQuery<{ visits: FieldVisit[] }>({
    queryKey: ["/api/admin/field-visits", selectedDate, agentFilter],
    queryFn: () =>
      api.admin.getAdminFieldVisits({
        date: selectedDate,
        ...(agentFilter ? { agent_id: agentFilter } : {}),
      }),
    refetchInterval: 60_000,
    retry: 2,
  });

  const agentsQuery = useQuery<{ agents: { id: number; name: string }[] }>({
    queryKey: ["/api/admin/agents"],
    queryFn: () => api.admin.getAgents(),
    staleTime: 5 * 60_000,
  });

  // ── Derived ───────────────────────────────────────────────────────────────

  const allVisits: FieldVisit[] = useMemo(
    () => visitsQuery.data?.visits ?? [],
    [visitsQuery.data]
  );

  const agents = useMemo(
    () => agentsQuery.data?.agents ?? [],
    [agentsQuery.data]
  );

  const isLoading = visitsQuery.isLoading;
  const isRefreshing = visitsQuery.isFetching && !visitsQuery.isLoading;

  // ── Date navigation ───────────────────────────────────────────────────────

  const prevDay = useCallback(
    () => setSelectedDate((d) => shiftDate(d, -1)),
    []
  );
  const nextDay = useCallback(() => {
    const next = shiftDate(selectedDate, 1);
    if (next <= todayISO()) setSelectedDate(next);
  }, [selectedDate]);

  const isToday = selectedDate === todayISO();
  const displayDate =
    isToday
      ? "Today"
      : selectedDate === shiftDate(todayISO(), -1)
      ? "Yesterday"
      : fmtDate(selectedDate + "T00:00:00");

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Field Visit Tracker</Text>
        <Pressable
          onPress={() => visitsQuery.refetch()}
          hitSlop={8}
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Ionicons name="refresh-outline" size={22} color={Colors.text} />
          )}
        </Pressable>
      </View>

      {/* ── Date Nav ── */}
      <View style={styles.dateNav}>
        <Pressable onPress={prevDay} hitSlop={8} style={styles.dateArrow}>
          <Ionicons name="chevron-back" size={20} color={Colors.text} />
        </Pressable>
        <View style={styles.dateLabelBox}>
          <Ionicons name="calendar-outline" size={14} color={Colors.textMuted} />
          <Text style={styles.dateLabelText}>{displayDate}</Text>
          {!isToday && (
            <Text style={styles.dateSub}>{selectedDate}</Text>
          )}
        </View>
        <Pressable
          onPress={nextDay}
          hitSlop={8}
          style={[styles.dateArrow, isToday && styles.dateArrowDisabled]}
          disabled={isToday}
        >
          <Ionicons
            name="chevron-forward"
            size={20}
            color={isToday ? Colors.textMuted : Colors.text}
          />
        </Pressable>
      </View>

      {/* ── Agent Filter ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.agentFilterRow}
      >
        <Pressable
          style={[styles.agentChip, agentFilter === null && styles.agentChipActive]}
          onPress={() => setAgentFilter(null)}
        >
          <Text
            style={[
              styles.agentChipText,
              agentFilter === null && styles.agentChipTextActive,
            ]}
          >
            All Agents
          </Text>
        </Pressable>
        {agents.map((a) => (
          <Pressable
            key={a.id}
            style={[styles.agentChip, agentFilter === a.id && styles.agentChipActive]}
            onPress={() => setAgentFilter(agentFilter === a.id ? null : a.id)}
          >
            <Text
              style={[
                styles.agentChipText,
                agentFilter === a.id && styles.agentChipTextActive,
              ]}
              numberOfLines={1}
            >
              {a.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* ── Summary ── */}
      {!isLoading && allVisits.length > 0 && (
        <SummaryBar visits={allVisits} />
      )}

      {/* ── List ── */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading visits…</Text>
        </View>
      ) : visitsQuery.isError ? (
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={40} color={Colors.danger} />
          <Text style={styles.errorText}>Failed to load visits</Text>
          <Pressable style={styles.retryBtn} onPress={() => visitsQuery.refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
     ) : allVisits.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="location-outline" size={44} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No visits recorded</Text>
          <Text style={styles.emptySubtitle}>
            {JSON.stringify({ 
              date: selectedDate, 
              data: visitsQuery.data,
              error: visitsQuery.error?.message 
            })}
          </Text>
        </View>
      ) : (
        <FlatList
          data={allVisits}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <VisitCard visit={item} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => visitsQuery.refetch()}
              tintColor={Colors.primary}
            />
          }
          ListFooterComponent={
            allVisits.length >= 200 ? (
              <Text style={styles.limitNote}>
                Showing latest 200 visits. Use agent filter to narrow results.
              </Text>
            ) : null
          }
        />
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: { marginRight: 8 },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: Colors.text,
  },

  // Date nav
  dateNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  dateArrow: { padding: 4 },
  dateArrowDisabled: { opacity: 0.3 },
  dateLabelBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dateLabelText: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.text,
  },
  dateSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginLeft: 2,
  },

  // Agent filter chips
  agentFilterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  agentChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  agentChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  agentChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  agentChipTextActive: {
    color: "#fff",
  },

  // Summary
  summaryBar: {
    flexDirection: "row",
    gap: 10,
    marginHorizontal: 14,
    marginBottom: 2,
    marginTop: 4,
  },
  summaryPill: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    gap: 2,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: "800",
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // Visit card
  listContent: { paddingHorizontal: 14, paddingVertical: 10, gap: 10 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  typeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  agentName: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.text,
    flex: 1,
  },
  timeText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  caseName: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: "500",
  },
  gpsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  coordText: {
    flex: 1,
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  mapBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: Colors.primary + "10",
    borderRadius: 6,
  },
  mapBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.primary,
  },

  // States
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 32,
  },
  loadingText: { fontSize: 14, color: Colors.textMuted },
  errorText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.danger,
    textAlign: "center",
  },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: Colors.primary,
    borderRadius: 8,
  },
  retryText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.text,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 18,
  },
  limitNote: {
    textAlign: "center",
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 8,
    marginBottom: 20,
  },
});

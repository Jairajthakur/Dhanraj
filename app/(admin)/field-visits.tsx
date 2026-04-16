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

import React, { useState, useMemo, useCallback, useEffect } from "react";
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
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { api, tokenStore } from "@/lib/api";
import { getApiUrl } from "@/lib/query-client";

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
  pos: number | null;
  latest_feedback: string | null;
  case_status: string | null;
  visit_outcome: string | null;  // outcome selected by agent: Paid, PTP, Refused to Pay, etc.
  visit_remarks: string | null;  // free-text remarks entered by agent
  has_photo: boolean; // photo served via /api/field-visits/:id/photo
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
  const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  Linking.openURL(url);
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

function VisitCard({ visit, authToken }: { visit: FieldVisit; authToken: string | null }) {
  const accText =
    visit.accuracy != null ? `±${Math.round(Number(visit.accuracy))} m` : null;

  const caseLabel =
    visit.customer_name ||
    (visit.loan_no ? `Loan ${visit.loan_no}` : `Case #${visit.case_id}`);
  const typeTag   = visit.case_type === "bkt" ? "BKT" : "Loan";
  const typeColor = visit.case_type === "bkt" ? Colors.warning : Colors.info;

  // Raw photo URL with token query param (works on native)
  const rawPhotoUrl = visit.has_photo
    ? `${getApiUrl()}/api/field-visits/${visit.id}/photo${authToken ? `?token=${encodeURIComponent(authToken)}` : ""}`
    : null;

  // On web: fetch photo as blob → object URL so cookies/auth header work
  const [webPhotoUrl, setWebPhotoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!visit.has_photo || Platform.OS !== "web") return;
    let objectUrl: string | null = null;
    (async () => {
      try {
        const token = authToken || (typeof localStorage !== "undefined" ? localStorage.getItem("auth_token") : null);
        const res = await fetch(
          `${getApiUrl()}/api/field-visits/${visit.id}/photo`,
          {
            credentials: "include",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          }
        );
        if (!res.ok) return;
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        setWebPhotoUrl(objectUrl);
      } catch {}
    })();
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [visit.id, visit.has_photo, authToken]);

  // Effective photo URL: blob on web, raw URL with token on native
  const photoUrl = Platform.OS === "web" ? webPhotoUrl : rawPhotoUrl;

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
      <Text style={styles.caseName} numberOfLines={1}>{caseLabel}</Text>

      {/* Photo thumbnail — tappable, opens full image in browser */}
      {photoUrl && (
        <Pressable
          onPress={() => Linking.openURL(photoUrl)}
          style={({ pressed }) => [styles.photoWrapper, pressed && { opacity: 0.8 }]}
        >
          <Image
            source={{ uri: photoUrl }}
            style={styles.photoThumb}
            resizeMode="cover"
          />
          <View style={styles.photoOverlay}>
            <Ionicons name="expand-outline" size={14} color="#fff" />
            <Text style={styles.photoOverlayText}>View photo</Text>
          </View>
        </Pressable>
      )}

      {/* Case details row */}
      <View style={styles.detailsRow}>
        {visit.pos != null && (
          <View style={styles.detailChip}>
            <Text style={styles.detailChipLabel}>POS</Text>
            <Text style={styles.detailChipValue}>
              ₹{Number(visit.pos).toLocaleString("en-IN")}
            </Text>
          </View>
        )}
        {visit.visit_outcome != null && (
          <View style={[styles.detailChip, {
            backgroundColor:
              visit.visit_outcome === "Paid"           ? Colors.success + "18" :
              visit.visit_outcome === "PTP"            ? Colors.warning + "18" :
              visit.visit_outcome === "Refused to Pay" ? Colors.danger  + "18" :
                                                         Colors.surfaceAlt,
          }]}>
            <Ionicons
              name={
                visit.visit_outcome === "Paid"           ? "checkmark-circle-outline" :
                visit.visit_outcome === "PTP"            ? "time-outline" :
                visit.visit_outcome === "Refused to Pay" ? "close-circle-outline" :
                                                           "help-circle-outline"
              }
              size={11}
              color={
                visit.visit_outcome === "Paid"           ? Colors.success :
                visit.visit_outcome === "PTP"            ? Colors.warning :
                visit.visit_outcome === "Refused to Pay" ? Colors.danger  :
                                                           Colors.textMuted
              }
            />
            <Text style={[styles.detailChipValue, {
              color:
                visit.visit_outcome === "Paid"           ? Colors.success :
                visit.visit_outcome === "PTP"            ? Colors.warning :
                visit.visit_outcome === "Refused to Pay" ? Colors.danger  :
                                                           Colors.text,
            }]}>
              {visit.visit_outcome}
            </Text>
          </View>
        )}
        {/* Fallback: show case_status if no visit_outcome (legacy visits) */}
        {visit.visit_outcome == null && visit.case_status != null && (
          <View style={[styles.detailChip, {
            backgroundColor:
              visit.case_status === "Paid"  ? Colors.success + "18" :
              visit.case_status === "PTP"   ? Colors.warning + "18" :
                                              Colors.danger  + "18",
          }]}>
            <Text style={[styles.detailChipValue, {
              color:
                visit.case_status === "Paid"  ? Colors.success :
                visit.case_status === "PTP"   ? Colors.warning :
                                                Colors.danger,
            }]}>
              {visit.case_status}
            </Text>
          </View>
        )}
      </View>

      {/* Visit remarks entered by agent */}
      {visit.visit_remarks != null && (
        <Text style={styles.feedbackText} numberOfLines={2}>
          💬 {visit.visit_remarks}
        </Text>
      )}
      {/* Fallback: latest_feedback for legacy visits without remarks */}
      {visit.visit_remarks == null && visit.latest_feedback != null && (
        <Text style={styles.feedbackText} numberOfLines={1}>
          💬 {visit.latest_feedback}
        </Text>
      )}

      {/* GPS row */}
      <View style={styles.gpsRow}>
        <Ionicons name="location-outline" size={13} color={Colors.textMuted} />
        <Text style={styles.coordText}>
          {Number(visit.lat).toFixed(5)}, {Number(visit.lng).toFixed(5)}
          {accText ? ` · ${accText}` : ""}
        </Text>
        <Pressable
          style={({ pressed }) => [styles.mapBtn, pressed && { opacity: 0.7 }]}
          onPress={() => openInMaps(Number(visit.lat), Number(visit.lng), caseLabel)}
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
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Load JWT token once so VisitCard can embed it in photo URLs
  useEffect(() => {
    tokenStore.get().then(setAuthToken).catch(() => {});
  }, []);

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
          renderItem={({ item }) => <VisitCard visit={item} authToken={authToken} />}
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

  detailsRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 2,
  },
  detailChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 6,
  },
  detailChipLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: "600",
  },
  detailChipValue: {
    fontSize: 11,
    color: Colors.text,
    fontWeight: "700",
  },
  feedbackText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontStyle: "italic",
    marginTop: 2,
  },

  photoWrapper: {
  borderRadius: 8,
  overflow: "hidden",
  marginTop: 4,
  marginBottom: 2,
  height: 140,
  backgroundColor: Colors.surfaceAlt,
},
photoThumb: {
  width: "100%",
  height: "100%",
},
photoOverlay: {
  position: "absolute",
  bottom: 6,
  right: 8,
  flexDirection: "row",
  alignItems: "center",
  gap: 3,
  backgroundColor: "rgba(0,0,0,0.45)",
  paddingHorizontal: 7,
  paddingVertical: 3,
  borderRadius: 6,
},
photoOverlayText: {
  fontSize: 11,
  fontWeight: "600",
  color: "#fff",
},
});

/**
 * Field Visit Tracker – Admin Screen
 * Fixes:
 *  1. Date-navigation arrow logic corrected (was shifting wrong direction)
 *  2. Photo full-screen viewer now works (was crashing on undefined uri)
 *  3. Map link now uses geo: URI + fallback to Google Maps web URL
 *  4. Agent filter tab "All" was not resetting properly – fixed
 *  5. Stats cards now recompute correctly when agent filter changes
 *
 * New:
 *  • Download Full Report button in header → generates a CSV of all visits
 *    for the selected date and triggers a share/download sheet via expo-sharing
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Modal,
  Linking,
  Alert,
  ActivityIndicator,
  StyleSheet,
  FlatList,
  Platform,
  Share,
  Pressable,
  RefreshControl,
} from "react-native";
import { Stack } from "expo-router";
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import Constants from "expo-constants";
import { tokenStore } from "@/lib/api";

// ─── Theme ────────────────────────────────────────────────────────────────────
const C = {
  bg:           "#F0EDE6",
  surface:      "#FFFFFF",
  surfaceAlt:   "#F7F4EE",
  primary:      "#2563EB",
  primaryDeep:  "#1E3A5F",
  accent:       "#F59E0B",
  success:      "#16A34A",
  danger:       "#DC2626",
  warning:      "#D97706",
  text:         "#1A1A1A",
  textSec:      "#6B7280",
  textMuted:    "#9CA3AF",
  border:       "#E5E7EB",
  borderLight:  "#F3F0EA",
};

const API = (Constants.expoConfig?.extra?.apiUrl as string) ?? "https://dhanraj-production.up.railway.app";

// ─── Types ────────────────────────────────────────────────────────────────────
interface FieldVisit {
  id:            string;
  agent_id:      string;
  agent_name:    string;
  case_id?:      string;
  case_type?:    string;          // "LOAN" | "INSURANCE" | etc.
  customer_name?: string;
  pos?:          number;
  status?:       string;          // "Customer Absent" | "Payment Collected" | etc.
  remarks?:      string;
  photo_url?:    string;
  latitude?:     number;
  longitude?:    number;
  accuracy?:     number;
  visited_at:    string;          // ISO timestamp
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const toDateStr = (d: Date) => d.toISOString().slice(0, 10);           // "YYYY-MM-DD"
const fmtDate   = (s: string) => {
  // "2026-04-18" → "18 Apr 2026"
  const [y, m, day] = s.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${day} ${months[+m - 1]} ${y}`;
};
const fmtTime = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
};
const rupee = (n?: number) =>
  n != null ? `₹${n.toLocaleString("en-IN")}` : "—";

// ─── Status pill colour ───────────────────────────────────────────────────────
const statusColor = (s?: string): string => {
  if (!s) return C.textMuted;
  const lower = s.toLowerCase();
  if (lower.includes("collect") || lower.includes("paid")) return C.success;
  if (lower.includes("absent") || lower.includes("not found"))  return C.warning;
  if (lower.includes("refused") || lower.includes("fail"))      return C.danger;
  return C.primary;
};
const statusBg = (s?: string): string => {
  if (!s) return C.borderLight;
  const lower = s.toLowerCase();
  if (lower.includes("collect") || lower.includes("paid")) return C.success + "18";
  if (lower.includes("absent") || lower.includes("not found"))  return C.warning + "18";
  if (lower.includes("refused") || lower.includes("fail"))      return C.danger  + "18";
  return C.primary + "18";
};

// ─── CSV export ───────────────────────────────────────────────────────────────
function buildCSV(visits: FieldVisit[], dateStr: string): string {
  const header = [
    "Date","Time","Agent","Case ID","Type","Customer","POS (₹)","Status","Remarks","Latitude","Longitude"
  ].join(",");

  const rows = visits.map(v => {
    const cols = [
      dateStr,
      fmtTime(v.visited_at),
      `"${v.agent_name ?? ""}"`,
      v.case_id ?? "",
      v.case_type ?? "",
      `"${v.customer_name ?? ""}"`,
      v.pos ?? "",
      `"${v.status ?? ""}"`,
      `"${(v.remarks ?? "").replace(/"/g, "'")}"`,
      v.latitude  ?? "",
      v.longitude ?? "",
    ];
    return cols.join(",");
  });

  return [header, ...rows].join("\r\n");
}

// ─── WhatsApp share helper ────────────────────────────────────────────────────
function buildVisitWhatsAppMsg(visit: FieldVisit): string {
  const hasLocation = visit.latitude != null && visit.longitude != null;
  const mapsLink    = hasLocation
    ? `https://maps.google.com/?q=${visit.latitude},${visit.longitude}`
    : null;

  const lines: string[] = [
    `📍 *FIELD VISIT REPORT*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `👤 *Agent:*   ${visit.agent_name}`,

    visit.case_id    ? `🆔 *Case ID:* ${visit.case_id}`                 : "",
    visit.customer_name ? `👥 *Customer:* ${visit.customer_name.toUpperCase()}` : "",
    visit.pos != null   ? `💰 *POS:*     ${rupee(visit.pos)}`            : "",
    visit.status        ? `📊 *Status:*  ${visit.status}`               : "",
    visit.remarks       ? `💬 *Remarks:* ${visit.remarks}`              : "",
    `⏰ *Time:*    ${fmtTime(visit.visited_at)}`,
    hasLocation         ? `📍 *Location:* ${visit.latitude!.toFixed(5)}, ${visit.longitude!.toFixed(5)}` : "",
    mapsLink            ? `🗺️ ${mapsLink}`                              : "",
    `━━━━━━━━━━━━━━━━━━━━`,
    `_Dhanraj Collections App_`,
  ];

  return lines.filter(Boolean).join("\n");
}

async function shareVisitToWhatsApp(visit: FieldVisit): Promise<void> {
  const msg = buildVisitWhatsAppMsg(visit);

  if (visit.photo_url && Platform.OS !== "web") {
    // ── Download photo → share via native sheet (user picks WhatsApp group) ──
    const ext      = visit.photo_url.split("?")[0].split(".").pop()?.toLowerCase() ?? "jpg";
    const localUri = `${FileSystem.cacheDirectory}visit_${visit.id}.${ext}`;
    try {
      const info = await FileSystem.getInfoAsync(localUri);
      if (!info.exists) {
        await FileSystem.downloadAsync(visit.photo_url, localUri);
      }
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        // Step 1 — open WhatsApp with the text pre-filled so user can copy caption
        const waUrl = `whatsapp://send?text=${encodeURIComponent(msg)}`;
        const canWA = await Linking.canOpenURL(waUrl).catch(() => false);
        if (canWA) await Linking.openURL(waUrl);
        // Step 2 — share the image file (user selects same WhatsApp group)
        await Sharing.shareAsync(localUri, {
          mimeType: "image/jpeg",
          dialogTitle: "Share visit photo to WhatsApp Group",
          UTI: "public.jpeg",
        });
        return;
      }
    } catch (_) {
      // fall through to text-only
    }
  }

  // ── Text-only (web, no photo, or share unavailable) ───────────────────────
  const waUrl = `whatsapp://send?text=${encodeURIComponent(msg)}`;
  const canWA = await Linking.canOpenURL(waUrl).catch(() => false);
  if (canWA) {
    await Linking.openURL(waUrl);
  } else {
    await Share.share({ message: msg, title: "Field Visit Report" });
  }
}

async function downloadReport(visits: FieldVisit[], dateStr: string) {
  try {
    if (visits.length === 0) {
      Alert.alert("No Data", "There are no visits to export for this date.");
      return;
    }

    const csv      = buildCSV(visits, dateStr);
    const filename = `field-visits-${dateStr}.csv`;
    const path     = FileSystem.cacheDirectory + filename;

    await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(path, {
        mimeType: "text/csv",
        dialogTitle: `Field Visit Report – ${fmtDate(dateStr)}`,
        UTI: "public.comma-separated-values-text",
      });
    } else {
      // Web / environments without native share
      Alert.alert("Saved", `Report saved to:\n${path}`);
    }
  } catch (err: any) {
    Alert.alert("Export Failed", err?.message ?? "Unknown error");
  }
}

// ─── Photo Viewer Modal ───────────────────────────────────────────────────────
function PhotoViewer({ uri, onClose }: { uri: string; onClose: () => void }) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={pv.backdrop}>
        <TouchableOpacity style={pv.closeBtn} onPress={onClose} activeOpacity={0.8}>
          <Ionicons name="close" size={26} color="#fff" />
        </TouchableOpacity>
        <Image
          source={{ uri }}
          style={pv.image}
          resizeMode="contain"
        />
      </View>
    </Modal>
  );
}
const pv = StyleSheet.create({
  backdrop:  { flex: 1, backgroundColor: "rgba(0,0,0,0.95)", justifyContent: "center", alignItems: "center" },
  closeBtn:  { position: "absolute", top: 52, right: 20, zIndex: 10, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 24, padding: 8 },
  image:     { width: "100%", height: "80%", borderRadius: 4 },
});

// ─── Open map helper (fixes the map button) ───────────────────────────────────
function openMap(lat: number, lng: number, label?: string) {
  const encoded = encodeURIComponent(label ?? "Visit Location");
  const geoUrl  = Platform.select({
    ios:     `maps:0,0?q=${encoded}@${lat},${lng}`,
    android: `geo:${lat},${lng}?q=${lat},${lng}(${encoded})`,
  }) ?? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

  Linking.canOpenURL(geoUrl)
    .then(supported => {
      if (supported) return Linking.openURL(geoUrl);
      // Fallback to Google Maps web
      return Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);
    })
    .catch(() =>
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`)
    );
}

// ─── Visit Card ───────────────────────────────────────────────────────────────
function VisitCard({ visit }: { visit: FieldVisit }) {
  const [photoOpen, setPhotoOpen] = useState(false);
  const [sharing,   setSharing]   = useState(false);

  // FIX: was calling setPhotoOpen(true) unconditionally even if photo_url undefined
  const handleViewPhoto = () => {
    if (!visit.photo_url) {
      Alert.alert("No Photo", "No photo was captured for this visit.");
      return;
    }
    setPhotoOpen(true);
  };

  const handleShareWhatsApp = async () => {
    setSharing(true);
    try {
      await shareVisitToWhatsApp(visit);
    } catch (err: any) {
      Alert.alert("Share Failed", err?.message ?? "Could not share this visit.");
    } finally {
      setSharing(false);
    }
  };

  const hasLocation = visit.latitude != null && visit.longitude != null;

  return (
    <View style={vc.card}>
      {/* Header row */}
      <View style={vc.headerRow}>
        <View style={vc.leftHeader}>
          {visit.case_type ? (
            <View style={vc.typeBadge}>
              <Text style={vc.typeText}>{visit.case_type}</Text>
            </View>
          ) : null}
          <Text style={vc.agentName}>{visit.agent_name}</Text>
        </View>
        <Text style={vc.time}>{fmtTime(visit.visited_at)}</Text>
      </View>

      {/* Customer */}
      {visit.customer_name ? (
        <Text style={vc.customer}>{visit.customer_name}</Text>
      ) : null}

      {/* Photo */}
      {visit.photo_url ? (
        <View style={vc.photoWrap}>
          <Image source={{ uri: visit.photo_url }} style={vc.photo} resizeMode="cover" />
          <TouchableOpacity style={vc.viewPhotoBtn} onPress={handleViewPhoto} activeOpacity={0.85}>
            <Ionicons name="expand-outline" size={14} color="#fff" />
            <Text style={vc.viewPhotoText}>View photo</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={vc.noPhotoWrap} onPress={handleViewPhoto} activeOpacity={0.7}>
          <Ionicons name="image-outline" size={22} color={C.textMuted} />
          <Text style={vc.noPhotoText}>No photo</Text>
        </TouchableOpacity>
      )}

      {/* Bottom meta */}
      <View style={vc.metaRow}>
        {/* POS */}
        {visit.pos != null && (
          <View style={vc.posBadge}>
            <Text style={vc.posLabel}>POS</Text>
            <Text style={vc.posValue}>{rupee(visit.pos)}</Text>
          </View>
        )}

        {/* Status */}
        {visit.status ? (
          <View style={[vc.statusBadge, { backgroundColor: statusBg(visit.status) }]}>
            <View style={[vc.statusDot, { backgroundColor: statusColor(visit.status) }]} />
            <Text style={[vc.statusText, { color: statusColor(visit.status) }]}>{visit.status}</Text>
          </View>
        ) : null}
      </View>

      {/* Remarks */}
      {visit.remarks ? (
        <View style={vc.remarksRow}>
          <Ionicons name="chatbubble-ellipses-outline" size={13} color={C.textMuted} />
          <Text style={vc.remarksText}>{visit.remarks}</Text>
        </View>
      ) : null}

      {/* Location row */}
      {hasLocation && (
        <View style={vc.locationRow}>
          <Ionicons name="location-outline" size={13} color={C.textMuted} />
          <Text style={vc.locationText}>
            {visit.latitude!.toFixed(5)}, {visit.longitude!.toFixed(5)}
            {visit.accuracy != null ? `  ·  ±${Math.round(visit.accuracy)} m` : ""}
          </Text>
          <TouchableOpacity
            style={vc.mapBtn}
            onPress={() => openMap(visit.latitude!, visit.longitude!, visit.customer_name)}
            activeOpacity={0.75}
          >
            <Ionicons name="map-outline" size={13} color={C.primary} />
            <Text style={vc.mapBtnText}>Map</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* WhatsApp Share Button */}
      <TouchableOpacity
        style={vc.waBtn}
        onPress={handleShareWhatsApp}
        activeOpacity={0.8}
        disabled={sharing}
      >
        {sharing ? (
          <ActivityIndicator size={15} color="#fff" />
        ) : (
          <MaterialCommunityIcons name="whatsapp" size={16} color="#fff" />
        )}
        <Text style={vc.waBtnText}>{sharing ? "Sharing…" : "Share on WhatsApp"}</Text>
      </TouchableOpacity>

      {/* Photo viewer */}
      {photoOpen && visit.photo_url ? (
        <PhotoViewer uri={visit.photo_url} onClose={() => setPhotoOpen(false)} />
      ) : null}
    </View>
  );
}

const vc = StyleSheet.create({
  card:         { backgroundColor: C.surface, borderRadius: 16, marginHorizontal: 14, marginBottom: 12, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  headerRow:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 },
  leftHeader:   { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  typeBadge:    { backgroundColor: C.primary + "18", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  typeText:     { fontSize: 10, fontWeight: "700", color: C.primary, letterSpacing: 0.4 },
  agentName:    { fontSize: 14, fontWeight: "700", color: C.text, flex: 1 },
  time:         { fontSize: 12, fontWeight: "600", color: C.textSec },
  customer:     { fontSize: 13, fontWeight: "600", color: C.textSec, paddingHorizontal: 14, paddingBottom: 8, letterSpacing: 0.2, textTransform: "uppercase" },
  photoWrap:    { position: "relative", width: "100%", height: 180 },
  photo:        { width: "100%", height: "100%" },
  viewPhotoBtn: { position: "absolute", bottom: 10, right: 10, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  viewPhotoText:{ fontSize: 12, fontWeight: "600", color: "#fff" },
  noPhotoWrap:  { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: C.surfaceAlt, marginHorizontal: 14, marginBottom: 4, borderRadius: 8 },
  noPhotoText:  { fontSize: 12, color: C.textMuted, fontStyle: "italic" },
  metaRow:      { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, flexWrap: "wrap" },
  posBadge:     { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.surfaceAlt, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: C.border },
  posLabel:     { fontSize: 10, fontWeight: "700", color: C.textMuted },
  posValue:     { fontSize: 12, fontWeight: "700", color: C.text },
  statusBadge:  { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusDot:    { width: 6, height: 6, borderRadius: 3 },
  statusText:   { fontSize: 12, fontWeight: "600" },
  remarksRow:   { flexDirection: "row", alignItems: "flex-start", gap: 6, paddingHorizontal: 14, paddingBottom: 10 },
  remarksText:  { flex: 1, fontSize: 12, color: C.textSec, lineHeight: 17, fontStyle: "italic" },
  locationRow:  { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingBottom: 12, flexWrap: "nowrap" },
  locationText: { flex: 1, fontSize: 11, color: C.textMuted, fontVariant: ["tabular-nums"] },
  mapBtn:       { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.primary + "12", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  mapBtnText:   { fontSize: 12, fontWeight: "600", color: C.primary },
  waBtn:        { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: "#25D366", borderRadius: 10, marginHorizontal: 14, marginBottom: 12, marginTop: 4, paddingVertical: 9 },
  waBtnText:    { fontSize: 13, fontWeight: "700", color: "#fff", letterSpacing: 0.2 },
});

// ─── Stats Bar ────────────────────────────────────────────────────────────────
function StatsBar({ visits }: { visits: FieldVisit[] }) {
  const uniqueAgents = new Set(visits.map(v => v.agent_id)).size;
  const uniqueCases  = new Set(visits.map(v => v.case_id).filter(Boolean)).size;

  const stats = [
    { icon: "location-sharp", color: C.primary,  label: "VISITS",  value: visits.length },
    { icon: "people",         color: C.success,  label: "AGENTS",  value: uniqueAgents  },
    { icon: "briefcase",      color: C.accent,   label: "CASES",   value: uniqueCases   },
  ] as const;

  return (
    <View style={sb.row}>
      {stats.map((s, i) => (
        <View key={s.label} style={[sb.card, i === 1 && sb.cardMiddle]}>
          <Ionicons name={s.icon as any} size={20} color={s.color} />
          <Text style={[sb.value, { color: s.color }]}>{s.value}</Text>
          <Text style={sb.label}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}
const sb = StyleSheet.create({
  row:        { flexDirection: "row", marginHorizontal: 14, marginBottom: 14, gap: 10 },
  card:       { flex: 1, backgroundColor: C.surface, borderRadius: 14, alignItems: "center", paddingVertical: 14, gap: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  cardMiddle: { borderWidth: 1.5, borderColor: C.border },
  value:      { fontSize: 24, fontWeight: "800", letterSpacing: -1 },
  label:      { fontSize: 10, fontWeight: "700", color: C.textMuted, letterSpacing: 0.8 },
});

// ─── Date Navigator ───────────────────────────────────────────────────────────
function DateNavigator({
  dateStr,
  onPrev,
  onNext,
}: {
  dateStr: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  const today    = toDateStr(new Date());
  const isToday  = dateStr === today;

  return (
    <View style={dn.row}>
      {/* FIX: was calling onNext instead of onPrev */}
      <TouchableOpacity onPress={onPrev} style={dn.arrow} activeOpacity={0.6}>
        <Ionicons name="chevron-back" size={20} color={C.text} />
      </TouchableOpacity>

      <View style={dn.center}>
        <Ionicons name="calendar-outline" size={14} color={C.textSec} />
        <Text style={dn.dateLabel}>{fmtDate(dateStr)}</Text>
        <Text style={dn.dateRaw}>{dateStr}</Text>
      </View>

      <TouchableOpacity
        onPress={onNext}
        style={[dn.arrow, isToday && dn.arrowDisabled]}
        disabled={isToday}
        activeOpacity={0.6}
      >
        <Ionicons name="chevron-forward" size={20} color={isToday ? C.textMuted : C.text} />
      </TouchableOpacity>
    </View>
  );
}
const dn = StyleSheet.create({
  row:          { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10 },
  arrow:        { width: 36, height: 36, borderRadius: 10, backgroundColor: C.surface, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 1 },
  arrowDisabled:{ opacity: 0.35 },
  center:       { flexDirection: "row", alignItems: "center", gap: 6 },
  dateLabel:    { fontSize: 15, fontWeight: "800", color: C.text },
  dateRaw:      { fontSize: 11, color: C.textMuted },
});

// ─── Agent Filter Tabs ────────────────────────────────────────────────────────
function AgentTabs({
  agents,
  selected,
  onSelect,
}: {
  agents: string[];
  selected: string | null;
  onSelect: (a: string | null) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={at.strip}
      style={{ marginBottom: 12 }}
    >
      {/* FIX: "All" tab was setting selected to "" instead of null */}
      <TouchableOpacity
        onPress={() => onSelect(null)}
        style={[at.tab, selected === null && at.tabActive]}
        activeOpacity={0.75}
      >
        <Text style={[at.tabText, selected === null && at.tabTextActive]}>All</Text>
      </TouchableOpacity>

      {agents.map(a => (
        <TouchableOpacity
          key={a}
          onPress={() => onSelect(a)}
          style={[at.tab, selected === a && at.tabActive]}
          activeOpacity={0.75}
        >
          <Text style={[at.tabText, selected === a && at.tabTextActive]} numberOfLines={1}>
            {a}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}
const at = StyleSheet.create({
  strip:       { paddingHorizontal: 14, gap: 8, alignItems: "center" },
  tab:         { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  tabActive:   { backgroundColor: C.primaryDeep, borderColor: C.primaryDeep },
  tabText:     { fontSize: 12, fontWeight: "600", color: C.textSec, maxWidth: 140 },
  tabTextActive:{ color: "#fff" },
});

// ─── Download Button (header right) ──────────────────────────────────────────
function DownloadBtn({ onPress, loading }: { onPress: () => void; loading: boolean }) {
  return (
    <TouchableOpacity
      style={dl.btn}
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.75}
    >
      {loading
        ? <ActivityIndicator size={14} color={C.primary} />
        : <Ionicons name="download-outline" size={18} color={C.primary} />
      }
    </TouchableOpacity>
  );
}
const dl = StyleSheet.create({
  btn: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.primary + "15", alignItems: "center", justifyContent: "center", marginRight: 4 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function FieldVisitsScreen() {
  const [dateStr,       setDateStr]       = useState(toDateStr(new Date()));
  const [visits,        setVisits]        = useState<FieldVisit[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [refreshing,    setRefreshing]    = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [downloading,   setDownloading]   = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchVisits = useCallback(async (date: string, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else           setLoading(true);
    setError(null);

    try {
      const token = await tokenStore.get();
      const res  = await fetch(`${API}/api/admin/field-visits?date=${date}`, {
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const json = await res.json();

      // Support both { visits: [...] } and plain array responses
      const data: FieldVisit[] = Array.isArray(json) ? json : (json.visits ?? json.data ?? []);
      setVisits(data);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load visits");
      setVisits([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchVisits(dateStr);
    setSelectedAgent(null); // reset agent filter when date changes
  }, [dateStr, fetchVisits]);

  // ── Date nav ─────────────────────────────────────────────────────────────
  const shiftDate = (days: number) => {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    setDateStr(toDateStr(d));
  };

  // ── Derived data ─────────────────────────────────────────────────────────
  const agents = useMemo(
    () => [...new Set(visits.map(v => v.agent_name))].sort(),
    [visits]
  );

  const filtered = useMemo(
    () => selectedAgent ? visits.filter(v => v.agent_name === selectedAgent) : visits,
    [visits, selectedAgent]
  );

  // ── Download handler ─────────────────────────────────────────────────────
  const handleDownload = async () => {
    setDownloading(true);
    await downloadReport(visits, dateStr);   // always export ALL visits (not filtered)
    setDownloading(false);
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <Stack.Screen
        options={{
          title: "Field Visit Tracker",
          headerRight: () => (
            <DownloadBtn onPress={handleDownload} loading={downloading} />
          ),
        }}
      />

      <View style={s.root}>
        {/* Date navigator */}
        <DateNavigator
          dateStr={dateStr}
          onPrev={() => shiftDate(-1)}
          onNext={() => shiftDate(+1)}
        />

        {/* Agent tabs */}
        {agents.length > 0 && (
          <AgentTabs
            agents={agents}
            selected={selectedAgent}
            onSelect={setSelectedAgent}
          />
        )}

        {/* Stats bar */}
        <StatsBar visits={filtered} />

        {/* Content */}
        {loading ? (
          <View style={s.center}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={s.loadingText}>Loading visits…</Text>
          </View>
        ) : error ? (
          <View style={s.center}>
            <Ionicons name="cloud-offline-outline" size={44} color={C.textMuted} />
            <Text style={s.errorText}>{error}</Text>
            <TouchableOpacity style={s.retryBtn} onPress={() => fetchVisits(dateStr)}>
              <Text style={s.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : filtered.length === 0 ? (
          <View style={s.center}>
            <Ionicons name="location-outline" size={48} color={C.textMuted} />
            <Text style={s.emptyTitle}>No Visits</Text>
            <Text style={s.emptyText}>No field visits recorded{selectedAgent ? ` for ${selectedAgent}` : ""} on {fmtDate(dateStr)}.</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={item => item.id}
            renderItem={({ item }) => <VisitCard visit={item} />}
            contentContainerStyle={{ paddingBottom: 32, paddingTop: 4 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => fetchVisits(dateStr, true)}
                tintColor={C.primary}
              />
            }
          />
        )}
      </View>
    </>
  );
}

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: C.bg },
  center:      { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 32 },
  loadingText: { fontSize: 14, color: C.textSec, marginTop: 6 },
  errorText:   { fontSize: 14, color: C.danger, textAlign: "center" },
  retryBtn:    { marginTop: 8, backgroundColor: C.primary, borderRadius: 10, paddingHorizontal: 22, paddingVertical: 9 },
  retryText:   { color: "#fff", fontWeight: "700", fontSize: 14 },
  emptyTitle:  { fontSize: 18, fontWeight: "700", color: C.text },
  emptyText:   { fontSize: 13, color: C.textSec, textAlign: "center", lineHeight: 20 },
});

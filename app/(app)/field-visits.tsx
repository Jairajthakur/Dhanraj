import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────
interface FieldVisit {
  id: number;
  case_id: string;
  customer_name: string;
  latitude: number;
  longitude: number;
  address: string | null;
  outcome: "Contacted" | "Not Home" | "Partial Payment" | "Paid" | "Refused";
  notes: string;
  visited_at: string;
  agent_name: string;
}

type Outcome = FieldVisit["outcome"];

const OUTCOMES: { value: Outcome; color: string; icon: string }[] = [
  { value: "Paid",            color: Colors.success, icon: "checkmark-circle" },
  { value: "Partial Payment", color: Colors.info,    icon: "cash-outline"     },
  { value: "Contacted",       color: Colors.primary, icon: "person-outline"   },
  { value: "Not Home",        color: Colors.warning ?? "#F59E0B", icon: "home-outline" },
  { value: "Refused",         color: Colors.danger,  icon: "close-circle"     },
];

function outcomeStyle(outcome: Outcome) {
  return OUTCOMES.find((o) => o.value === outcome) ?? OUTCOMES[2];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}
function fmtCoords(lat: number, lng: number) {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

// ─── Log Visit Modal ──────────────────────────────────────────────────────────
function LogVisitModal({
  visible,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [caseId, setCaseId]         = useState("");
  const [customerName, setCustomer] = useState("");
  const [outcome, setOutcome]       = useState<Outcome>("Contacted");
  const [notes, setNotes]           = useState("");
  const [locating, setLocating]     = useState(false);
  const [coords, setCoords]         = useState<{ lat: number; lng: number; address: string } | null>(null);

  // Reset on open
  useEffect(() => {
    if (visible) {
      setCaseId(""); setCustomer(""); setOutcome("Contacted");
      setNotes(""); setCoords(null);
    }
  }, [visible]);

  const getLocation = useCallback(async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission needed",
          "Enable location access in Settings to log field visits.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() },
          ]
        );
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      // Reverse geocode for a human-readable address
      const [geo] = await Location.reverseGeocodeAsync({
        latitude:  loc.coords.latitude,
        longitude: loc.coords.longitude,
      });

      const address = [geo?.street, geo?.district, geo?.city, geo?.region]
        .filter(Boolean)
        .join(", ");

      setCoords({
        lat:     loc.coords.latitude,
        lng:     loc.coords.longitude,
        address: address || "Address unavailable",
      });
    } catch {
      Alert.alert("Error", "Could not get location. Please try again.");
    } finally {
      setLocating(false);
    }
  }, []);

  const { mutate: saveVisit, isPending } = useMutation({
    mutationFn: (payload: Parameters<typeof api.fieldVisits.create>[0]) =>
      api.fieldVisits.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/field-visits"] });
      onSuccess();
      onClose();
      Alert.alert("Saved", "Field visit logged successfully.");
    },
    onError: () => Alert.alert("Error", "Could not save visit. Please try again."),
  });

  const handleSave = () => {
    if (!caseId.trim())      return Alert.alert("Required", "Please enter the Case ID.");
    if (!customerName.trim()) return Alert.alert("Required", "Please enter the customer name.");
    if (!coords)              return Alert.alert("Required", "Please capture your location first.");

    saveVisit({
      case_id:       caseId.trim(),
      customer_name: customerName.trim(),
      latitude:      coords.lat,
      longitude:     coords.lng,
      address:       coords.address,
      outcome,
      notes:         notes.trim(),
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={m.overlay}>
        <Pressable style={m.backdrop} onPress={onClose} />
        <View style={[m.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={m.header}>
            <Text style={m.title}>Log Field Visit</Text>
            <Pressable style={m.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={20} color={Colors.text} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Case ID */}
            <Text style={m.label}>Case ID</Text>
            <TextInput
              style={m.input}
              value={caseId}
              onChangeText={setCaseId}
              placeholder="e.g. DHR-2024-001"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="characters"
            />

            {/* Customer name */}
            <Text style={m.label}>Customer Name</Text>
            <TextInput
              style={m.input}
              value={customerName}
              onChangeText={setCustomer}
              placeholder="Full name"
              placeholderTextColor={Colors.textMuted}
            />

            {/* Location capture */}
            <Text style={m.label}>Location</Text>
            {coords ? (
              <View style={m.locBox}>
                <Ionicons name="location" size={16} color={Colors.success} />
                <View style={{ flex: 1 }}>
                  <Text style={m.locAddr} numberOfLines={2}>{coords.address}</Text>
                  <Text style={m.locCoords}>{fmtCoords(coords.lat, coords.lng)}</Text>
                </View>
                <Pressable onPress={getLocation}>
                  <Ionicons name="refresh" size={18} color={Colors.primary} />
                </Pressable>
              </View>
            ) : (
              <Pressable style={m.locBtn} onPress={getLocation} disabled={locating}>
                {locating ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <Ionicons name="locate" size={18} color={Colors.primary} />
                )}
                <Text style={m.locBtnText}>
                  {locating ? "Getting location…" : "Capture my location"}
                </Text>
              </Pressable>
            )}

            {/* Outcome */}
            <Text style={[m.label, { marginTop: 14 }]}>Visit Outcome</Text>
            <View style={m.outcomeRow}>
              {OUTCOMES.map((o) => (
                <Pressable
                  key={o.value}
                  style={[
                    m.outcomeChip,
                    outcome === o.value && { backgroundColor: o.color + "22", borderColor: o.color },
                  ]}
                  onPress={() => setOutcome(o.value)}
                >
                  <Ionicons
                    name={o.icon as any}
                    size={13}
                    color={outcome === o.value ? o.color : Colors.textMuted}
                  />
                  <Text
                    style={[
                      m.outcomeText,
                      outcome === o.value && { color: o.color, fontWeight: "700" },
                    ]}
                  >
                    {o.value}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Notes */}
            <Text style={[m.label, { marginTop: 14 }]}>Notes (optional)</Text>
            <TextInput
              style={[m.input, m.textarea]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Any details about the visit…"
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <Pressable style={m.saveBtn} onPress={handleSave} disabled={isPending}>
              {isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
              )}
              <Text style={m.saveBtnText}>Save Visit</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const m = StyleSheet.create({
  overlay:     { flex: 1, justifyContent: "flex-end" },
  backdrop:    { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet:       { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 4, maxHeight: "92%" },
  header:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  title:       { fontSize: 18, fontWeight: "800", color: Colors.text },
  closeBtn:    { width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  label:       { fontSize: 11, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, marginTop: 10 },
  input:       { backgroundColor: Colors.surfaceAlt, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: Colors.text },
  textarea:    { height: 80, paddingTop: 12 },
  locBtn:      { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.primary + "15", borderRadius: 12, borderWidth: 1, borderColor: Colors.primary + "40", paddingHorizontal: 16, paddingVertical: 14 },
  locBtnText:  { fontSize: 14, fontWeight: "700", color: Colors.primary },
  locBox:      { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: Colors.success + "12", borderRadius: 12, borderWidth: 1, borderColor: Colors.success + "40", padding: 12 },
  locAddr:     { fontSize: 13, color: Colors.text, fontWeight: "600", flex: 1 },
  locCoords:   { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  outcomeRow:  { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  outcomeChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt },
  outcomeText: { fontSize: 12, color: Colors.textMuted },
  saveBtn:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14, marginTop: 16 },
  saveBtnText: { fontSize: 15, fontWeight: "800", color: "#fff" },
});

// ─── Visit Card ───────────────────────────────────────────────────────────────
function VisitCard({ visit }: { visit: FieldVisit }) {
  const meta = outcomeStyle(visit.outcome);

  const openMaps = () => {
    const url = Platform.select({
      ios:     `maps://app?ll=${visit.latitude},${visit.longitude}`,
      android: `geo:${visit.latitude},${visit.longitude}?q=${visit.latitude},${visit.longitude}`,
      default: `https://www.google.com/maps?q=${visit.latitude},${visit.longitude}`,
    });
    Linking.openURL(url!);
  };

  return (
    <View style={vc.wrap}>
      <View style={vc.header}>
        <View style={vc.left}>
          <Text style={vc.caseId}>{visit.case_id}</Text>
          <Text style={vc.customer}>{visit.customer_name}</Text>
        </View>
        <View style={[vc.outcomeBadge, { backgroundColor: meta.color + "20", borderColor: meta.color + "50" }]}>
          <Ionicons name={meta.icon as any} size={12} color={meta.color} />
          <Text style={[vc.outcomeText, { color: meta.color }]}>{visit.outcome}</Text>
        </View>
      </View>

      {/* Location row */}
      <Pressable style={vc.locRow} onPress={openMaps}>
        <Ionicons name="location-outline" size={14} color={Colors.textMuted} />
        <Text style={vc.locText} numberOfLines={1}>
          {visit.address ?? fmtCoords(visit.latitude, visit.longitude)}
        </Text>
        <Ionicons name="open-outline" size={12} color={Colors.primary} />
      </Pressable>

      {visit.notes ? (
        <Text style={vc.notes} numberOfLines={2}>{visit.notes}</Text>
      ) : null}

      <View style={vc.footer}>
        <Ionicons name="time-outline" size={12} color={Colors.textMuted} />
        <Text style={vc.footerText}>
          {fmtDate(visit.visited_at)} · {fmtTime(visit.visited_at)}
        </Text>
        <Text style={vc.agentText}>{visit.agent_name}</Text>
      </View>
    </View>
  );
}

const vc = StyleSheet.create({
  wrap:         { backgroundColor: Colors.surface, borderRadius: 16, padding: 14, gap: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  header:       { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  left:         { gap: 2 },
  caseId:       { fontSize: 12, fontWeight: "700", color: Colors.primary, textTransform: "uppercase", letterSpacing: 0.5 },
  customer:     { fontSize: 15, fontWeight: "800", color: Colors.text },
  outcomeBadge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  outcomeText:  { fontSize: 11, fontWeight: "700" },
  locRow:       { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.surfaceAlt, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  locText:      { flex: 1, fontSize: 12, color: Colors.textSecondary },
  notes:        { fontSize: 13, color: Colors.textSecondary, lineHeight: 18, fontStyle: "italic" },
  footer:       { flexDirection: "row", alignItems: "center", gap: 5 },
  footerText:   { flex: 1, fontSize: 11, color: Colors.textMuted },
  agentText:    { fontSize: 11, color: Colors.textMuted, fontWeight: "600" },
});

// ─── Summary Strip ────────────────────────────────────────────────────────────
function SummaryStrip({ visits }: { visits: FieldVisit[] }) {
  const today = new Date().toDateString();
  const todayVisits = visits.filter((v) => new Date(v.visited_at).toDateString() === today);
  const paidCount   = visits.filter((v) => v.outcome === "Paid" || v.outcome === "Partial Payment").length;

  return (
    <View style={ss.wrap}>
      <View style={ss.stat}>
        <Text style={ss.num}>{visits.length}</Text>
        <Text style={ss.lbl}>Total visits</Text>
      </View>
      <View style={ss.divider} />
      <View style={ss.stat}>
        <Text style={[ss.num, { color: Colors.success }]}>{todayVisits.length}</Text>
        <Text style={ss.lbl}>Today</Text>
      </View>
      <View style={ss.divider} />
      <View style={ss.stat}>
        <Text style={[ss.num, { color: Colors.primary }]}>{paidCount}</Text>
        <Text style={ss.lbl}>Collected</Text>
      </View>
    </View>
  );
}

const ss = StyleSheet.create({
  wrap:    { backgroundColor: Colors.primaryDeep ?? Colors.primary, borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "center" },
  stat:    { flex: 1, alignItems: "center", gap: 3 },
  num:     { fontSize: 22, fontWeight: "900", color: "#fff" },
  lbl:     { fontSize: 10, color: "rgba(255,255,255,0.65)", fontWeight: "700", textTransform: "uppercase" },
  divider: { width: 1, height: 32, backgroundColor: "rgba(255,255,255,0.2)", marginHorizontal: 8 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function FieldVisitsScreen() {
  const insets = useSafeAreaInsets();
  const [modalVisible, setModalVisible] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/field-visits"],
    queryFn:  () => api.fieldVisits.list(),
    refetchInterval: 30_000,
  });

  const visits: FieldVisit[] = data?.visits ?? [];

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={[
          s.container,
          Platform.OS === "web" ? { paddingTop: 16 } : {},
          { paddingBottom: insets.bottom + 24 },
        ]}
      >
        {/* Header */}
        <View style={s.topBar}>
          <View style={s.topLeft}>
            <Ionicons name="map" size={16} color={Colors.primary} />
            <Text style={s.topTitle}>Field Visits</Text>
          </View>
          <Pressable style={s.logBtn} onPress={() => setModalVisible(true)}>
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={s.logBtnText}>Log Visit</Text>
          </Pressable>
        </View>

        {isLoading ? (
          <ActivityIndicator color={Colors.primary} size="large" style={{ marginTop: 60 }} />
        ) : visits.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="map-outline" size={56} color={Colors.textMuted} />
            <Text style={s.emptyTitle}>No visits yet</Text>
            <Text style={s.emptyText}>
              Tap "Log Visit" to record your first field visit with GPS location.
            </Text>
            <Pressable style={s.emptyBtn} onPress={() => setModalVisible(true)}>
              <Ionicons name="add" size={14} color="#fff" />
              <Text style={s.emptyBtnText}>Log your first visit</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <SummaryStrip visits={visits} />
            {visits.map((v) => (
              <VisitCard key={v.id} visit={v} />
            ))}
          </>
        )}
      </ScrollView>

      <LogVisitModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["/api/field-visits"] })}
      />
    </>
  );
}

const s = StyleSheet.create({
  container:    { padding: 16, gap: 12 },
  topBar:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topLeft:      { flexDirection: "row", alignItems: "center", gap: 7 },
  topTitle:     { fontSize: 16, fontWeight: "800", color: Colors.text },
  logBtn:       { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  logBtnText:   { fontSize: 13, fontWeight: "700", color: "#fff" },
  empty:        { alignItems: "center", justifyContent: "center", paddingVertical: 80, gap: 12 },
  emptyTitle:   { fontSize: 18, fontWeight: "800", color: Colors.text },
  emptyText:    { fontSize: 13, color: Colors.textMuted, textAlign: "center", maxWidth: 280, lineHeight: 20 },
  emptyBtn:     { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10, marginTop: 8 },
  emptyBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
});

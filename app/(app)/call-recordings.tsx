import React, { useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable,
  ActivityIndicator, Linking, Alert, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Recording {
  id: number;
  loan_no: string | null;
  drive_link: string | null;
  duration_seconds: number;
  recorded_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDuration(secs: number): string {
  if (!secs) return "0s";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true,
    });
  } catch { return iso; }
}

// ─── Recording Card ───────────────────────────────────────────────────────────

function RecordingCard({ item }: { item: Recording }) {
  const [opening, setOpening] = useState(false);

  const handleOpen = async () => {
    if (!item.drive_link) {
      Alert.alert("Not Available", "Recording link not available yet. Try again in a moment.");
      return;
    }
    setOpening(true);
    try {
      const supported = await Linking.canOpenURL(item.drive_link);
      if (supported) {
        await Linking.openURL(item.drive_link);
      } else {
        Alert.alert("Error", "Cannot open this link on your device.");
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setOpening(false);
    }
  };

  const hasLink = !!item.drive_link;

  return (
    <View style={styles.card}>
      {/* Left icon */}
      <View style={[styles.iconWrap, { backgroundColor: hasLink ? Colors.primary + "18" : Colors.border }]}>
        <Ionicons
          name={hasLink ? "mic" : "mic-off-outline"}
          size={20}
          color={hasLink ? Colors.primary : Colors.textMuted}
        />
      </View>

      {/* Info */}
      <View style={styles.cardInfo}>
        <Text style={styles.loanNo} numberOfLines={1}>
          {item.loan_no ? `Loan: ${item.loan_no}` : "No Loan No"}
        </Text>
        <View style={styles.metaRow}>
          <Ionicons name="time-outline" size={12} color={Colors.textMuted} />
          <Text style={styles.metaText}>{fmtDuration(item.duration_seconds)}</Text>
          <View style={styles.dot} />
          <Ionicons name="calendar-outline" size={12} color={Colors.textMuted} />
          <Text style={styles.metaText}>{fmtDate(item.recorded_at)}</Text>
        </View>
        {hasLink && (
          <View style={styles.driveBadge}>
            <Ionicons name="logo-google" size={10} color={Colors.success} />
            <Text style={styles.driveBadgeText}>Saved to Google Drive</Text>
          </View>
        )}
        {!hasLink && (
          <View style={[styles.driveBadge, { backgroundColor: Colors.warning + "18" }]}>
            <Ionicons name="cloud-upload-outline" size={10} color={Colors.warning} />
            <Text style={[styles.driveBadgeText, { color: Colors.warning }]}>Processing…</Text>
          </View>
        )}
      </View>

      {/* Play / Open button */}
      <Pressable
        style={[styles.playBtn, !hasLink && { opacity: 0.4 }]}
        onPress={handleOpen}
        disabled={!hasLink || opening}
      >
        {opening
          ? <ActivityIndicator size="small" color="#fff" />
          : <Ionicons name="play" size={16} color="#fff" />
        }
      </Pressable>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CallRecordingsScreen() {
  const insets = useSafeAreaInsets();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["/api/call-recordings"],
    queryFn: () => api.getCallRecordings(),
    refetchInterval: 30_000, // auto-refresh every 30s for "processing" ones
  });

  const recordings: Recording[] = data?.recordings || [];

  const totalDuration = recordings.reduce((sum, r) => sum + (r.duration_seconds || 0), 0);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>

      {/* Summary banner */}
      {recordings.length > 0 && (
        <View style={[styles.banner, { paddingTop: Platform.OS === "web" ? 74 : 12 }]}>
          <View style={styles.bannerStat}>
            <Ionicons name="mic-circle" size={18} color={Colors.primary} />
            <Text style={styles.bannerVal}>{recordings.length}</Text>
            <Text style={styles.bannerLabel}>Recordings</Text>
          </View>
          <View style={styles.bannerDivider} />
          <View style={styles.bannerStat}>
            <Ionicons name="time" size={18} color={Colors.accent} />
            <Text style={styles.bannerVal}>{fmtDuration(totalDuration)}</Text>
            <Text style={styles.bannerLabel}>Total</Text>
          </View>
          <View style={styles.bannerDivider} />
          <View style={styles.bannerStat}>
            <Ionicons name="logo-google" size={18} color={Colors.success} />
            <Text style={styles.bannerVal}>{recordings.filter(r => r.drive_link).length}</Text>
            <Text style={styles.bannerLabel}>On Drive</Text>
          </View>
        </View>
      )}

      {/* Info strip */}
      <View style={styles.infoStrip}>
        <Ionicons name="information-circle-outline" size={14} color={Colors.info} />
        <Text style={styles.infoText}>
          Calls are recorded via Twilio and auto-saved to Google Drive. Tap{" "}
          <Text style={{ fontWeight: "800" }}>▶</Text> to open in Drive.
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={styles.loadingText}>Loading recordings…</Text>
        </View>
      ) : (
        <FlatList
          data={recordings}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <RecordingCard item={item} />}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + 24 },
            recordings.length === 0 && { flex: 1 },
          ]}
          refreshing={isRefetching}
          onRefresh={refetch}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="mic-off-outline" size={40} color={Colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>No Recordings Yet</Text>
              <Text style={styles.emptySubtitle}>
                Make a call using the{" "}
                <Text style={{ color: Colors.primary, fontWeight: "700" }}>Call</Text>
                {" "}button on any case.{"\n"}Recordings appear here automatically.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  bannerStat: { flex: 1, alignItems: "center", gap: 4 },
  bannerVal:  { fontSize: 18, fontWeight: "800", color: Colors.text },
  bannerLabel:{ fontSize: 10, fontWeight: "600", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  bannerDivider: { width: 1, backgroundColor: Colors.border, marginVertical: 4 },

  infoStrip: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    marginHorizontal: 12, marginVertical: 8,
    backgroundColor: Colors.info + "12",
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: Colors.info + "30",
  },
  infoText: { flex: 1, fontSize: 12, color: Colors.info, lineHeight: 17 },

  list:  { padding: 12, gap: 10 },
  center:{ flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  loadingText: { fontSize: 14, color: Colors.textMuted },

  empty: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.surfaceAlt,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: Colors.border,
  },
  emptyTitle:    { fontSize: 18, fontWeight: "700", color: Colors.text },
  emptySubtitle: { fontSize: 14, color: Colors.textMuted, textAlign: "center", lineHeight: 20, paddingHorizontal: 24 },

  // Card
  card: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.border,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 4, elevation: 2,
  },
  iconWrap: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  cardInfo:  { flex: 1, gap: 4 },
  loanNo:    { fontSize: 14, fontWeight: "700", color: Colors.text },
  metaRow:   { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText:  { fontSize: 11, color: Colors.textMuted, fontWeight: "500" },
  dot:       { width: 3, height: 3, borderRadius: 1.5, backgroundColor: Colors.textMuted },
  driveBadge:{
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: Colors.success + "15",
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3,
    alignSelf: "flex-start", marginTop: 2,
  },
  driveBadgeText: { fontSize: 10, fontWeight: "700", color: Colors.success, letterSpacing: 0.3 },

  playBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: "center", justifyContent: "center",
  },
});

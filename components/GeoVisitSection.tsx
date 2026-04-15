import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, Pressable,
  ActivityIndicator, Alert, Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────
interface FieldVisit {
  id: number;
  lat: number;
  lng: number;
  accuracy: number | null;
  visited_at: string;
  agent_name?: string;
  photo_url?: string | null;
}

interface Props {
  caseId: number;
  caseType: "loan" | "bkt";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtCoords(lat: number, lng: number): string {
  return `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? "N" : "S"}  ${Math.abs(lng).toFixed(4)}°${lng >= 0 ? "E" : "W"}`;
}

function fmtVisitDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
    }) + " · " + d.toLocaleTimeString("en-IN", {
      hour: "2-digit", minute: "2-digit", hour12: true,
    });
  } catch { return iso.slice(0, 16).replace("T", " "); }
}

// ─── Component ────────────────────────────────────────────────────────────────
export function GeoVisitSection({ caseId, caseType }: Props) {
  const qc = useQueryClient();
  const [checking, setChecking] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<{
    uri: string; name: string; mimeType: string;
  } | null>(null);

  // ── Fetch visit history ──
  const queryKey = [`/api/cases/${caseId}/visits`];
  const { data, isLoading } = useQuery<{ visits: FieldVisit[] }>({
    queryKey,
    queryFn: () => api.getFieldVisits(caseId),
    staleTime: 60_000,
  });

  const visits = data?.visits ?? [];
  const todayStr = new Date().toDateString();
  const hasCheckedInToday = visits.some(
    (v) => new Date(v.visited_at).toDateString() === todayStr
  );

  // ── Photo picker ──
  const handlePickPhoto = useCallback(async () => {
    // Try camera first, fall back to library
    const { status: camStatus } = await ImagePicker.requestCameraPermissionsAsync();
    if (camStatus !== "granted") {
      // Fall back to gallery
      const { status: libStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (libStatus !== "granted") {
        Alert.alert("Permission Required", "Please allow camera or photo library access.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        allowsEditing: false,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setPendingPhoto({
          uri: asset.uri,
          name: asset.fileName || `visit_${Date.now()}.jpg`,
          mimeType: asset.mimeType || "image/jpeg",
        });
      }
      return;
    }

    Alert.alert(
      "Add Photo",
      "Take a new photo or choose from gallery?",
      [
        {
          text: "Camera",
          onPress: async () => {
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.7,
              allowsEditing: false,
            });
            if (!result.canceled && result.assets[0]) {
              const asset = result.assets[0];
              setPendingPhoto({
                uri: asset.uri,
                name: asset.fileName || `visit_${Date.now()}.jpg`,
                mimeType: asset.mimeType || "image/jpeg",
              });
            }
          },
        },
        {
          text: "Gallery",
          onPress: async () => {
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.7,
              allowsEditing: false,
            });
            if (!result.canceled && result.assets[0]) {
              const asset = result.assets[0];
              setPendingPhoto({
                uri: asset.uri,
                name: asset.fileName || `visit_${Date.now()}.jpg`,
                mimeType: asset.mimeType || "image/jpeg",
              });
            }
          },
        },
        { text: "Cancel", style: "cancel" },
      ]
    );
  }, []);

  // ── Check-in handler ──
  const handleCheckIn = useCallback(async () => {
    setChecking(true);
    try {
      // 1. Request location permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Location Required",
          "Please allow location access to record your field visit.",
          [{ text: "OK" }]
        );
        return;
      }

      // 2. Get position
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      // 3. Post to server (with or without photo)
      await api.recordFieldVisit(caseId, {
        case_type: caseType,
        lat:       pos.coords.latitude,
        lng:       pos.coords.longitude,
        accuracy:  pos.coords.accuracy ?? undefined,
        photo:     pendingPhoto ?? undefined,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPendingPhoto(null); // clear staged photo after successful submit
      await qc.invalidateQueries({ queryKey });
    } catch (e: any) {
      Alert.alert("Check-in Failed", e.message || "Could not record location.");
    } finally {
      setChecking(false);
    }
  }, [caseId, caseType, pendingPhoto, qc, queryKey]);

  // ── Confirm before check-in if already done today ──
  const handlePress = () => {
    if (hasCheckedInToday) {
      Alert.alert(
        "Already Checked In",
        "You have already recorded a visit today. Check in again?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Check In Again", onPress: handleCheckIn },
        ]
      );
    } else {
      handleCheckIn();
    }
  };

  return (
    <View style={[
      styles.sectionCard,
      hasCheckedInToday && { borderColor: Colors.success + "55" },
    ]}>
      {/* ── Header ── */}
      <View style={[
        styles.sectionHeader,
        hasCheckedInToday && { backgroundColor: Colors.success + "12" },
      ]}>
        <Ionicons
          name="location-outline"
          size={16}
          color={hasCheckedInToday ? Colors.success : Colors.primary}
        />
        <Text style={[
          styles.sectionTitle,
          hasCheckedInToday && { color: Colors.success },
        ]}>
          Field Visit
        </Text>

        {hasCheckedInToday && (
          <View style={styles.doneBadge}>
            <Ionicons name="checkmark" size={10} color={Colors.success} />
            <Text style={styles.doneBadgeText}>Done today</Text>
          </View>
        )}
      </View>

      {/* ── Body ── */}
      <View style={styles.body}>

        {/* Latest visit info */}
        {isLoading ? (
          <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: 8 }} />
        ) : visits.length > 0 ? (
          <View style={styles.lastVisitRow}>
            <View style={[styles.dot, { backgroundColor: hasCheckedInToday ? Colors.success : Colors.textMuted }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.lastVisitDate}>{fmtVisitDate(visits[0].visited_at)}</Text>
              <Text style={styles.lastVisitCoords}>{fmtCoords(visits[0].lat, visits[0].lng)}</Text>
              {visits[0].accuracy != null && (
                <Text style={styles.accuracy}>Accuracy ±{Math.round(visits[0].accuracy)}m</Text>
              )}
              {/* Show photo from last visit if exists */}
              {visits[0].photo_url ? (
                <Image
                  source={{ uri: visits[0].photo_url }}
                  style={styles.visitPhoto}
                  resizeMode="cover"
                />
              ) : null}
            </View>
          </View>
        ) : (
          <View style={styles.noVisitRow}>
            <Ionicons name="location-outline" size={14} color={Colors.textMuted} />
            <Text style={styles.noVisitText}>No visits recorded yet</Text>
          </View>
        )}

        {/* ── Staged photo preview ── */}
        {pendingPhoto && (
          <View style={styles.pendingPhotoWrapper}>
            <Image source={{ uri: pendingPhoto.uri }} style={styles.pendingPhoto} resizeMode="cover" />
            <Pressable
              style={styles.removePhotoBtn}
              onPress={() => setPendingPhoto(null)}
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={22} color="#fff" />
            </Pressable>
            <View style={styles.pendingPhotoLabel}>
              <Ionicons name="camera" size={12} color="#fff" />
              <Text style={styles.pendingPhotoLabelText}>Photo ready to upload</Text>
            </View>
          </View>
        )}

        {/* ── Photo picker row ── */}
        <Pressable
          style={({ pressed }) => [styles.photoBtn, pressed && { opacity: 0.7 }]}
          onPress={handlePickPhoto}
          disabled={checking}
        >
          <Ionicons
            name={pendingPhoto ? "camera" : "camera-outline"}
            size={15}
            color={pendingPhoto ? Colors.success : Colors.primary}
          />
          <Text style={[styles.photoBtnText, pendingPhoto && { color: Colors.success }]}>
            {pendingPhoto ? "Change Photo" : "Add Photo (optional)"}
          </Text>
        </Pressable>

        {/* Action buttons */}
        <View style={styles.btnRow}>
          <Pressable
            style={[styles.checkInBtn, checking && { opacity: 0.6 }]}
            onPress={handlePress}
            disabled={checking}
          >
            {checking ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="locate" size={15} color="#fff" />
                <Text style={styles.checkInText}>
                  {hasCheckedInToday ? "Check In Again" : "Check In Here"}
                </Text>
              </>
            )}
          </Pressable>

          {visits.length > 1 && (
            <Pressable
              style={styles.historyBtn}
              onPress={() => setShowHistory((v) => !v)}
            >
              <Ionicons
                name={showHistory ? "chevron-up" : "time-outline"}
                size={14}
                color={Colors.primary}
              />
              <Text style={styles.historyBtnText}>
                {showHistory ? "Hide" : `History (${visits.length})`}
              </Text>
            </Pressable>
          )}
        </View>

        {/* Visit history list */}
        {showHistory && visits.length > 1 && (
          <View style={styles.historyList}>
            {visits.slice(1).map((v, i) => (
              <View key={v.id} style={[styles.historyRow, i === visits.length - 2 && { borderBottomWidth: 0 }]}>
                <View style={[styles.dot, { backgroundColor: Colors.textMuted, marginTop: 3 }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyDate}>{fmtVisitDate(v.visited_at)}</Text>
                  <Text style={styles.historyCoords}>{fmtCoords(v.lat, v.lng)}</Text>
                  {v.photo_url ? (
                    <Image
                      source={{ uri: v.photo_url }}
                      style={styles.historyPhoto}
                      resizeMode="cover"
                    />
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  sectionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surfaceAlt,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.text,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    flex: 1,
  },
  doneBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.success + "18",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  doneBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.success,
  },
  body: {
    padding: 14,
    gap: 10,
  },
  lastVisitRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 10,
    padding: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 3,
    flexShrink: 0,
  },
  lastVisitDate: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.text,
  },
  lastVisitCoords: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
    fontFamily: "monospace",
  },
  accuracy: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },
  visitPhoto: {
    width: "100%",
    height: 120,
    borderRadius: 8,
    marginTop: 8,
  },
  noVisitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },
  noVisitText: {
    fontSize: 13,
    color: Colors.textMuted,
    fontStyle: "italic",
  },

  // Pending photo
  pendingPhotoWrapper: {
    borderRadius: 10,
    overflow: "hidden",
    height: 160,
    backgroundColor: Colors.surfaceAlt,
  },
  pendingPhoto: {
    width: "100%",
    height: "100%",
  },
  removePhotoBtn: {
    position: "absolute",
    top: 8,
    right: 8,
  },
  pendingPhotoLabel: {
    position: "absolute",
    bottom: 8,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  pendingPhotoLabelText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#fff",
  },

  // Photo button
  photoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: "dashed",
  },
  photoBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.primary,
  },

  btnRow: {
    flexDirection: "row",
    gap: 8,
  },
  checkInBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 11,
  },
  checkInText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 13,
  },
  historyBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingVertical: 11,
  },
  historyBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.primary,
  },
  historyList: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  historyDate: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.text,
  },
  historyCoords: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 1,
    fontFamily: "monospace",
  },
  historyPhoto: {
    width: "100%",
    height: 80,
    borderRadius: 6,
    marginTop: 6,
  },
});

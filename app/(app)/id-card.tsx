import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, Image,
  Alert, ActivityIndicator, Platform
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useAuth, formatAgentId } from "@/context/AuthContext";
import { api } from "@/lib/api";

// ✅ FIX 2: Per-user key — each agent gets their own photo slot
const getPhotoKey = (agentId: string) => `id_card_photo_${agentId}`;

const PHOTO_SIZE  = 90;
const BORDER      = 4;
const TOTAL_PHOTO = PHOTO_SIZE + BORDER * 2; // 98
const BG_HEIGHT   = 110;
const BOTTOM_PAD  = 16;
// ✅ Section is tall enough to fully contain the circle inside the card
const SECTION_H   = BG_HEIGHT + TOTAL_PHOTO + BOTTOM_PAD; // 224

export default function IdCardScreen() {
  const insets = useSafeAreaInsets();
  const { agent } = useAuth();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);

  const agentIdDisplay = agent
    ? (agent.agent_id || formatAgentId(agent.id))
    : "—";

  // ✅ FIX 2: Use per-user key, wait for agent to be available
  const photoKey = getPhotoKey(agent?.id ?? "guest");

  useEffect(() => {
    let cancelled = false;

    async function loadPhoto() {
      try {
        // ✅ FIX 2: use photoKey (per-user), not a shared constant
        const local = await AsyncStorage.getItem(photoKey);
        if (!cancelled && local) setPhotoUri(local);
      } catch (e) {
        console.warn("[IdCard] AsyncStorage read failed:", e);
      }

      try {
        const p = await api.getProfile();
        if (!cancelled && p?.photo_url?.startsWith("http")) {
          setPhotoUri(p.photo_url);
        }
      } catch (e) {
        console.warn("[IdCard] getProfile failed (non-fatal):", e);
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    loadPhoto();
    return () => { cancelled = true; };
  }, [photoKey]); // re-run if agent changes

  const pickAndSave = async (useCamera: boolean) => {
    try {
      const result = useCamera
        ? await ImagePicker.launchCameraAsync({
            allowsEditing: true, aspect: [1, 1], quality: 0.8,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsEditing: true, aspect: [1, 1], quality: 0.8,
          });

      if (result.canceled || !result.assets?.[0]) return;

      setSaving(true);
      const localUri = result.assets[0].uri;
      // ✅ FIX 2: save under per-user key
      await AsyncStorage.setItem(photoKey, localUri);
      setPhotoUri(localUri);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to pick photo");
    } finally {
      setSaving(false);
    }
  };

  const showPhotoOptions = () => {
    if (Platform.OS === "web") { pickAndSave(false); return; }
    Alert.alert("Add Photo", "Choose source", [
      { text: "Camera",  onPress: () => pickAndSave(true)  },
      { text: "Gallery", onPress: () => pickAndSave(false) },
      { text: "Cancel",  style: "cancel" },
    ]);
  };

  if (!ready) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={Colors.primary} size="large" />
        <Text style={styles.loadingText}>Loading ID Card...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={[styles.container, {
        paddingBottom: insets.bottom + 24,
        paddingTop: Platform.OS === "web" ? 67 : 16,
      }]}
    >
      {/* ✅ FIX 1: card has NO overflow:hidden — header/footer handle their own corners */}
      <View style={styles.card}>

        {/* Header — has its own top border-radius + overflow:hidden for geo clips */}
        <View style={styles.cardHeader}>
          <Text style={styles.headerSubtitle}>Authorised Collection Agency For</Text>
          <View style={styles.brandRow}>
            <View style={styles.brandIcon}>
              <View style={[styles.brandBar, { backgroundColor: "#2E7D32", height: 18 }]} />
              <View style={[styles.brandBar, { backgroundColor: "#2E7D32", height: 26, marginLeft: 3 }]} />
            </View>
            <View>
              <Text style={styles.brandName}>Hero</Text>
              <Text style={styles.brandSub}>FINCORP</Text>
            </View>
          </View>
        </View>

        {/* ✅ FIX 1: photoSection is tall enough — full circle stays inside the card */}
        <View style={styles.photoSection}>
          {/* Coloured geometric background — only top BG_HEIGHT px */}
          <View style={[StyleSheet.absoluteFillObject, { height: BG_HEIGHT, overflow: "hidden" }]}>
            <View style={styles.geometricBg}>
              <View style={[styles.geoBlock, styles.geoRed]}  />
              <View style={[styles.geoBlock, styles.geoDark]} />
              <View style={[styles.geoBlock, styles.geoGreen]}/>
            </View>
          </View>
          {/* White below the coloured strip */}
          <View style={[StyleSheet.absoluteFillObject, { top: BG_HEIGHT, backgroundColor: "#fff" }]} />

          {/* Photo shell — shadow only (overflow:visible); wrapper clips image to circle */}
          <View style={styles.photoShell}>
            <Pressable style={styles.photoWrapper} onPress={showPhotoOptions} disabled={saving}>
              {saving ? (
                <View style={styles.photoInner}>
                  <ActivityIndicator color={Colors.primary} />
                </View>
              ) : photoUri ? (
                <Image
                  source={{ uri: photoUri }}
                  style={styles.photoInner}
                  resizeMode="cover"
                  onError={() => {
                    console.warn("[IdCard] Image failed to load");
                    setPhotoUri(null);
                  }}
                />
              ) : (
                <View style={[styles.photoInner, styles.photoPlaceholder]}>
                  <Ionicons name="person" size={44} color={Colors.textMuted} />
                </View>
              )}
            </Pressable>
            <Pressable style={styles.photoEditBadge} onPress={showPhotoOptions} disabled={saving}>
              <Ionicons name="camera" size={12} color="#fff" />
            </Pressable>
          </View>
        </View>

        {/* Body */}
        <View style={styles.cardBody}>
          <Text style={styles.agentName}>{agent?.name || "—"}</Text>
          <Text style={styles.designation}>Collection Officer</Text>
          <Text style={styles.agentId}>Agent ID No. : {agentIdDisplay}</Text>

          <View style={styles.divider} />
          <View style={styles.companyBrandRow}>
            <Text style={styles.heroText}>Hero</Text>
            <Text style={styles.financeText}> FINANCE</Text>
          </View>
          <Text style={styles.companyName}>DHANRAJ ENTERPRISES</Text>
          <Text style={styles.address}>
            2nd Floor Ghodajkar Complex Maharana{"\n"}
            Pratap Chowk, Hingoli Naka Nanded
          </Text>
          <View style={styles.emergencyRow}>
            <Ionicons name="call" size={12} color={Colors.danger} />
            <Text style={styles.emergencyLabel}>Emergency Contact</Text>
          </View>
          <Text style={styles.phone}>{agent?.phone || "9689898388"}</Text>
        </View>

        {/* Footer — has its own bottom border-radius */}
        <View style={styles.cardFooter}>
          <View style={[styles.footerBar, { backgroundColor: "#2E7D32" }]} />
          <View style={[styles.footerBar, { backgroundColor: Colors.danger   }]} />
          <View style={[styles.footerBar, { backgroundColor: "#1565C0"       }]} />
        </View>
      </View>

      <Pressable style={styles.photoBtn} onPress={showPhotoOptions} disabled={saving}>
        <Ionicons name="camera-outline" size={18} color={Colors.primary} />
        <Text style={styles.photoBtnText}>{photoUri ? "Change Photo" : "Add Photo"}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1, justifyContent: "center", alignItems: "center",
    backgroundColor: Colors.background, gap: 12,
  },
  loadingText: { fontSize: 14, color: Colors.textMuted, fontWeight: "500" },
  container:   { alignItems: "center", gap: 16, padding: 20 },

  // ✅ FIX 1: NO overflow:"hidden" here — it was clipping the photo circle
  card: {
    width: "100%", maxWidth: 340, backgroundColor: "#fff",
    borderRadius: 20,
    // overflow: "hidden" REMOVED
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2, shadowRadius: 24, elevation: 10,
    borderWidth: 3, borderColor: "#E8B800",
  },

  // Header handles its own top corners
  cardHeader: {
    backgroundColor: "#1a1a2e",
    paddingTop: 16, paddingBottom: 12, paddingHorizontal: 20,
    alignItems: "center", gap: 6,
    borderTopLeftRadius: 17,   // card radius (20) minus border (3)
    borderTopRightRadius: 17,
    overflow: "hidden",
  },
  headerSubtitle: { color: "rgba(255,255,255,0.7)", fontSize: 10, letterSpacing: 0.5 },
  brandRow:   { flexDirection: "row", alignItems: "center", gap: 8 },
  brandIcon:  { flexDirection: "row", alignItems: "flex-end", height: 28 },
  brandBar:   { width: 8, borderRadius: 2 },
  brandName:  { color: "#fff", fontSize: 26, fontWeight: "900", letterSpacing: -0.5, lineHeight: 28 },
  brandSub:   { color: "rgba(255,255,255,0.85)", fontSize: 10, fontWeight: "700", letterSpacing: 3, marginTop: -2 },

  // ✅ FIX 1: tall enough to contain the FULL photo circle (no clipping needed)
  photoSection: {
    height: SECTION_H,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: BOTTOM_PAD,
  },
  geometricBg: { height: BG_HEIGHT, flexDirection: "row" },
  geoBlock:    { flex: 1, transform: [{ skewX: "-15deg" }] },
  geoRed:      { backgroundColor: "#C62828", marginHorizontal: -10 },
  geoDark:     { backgroundColor: "#1a1a2e" },
  geoGreen:    { backgroundColor: "#2E7D32", marginHorizontal: -10 },

  // Shadow shell — overflow:visible so shadow shows on Android
  photoShell: {
    width: TOTAL_PHOTO, height: TOTAL_PHOTO,
    borderRadius: TOTAL_PHOTO / 2,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
    backgroundColor: "#fff",
  },

  // Clip wrapper — overflow:hidden cuts image to perfect circle
  photoWrapper: {
    width: TOTAL_PHOTO, height: TOTAL_PHOTO,
    borderRadius: TOTAL_PHOTO / 2,
    borderWidth: BORDER, borderColor: "#fff",
    overflow: "hidden",
    backgroundColor: "#f0f0f0",
  },

  photoInner:       { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  photoPlaceholder: { backgroundColor: "#f0f0f0" },

  photoEditBadge: {
    position: "absolute", bottom: 2, right: 2,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.primary,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#fff", zIndex: 10,
  },

  cardBody: {
    paddingTop: 16, paddingBottom: 16, paddingHorizontal: 20,
    alignItems: "center", gap: 4, backgroundColor: "#fff",
  },
  agentName:       { fontSize: 18, fontWeight: "800", color: "#1a1a2e", textAlign: "center", letterSpacing: 0.3 },
  designation:     { fontSize: 12, color: "#C62828", fontWeight: "700", letterSpacing: 0.5 },
  agentId:         { fontSize: 11, color: "#555", fontWeight: "500", marginBottom: 4 },
  divider:         { width: "80%", height: StyleSheet.hairlineWidth, backgroundColor: "#ddd", marginVertical: 8 },
  companyBrandRow: { flexDirection: "row", alignItems: "baseline" },
  heroText:        { fontSize: 22, fontWeight: "900", color: "#C62828", letterSpacing: -0.5, fontStyle: "italic" },
  financeText:     { fontSize: 22, fontWeight: "700", color: "#1a1a2e", letterSpacing: 0.5 },
  companyName:     { fontSize: 14, fontWeight: "900", color: "#1a1a2e", letterSpacing: 1, textAlign: "center", marginTop: 2 },
  address:         { fontSize: 9, color: "#777", textAlign: "center", lineHeight: 13, marginTop: 2 },
  emergencyRow:    { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  emergencyLabel:  { fontSize: 10, color: Colors.danger, fontWeight: "600", letterSpacing: 0.3 },
  phone:           { fontSize: 16, fontWeight: "800", color: "#1a1a2e", letterSpacing: 1 },

  // Footer handles its own bottom corners
  cardFooter: {
    flexDirection: "row", height: 8,
    borderBottomLeftRadius: 17,
    borderBottomRightRadius: 17,
    overflow: "hidden",
  },
  footerBar: { flex: 1 },

  photoBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.surface, borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 24,
    borderWidth: 1, borderColor: Colors.border,
    width: "100%", maxWidth: 340, justifyContent: "center",
  },
  photoBtnText: { fontSize: 15, fontWeight: "600", color: Colors.primary },
});

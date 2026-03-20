import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, Modal,
  TextInput, Alert, ScrollView, Platform, Image, ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";
import { getApiUrl } from "@/lib/query-client";
import { tokenStore } from "@/lib/api";

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: any) => parseFloat(n || 0).toLocaleString("en-IN");
const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "";

async function uploadScreenshotForDep(depositId: number, uri: string): Promise<string> {
  const base = getApiUrl();
  const token = Platform.OS !== "web" ? await tokenStore.get() : null;
  const form = new FormData();
  form.append("screenshot", { uri, name: `dep_${depositId}.jpg`, type: "image/jpeg" } as any);
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${base}/api/fos-depositions/${depositId}/pay-online`, {
    method: "POST", body: form, credentials: "include",
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.message || "Upload failed");
  }
  const data = await res.json();
  return data.screenshotUrl || "";
}

async function payCash(depositId: number, cashAmount: number): Promise<void> {
  const base = getApiUrl();
  const token = Platform.OS !== "web" ? await tokenStore.get() : null;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${base}/api/fos-depositions/${depositId}/pay-cash`, {
    method: "POST", headers, credentials: "include",
    body: JSON.stringify({ cashAmount }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.message || "Failed");
  }
}

// ─── Payment Method Sheet ─────────────────────────────────────────────────────
function PaymentSheet({ visible, item, onClose, onPaid }: any) {
  const [mode, setMode] = useState<"select" | "cash" | "online">("select");
  const [cashAmt, setCashAmt] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = () => { setMode("select"); setCashAmt(""); };

  const handleCash = async () => {
    const amt = parseFloat(cashAmt);
    if (!amt || amt <= 0) { Alert.alert("Error", "Enter a valid amount"); return; }
    setLoading(true);
    try {
      await payCash(item.id, amt);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onPaid();
      reset();
      onClose();
    } catch (e: any) { Alert.alert("Error", e.message); }
    finally { setLoading(false); }
  };

  const handleOnline = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.85,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      setLoading(true);
      await uploadScreenshotForDep(item.id, result.assets[0].uri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onPaid();
      reset();
      onClose();
    } catch (e: any) { Alert.alert("Error", e.message); }
    finally { setLoading(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { reset(); onClose(); }}>
      <View style={pay.overlay}>
        <View style={pay.sheet}>
          <View style={pay.handle} />

          {item && (
            <View style={pay.infoCard}>
              <View style={{ flex: 1 }}>
                <Text style={pay.infoName} numberOfLines={1}>{item.customer_name || "Deposition"}</Text>
                {item.loan_no && <Text style={pay.infoMeta}>{item.loan_no}</Text>}
              </View>
              <Text style={pay.infoAmt}>₹{fmt(item.amount)}</Text>
            </View>
          )}

          {mode === "select" && (
            <>
              <Text style={pay.title}>How did you pay?</Text>
              <View style={pay.optRow}>
                <Pressable style={[pay.opt, { borderColor: Colors.success }]} onPress={() => setMode("cash")}>
                  <View style={[pay.optIcon, { backgroundColor: Colors.success + "15" }]}>
                    <Ionicons name="cash-outline" size={28} color={Colors.success} />
                  </View>
                  <Text style={[pay.optLabel, { color: Colors.success }]}>Paid in Cash</Text>
                  <Text style={pay.optHint}>Enter cash amount</Text>
                </Pressable>

                <Pressable style={[pay.opt, { borderColor: "#2563eb" }]} onPress={handleOnline} disabled={loading}>
                  <View style={[pay.optIcon, { backgroundColor: "#2563eb15" }]}>
                    {loading ? <ActivityIndicator color="#2563eb" /> : <Ionicons name="phone-portrait-outline" size={28} color="#2563eb" />}
                  </View>
                  <Text style={[pay.optLabel, { color: "#2563eb" }]}>Paid Online</Text>
                  <Text style={pay.optHint}>Upload screenshot</Text>
                </Pressable>
              </View>

              <Pressable style={pay.cancelBtn} onPress={() => { reset(); onClose(); }}>
                <Text style={pay.cancelText}>Cancel</Text>
              </Pressable>
            </>
          )}

          {mode === "cash" && (
            <>
              <Text style={pay.title}>Enter Cash Amount</Text>
              <View style={pay.cashRow}>
                <Text style={pay.rupee}>₹</Text>
                <TextInput
                  style={pay.cashInput}
                  placeholder="0"
                  placeholderTextColor={Colors.textMuted}
                  value={cashAmt}
                  onChangeText={setCashAmt}
                  keyboardType="numeric"
                  autoFocus
                />
              </View>
              <Text style={pay.cashHint}>
                Total assigned: ₹{fmt(item?.amount)}
              </Text>
              <View style={pay.cashBtnRow}>
                <Pressable style={pay.backBtn} onPress={() => setMode("select")}>
                  <Ionicons name="arrow-back" size={18} color={Colors.textSecondary} />
                  <Text style={pay.backText}>Back</Text>
                </Pressable>
                <Pressable
                  style={[pay.confirmBtn, loading && { opacity: 0.6 }]}
                  onPress={handleCash}
                  disabled={loading}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <><Ionicons name="checkmark" size={18} color="#fff" /><Text style={pay.confirmText}>Confirm Cash</Text></>
                  }
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Deposition Card ──────────────────────────────────────────────────────────
function DepositionCard({ item, onPayPressed }: { item: any; onPayPressed: (item: any) => void }) {
  const isPending = item.payment_method === "pending";
  const isCash = item.payment_method === "cash";
  const isOnline = item.payment_method === "online";
  const amount = parseFloat(item.amount || 0);

  const borderColor = isPending ? Colors.warning : isCash ? Colors.success : "#2563eb";

  const screenshotSrc = item.screenshot_url
    ? (item.screenshot_url.startsWith("http") ? item.screenshot_url : `${getApiUrl()}${item.screenshot_url}`)
    : null;

  return (
    <View style={[card.root, { borderLeftColor: borderColor }]}>
      {/* Header */}
      <View style={card.header}>
        <View style={{ flex: 1 }}>
          <Text style={card.name} numberOfLines={1}>{item.customer_name || "Assigned Deposit"}</Text>
          {item.loan_no && (
            <Text style={card.meta}>{item.loan_no}{item.bkt ? ` · BKT ${item.bkt}` : ""}</Text>
          )}
          <Text style={card.date}>Assigned: {fmtDate(item.created_at)}</Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <Text style={[card.amount, { color: borderColor }]}>₹{fmt(amount)}</Text>
          {/* Status badge */}
          <View style={[card.badge, { backgroundColor: borderColor + "20" }]}>
            <Text style={[card.badgeText, { color: borderColor }]}>
              {isPending ? "⏳ Pending" : isCash ? "💵 Cash" : "📲 Online"}
            </Text>
          </View>
        </View>
      </View>

      {/* Sub amounts */}
      {(parseFloat(item.cash_amount) > 0 || parseFloat(item.online_amount) > 0) && (
        <View style={card.subRow}>
          {parseFloat(item.cash_amount) > 0 && (
            <Text style={card.subAmt}>💵 Cash: ₹{fmt(item.cash_amount)}</Text>
          )}
          {parseFloat(item.online_amount) > 0 && (
            <Text style={[card.subAmt, { color: "#2563eb" }]}>📲 Online: ₹{fmt(item.online_amount)}</Text>
          )}
        </View>
      )}

      {/* Screenshot thumbnail */}
      {screenshotSrc && (
        <View style={card.screenshotRow}>
          <Image source={{ uri: screenshotSrc }} style={card.thumb} resizeMode="cover" />
          <View style={card.screenshotInfo}>
            <Ionicons name="checkmark-circle" size={14} color="#2563eb" />
            <Text style={{ fontSize: 12, color: "#2563eb", fontWeight: "600" }}>Screenshot uploaded</Text>
          </View>
        </View>
      )}

      {item.notes && <Text style={card.notes}>{item.notes}</Text>}

      {/* Pay button — show if pending */}
      {isPending && (
        <Pressable style={card.payBtn} onPress={() => onPayPressed(item)}>
          <Ionicons name="wallet-outline" size={16} color="#fff" />
          <Text style={card.payBtnText}>Mark as Paid</Text>
        </Pressable>
      )}

      {/* Replace screenshot for online */}
      {isOnline && (
        <Pressable style={[card.payBtn, { backgroundColor: "#2563eb" }]} onPress={() => onPayPressed(item)}>
          <Ionicons name="camera-outline" size={16} color="#fff" />
          <Text style={card.payBtnText}>Replace Screenshot</Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function FosDepositionScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [payItem, setPayItem] = useState<any>(null);

  // ✅ FIX: Added error state + retry button + debug logging
  const { data: depData, isLoading, error, refetch } = useQuery({
    queryKey: ["/api/fos-depositions"],
    queryFn: async () => {
      const base = getApiUrl();
      const token = Platform.OS !== "web" ? await tokenStore.get() : null;
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${base}/api/fos-depositions`, {
        headers,
        credentials: "include",
      });

      const text = await res.text();
      console.log("[fos-dep] status:", res.status, "body:", text.slice(0, 200));

      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { msg = JSON.parse(text).message || msg; } catch {}
        throw new Error(msg);
      }

      let json: any;
      try { json = JSON.parse(text); } catch { throw new Error("Invalid server response"); }

      // ✅ Handle both { depositions: [] } and plain [] response shapes
      if (Array.isArray(json)) return { depositions: json };
      return json;
    },
    staleTime: 0,
    retry: 2,
  });

  const depositions: any[] = depData?.depositions || [];

  const totalAssigned = depositions.reduce((s, d) => s + parseFloat(d.amount || 0), 0);
  const totalCash = depositions.reduce((s, d) => s + parseFloat(d.cash_amount || 0), 0);
  const totalOnline = depositions.reduce((s, d) => s + parseFloat(d.online_amount || 0), 0);
  const pendingCount = depositions.filter((d) => d.payment_method === "pending").length;

  const onPaid = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["/api/fos-depositions"] });
  }, [qc]);

  // ✅ Loading state
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background }}>
        <ActivityIndicator color={Colors.primary} size="large" />
        <Text style={{ marginTop: 12, color: Colors.textSecondary, fontSize: 14 }}>Loading depositions...</Text>
      </View>
    );
  }

  // ✅ Error state with retry button
  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background, padding: 24 }}>
        <Ionicons name="cloud-offline-outline" size={48} color={Colors.textMuted} />
        <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.text, marginTop: 12, textAlign: "center" }}>
          Could not load depositions
        </Text>
        <Text style={{ fontSize: 13, color: Colors.textMuted, marginTop: 6, textAlign: "center" }}>
          {(error as Error).message}
        </Text>
        <Pressable
          style={{ marginTop: 20, backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
          onPress={() => refetch()}
        >
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <FlatList
        data={depositions}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[
          main.container,
          { paddingBottom: insets.bottom + 32, paddingTop: Platform.OS === "web" ? 67 : 12 },
          depositions.length === 0 && { flex: 1 },
        ]}
        ListHeaderComponent={
          depositions.length > 0 ? (
            <View style={{ gap: 12, marginBottom: 4 }}>
              {/* Summary cards */}
              <View style={main.summaryRow}>
                <View style={[main.sumCard, { borderTopColor: Colors.warning }]}>
                  <Ionicons name="time-outline" size={18} color={Colors.warning} />
                  <Text style={main.sumNum}>{pendingCount}</Text>
                  <Text style={main.sumLabel}>Pending</Text>
                </View>
                <View style={[main.sumCard, { borderTopColor: Colors.success }]}>
                  <Ionicons name="cash-outline" size={18} color={Colors.success} />
                  <Text style={[main.sumNum, { color: Colors.success }]}>₹{fmt(totalCash)}</Text>
                  <Text style={main.sumLabel}>Cash Paid</Text>
                </View>
                <View style={[main.sumCard, { borderTopColor: "#2563eb" }]}>
                  <Ionicons name="phone-portrait-outline" size={18} color="#2563eb" />
                  <Text style={[main.sumNum, { color: "#2563eb" }]}>₹{fmt(totalOnline)}</Text>
                  <Text style={main.sumLabel}>Online Paid</Text>
                </View>
              </View>

              {/* Total banner */}
              <View style={main.totalBanner}>
                <View>
                  <Text style={main.totalLabel}>Total Assigned</Text>
                  <Text style={main.totalAmt}>₹{fmt(totalAssigned)}</Text>
                </View>
                {pendingCount > 0 && (
                  <View style={main.pendingAlert}>
                    <Ionicons name="alert-circle" size={14} color={Colors.warning} />
                    <Text style={main.pendingAlertText}>{pendingCount} awaiting payment</Text>
                  </View>
                )}
              </View>

              <Text style={main.sectionTitle}>Your Assigned Deposits</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <DepositionCard item={item} onPayPressed={setPayItem} />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        // ✅ Pull-to-refresh
        onRefresh={() => refetch()}
        refreshing={isLoading}
        ListEmptyComponent={
          <View style={main.empty}>
            <View style={main.emptyIcon}>
              <Ionicons name="wallet-outline" size={44} color={Colors.primary} />
            </View>
            <Text style={main.emptyTitle}>No Deposits Assigned</Text>
            <Text style={main.emptyText}>Admin hasn't assigned any deposits to you yet.</Text>
            <Pressable
              style={{ marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.border }}
              onPress={() => refetch()}
            >
              <Text style={{ color: Colors.textSecondary, fontWeight: "600", fontSize: 13 }}>Refresh</Text>
            </Pressable>
          </View>
        }
      />

      <PaymentSheet
        visible={!!payItem}
        item={payItem}
        onClose={() => setPayItem(null)}
        onPaid={onPaid}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const main = StyleSheet.create({
  container: { padding: 16, gap: 10 },
  summaryRow: { flexDirection: "row", gap: 10 },
  sumCard: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: 14, padding: 12,
    borderTopWidth: 3, alignItems: "center", gap: 3,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  sumNum: { fontSize: 14, fontWeight: "800", color: Colors.text },
  sumLabel: { fontSize: 10, color: Colors.textSecondary, fontWeight: "600", textAlign: "center" },
  totalBanner: {
    backgroundColor: Colors.primary, borderRadius: 16, padding: 18,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  totalLabel: { color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: "600" },
  totalAmt: { color: "#fff", fontSize: 28, fontWeight: "800", marginTop: 2 },
  pendingAlert: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  pendingAlertText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: Colors.text, marginTop: 4 },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.primary + "12", justifyContent: "center", alignItems: "center",
  },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: Colors.text },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: "center", maxWidth: 260 },
});

const card = StyleSheet.create({
  root: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 16,
    borderLeftWidth: 4,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  name: { fontSize: 15, fontWeight: "700", color: Colors.text },
  meta: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  date: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  amount: { fontSize: 20, fontWeight: "800" },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  subRow: { flexDirection: "row", gap: 12, marginTop: 8, flexWrap: "wrap" },
  subAmt: { fontSize: 13, fontWeight: "600", color: Colors.success },
  screenshotRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  thumb: { width: 56, height: 56, borderRadius: 8 },
  screenshotInfo: { flexDirection: "row", alignItems: "center", gap: 4 },
  notes: { fontSize: 12, color: Colors.textSecondary, fontStyle: "italic", marginTop: 8 },
  payBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 13, marginTop: 12,
  },
  payBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
});

const pay = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, gap: 16,
  },
  handle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: "center", marginBottom: 4 },
  infoCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: Colors.surfaceAlt, borderRadius: 14, padding: 14,
  },
  infoName: { fontSize: 15, fontWeight: "700", color: Colors.text },
  infoMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  infoAmt: { fontSize: 22, fontWeight: "800", color: Colors.primary },
  title: { fontSize: 18, fontWeight: "800", color: Colors.text, textAlign: "center" },
  optRow: { flexDirection: "row", gap: 12 },
  opt: {
    flex: 1, borderRadius: 16, padding: 18, alignItems: "center", gap: 8,
    backgroundColor: Colors.surface, borderWidth: 2,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  optIcon: { width: 56, height: 56, borderRadius: 28, justifyContent: "center", alignItems: "center" },
  optLabel: { fontSize: 15, fontWeight: "800" },
  optHint: { fontSize: 11, color: Colors.textMuted, textAlign: "center" },
  cancelBtn: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 12,
    paddingVertical: 13, alignItems: "center",
  },
  cancelText: { fontSize: 15, fontWeight: "600", color: Colors.textSecondary },
  cashRow: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 2, borderColor: Colors.success, borderRadius: 16, padding: 16, gap: 4,
  },
  rupee: { fontSize: 28, fontWeight: "800", color: Colors.success },
  cashInput: { flex: 1, fontSize: 36, fontWeight: "800", color: Colors.text },
  cashHint: { fontSize: 12, color: Colors.textMuted, textAlign: "center" },
  cashBtnRow: { flexDirection: "row", gap: 10 },
  backBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    borderWidth: 1, borderColor: Colors.border, borderRadius: 12, paddingVertical: 13,
  },
  backText: { fontSize: 14, fontWeight: "600", color: Colors.textSecondary },
  confirmBtn: {
    flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: Colors.success, borderRadius: 12, paddingVertical: 13,
  },
  confirmText: { fontSize: 14, fontWeight: "700", color: "#fff" },
});

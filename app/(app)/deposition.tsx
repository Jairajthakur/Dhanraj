import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, Modal,
  TextInput, Alert, Platform, Image, ActivityIndicator, KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { tokenStore } from "@/lib/api";
import { usePushNotifications } from "@/context/usePushNotifications";
// ─── helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: any) => parseFloat(n || 0).toLocaleString("en-IN");
const fmtDate = (d: any) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "";

function resolveScreenshotUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const base = getApiUrl().replace(/\/+$/, "");
  const path = url.startsWith("/") ? url : `/${url}`;
  return `${base}${path}`;
}

async function authFetch(url: string, options: RequestInit = {}) {
  const base = getApiUrl();
  const token = Platform.OS !== "web" ? await tokenStore.get() : null;
  const headers: Record<string, string> = { ...(options.headers as any) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(`${base}${url}`, { ...options, headers, credentials: "include" });
}

async function payCash(depositId: number, cashAmount: number): Promise<void> {
  const res = await authFetch(`/api/fos-depositions/${depositId}/pay-cash`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cashAmount }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Failed");
}

async function payOnline(depositId: number, uri: string, amount?: number): Promise<void> {
  const base  = getApiUrl();
  const token = Platform.OS !== "web" ? await tokenStore.get() : null;
  const ext      = uri.split(".").pop()?.toLowerCase() || "jpg";
  const mimeType = ext === "png" ? "image/png" : "image/jpeg";
  const form = new FormData();
  form.append("screenshot", { uri, type: mimeType, name: `dep_${depositId}.${ext}` } as any);
  if (amount && amount > 0) form.append("onlineAmount", String(amount));
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${base}/api/fos-depositions/${depositId}/pay-online`, {
    method: "POST", body: form, credentials: "include",
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({})) as any;
    throw new Error(json.message || "Upload failed");
  }
}

async function payBoth(
  depositId: number,
  cashAmount: number,
  onlineAmount: number,
  screenshotUri: string
): Promise<void> {
  const base  = getApiUrl();
  const token = Platform.OS !== "web" ? await tokenStore.get() : null;
  const ext      = screenshotUri.split(".").pop()?.toLowerCase() || "jpg";
  const mimeType = ext === "png" ? "image/png" : "image/jpeg";
  const form = new FormData();
  form.append("cashAmount",   String(cashAmount));
  form.append("onlineAmount", String(onlineAmount));
  form.append("screenshot", {
    uri:  screenshotUri,
    type: mimeType,
    name: `dep_${depositId}_both.${ext}`,
  } as any);
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${base}/api/fos-depositions/${depositId}/pay-both`, {
    method: "PUT", body: form, credentials: "include",
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  });
  if (!res.ok) {
    throw new Error((await res.json().catch(() => ({}))).message || "Failed");
  }
}

// ─── PayMode — single declaration ─────────────────────────────────────────────
type PayMode = "select" | "cash" | "online_amt" | "online" | "both";

// ─── Bulk Payment Sheet ───────────────────────────────────────────────────────
function BulkPaymentSheet({ visible, selectedItems, onClose, onPaid }: {
  visible: boolean; selectedItems: any[]; onClose: () => void; onPaid: () => void;
}) {
  const [mode, setMode]               = useState<PayMode>("select");
  const [cashAmt, setCashAmt]         = useState("");
  const [onlineAmt, setOnlineAmt]     = useState("");   // used for split (both) mode
  const [onlineAmt2, setOnlineAmt2]   = useState("");   // used for online-only mode
  const [screenshotUri, setScreenshotUri] = useState<string | null>(null);
  const [loading, setLoading]         = useState(false);

  const totalAmount = selectedItems.reduce((s, i) => s + parseFloat(i.amount || 0), 0);

  // reset clears ALL state including onlineAmt2
  const reset = () => {
    setMode("select");
    setCashAmt("");
    setOnlineAmt("");
    setOnlineAmt2("");
    setScreenshotUri(null);
  };

  const pickScreenshot = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (!result.canceled && result.assets?.[0]) setScreenshotUri(result.assets[0].uri);
  };

  // Cash handler — supports partial amounts
  const handleCash = async () => {
    const amt = parseFloat(cashAmt);
    if (!amt || amt <= 0) { Alert.alert("Error", "Enter a valid cash amount"); return; }
    setLoading(true);
    try {
      for (const item of selectedItems) {
        const prop = parseFloat(item.amount || 0) / totalAmount;
        await payCash(item.id, Math.round(amt * prop * 100) / 100);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onPaid(); reset(); onClose();
    } catch (e: any) { Alert.alert("Error", e.message); }
    finally { setLoading(false); }
  };

  // Online handler — asks for amount first (online_amt step), then screenshot
  const handleOnline = async () => {
    const amt = parseFloat(onlineAmt2);
    if (!amt || amt <= 0) { Alert.alert("Error", "Enter a valid online amount"); return; }
    setLoading(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
      if (result.canceled || !result.assets?.[0]) { setLoading(false); return; }
      for (const item of selectedItems) {
        const prop = selectedItems.length > 1 ? parseFloat(item.amount || 0) / totalAmount : 1;
        await payOnline(item.id, result.assets[0].uri, Math.round(amt * prop * 100) / 100);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onPaid(); reset(); onClose();
    } catch (e: any) { Alert.alert("Error", e.message); }
    finally { setLoading(false); }
  };

  // Split (both) handler
  const handleBoth = async () => {
    const cash   = parseFloat(cashAmt)   || 0;
    const online = parseFloat(onlineAmt) || 0;
    if (cash   <= 0) { Alert.alert("Error", "Enter cash amount");   return; }
    if (online <= 0) { Alert.alert("Error", "Enter online amount"); return; }
    if (!screenshotUri) { Alert.alert("Screenshot Required", "Please attach the online payment screenshot."); return; }
    const proceed = async () => {
      setLoading(true);
      try {
        const splitTotal = cash + online;
        for (const item of selectedItems) {
          const prop = parseFloat(item.amount || 0) / splitTotal;
          await payBoth(
            item.id,
            Math.round(cash   * prop * 100) / 100,
            Math.round(online * prop * 100) / 100,
            screenshotUri!
          );
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onPaid(); reset(); onClose();
      } catch (e: any) { Alert.alert("Error", e.message); }
      finally { setLoading(false); }
    };
    const diff = Math.abs((cash + online) - totalAmount);
    if (diff > 1) {
      Alert.alert(
        "Amount Mismatch",
        `Cash ₹${fmt(cash)} + Online ₹${fmt(online)} = ₹${fmt(cash + online)}\nExpected: ₹${fmt(totalAmount)}\n\nProceed anyway?`,
        [{ text: "Cancel", style: "cancel" }, { text: "Proceed", onPress: proceed }]
      );
    } else { await proceed(); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { reset(); onClose(); }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <View style={pay.overlay}>
        <View style={pay.sheet}>
          <View style={pay.handle} />

          {/* Info header */}
          <View style={pay.infoCard}>
            <View style={{ flex: 1 }}>
              <Text style={pay.infoName}>{selectedItems.length} customer{selectedItems.length > 1 ? "s" : ""} selected</Text>
              <Text style={pay.infoMeta} numberOfLines={2}>{selectedItems.map((i) => i.customer_name || "—").join(", ")}</Text>
            </View>
            <Text style={pay.infoAmt}>₹{fmt(totalAmount)}</Text>
          </View>

          {/* ── Step 1: choose payment mode ── */}
          {mode === "select" && (
            <>
              <Text style={pay.title}>How was payment made?</Text>
              <View style={pay.optRow}>
                <Pressable style={[pay.opt, { borderColor: Colors.success }]} onPress={() => setMode("cash")}>
                  <View style={[pay.optIcon, { backgroundColor: Colors.success + "18" }]}>
                    <Ionicons name="cash-outline" size={26} color={Colors.success} />
                  </View>
                  <Text style={[pay.optLabel, { color: Colors.success }]}>Cash</Text>
                  <Text style={pay.optHint}>Enter amount</Text>
                </Pressable>

                {/* Online → goes to online_amt step first */}
                <Pressable style={[pay.opt, { borderColor: "#2563eb" }]} onPress={() => setMode("online_amt")}>
                  <View style={[pay.optIcon, { backgroundColor: "#2563eb18" }]}>
                    <Ionicons name="phone-portrait-outline" size={26} color="#2563eb" />
                  </View>
                  <Text style={[pay.optLabel, { color: "#2563eb" }]}>Online</Text>
                  <Text style={pay.optHint}>Enter amount</Text>
                </Pressable>

                <Pressable style={[pay.opt, { borderColor: Colors.primary }]} onPress={() => setMode("both")}>
                  <View style={[pay.optIcon, { backgroundColor: Colors.primary + "18" }]}>
                    <Ionicons name="swap-horizontal-outline" size={26} color={Colors.primary} />
                  </View>
                  <Text style={[pay.optLabel, { color: Colors.primary }]}>Split</Text>
                  <Text style={pay.optHint}>Cash + Online</Text>
                </Pressable>
              </View>
              <Pressable style={pay.cancelBtn} onPress={() => { reset(); onClose(); }}>
                <Text style={pay.cancelText}>Cancel</Text>
              </Pressable>
            </>
          )}

          {/* ── Step 2a: cash amount entry ── */}
          {mode === "cash" && (
            <>
              <Text style={pay.title}>Enter Cash Amount</Text>
              <View style={[pay.amtRow, { borderColor: Colors.success }]}>
                <Text style={[pay.rupee, { color: Colors.success }]}>₹</Text>
                <TextInput
                  style={pay.amtInput}
                  placeholder="0"
                  placeholderTextColor={Colors.textMuted}
                  value={cashAmt}
                  onChangeText={setCashAmt}
                  keyboardType="numeric"
                  autoFocus
                />
              </View>
              <Text style={pay.hint}>
                Total assigned: ₹{fmt(totalAmount)}
                {parseFloat(cashAmt) > 0 && parseFloat(cashAmt) < totalAmount
                  ? `  ·  Remaining after: ₹${fmt(totalAmount - parseFloat(cashAmt))}`
                  : ""}
              </Text>
              <Pressable
                style={{ backgroundColor: Colors.surfaceAlt, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, alignSelf: "flex-start" }}
                onPress={() => setCashAmt(String(totalAmount))}
              >
                <Text style={{ fontSize: 12, fontWeight: "700", color: Colors.success }}>Use full ₹{fmt(totalAmount)}</Text>
              </Pressable>
              <View style={pay.btnRow}>
                <Pressable style={pay.backBtn} onPress={() => setMode("select")}>
                  <Ionicons name="arrow-back" size={18} color={Colors.textSecondary} />
                  <Text style={pay.backText}>Back</Text>
                </Pressable>
                <Pressable
                  style={[pay.confirmBtn, { backgroundColor: Colors.success }, loading && { opacity: 0.6 }]}
                  onPress={handleCash}
                  disabled={loading}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <><Ionicons name="checkmark" size={18} color="#fff" /><Text style={pay.confirmText}>Confirm Cash</Text></>}
                </Pressable>
              </View>
            </>
          )}

          {/* ── Step 2b: online amount entry (NEW) ── */}
          {mode === "online_amt" && (
            <>
              <Text style={pay.title}>Enter Online Amount</Text>
              <View style={[pay.amtRow, { borderColor: "#2563eb" }]}>
                <Text style={[pay.rupee, { color: "#2563eb" }]}>₹</Text>
                <TextInput
                  style={pay.amtInput}
                  placeholder="0"
                  placeholderTextColor={Colors.textMuted}
                  value={onlineAmt2}
                  onChangeText={setOnlineAmt2}
                  keyboardType="numeric"
                  autoFocus
                />
              </View>
              <Text style={pay.hint}>
                Total assigned: ₹{fmt(totalAmount)}
                {parseFloat(onlineAmt2) > 0 && parseFloat(onlineAmt2) < totalAmount
                  ? `  ·  Remaining after: ₹${fmt(totalAmount - parseFloat(onlineAmt2))}`
                  : ""}
              </Text>
              <Pressable
                style={{ backgroundColor: Colors.surfaceAlt, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, alignSelf: "flex-start" }}
                onPress={() => setOnlineAmt2(String(totalAmount))}
              >
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#2563eb" }}>Use full ₹{fmt(totalAmount)}</Text>
              </Pressable>
              <View style={pay.btnRow}>
                <Pressable style={pay.backBtn} onPress={() => setMode("select")}>
                  <Ionicons name="arrow-back" size={18} color={Colors.textSecondary} />
                  <Text style={pay.backText}>Back</Text>
                </Pressable>
                <Pressable
                  style={[pay.confirmBtn, { backgroundColor: "#2563eb" }, loading && { opacity: 0.6 }]}
                  onPress={handleOnline}
                  disabled={loading}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <><Ionicons name="camera-outline" size={18} color="#fff" /><Text style={pay.confirmText}>Pick Screenshot</Text></>}
                </Pressable>
              </View>
            </>
          )}

          {/* ── Step 2c: split (cash + online) ── */}
          {mode === "both" && (
            <>
              <Text style={pay.title}>Split Payment</Text>
              <Text style={pay.fieldLabel}>💵 Cash Amount</Text>
              <View style={[pay.amtRow, { borderColor: Colors.success }]}>
                <Text style={[pay.rupee, { color: Colors.success }]}>₹</Text>
                <TextInput
                  style={pay.amtInput}
                  placeholder="0"
                  placeholderTextColor={Colors.textMuted}
                  value={cashAmt}
                  onChangeText={setCashAmt}
                  keyboardType="numeric"
                  autoFocus
                />
              </View>
              <Text style={[pay.fieldLabel, { marginTop: 2 }]}>📲 Online Amount</Text>
              <View style={[pay.amtRow, { borderColor: "#2563eb" }]}>
                <Text style={[pay.rupee, { color: "#2563eb" }]}>₹</Text>
                <TextInput
                  style={pay.amtInput}
                  placeholder="0"
                  placeholderTextColor={Colors.textMuted}
                  value={onlineAmt}
                  onChangeText={setOnlineAmt}
                  keyboardType="numeric"
                />
              </View>
              <Text style={pay.hint}>
                Total: ₹{fmt((parseFloat(cashAmt) || 0) + (parseFloat(onlineAmt) || 0))} / ₹{fmt(totalAmount)}
              </Text>
              <Pressable
                style={[pay.screenshotPicker, screenshotUri && { borderStyle: "solid", borderColor: "#2563eb" }]}
                onPress={pickScreenshot}
              >
                {screenshotUri ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Image source={{ uri: screenshotUri }} style={pay.screenshotThumb} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: "#2563eb" }}>Screenshot attached ✓</Text>
                      <Text style={{ fontSize: 11, color: Colors.textMuted }}>Tap to change</Text>
                    </View>
                    <Ionicons name="checkmark-circle" size={20} color="#2563eb" />
                  </View>
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={[pay.optIcon, { width: 44, height: 44, borderRadius: 22, backgroundColor: "#2563eb18" }]}>
                      <Ionicons name="camera-outline" size={20} color="#2563eb" />
                    </View>
                    <View>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: "#2563eb" }}>Attach Online Screenshot</Text>
                      <Text style={{ fontSize: 11, color: Colors.textMuted }}>Required for online portion</Text>
                    </View>
                  </View>
                )}
              </Pressable>
              <View style={pay.btnRow}>
                <Pressable style={pay.backBtn} onPress={() => setMode("select")}>
                  <Ionicons name="arrow-back" size={18} color={Colors.textSecondary} />
                  <Text style={pay.backText}>Back</Text>
                </Pressable>
                <Pressable
                  style={[pay.confirmBtn, loading && { opacity: 0.6 }]}
                  onPress={handleBoth}
                  disabled={loading}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <><Ionicons name="checkmark" size={18} color="#fff" /><Text style={pay.confirmText}>Confirm Split</Text></>}
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Deposition Card ──────────────────────────────────────────────────────────
function DepositionCard({ item, isSelected, onSelect }: {
  item: any; isSelected: boolean; onSelect: (item: any) => void;
}) {
  const isPending = item.payment_method === "pending";
  const isCash    = item.payment_method === "cash";
  const isBoth    = item.payment_method === "both";

  const assignedAmt      = parseFloat(item.amount        || 0);
  const collectedCash    = parseFloat(item.cash_amount   || 0);
  const collectedOnline  = parseFloat(item.online_amount || 0);
  const totalCollected   = collectedCash + collectedOnline;
  const remaining        = Math.max(0, assignedAmt - totalCollected);
  const hasRemaining     = remaining > 0 && totalCollected > 0;

  const borderColor = isPending
    ? isSelected ? Colors.primary : Colors.warning
    : isCash  ? Colors.success
    : isBoth  ? Colors.primary
    : "#2563eb";

  const screenshotSrc = resolveScreenshotUrl(item.screenshot_url);

  return (
    <Pressable
      style={[card.root, { borderLeftColor: borderColor }, isPending && isSelected && card.selectedRoot]}
      onPress={isPending ? () => onSelect(item) : undefined}
      disabled={!isPending}
      activeOpacity={isPending ? 0.7 : 1}
    >
      <View style={card.header}>
        {isPending && (
          <View style={[card.checkbox, isSelected && card.checkboxActive]}>
            {isSelected && <Ionicons name="checkmark" size={13} color="#fff" />}
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={card.name} numberOfLines={1}>{item.customer_name || "Assigned Deposit"}</Text>
          <Text style={card.date}>Assigned: {fmtDate(item.created_at)}</Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <Text style={[card.amount, { color: borderColor }]}>₹{fmt(assignedAmt)}</Text>
          <View style={[card.badge, { backgroundColor: borderColor + "20" }]}>
            <Text style={[card.badgeText, { color: borderColor }]}>
              {isPending ? "⏳ Pending"
                : isCash  ? "💵 Cash"
                : isBoth  ? "🔀 Split"
                :           "📲 Online"}
            </Text>
          </View>
        </View>
      </View>

      {/* Sub amounts */}
      {(collectedCash > 0 || collectedOnline > 0) && (
        <View style={card.subRow}>
          {collectedCash > 0 && (
            <View style={card.subChip}>
              <Ionicons name="cash-outline" size={12} color={Colors.success} />
              <Text style={[card.subAmt, { color: Colors.success }]}>₹{fmt(collectedCash)}</Text>
            </View>
          )}
          {collectedOnline > 0 && (
            <View style={[card.subChip, { backgroundColor: "#2563eb12" }]}>
              <Ionicons name="phone-portrait-outline" size={12} color="#2563eb" />
              <Text style={[card.subAmt, { color: "#2563eb" }]}>₹{fmt(collectedOnline)}</Text>
            </View>
          )}
        </View>
      )}

      {/* Remaining amount indicator */}
      {hasRemaining && (
        <View style={card.remainingRow}>
          <Ionicons name="alert-circle-outline" size={13} color={Colors.warning} />
          <Text style={card.remainingText}>
            Collected ₹{fmt(totalCollected)} — Pending ₹{fmt(remaining)}
          </Text>
        </View>
      )}

      {/* Screenshot thumbnail */}
      {screenshotSrc && (
        <View style={card.screenshotRow}>
          <Image source={{ uri: screenshotSrc }} style={card.thumb} resizeMode="cover" />
          <View style={card.screenshotInfo}>
            <Ionicons name="checkmark-circle" size={13} color="#2563eb" />
            <Text style={{ fontSize: 11, color: "#2563eb", fontWeight: "600" }}>Screenshot uploaded</Text>
          </View>
        </View>
      )}

      {item.notes && <Text style={card.notes}>{item.notes}</Text>}

      
    </Pressable>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function FosDepositionScreen() {
  const insets = useSafeAreaInsets();
  const qc     = useQueryClient();
  usePushNotifications();

  const [bulkPayVisible, setBulkPayVisible] = useState(false);
  const [amountEntryItem, setAmountEntryItem] = useState<any>(null);
  const [enteredAmount,   setEnteredAmount]   = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const { data: depData, isLoading, error, refetch } = useQuery({
    queryKey: ["/api/fos-depositions"],
    queryFn: async () => {
      const res  = await authFetch("/api/fos-depositions");
      const text = await res.text();
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { msg = JSON.parse(text).message || msg; } catch {}
        throw new Error(msg);
      }
      const json = JSON.parse(text);
      return Array.isArray(json) ? { depositions: json } : json;
    },
    staleTime: 0,
    retry: 2,
  });

  const depositions: any[]   = depData?.depositions || [];
  const pendingDepositions   = depositions.filter((d) => d.payment_method === "pending");

  const totalAssigned  = depositions.reduce((s, d) => s + parseFloat(d.amount        || 0), 0);
  const totalCash      = depositions.reduce((s, d) => s + parseFloat(d.cash_amount   || 0), 0);
  const totalOnline    = depositions.reduce((s, d) => s + parseFloat(d.online_amount || 0), 0);
  const totalCollected = totalCash + totalOnline;
  const totalRemaining = Math.max(0, totalAssigned - totalCollected);

  const pendingCount   = pendingDepositions.length;
  const selectedItems  = depositions.filter((d) => d.payment_method === "pending" && selectedIds.has(d.id));
  const selectedTotal  = selectedItems.reduce((s, d) => s + parseFloat(d.amount || 0), 0);

  const toggleSelect = useCallback((item: any) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(
      selectedIds.size === pendingDepositions.length
        ? new Set()
        : new Set(pendingDepositions.map((d) => d.id))
    );
  }, [selectedIds, pendingDepositions]);

  const onPaid = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["/api/fos-depositions"] });
    setSelectedIds(new Set());
  }, [qc]);

  const handleAmountConfirm = () => {
    if (!amountEntryItem) return;
    const entered  = parseFloat(enteredAmount);
    if (!entered || entered <= 0) { Alert.alert("Error", "Enter a valid amount"); return; }
    const assigned              = parseFloat(amountEntryItem.amount        || 0);
    const collectedCash         = parseFloat(amountEntryItem.cash_amount   || 0);
    const collectedOnline       = parseFloat(amountEntryItem.online_amount || 0);
    const totalCollectedSoFar   = collectedCash + collectedOnline;
    const remaining             = Math.max(0, assigned - totalCollectedSoFar);

    if (Math.round(entered) > Math.round(remaining)) {
      Alert.alert(
        "Amount Exceeds Remaining",
        `You entered ₹${fmt(entered)} but remaining is ₹${fmt(remaining)}.\nProceed with ₹${fmt(remaining)}?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Use Remaining", onPress: () => {
            setEnteredAmount(String(remaining));
            setAmountEntryItem(null);
            setSelectedIds(new Set([amountEntryItem.id]));
            setBulkPayVisible(true);
          }},
        ]
      );
      return;
    }
    setAmountEntryItem(null);
    setSelectedIds(new Set([amountEntryItem.id]));
    setBulkPayVisible(true);
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background }}>
        <ActivityIndicator color={Colors.primary} size="large" />
        <Text style={{ marginTop: 12, color: Colors.textSecondary, fontSize: 14 }}>Loading depositions...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background, padding: 24 }}>
        <Ionicons name="cloud-offline-outline" size={48} color={Colors.textMuted} />
        <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.text, marginTop: 12, textAlign: "center" }}>Could not load depositions</Text>
        <Text style={{ fontSize: 13, color: Colors.textMuted, marginTop: 6, textAlign: "center" }}>{(error as Error).message}</Text>
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
          { paddingBottom: selectedIds.size > 0 ? insets.bottom + 120 : insets.bottom + 32, paddingTop: Platform.OS === "web" ? 67 : 12 },
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
                  <Text style={main.sumLabel}>Cash</Text>
                </View>
                <View style={[main.sumCard, { borderTopColor: "#2563eb" }]}>
                  <Ionicons name="phone-portrait-outline" size={18} color="#2563eb" />
                  <Text style={[main.sumNum, { color: "#2563eb" }]}>₹{fmt(totalOnline)}</Text>
                  <Text style={main.sumLabel}>Online</Text>
                </View>
              </View>

              {/* Total banner */}
              <View style={main.totalBanner}>
                <View>
                  <Text style={main.totalLabel}>Total Assigned</Text>
                  <Text style={main.totalAmt}>₹{fmt(totalAssigned)}</Text>
                </View>
                {totalRemaining > 0 && (
                  <View style={main.remainingBadge}>
                    <Ionicons name="alert-circle" size={14} color={Colors.warning} />
                    <Text style={main.remainingBadgeText}>₹{fmt(totalRemaining)} remaining</Text>
                  </View>
                )}
              </View>

              <Text style={main.sectionTitle}>Your Assigned Deposits</Text>

              {pendingCount > 0 && (
                <Pressable style={main.selectAllBtn} onPress={selectAll}>
                  <Ionicons
                    name={selectedIds.size === pendingCount ? "checkbox" : "square-outline"}
                    size={18}
                    color={Colors.primary}
                  />
                  <Text style={main.selectAllText}>
                    {selectedIds.size === pendingCount ? "Deselect All" : `Select All Pending (${pendingCount})`}
                  </Text>
                </Pressable>
              )}
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <DepositionCard item={item} isSelected={selectedIds.has(item.id)} onSelect={toggleSelect} />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
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

      {/* Sticky "Mark as Paid" bar */}
      {selectedIds.size > 0 && (
        <View style={[main.stickyBar, { paddingBottom: insets.bottom + 12 }]}>
          <View>
            <Text style={main.stickyLabel}>{selectedIds.size} customer{selectedIds.size > 1 ? "s" : ""} selected</Text>
            <Text style={main.stickyTotal}>₹{fmt(selectedTotal)}</Text>
          </View>
          <Pressable style={main.stickyPayBtn} onPress={() => setBulkPayVisible(true)}>
            <Ionicons name="wallet-outline" size={18} color="#fff" />
            <Text style={main.stickyPayText}>Mark as Paid</Text>
          </Pressable>
        </View>
      )}

      {/* Amount Entry Modal (for partial-pay flow) */}
      <Modal
        visible={!!amountEntryItem}
        transparent
        animationType="slide"
        onRequestClose={() => { setAmountEntryItem(null); setEnteredAmount(""); }}
      >
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={pay.overlay}>
          <View style={pay.sheet}>
            <View style={pay.handle} />
            {amountEntryItem && (() => {
              const assigned            = parseFloat(amountEntryItem.amount        || 0);
              const collectedCash       = parseFloat(amountEntryItem.cash_amount   || 0);
              const collectedOnline     = parseFloat(amountEntryItem.online_amount || 0);
              const totalCollectedSoFar = collectedCash + collectedOnline;
              const remaining           = Math.max(0, assigned - totalCollectedSoFar);
              return (
                <>
                  <Text style={pay.title}>Enter Amount Collected</Text>
                  <View style={pay.infoCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={pay.infoName}>{amountEntryItem.customer_name || "—"}</Text>
                      {amountEntryItem.loan_no && <Text style={pay.infoMeta}>{amountEntryItem.loan_no}</Text>}
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={[pay.infoAmt, { fontSize: 14 }]}>Assigned ₹{fmt(assigned)}</Text>
                      {totalCollectedSoFar > 0 && (
                        <Text style={{ fontSize: 12, color: Colors.success, fontWeight: "600" }}>
                          Collected ₹{fmt(totalCollectedSoFar)}
                        </Text>
                      )}
                      <Text style={{ fontSize: 13, color: Colors.warning, fontWeight: "700" }}>
                        Remaining ₹{fmt(remaining)}
                      </Text>
                    </View>
                  </View>
                  <View style={[pay.amtRow, { borderColor: Colors.primary }]}>
                    <Text style={[pay.rupee, { color: Colors.primary }]}>₹</Text>
                    <TextInput
                      style={pay.amtInput}
                      placeholder="0"
                      placeholderTextColor={Colors.textMuted}
                      value={enteredAmount}
                      onChangeText={setEnteredAmount}
                      keyboardType="numeric"
                      autoFocus
                    />
                  </View>
                  <Pressable
                    style={{ backgroundColor: Colors.surfaceAlt, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, alignSelf: "flex-start" }}
                    onPress={() => setEnteredAmount(String(remaining))}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "700", color: Colors.primary }}>
                      Use full remaining ₹{fmt(remaining)}
                    </Text>
                  </Pressable>
                  <View style={pay.btnRow}>
                    <Pressable
                      style={pay.backBtn}
                      onPress={() => { setAmountEntryItem(null); setEnteredAmount(""); }}
                    >
                      <Text style={pay.backText}>Cancel</Text>
                    </Pressable>
                    <Pressable style={pay.confirmBtn} onPress={handleAmountConfirm}>
                      <Ionicons name="arrow-forward" size={18} color="#fff" />
                      <Text style={pay.confirmText}>Continue to Pay</Text>
                    </Pressable>
                  </View>
                </>
              );
            })()}
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const main = StyleSheet.create({
  container:        { padding: 16, gap: 10 },
  summaryRow:       { flexDirection: "row", gap: 10 },
  sumCard:          { flex: 1, backgroundColor: Colors.surface, borderRadius: 14, padding: 12, borderTopWidth: 3, alignItems: "center", gap: 3, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  sumNum:           { fontSize: 14, fontWeight: "800", color: Colors.text },
  sumLabel:         { fontSize: 10, color: Colors.textSecondary, fontWeight: "600", textAlign: "center" },
  totalBanner:      { backgroundColor: Colors.primary, borderRadius: 16, padding: 18, flexDirection: "row", justifyContent: "space-between", alignItems: "center", shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  totalLabel:       { color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: "600" },
  totalAmt:         { color: "#fff", fontSize: 28, fontWeight: "800", marginTop: 2 },
  remainingBadge:   { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  remainingBadgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  sectionTitle:     { fontSize: 15, fontWeight: "800", color: Colors.text, marginTop: 4 },
  selectAllBtn:     { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: Colors.primary + "10", borderRadius: 10, borderWidth: 1, borderColor: Colors.primary + "30" },
  selectAllText:    { fontSize: 13, fontWeight: "700", color: Colors.primary },
  stickyBar:        { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: Colors.surface, paddingTop: 16, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: Colors.border, shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 10 },
  stickyLabel:      { fontSize: 12, color: Colors.textSecondary, fontWeight: "600" },
  stickyTotal:      { fontSize: 22, fontWeight: "800", color: Colors.text, marginTop: 2 },
  stickyPayBtn:     { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.primary, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 14 },
  stickyPayText:    { fontSize: 15, fontWeight: "800", color: "#fff" },
  empty:            { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  emptyIcon:        { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.primary + "12", justifyContent: "center", alignItems: "center" },
  emptyTitle:       { fontSize: 18, fontWeight: "800", color: Colors.text },
  emptyText:        { fontSize: 14, color: Colors.textMuted, textAlign: "center", maxWidth: 260 },
});

const card = StyleSheet.create({
  root:           { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, borderLeftWidth: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  selectedRoot:   { borderWidth: 1.5, borderColor: Colors.primary, backgroundColor: Colors.primary + "05" },
  header:         { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  checkbox:       { width: 16, height: 16, borderRadius: 4, borderWidth: 1.5, borderColor: Colors.border, alignItems: "center", justifyContent: "center", marginTop: 2, flexShrink: 0 },
  checkboxActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  name:           { fontSize: 15, fontWeight: "700", color: Colors.text },
  meta:           { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  date:           { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  amount:         { fontSize: 20, fontWeight: "800" },
  badge:          { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText:      { fontSize: 11, fontWeight: "700" },
  subRow:         { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" },
  subChip:        { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.success + "12", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  subAmt:         { fontSize: 12, fontWeight: "700" },
  remainingRow:   { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, backgroundColor: Colors.warning + "12", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: Colors.warning + "30" },
  remainingText:  { fontSize: 12, fontWeight: "700", color: Colors.warning, flex: 1 },
  screenshotRow:  { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  thumb:          { width: 52, height: 52, borderRadius: 8 },
  screenshotInfo: { flexDirection: "row", alignItems: "center", gap: 4 },
  notes:          { fontSize: 12, color: Colors.textSecondary, fontStyle: "italic", marginTop: 8 },
  tapHint:        { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  tapHintText:    { fontSize: 12, color: Colors.textMuted, fontWeight: "500" },
});

const pay = StyleSheet.create({
  overlay:          { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet:            { backgroundColor: Colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, gap: 14 },
  handle:           { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: "center", marginBottom: 4 },
  infoCard:         { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: Colors.surfaceAlt, borderRadius: 14, padding: 14 },
  infoName:         { fontSize: 15, fontWeight: "700", color: Colors.text },
  infoMeta:         { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  infoAmt:          { fontSize: 22, fontWeight: "800", color: Colors.primary },
  title:            { fontSize: 18, fontWeight: "800", color: Colors.text, textAlign: "center" },
  optRow:           { flexDirection: "row", gap: 10 },
  opt:              { flex: 1, borderRadius: 16, padding: 14, alignItems: "center", gap: 6, backgroundColor: Colors.surface, borderWidth: 2 },
  optIcon:          { width: 50, height: 50, borderRadius: 25, justifyContent: "center", alignItems: "center" },
  optLabel:         { fontSize: 13, fontWeight: "800" },
  optHint:          { fontSize: 10, color: Colors.textMuted, textAlign: "center" },
  cancelBtn:        { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  cancelText:       { fontSize: 15, fontWeight: "600", color: Colors.textSecondary },
  fieldLabel:       { fontSize: 12, fontWeight: "700", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.4 },
  amtRow:           { flexDirection: "row", alignItems: "center", borderWidth: 2, borderColor: Colors.success, borderRadius: 16, padding: 14, gap: 4 },
  rupee:            { fontSize: 26, fontWeight: "800", color: Colors.success },
  amtInput:         { flex: 1, fontSize: 32, fontWeight: "800", color: Colors.text },
  hint:             { fontSize: 12, color: Colors.textMuted, textAlign: "center" },
  screenshotPicker: { borderWidth: 1.5, borderColor: "#2563eb", borderStyle: "dashed", borderRadius: 14, padding: 14 },
  screenshotThumb:  { width: 48, height: 48, borderRadius: 8 },
  btnRow:           { flexDirection: "row", gap: 10 },
  backBtn:          { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, paddingVertical: 13 },
  backText:         { fontSize: 14, fontWeight: "600", color: Colors.textSecondary },
  confirmBtn:       { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 13 },
  confirmText:      { fontSize: 14, fontWeight: "700", color: "#fff" },
});

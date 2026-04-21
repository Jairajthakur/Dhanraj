import React, { useEffect, useRef, useState } from "react";
import {
  Modal, View, Text, Pressable, StyleSheet,
  ScrollView, Animated, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface BlockingItem {
  type: "broken_ptp" | "overdue_deposition";
  id: number;
  customer_name: string;
  loan_no?: string;
  amount?: number;
  ptp_date?: string;        // for broken PTP
  assigned_at?: string;     // for overdue deposition
  hours_overdue?: number;
}

interface BlockingActionModalProps {
  visible: boolean;
  items: BlockingItem[];
  onDismiss: () => void;   // only called after snooze (1-hour grace)
  onActionTaken: () => void;
}

// ─── Single row ───────────────────────────────────────────────────────────────
function BlockItem({ item, index }: { item: BlockingItem; index: number }) {
  const isBrokenPtp = item.type === "broken_ptp";

  return (
    <View style={[
      s.itemCard,
      { borderLeftColor: isBrokenPtp ? "#E24B4A" : "#EF9F27" },
    ]}>
      <View style={s.itemRow}>
        <View style={[
          s.itemIconBox,
          { backgroundColor: isBrokenPtp ? "#FEE2E2" : "#FEF3C7" },
        ]}>
          <Ionicons
            name={isBrokenPtp ? "calendar-outline" : "wallet-outline"}
            size={16}
            color={isBrokenPtp ? "#991B1B" : "#92400E"}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.itemName} numberOfLines={1}>{item.customer_name}</Text>
          {item.loan_no
            ? <Text style={s.itemSub}>{item.loan_no}</Text>
            : null}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          {item.amount
            ? <Text style={[s.itemAmt, { color: isBrokenPtp ? "#E24B4A" : "#EF9F27" }]}>
                ₹{item.amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </Text>
            : null}
          <Text style={[s.itemTag, {
            backgroundColor: isBrokenPtp ? "#FEE2E2" : "#FEF3C7",
            color: isBrokenPtp ? "#991B1B" : "#92400E",
          }]}>
            {isBrokenPtp
              ? `PTP: ${String(item.ptp_date ?? "").slice(0, 10)}`
              : `${item.hours_overdue ?? ""}h overdue`}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────
export default function BlockingActionModal({
  visible,
  items,
  onDismiss,
  onActionTaken,
}: BlockingActionModalProps) {
  const shake = useRef(new Animated.Value(0)).current;
  const [snoozeCountdown, setSnoozeCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const brokenPtps   = items.filter((i) => i.type === "broken_ptp");
  const overdueDepos = items.filter((i) => i.type === "overdue_deposition");

  // Shake on open
  useEffect(() => {
    if (!visible) return;
    Animated.sequence([
      Animated.timing(shake, { toValue: 8,  duration: 60,  useNativeDriver: true }),
      Animated.timing(shake, { toValue: -8, duration: 60,  useNativeDriver: true }),
      Animated.timing(shake, { toValue: 6,  duration: 50,  useNativeDriver: true }),
      Animated.timing(shake, { toValue: -6, duration: 50,  useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0,  duration: 40,  useNativeDriver: true }),
    ]).start();
  }, [visible]);

  // Snooze countdown cleanup
  useEffect(() => {
    if (!visible) {
      if (timerRef.current) clearInterval(timerRef.current);
      setSnoozeCountdown(0);
    }
  }, [visible]);

  const handleSnooze = () => {
    // Give a 60-second visible countdown before actually dismissing
    // This makes the snooze feel earned, not instant
    setSnoozeCountdown(60);
    timerRef.current = setInterval(() => {
      setSnoozeCountdown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          onDismiss();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleGoAction = () => {
    // Do NOT dismiss here — modal stays blocking until the agent actually
    // resolves the PTP/deposition in the DB.
    // Just navigate underneath so the right screen is ready.
    if (overdueDepos.length > 0 && brokenPtps.length === 0) {
      router.push("/(app)/deposition" as any);
    } else {
      router.push("/(app)/allocation" as any);
    }
    // Trigger a refetch — modal will auto-dismiss once server confirms resolved.
    onActionTaken();
  };

  if (!visible || items.length === 0) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {}}  // back button does nothing
      statusBarTranslucent
    >
      <View style={s.overlay}>
        <Animated.View style={[s.sheet, { transform: [{ translateX: shake }] }]}>

          {/* Header */}
          <View style={s.header}>
            <View style={s.headerIconWrap}>
              <Ionicons name="warning" size={28} color="#E24B4A" />
            </View>
            <Text style={s.headerTitle}>Action required</Text>
            <Text style={s.headerSub}>
              You cannot use the app until you resolve{" "}
              {items.length === 1 ? "this issue" : `these ${items.length} issues`}.
            </Text>
          </View>

          {/* Items list */}
          <ScrollView
            style={s.scroll}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {brokenPtps.length > 0 && (
              <>
                <View style={s.groupHeader}>
                  <View style={[s.groupDot, { backgroundColor: "#E24B4A" }]} />
                  <Text style={s.groupLabel}>
                    {brokenPtps.length} broken PTP{brokenPtps.length > 1 ? "s" : ""}
                    {" "}— payment not received
                  </Text>
                </View>
                {brokenPtps.map((item, i) => (
                  <BlockItem key={item.id} item={item} index={i} />
                ))}
              </>
            )}

            {overdueDepos.length > 0 && (
              <>
                <View style={[s.groupHeader, brokenPtps.length > 0 && { marginTop: 12 }]}>
                  <View style={[s.groupDot, { backgroundColor: "#EF9F27" }]} />
                  <Text style={s.groupLabel}>
                    {overdueDepos.length} overdue deposit{overdueDepos.length > 1 ? "s" : ""}
                    {" "}— payment not submitted
                  </Text>
                </View>
                {overdueDepos.map((item, i) => (
                  <BlockItem key={item.id} item={item} index={i} />
                ))}
              </>
            )}
          </ScrollView>

          {/* Action buttons */}
          <Pressable style={s.primaryBtn} onPress={handleGoAction}>
            <Ionicons name="arrow-forward-circle" size={20} color="#fff" />
            <Text style={s.primaryBtnText}>
              {overdueDepos.length > 0 && brokenPtps.length === 0
                ? "Go to Depositions"
                : brokenPtps.length > 0 && overdueDepos.length === 0
                  ? "Go to Allocation"
                  : "Resolve now"}
            </Text>
          </Pressable>

          {/* Snooze — 1 hour grace, with visible countdown */}
          {snoozeCountdown > 0 ? (
            <View style={s.snoozeCountdown}>
              <Ionicons name="time-outline" size={14} color={Colors.textMuted} />
              <Text style={s.snoozeCountdownText}>
                App unlocks in {snoozeCountdown}s…
              </Text>
            </View>
          ) : (
            <Pressable style={s.snoozeBtn} onPress={handleSnooze}>
              <Ionicons name="time-outline" size={14} color={Colors.textMuted} />
              <Text style={s.snoozeBtnText}>Remind me in 1 hour</Text>
            </Pressable>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    width: "100%",
    maxHeight: "88%",
    overflow: "hidden",
    paddingBottom: 8,
  },
  header: {
    alignItems: "center",
    paddingTop: 28,
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 6,
    textAlign: "center",
  },
  headerSub: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 19,
  },
  scroll: {
    maxHeight: 300,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 8,
  },
  groupDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  groupLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    flex: 1,
  },
  itemCard: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 3,
    marginBottom: 8,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  itemIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  itemName: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.text,
  },
  itemSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  itemAmt: {
    fontSize: 13,
    fontWeight: "700",
  },
  itemTag: {
    fontSize: 10,
    fontWeight: "600",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 3,
    overflow: "hidden",
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#E24B4A",
    borderRadius: 14,
    paddingVertical: 15,
    marginHorizontal: 16,
    marginTop: 16,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
  snoozeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginTop: 4,
  },
  snoozeBtnText: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: "500",
  },
  snoozeCountdown: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginTop: 4,
  },
  snoozeCountdownText: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: "500",
  },
});

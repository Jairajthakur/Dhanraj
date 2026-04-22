import React, { useEffect, useRef, useState } from "react";
import {
  Modal, View, Text, Pressable, StyleSheet,
  ScrollView, Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface BlockingItem {
  type: "broken_ptp" | "overdue_deposition";
  source: "loan" | "bkt";
  id: number;
  customer_name: string;
  loan_no?: string;
  amount?: number;
  ptp_date?: string;
  assigned_at?: string;
  hours_overdue?: number;
}

interface BlockingActionModalProps {
  visible: boolean;
  items: BlockingItem[];
  onDismiss: () => void;
  onGoToCase: (item: BlockingItem) => void;
}

// ─── Single row ───────────────────────────────────────────────────────────────
function BlockItem({
  item,
  onPress,
}: {
  item: BlockingItem;
  onPress: (item: BlockingItem) => void;
}) {
  const isBrokenPtp = item.type === "broken_ptp";
  const [pressed, setPressed] = useState(false);

  return (
    <Pressable
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={() => onPress(item)}
      style={[
        s.itemCard,
        { borderLeftColor: isBrokenPtp ? "#E24B4A" : "#EF9F27" },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={s.itemRow}>
        <View style={[s.itemIconBox, { backgroundColor: isBrokenPtp ? "#FEE2E2" : "#FEF3C7" }]}>
          <Ionicons
            name={isBrokenPtp ? "calendar-outline" : "wallet-outline"}
            size={16}
            color={isBrokenPtp ? "#991B1B" : "#92400E"}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.itemName} numberOfLines={1}>{item.customer_name}</Text>
          {item.loan_no ? <Text style={s.itemSub}>{item.loan_no}</Text> : null}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          {item.amount ? (
            <Text style={[s.itemAmt, { color: isBrokenPtp ? "#E24B4A" : "#EF9F27" }]}>
              \u20b9{item.amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </Text>
          ) : null}
          <Text style={[s.itemTag, {
            backgroundColor: isBrokenPtp ? "#FEE2E2" : "#FEF3C7",
            color: isBrokenPtp ? "#991B1B" : "#92400E",
          }]}>
            {isBrokenPtp
              ? `PTP: ${String(item.ptp_date ?? "").slice(0, 10)}`
              : `${item.hours_overdue ?? ""}h overdue`}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#E24B4A" style={{ marginLeft: 6 }} />
      </View>
    </Pressable>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────
export default function BlockingActionModal({
  visible,
  items,
  onDismiss,
  onGoToCase,
}: BlockingActionModalProps) {
  const shake = useRef(new Animated.Value(0)).current;

  const brokenPtps   = items.filter((i) => i.type === "broken_ptp");
  const overdueDepos = items.filter((i) => i.type === "overdue_deposition");

  useEffect(() => {
    if (!visible) return;
    Animated.sequence([
      Animated.timing(shake, { toValue: 8,  duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 6,  duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -6, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0,  duration: 40, useNativeDriver: true }),
    ]).start();
  }, [visible]);

  // BUG FIX: Previously the snooze button started a 60-second countdown and only
  // called onDismiss() after it finished — forcing agents to watch a timer before the
  // app unlocked. Now onDismiss() is called immediately so the app unlocks at once.
  // The 1-hour re-appear logic lives in BlockingContext.snooze(), not here.
  const handleSnooze = () => {
    onDismiss();
  };

  if (!visible || items.length === 0) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {}}
      statusBarTranslucent
    >
      <View style={s.overlay}>
        <Animated.View style={[s.sheet, { transform: [{ translateX: shake }] }]}>

          <View style={s.header}>
            <View style={s.headerIconWrap}>
              <Ionicons name="warning" size={28} color="#E24B4A" />
            </View>
            <Text style={s.headerTitle}>Action Required</Text>
            <Text style={s.headerSub}>
              Resolve {items.length === 1 ? "this issue" : `these ${items.length} issues`} to use the app.
            </Text>
          </View>

          <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} bounces={false}>
            {brokenPtps.length > 0 && (
              <>
                <View style={s.groupHeader}>
                  <View style={[s.groupDot, { backgroundColor: "#E24B4A" }]} />
                  <Text style={s.groupLabel}>
                    {brokenPtps.length} Broken PTP{brokenPtps.length > 1 ? "s" : ""} — tap to update
                  </Text>
                </View>
                {brokenPtps.map((item) => (
                  <BlockItem key={`ptp-${item.id}`} item={item} onPress={onGoToCase} />
                ))}
              </>
            )}

            {overdueDepos.length > 0 && (
              <>
                <View style={[s.groupHeader, brokenPtps.length > 0 && { marginTop: 12 }]}>
                  <View style={[s.groupDot, { backgroundColor: "#EF9F27" }]} />
                  <Text style={s.groupLabel}>
                    {overdueDepos.length} Overdue Deposit{overdueDepos.length > 1 ? "s" : ""} — tap to submit
                  </Text>
                </View>
                {overdueDepos.map((item) => (
                  <BlockItem key={`dep-${item.id}`} item={item} onPress={onGoToCase} />
                ))}
              </>
            )}
          </ScrollView>

          <Pressable style={s.snoozeBtn} onPress={handleSnooze}>
            <Ionicons name="time-outline" size={14} color={Colors.textMuted} />
            <Text style={s.snoozeBtnText}>Remind me in 1 hour</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  overlay:            { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "center", alignItems: "center", padding: 20 },
  sheet:              { backgroundColor: Colors.surface, borderRadius: 20, width: "100%", maxHeight: "88%", overflow: "hidden", paddingBottom: 8 },
  header:             { alignItems: "center", paddingTop: 28, paddingHorizontal: 24, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  headerIconWrap:     { width: 56, height: 56, borderRadius: 28, backgroundColor: "#FEE2E2", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  headerTitle:        { fontSize: 18, fontWeight: "700", color: Colors.text, marginBottom: 6, textAlign: "center" },
  headerSub:          { fontSize: 13, color: Colors.textSecondary, textAlign: "center", lineHeight: 19 },
  scroll:             { maxHeight: 320, paddingHorizontal: 16, paddingTop: 12 },
  groupHeader:        { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 8 },
  groupDot:           { width: 8, height: 8, borderRadius: 4 },
  groupLabel:         { fontSize: 11, fontWeight: "700", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.4, flex: 1 },
  itemCard:           { backgroundColor: Colors.surfaceAlt, borderRadius: 12, padding: 12, borderLeftWidth: 3, marginBottom: 8 },
  itemRow:            { flexDirection: "row", alignItems: "center", gap: 10 },
  itemIconBox:        { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  itemName:           { fontSize: 13, fontWeight: "700", color: Colors.text },
  itemSub:            { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  itemAmt:            { fontSize: 13, fontWeight: "700" },
  itemTag:            { fontSize: 10, fontWeight: "600", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, marginTop: 3, overflow: "hidden" },
  snoozeBtn:          { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 16, marginHorizontal: 16, marginTop: 8 },
  snoozeBtnText:      { fontSize: 13, color: Colors.textMuted, fontWeight: "500" },

});

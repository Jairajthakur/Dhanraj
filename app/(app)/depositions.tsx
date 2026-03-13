import React from "react";
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, Pressable, Alert, Linking, Platform
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";

const UPI_APPS = [
  {
    name: "PhonePe",
    icon: require("@/assets/images/icon.png") as any,
    color: "#5f259f",
    scheme: (amount: string, note: string) => `phonepe://pay?am=${amount}&tn=${encodeURIComponent(note)}&cu=INR`,
    fallback: "https://phon.pe/store",
  },
  {
    name: "GPay",
    icon: null,
    color: "#1a73e8",
    scheme: (amount: string, note: string) => `tez://upi/pay?am=${amount}&tn=${encodeURIComponent(note)}&cu=INR`,
    fallback: "https://pay.google.com",
  },
  {
    name: "Paytm",
    icon: null,
    color: "#002970",
    scheme: (amount: string, note: string) => `paytmmp://pay?am=${amount}&tn=${encodeURIComponent(note)}&cu=INR`,
    fallback: "https://paytm.com",
  },
];

const UPI_ICONS: Record<string, string> = {
  PhonePe: "📱",
  GPay: "💳",
  Paytm: "💰",
};

async function openUpiApp(scheme: string, fallback: string) {
  const canOpen = await Linking.canOpenURL(scheme).catch(() => false);
  if (canOpen) {
    await Linking.openURL(scheme);
  } else {
    Linking.openURL(fallback);
  }
}

function DepositCard({ item }: { item: any }) {
  const amount = parseFloat(item.amount || 0);
  const amountStr = amount.toFixed(2);
  const note = item.description || "FOS Deposit";

  return (
    <View style={styles.card}>
      {/* Card header */}
      <View style={styles.cardHeader}>
        <View style={styles.amountPill}>
          <Ionicons name="wallet" size={18} color={Colors.warning} />
          <Text style={styles.amountText}>₹{amount.toLocaleString("en-IN", { minimumFractionDigits: 0 })}</Text>
        </View>
        <View style={styles.pendingBadge}>
          <Text style={styles.pendingText}>PENDING</Text>
        </View>
      </View>

      {item.description ? (
        <Text style={styles.description}>{item.description}</Text>
      ) : null}

      <Text style={styles.addedDate}>
        Added: {item.created_at ? new Date(item.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : ""}
      </Text>

      {/* UPI Payment buttons */}
      <View style={styles.divider} />
      <Text style={styles.payLabel}>Pay via UPI</Text>
      <View style={styles.upiRow}>
        {UPI_APPS.map((app) => (
          <Pressable
            key={app.name}
            style={[styles.upiBtn, { backgroundColor: app.color }]}
            onPress={() => {
              Alert.alert(
                `Pay via ${app.name}`,
                `Amount: ₹${amount.toLocaleString("en-IN")}\n\nThis will open ${app.name} to complete the payment.`,
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: `Open ${app.name}`,
                    onPress: () => openUpiApp(app.scheme(amountStr, note), app.fallback),
                  },
                ]
              );
            }}
          >
            <Text style={styles.upiIcon}>{UPI_ICONS[app.name]}</Text>
            <Text style={styles.upiName}>{app.name}</Text>
          </Pressable>
        ))}
      </View>

      {/* Any UPI app */}
      <Pressable
        style={styles.anyUpiBtn}
        onPress={() => {
          Alert.alert(
            "Pay via UPI",
            `Amount: ₹${amount.toLocaleString("en-IN")}\n\nThis will open your default UPI app.`,
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Pay Now",
                onPress: () => Linking.openURL(`upi://pay?am=${amountStr}&tn=${encodeURIComponent(note)}&cu=INR`),
              },
            ]
          );
        }}
      >
        <Ionicons name="qr-code-outline" size={18} color={Colors.primary} />
        <Text style={styles.anyUpiText}>Open any UPI App</Text>
      </Pressable>
    </View>
  );
}

export default function FosDepositionsScreen() {
  const insets = useSafeAreaInsets();

  const { data, isLoading } = useQuery({
    queryKey: ["/api/required-deposits"],
    queryFn: () => api.getRequiredDeposits(),
  });

  const deposits = data?.deposits || [];
  const total = deposits.reduce((s: number, d: any) => s + parseFloat(d.amount || 0), 0);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background }}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: Colors.background }}
      contentContainerStyle={[
        styles.container,
        { paddingBottom: insets.bottom + 24, paddingTop: Platform.OS === "web" ? 67 : 0 },
        deposits.length === 0 && { flex: 1 },
      ]}
      data={deposits}
      keyExtractor={(item) => String(item.id)}
      ListHeaderComponent={
        deposits.length > 0 ? (
          <View style={styles.totalCard}>
            <Ionicons name="wallet" size={28} color="#fff" />
            <View>
              <Text style={styles.totalLabel}>Total Pending Deposit</Text>
              <Text style={styles.totalAmount}>₹{total.toLocaleString("en-IN")}</Text>
            </View>
          </View>
        ) : null
      }
      renderItem={({ item }) => <DepositCard item={item} />}
      ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Ionicons name="checkmark-circle" size={64} color={Colors.success} />
          <Text style={styles.emptyTitle}>All Clear!</Text>
          <Text style={styles.emptyText}>No pending deposits assigned to you</Text>
        </View>
      }
      scrollEnabled={!!deposits.length}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  totalCard: {
    backgroundColor: Colors.warning, borderRadius: 16, padding: 20,
    flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 4,
    shadowColor: Colors.warning, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  totalLabel: { color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: "600" },
  totalAmount: { color: "#fff", fontSize: 30, fontWeight: "800" },
  card: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 16, gap: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
    borderLeftWidth: 4, borderLeftColor: Colors.warning,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  amountPill: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.warning + "18", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  amountText: { fontSize: 20, fontWeight: "800", color: Colors.warning },
  pendingBadge: {
    backgroundColor: Colors.warning + "20", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.warning + "40",
  },
  pendingText: { fontSize: 10, fontWeight: "800", color: Colors.warning, letterSpacing: 0.5 },
  description: { fontSize: 14, color: Colors.textSecondary },
  addedDate: { fontSize: 12, color: Colors.textMuted },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border },
  payLabel: { fontSize: 12, fontWeight: "700", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  upiRow: { flexDirection: "row", gap: 8 },
  upiBtn: {
    flex: 1, borderRadius: 12, padding: 12, alignItems: "center", gap: 4,
  },
  upiIcon: { fontSize: 22 },
  upiName: { fontSize: 12, fontWeight: "700", color: "#fff" },
  anyUpiBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: Colors.primary + "12", borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: Colors.primary + "30",
  },
  anyUpiText: { fontSize: 14, fontWeight: "600", color: Colors.primary },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: "800", color: Colors.text },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: "center" },
});

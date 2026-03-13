import React, { useMemo } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Linking, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";
import { Platform } from "react-native";

export default function ReadyPaymentScreen() {
  const insets = useSafeAreaInsets();
  const { data, isLoading } = useQuery({
    queryKey: ["/api/cases"],
    queryFn: () => api.getCases(),
  });

  const ptpCases = useMemo(() =>
    (data?.cases || []).filter((c: any) => c.status === "PTP"),
    [data]
  );

  if (isLoading) return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background }}>
      <ActivityIndicator color={Colors.primary} size="large" />
    </View>
  );

  return (
    <FlatList
      style={{ backgroundColor: Colors.background }}
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 24, paddingTop: Platform.OS === "web" ? 67 : 12 }]}
      data={ptpCases}
      keyExtractor={(item) => String(item.id)}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Ready Payment - By Telecaller</Text>
          <Text style={styles.headerSub}>{ptpCases.length} PTP cases pending</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="person-circle" size={22} color={Colors.primary} />
            <Text style={styles.customerName} numberOfLines={1}>{item.customer_name}</Text>
            <View style={styles.bktBadge}>
              <Text style={styles.bktText}>BKT: {item.bkt}</Text>
            </View>
          </View>
          <Text style={styles.loanNo}>Loan: {item.loan_no}</Text>
          {item.latest_feedback && (
            <View style={styles.feedbackBadge}>
              <Text style={styles.feedbackText}>{item.latest_feedback}</Text>
            </View>
          )}
          {item.feedback_comments && (
            <Text style={styles.comments}>{item.feedback_comments}</Text>
          )}
          <View style={styles.footer}>
            <Text style={styles.amount}>₹{parseFloat(item.emi_amount || 0).toFixed(2)}</Text>
            <Pressable
              style={styles.callBtn}
              onPress={() => item.mobile_no && Linking.openURL(`tel:${item.mobile_no.split(",")[0].trim()}`)}
            >
              <Ionicons name="call" size={16} color="#fff" />
              <Text style={styles.callBtnText}>Call</Text>
            </Pressable>
          </View>
        </View>
      )}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Ionicons name="checkmark-circle-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyText}>No PTP cases</Text>
        </View>
      }
      scrollEnabled={!!ptpCases.length}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  header: { marginBottom: 8 },
  headerTitle: { fontSize: 20, fontWeight: "800", color: Colors.text },
  headerSub: { fontSize: 14, color: Colors.textSecondary, marginTop: 4 },
  card: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 16, gap: 8,
    borderLeftWidth: 4, borderLeftColor: Colors.statusPTP,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  customerName: { flex: 1, fontSize: 15, fontWeight: "700", color: Colors.text, textTransform: "uppercase" },
  bktBadge: { backgroundColor: Colors.statusPTP + "22", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  bktText: { fontSize: 12, fontWeight: "700", color: Colors.statusPTP },
  company: { fontSize: 13, color: Colors.textSecondary },
  loanNo: { fontSize: 12, color: Colors.textMuted },
  feedbackBadge: {
    alignSelf: "flex-start", backgroundColor: Colors.statusPTP + "15",
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
  },
  feedbackText: { fontSize: 12, fontWeight: "700", color: Colors.statusPTP },
  comments: { fontSize: 13, color: Colors.textSecondary, fontStyle: "italic" },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  amount: { fontSize: 20, fontWeight: "800", color: Colors.primary },
  callBtn: {
    backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10,
    flexDirection: "row", alignItems: "center", gap: 6,
  },
  callBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingVertical: 80 },
  emptyText: { fontSize: 16, color: Colors.textMuted },
});

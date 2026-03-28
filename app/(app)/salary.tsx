import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Platform } from "react-native";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

// Converts stored month (integer 1-12 OR string "January") to display name
function getMonthName(month: any): string {
  if (!month && month !== 0) return "—";
  const n = parseInt(String(month));
  if (!isNaN(n) && n >= 1 && n <= 12) return MONTH_NAMES[n - 1];
  // fallback: already a string month name
  return String(month);
}

export default function SalaryScreen() {
  const insets = useSafeAreaInsets();
  const { agent } = useAuth();
  const [selectedIdx, setSelectedIdx] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/salary"],
    queryFn: () => api.getSalary(),
  });

  const salaryList = data?.salary || [];
  const selected = salaryList[selectedIdx];

  const Row = ({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) => (
    <View style={[styles.row, highlight && styles.rowHighlight]}>
      <Text style={[styles.rowLabel, highlight && styles.rowLabelHighlight]}>{label}</Text>
      <Text style={[styles.rowValue, highlight && styles.rowValueHighlight]}>{value}</Text>
    </View>
  );

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background }}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={[
        styles.container,
        { paddingBottom: insets.bottom + 24, paddingTop: Platform.OS === "web" ? 67 : 0 },
      ]}
    >
      {salaryList.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="wallet-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyText}>No salary records found</Text>
        </View>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.monthPicker}>
            {salaryList.map((s: any, i: number) => (
              <Pressable
                key={i}
                style={[styles.monthChip, i === selectedIdx && styles.monthChipActive]}
                onPress={() => setSelectedIdx(i)}
              >
                <Text style={[styles.monthChipText, i === selectedIdx && styles.monthChipTextActive]}>
                  {getMonthName(s.month)} {s.year}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {selected && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardHeaderTitle}>
                  {getMonthName(selected.month)} {selected.year}
                </Text>
              </View>

              <Row
                label="Salary for the month"
                value={`${getMonthName(selected.month)} ${selected.year}`}
              />
              <Row label="Emp Name:" value={agent?.name || "—"} />
              <Row label="Present Day:" value={String(selected.present_days ?? 0)} />
              <Row
                label="Payment Amount:"
                value={`₹${parseFloat(selected.payment_amount || 0).toFixed(2)}`}
              />
              <Row
                label="Incentive Amount:"
                value={`₹${parseFloat(selected.incentive_amount || 0).toFixed(0)}`}
              />
              <Row
                label="Petrol Expense:"
                value={`₹${parseFloat(selected.petrol_expense || 0).toFixed(0)}`}
              />
              <Row
                label="Mobile Expense:"
                value={`₹${parseFloat(selected.mobile_expense || 0).toFixed(0)}`}
              />
              <Row
                label="Gross Payment:"
                value={`₹${parseFloat(selected.gross_payment || 0).toFixed(0)}`}
              />
              <Row
                label="Advance:"
                value={`₹${parseFloat(selected.advance || 0).toFixed(0)}`}
              />
              <Row
                label="Other Deductions:"
                value={`₹${parseFloat(selected.other_deductions || 0).toFixed(0)}`}
              />
              <Row
                label="Total:"
                value={`₹${parseFloat(selected.total || 0).toFixed(0)}`}
              />
              <Row
                label="Net Salary:"
                value={`₹${parseFloat(selected.net_salary || 0).toFixed(0)}`}
                highlight
              />
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16 },
  monthPicker: { marginBottom: 4 },
  monthChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    marginRight: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  monthChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  monthChipText: { fontSize: 13, fontWeight: "600", color: Colors.textSecondary },
  monthChipTextActive: { color: "#fff" },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    backgroundColor: Colors.primaryDark,
    padding: 16,
  },
  cardHeaderTitle: { color: "#fff", fontSize: 17, fontWeight: "700" },
  row: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  rowHighlight: { backgroundColor: Colors.primary + "15" },
  rowLabel: {
    width: "50%",
    fontSize: 13,
    fontWeight: "600",
    color: Colors.textSecondary,
    padding: 14,
    backgroundColor: Colors.surfaceAlt,
  },
  rowLabelHighlight: {
    backgroundColor: Colors.primary + "15",
    fontWeight: "700",
    color: Colors.primary,
  },
  rowValue: { flex: 1, fontSize: 14, color: Colors.text, padding: 14, fontWeight: "500" },
  rowValueHighlight: { fontWeight: "800", color: Colors.primary, fontSize: 16 },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    paddingVertical: 80,
  },
  emptyText: { fontSize: 16, color: Colors.textMuted },
});

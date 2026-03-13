import React, { useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  ActivityIndicator, Platform
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  color: string;
}

function StatCard({ label, value, icon, color }: StatCardProps) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <View style={[styles.statIconWrap, { backgroundColor: color + "20" }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function Dashboard() {
  const insets = useSafeAreaInsets();

  const { data: stats, isLoading, refetch: refetchStats } = useQuery({
    queryKey: ["/api/stats"],
    queryFn: () => api.getStats(),
  });

  const { data: ptpData, isLoading: ptpLoading, refetch: refetchPtp } = useQuery({
    queryKey: ["/api/today-ptp"],
    queryFn: () => api.getTodayPtp(),
  });

  const refetch = useCallback(() => {
    refetchStats();
    refetchPtp();
  }, [refetchStats, refetchPtp]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background }}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  const ptpCases: any[] = ptpData?.cases || [];
  const ptpCount: number = ptpData?.count || 0;

  const fmt = (v: number) =>
    v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={[styles.container, {
        paddingBottom: insets.bottom + 24,
        paddingTop: Platform.OS === "web" ? 67 : 12,
      }]}
      refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={Colors.primary} />}
    >
      <Text style={styles.sectionHeading}>Overview</Text>

      <View style={styles.statsGrid}>
        <StatCard label="Total Cases" value={stats?.total || 0} icon="briefcase" color={Colors.info} />
        <StatCard label="Paid" value={stats?.paid || 0} icon="checkmark-circle" color={Colors.success} />
        <StatCard label="PTP" value={stats?.ptp || 0} icon="calendar" color={Colors.accent} />
        <StatCard label="Not Process" value={stats?.notProcess || 0} icon="close-circle" color={Colors.danger} />
      </View>

      <View style={styles.ptpCard}>
        <View style={styles.ptpHeader}>
          <View style={[styles.ptpBadge, { backgroundColor: Colors.accent + "20" }]}>
            <Ionicons name="calendar-outline" size={16} color={Colors.accent} />
          </View>
          <Text style={styles.ptpTitle}>Today's PTP</Text>
          <View style={[styles.countBadge, { backgroundColor: ptpCount > 0 ? Colors.accent : Colors.border }]}>
            <Text style={[styles.countBadgeText, { color: ptpCount > 0 ? "#fff" : Colors.textMuted }]}>
              {ptpLoading ? "…" : ptpCount}
            </Text>
          </View>
        </View>

        {ptpLoading ? (
          <ActivityIndicator color={Colors.accent} size="small" style={{ marginTop: 12 }} />
        ) : ptpCases.length === 0 ? (
          <Text style={styles.emptyText}>No PTP cases due today</Text>
        ) : (
          <View style={styles.ptpList}>
            {ptpCases.map((c: any, i: number) => {
              const teleDate = c.telecaller_ptp_date ? String(c.telecaller_ptp_date).slice(0, 10) : null;
              const fosDate  = c.ptp_date ? String(c.ptp_date).slice(0, 10) : null;
              return (
                <View key={`${c.source}-${c.id}`} style={[styles.ptpRow, i > 0 && styles.ptpRowBorder]}>
                  <View style={styles.ptpRowLeft}>
                    <Text style={styles.ptpName}>{c.customer_name}</Text>
                    <Text style={styles.ptpLoan}>{c.loan_no}</Text>
                    <View style={styles.ptpDatesRow}>
                      {teleDate && (
                        <View style={[styles.ptpDateTag, { backgroundColor: Colors.info + "22" }]}>
                          <Text style={[styles.ptpDateLabel, { color: Colors.info }]}>TC: {teleDate}</Text>
                        </View>
                      )}
                      {fosDate && (
                        <View style={[styles.ptpDateTag, { backgroundColor: Colors.accent + "22" }]}>
                          <Text style={[styles.ptpDateLabel, { color: Colors.accent }]}>FOS: {fosDate}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <Text style={[styles.ptpPos, { color: Colors.accent }]}>{fmt(parseFloat(c.pos) || 0)}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 16,
  },
  sectionHeading: {
    fontSize: 20,
    fontWeight: "800",
    color: Colors.text,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statCard: {
    width: "47%",
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderLeftWidth: 3,
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 30,
    fontWeight: "900",
    color: Colors.text,
    letterSpacing: -1,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  ptpCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  ptpHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  ptpBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  ptpTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: Colors.text,
  },
  countBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  countBadgeText: {
    fontSize: 13,
    fontWeight: "800",
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: "center",
    paddingVertical: 12,
  },
  ptpList: {
    gap: 0,
  },
  ptpRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  ptpRowBorder: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  ptpRowLeft: {
    flex: 1,
    gap: 2,
  },
  ptpName: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.text,
  },
  ptpLoan: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  ptpPos: {
    fontSize: 14,
    fontWeight: "700",
  },
  ptpDatesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 4,
  },
  ptpDateTag: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  ptpDateLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
});

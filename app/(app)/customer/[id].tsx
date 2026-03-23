import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";

const STATUS_COLORS: Record<string, string> = {
  Unpaid: Colors.statusUnpaid,
  PTP: Colors.statusPTP,
  Paid: Colors.statusPaid,
};

function fmt(v: any, prefix = "") {
  if (v === null || v === undefined || v === "") return "—";
  const n = parseFloat(v);
  if (!isNaN(n) && prefix)
    return prefix + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return String(v);
}

function Row({
  label, value, phone, highlight,
}: {
  label: string; value?: any; phone?: boolean; highlight?: string;
}) {
  const display = value !== null && value !== undefined && value !== "" ? String(value) : "—";
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {phone && display !== "—" ? (
        <Pressable onPress={() => Linking.openURL(`tel:${display.split(",")[0].trim()}`)}>
          <Text style={[styles.rowValue, { color: Colors.info, textDecorationLine: "underline" }]}>{display}</Text>
        </Pressable>
      ) : (
        <Text style={[styles.rowValue, highlight ? { color: highlight, fontWeight: "700" } : undefined]}>{display}</Text>
      )}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.table}>{children}</View>
    </View>
  );
}

export default function CustomerDetailScreen() {
  // ✅ FIX: Accept both `id` and `data` from navigation params
  const params = useLocalSearchParams<{ id: string; data?: string }>();
  const id = params.id;
  const dataParam = params.data;
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // ✅ FIX: Parse passed data from navigation (avoids API call entirely)
  const passedCase = React.useMemo(() => {
    if (!dataParam) return null;
    try {
      const parsed = JSON.parse(dataParam);
      // Make sure it's a real object with expected fields
      if (parsed && typeof parsed === "object" && parsed.id) return parsed;
    } catch (e) {
      console.warn("[CustomerDetail] Failed to parse passed data:", e);
    }
    return null;
  }, [dataParam]);

  // ✅ FIX: Only call API if no data was passed AND we have a valid id
  const shouldFetch = !passedCase && !!id && !isNaN(Number(id));

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["/api/cases", id],
    queryFn: async () => {
      // ✅ FIX: Wrap in try/catch so errors are visible, not swallowed
      try {
        const result = await api.getCaseById(Number(id));
        console.log("[CustomerDetail] API result:", JSON.stringify(result)?.slice(0, 200));
        return result;
      } catch (e) {
        console.error("[CustomerDetail] API error:", e);
        throw e;
      }
    },
    enabled: shouldFetch,
    retry: 1,
  });

  // ✅ FIX: Show loading only when actually fetching
  if (shouldFetch && isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background }}>
        <ActivityIndicator color={Colors.primary} size="large" />
        <Text style={{ color: Colors.textMuted, marginTop: 12, fontSize: 13 }}>Loading case details...</Text>
      </View>
    );
  }

  if (shouldFetch && isError) {
    return (
      <View style={styles.centerState}>
        <View style={styles.stateIconWrap}>
          <Ionicons name="wifi-outline" size={36} color={Colors.danger} />
        </View>
        <Text style={[styles.stateTitle, { color: Colors.danger }]}>Failed to load</Text>
        <Text style={styles.stateSubtitle}>{(error as any)?.message || "Something went wrong"}</Text>
        <Pressable style={styles.retryBtn} onPress={() => refetch()}>
          <Ionicons name="refresh" size={16} color="#fff" />
          <Text style={styles.retryText}>Try Again</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={{ color: Colors.primary, fontWeight: "700", fontSize: 14 }}>← Go Back</Text>
        </Pressable>
      </View>
    );
  }

  // ✅ FIX: Robust resolver — handles all API response shapes:
  // { case: {...} }, { id: ..., loan_no: ... }, or direct object
  const c = passedCase
    ?? data?.case        // shape: { case: { id, loan_no, ... } }
    ?? data?.data        // shape: { data: { id, loan_no, ... } }
    ?? (data?.id ? data : null); // shape: { id, loan_no, ... } (direct)

  // ✅ FIX: Show "No data" with helpful debug info instead of silent blank screen
  if (!c) {
    return (
      <View style={styles.centerState}>
        <View style={styles.stateIconWrap}>
          <Ionicons name="document-outline" size={36} color={Colors.textMuted} />
        </View>
        <Text style={styles.stateTitle}>No data found</Text>
        <Text style={styles.stateSubtitle}>
          Case ID: {id}{"\n"}
          {!dataParam ? "No data passed — API fallback used" : "Data param was invalid"}
        </Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: Colors.primary, fontWeight: "700", fontSize: 14 }}>← Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const statusColor = STATUS_COLORS[c.status] || Colors.textSecondary;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={[
        styles.container,
        { paddingBottom: insets.bottom + 32, paddingTop: Platform.OS === "web" ? 67 : 0 },
      ]}
    >
      {/* Status Banner */}
      <View style={[styles.statusBanner, { borderColor: statusColor + "40", backgroundColor: statusColor + "15" }]}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <Text style={[styles.statusLabel, { color: statusColor }]}>{c.status}</Text>
        {c.latest_feedback && (
          <View style={styles.fbBadge}>
            <Text style={styles.fbText}>{c.latest_feedback}</Text>
          </View>
        )}
      </View>

      {/* Feedback comment */}
      {c.feedback_comments ? (
        <View style={styles.commentBox}>
          <Text style={styles.commentText}>{c.feedback_comments}</Text>
        </View>
      ) : null}

      {/* Monthly feedback */}
      {c.monthly_feedback ? (
        <View style={[styles.commentBox, { borderLeftColor: Colors.primary }]}>
          <Text style={[styles.commentText, { color: Colors.primary, fontWeight: "600" }]}>
            Monthly: {c.monthly_feedback}
          </Text>
        </View>
      ) : null}

      <Section title="Loan Details">
        <Row label="LOAN NO" value={c.loan_no} />
        <Row label="APP ID" value={c.app_id} />
        <Row label="BKT" value={c.bkt} highlight={Colors.primary} />
        <Row label="PRO" value={c.pro} />
        <Row label="TENOR" value={c.tenor ? `${c.tenor} months` : null} />
        <Row label="FOS NAME" value={c.fos_name} />
      </Section>

      <Section title="Customer Info">
        <Row label="CUSTOMER NAME" value={c.customer_name} />
        <Row label="NUMBER" value={c.mobile_no} phone />
        <Row label="CUSTOMER ADDRESS" value={c.address} />
      </Section>

      <Section title="Payment Details">
        <Row label="EMI AMOUNT" value={fmt(c.emi_amount, "₹")} />
        <Row label="EMI DUE" value={fmt(c.emi_due, "₹")} highlight={Colors.danger} />
        <Row label="POS" value={fmt(c.pos, "₹")} />
        <Row label="CBC" value={fmt(c.cbc, "₹")} />
        <Row label="LPP" value={fmt(c.lpp, "₹")} />
        <Row label="CBC + LPP" value={fmt(c.cbc_lpp, "₹")} highlight={Colors.warning} />
        <Row label="ROLLBACK" value={fmt(c.rollback, "₹")} />
        <Row label="CLEARANCE" value={fmt(c.clearance, "₹")} highlight={Colors.success} />
      </Section>

      <Section title="Important Dates">
        <Row label="FIRST EMI DUE DATE" value={c.first_emi_due_date} />
        <Row label="LOAN MATURITY DATE" value={c.loan_maturity_date} />
        {c.ptp_date ? <Row label="PTP DATE" value={String(c.ptp_date).slice(0, 10)} highlight={Colors.statusPTP} /> : null}
        {c.telecaller_ptp_date ? <Row label="TELECALLER PTP" value={String(c.telecaller_ptp_date).slice(0, 10)} highlight={Colors.info} /> : null}
      </Section>

      <Section title="Asset Details">
        <Row label="ASSET MAKE" value={c.asset_make} />
        <Row label="REGISTRATION NO" value={c.registration_no} />
        <Row label="ENGINE NO" value={c.engine_no} />
        <Row label="CHASSIS NO" value={c.chassis_no} />
      </Section>

      <Section title="References">
        <Row label="REFERENCE ADDRESS" value={c.reference_address} />
      </Section>

      {/* Feedback Summary */}
      {(c.feedback_code || c.projection || c.workable !== null) ? (
        <Section title="Feedback Summary">
          {c.feedback_code ? <Row label="FEEDBACK CODE" value={c.feedback_code} highlight={Colors.accent} /> : null}
          {c.projection ? <Row label="PROJECTION" value={c.projection} /> : null}
          {c.customer_available !== null && c.customer_available !== undefined
            ? <Row label="CUSTOMER AVAILABLE" value={c.customer_available ? "Yes" : "No"} /> : null}
          {c.vehicle_available !== null && c.vehicle_available !== undefined
            ? <Row label="VEHICLE AVAILABLE" value={c.vehicle_available ? "Yes" : "No"} /> : null}
          {c.workable !== null && c.workable !== undefined
            ? <Row label="WORKABLE" value={c.workable ? "Workable" : "Non Workable"} /> : null}
        </Section>
      ) : null}

      {/* Call Button */}
      <View style={styles.actionRow}>
        {c.mobile_no ? (
          <Pressable
            style={[styles.callBtn, { flex: 1 }]}
            onPress={() => Linking.openURL(`tel:${c.mobile_no.split(",")[0].trim()}`)}
          >
            <Ionicons name="call" size={20} color="#fff" />
            <Text style={styles.callBtnText}>Call</Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  centerState: {
    flex: 1, justifyContent: "center", alignItems: "center",
    backgroundColor: Colors.background, padding: 32, gap: 8,
  },
  stateIconWrap: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.surface,
    alignItems: "center", justifyContent: "center", marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  stateTitle: { fontSize: 17, fontWeight: "700", color: Colors.text, marginTop: 4 },
  stateSubtitle: { fontSize: 13, color: Colors.textSecondary, textAlign: "center", marginTop: 2 },
  retryBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: Colors.primary, borderRadius: 12,
    paddingHorizontal: 20, paddingVertical: 12, marginTop: 12,
  },
  retryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  statusBanner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 12, borderRadius: 12, borderWidth: 1,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontSize: 15, fontWeight: "700" },
  fbBadge: {
    marginLeft: "auto", backgroundColor: "rgba(0,0,0,0.07)",
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3,
  },
  fbText: { fontSize: 12, fontWeight: "600", color: Colors.text },
  commentBox: {
    backgroundColor: Colors.surface, borderRadius: 10, padding: 12,
    borderLeftWidth: 3, borderLeftColor: Colors.primary,
  },
  commentText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
  section: {
    backgroundColor: Colors.surface, borderRadius: 12, overflow: "hidden",
    borderWidth: 1, borderColor: Colors.border,
  },
  sectionTitle: {
    fontSize: 11, fontWeight: "700", color: Colors.textSecondary,
    textTransform: "uppercase", letterSpacing: 0.8,
    paddingHorizontal: 14, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  table: {},
  row: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  rowLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: "600", flex: 1 },
  rowValue: { fontSize: 13, color: Colors.text, fontWeight: "500", flex: 1.5, textAlign: "right" },
  actionRow: { flexDirection: "row", gap: 10 },
  callBtn: {
    backgroundColor: Colors.primary, borderRadius: 14, padding: 15,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
  },
  callBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});

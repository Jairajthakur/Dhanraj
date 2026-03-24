import React from "react";
import { View, Text, ScrollView, Pressable, Linking, Platform, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { caseStore } from "@/lib/caseStore";
import { api } from "@/lib/api";

function fmt(v: any, prefix = "") {
  if (v === null || v === undefined || v === "") return "—";
  const n = parseFloat(String(v).replace(/,/g, ""));
  if (!isNaN(n) && prefix) return prefix + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return String(v);
}

function Row({ label, value, highlight, phone }: { label: string; value?: any; highlight?: string; phone?: boolean }) {
  const d = value !== null && value !== undefined && value !== "" ? String(value) : "—";
  return (
    <View style={S.row}>
      <Text style={S.rl}>{label}</Text>
      {phone && d !== "—"
        ? <Pressable onPress={() => Linking.openURL(`tel:${d.split(",")[0].trim()}`)}><Text style={[S.rv, { color: Colors.info, textDecorationLine: "underline" }]}>{d}</Text></Pressable>
        : <Text style={[S.rv, highlight ? { color: highlight, fontWeight: "700" } : null]}>{d}</Text>
      }
    </View>
  );
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={S.sec}>
      <Text style={S.secT}>{title}</Text>
      {children}
    </View>
  );
}

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Always fetch from API — works on native, web, direct URL, and refresh
  const { data, isLoading, isError } = useQuery({
    queryKey: [`/api/cases/${id}`],
    queryFn: () => api.getCaseById(Number(id)),
    enabled: !!id,
    placeholderData: () => {
      const cached = caseStore.get();
      if (cached && String(cached.id) === String(id)) return { case: cached };
      return undefined;
    },
    staleTime: 30 * 1000,
  });

  const c = data?.case;

  if (isLoading && !c) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background }}>
        <ActivityIndicator color={Colors.primary} size="large" />
        <Text style={{ marginTop: 12, color: Colors.textMuted, fontSize: 13 }}>Loading...</Text>
      </View>
    );
  }

  if (!c) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background, padding: 32, gap: 12 }}>
        <Ionicons name="document-outline" size={48} color={Colors.textMuted} />
        <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.text }}>No data found</Text>
        <Text style={{ fontSize: 13, color: Colors.textSecondary, textAlign: "center" }}>
          {isError ? "Failed to load. Check your connection." : "Go back and tap Details again."}
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={{ backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const SC: Record<string, string> = { Unpaid: Colors.statusUnpaid, PTP: Colors.statusPTP, Paid: Colors.statusPaid };
  const sc = SC[c.status] || Colors.textSecondary;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 32, paddingTop: Platform.OS === "web" ? 67 : 0 }}
    >
      <View style={[S.banner, { borderColor: sc + "40", backgroundColor: sc + "15" }]}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: sc }} />
        <Text style={{ fontSize: 15, fontWeight: "700", color: sc }}>{c.status}</Text>
        {c.latest_feedback
          ? <View style={S.fb}><Text style={{ fontSize: 12, fontWeight: "600", color: Colors.text }}>{c.latest_feedback}</Text></View>
          : null}
      </View>

      <Sec title="Loan Details">
        <Row label="LOAN NO" value={c.loan_no} />
        <Row label="APP ID" value={c.app_id} />
        <Row label="BKT" value={c.bkt} highlight={Colors.primary} />
        <Row label="PRO" value={c.pro} />
        <Row label="TENOR" value={c.tenor ? `${c.tenor} months` : null} />
        <Row label="FOS NAME" value={c.fos_name} />
      </Sec>

      <Sec title="Customer Info">
        <Row label="CUSTOMER NAME" value={c.customer_name} />
        <Row label="NUMBER" value={c.mobile_no} phone />
        <Row label="ADDRESS" value={c.address} />
      </Sec>

      <Sec title="Payment Details">
        <Row label="EMI AMOUNT" value={fmt(c.emi_amount, "₹")} />
        <Row label="EMI DUE" value={fmt(c.emi_due, "₹")} highlight={Colors.danger} />
        <Row label="POS" value={fmt(c.pos, "₹")} />
        <Row label="CBC" value={fmt(c.cbc, "₹")} />
        <Row label="LPP" value={fmt(c.lpp, "₹")} />
        <Row label="CBC + LPP" value={fmt(c.cbc_lpp, "₹")} highlight={Colors.warning} />
        <Row label="ROLLBACK" value={fmt(c.rollback, "₹")} />
        <Row label="CLEARANCE" value={fmt(c.clearance, "₹")} highlight={Colors.success} />
      </Sec>

      <Sec title="Important Dates">
        <Row label="FIRST EMI DUE DATE" value={c.first_emi_due_date} />
        <Row label="LOAN MATURITY DATE" value={c.loan_maturity_date} />
        {c.ptp_date ? <Row label="PTP DATE" value={String(c.ptp_date).slice(0, 10)} highlight={Colors.statusPTP} /> : null}
        {c.telecaller_ptp_date ? <Row label="TELECALLER PTP" value={String(c.telecaller_ptp_date).slice(0, 10)} highlight={Colors.info} /> : null}
      </Sec>

      <Sec title="Asset Details">
        <Row label="ASSET MAKE" value={c.asset_make} />
        <Row label="REGISTRATION NO" value={c.registration_no} />
        <Row label="ENGINE NO" value={c.engine_no} />
        <Row label="CHASSIS NO" value={c.chassis_no} />
      </Sec>

      <Sec title="References">
        <Row label="REFERENCE ADDRESS" value={c.reference_address} />
      </Sec>

      {c.mobile_no
        ? <Pressable
            style={{ backgroundColor: Colors.primary, borderRadius: 14, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}
            onPress={() => Linking.openURL(`tel:${c.mobile_no.split(",")[0].trim()}`)}
          >
            <Ionicons name="call" size={20} color="#fff" />
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>Call</Text>
          </Pressable>
        : null}
    </ScrollView>
  );
}

const S = StyleSheet.create({
  banner: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  fb: { marginLeft: "auto", backgroundColor: "rgba(0,0,0,0.07)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  sec: { backgroundColor: Colors.surface, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: Colors.border },
  secT: { fontSize: 11, fontWeight: "700", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.8, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: Colors.surfaceAlt, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  rl: { fontSize: 12, color: Colors.textSecondary, fontWeight: "600", flex: 1 },
  rv: { fontSize: 13, color: Colors.text, fontWeight: "500", flex: 1.5, textAlign: "right" },
});

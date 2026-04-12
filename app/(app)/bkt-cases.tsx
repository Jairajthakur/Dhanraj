import React, { useState, useMemo } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput,
  ScrollView, Modal, Platform, ActivityIndicator, Alert, KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

const TABS = [
  { key: "bkt1", label: "BKT 1", color: Colors.info },
  { key: "bkt2", label: "BKT 2", color: Colors.warning },
  { key: "bkt3", label: "BKT 3", color: Colors.danger },
  { key: "penal", label: "Penal", color: Colors.primaryLight },
];

const STATUS_OPTIONS = ["Unpaid", "PTP", "Paid"];

const STATUS_COLORS: Record<string, string> = {
  Paid: Colors.success,
  PTP: Colors.info,
  Unpaid: Colors.danger,
};

const FEEDBACK_CODES = ["PAID", "RTP", "SKIP", "PTP", "CAVNA", "ANF", "EXP", "SFT", "VSL"];
const PROJECTION_OPTIONS = ["ST", "RF", "RB"];

function YNToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={fbStyles.label}>{label}</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {([true, false] as const).map((val) => (
          <Pressable
            key={String(val)}
            style={[
              fbStyles.chip,
              { flex: 1, justifyContent: "center", alignItems: "center" },
              value === val && {
                backgroundColor: val ? Colors.success : Colors.danger,
                borderColor: "transparent",
              },
            ]}
            onPress={() => onChange(value === val ? null : val)}
          >
            <Text style={[fbStyles.chipText, value === val && { color: "#fff" }]}>
              {val ? "Y" : "N"}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function FeedbackModal({
  visible, onClose, item, onSaved,
}: {
  visible: boolean; onClose: () => void; item: any; onSaved: () => void;
}) {
  const [status, setStatus] = useState(item?.status || "Unpaid");
  const [feedbackCode, setFeedbackCode] = useState(item?.feedback_code || "");
  const [comments, setComments] = useState(item?.latest_feedback || "");
  const [ptpDate, setPtpDate] = useState(item?.ptp_date ? String(item.ptp_date).slice(0, 10) : "");
  const [rollbackYn, setRollbackYn] = useState<boolean | null>(
    item?.rollback_yn != null ? Boolean(item.rollback_yn) : null
  );
  const [customerAvailable, setCustomerAvailable] = useState<boolean | null>(
    item?.customer_available ?? null
  );
  const [vehicleAvailable, setVehicleAvailable] = useState<boolean | null>(
    item?.vehicle_available ?? null
  );
  const [thirdParty, setThirdParty] = useState<boolean | null>(item?.third_party ?? null);
  const [thirdPartyName, setThirdPartyName] = useState(item?.third_party_name || "");
  const [thirdPartyNumber, setThirdPartyNumber] = useState(item?.third_party_number || "");
  const [projection, setProjection] = useState(item?.projection || "");
  const [nonStarter, setNonStarter] = useState<boolean | null>(item?.non_starter ?? null);
  const [kycPurchase, setKycPurchase] = useState<boolean | null>(item?.kyc_purchase ?? null);
  const [workable, setWorkable] = useState<boolean | null>(item?.workable ?? null);
  const [loading, setLoading] = useState(false);

  const toIsoDate = (val: string) => {
    const parts = val.trim().split(/[-\/]/);
    if (parts.length === 3 && parts[2].length === 4)
      return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
    return val;
  };

  const save = async () => {
    if (!feedbackCode) { Alert.alert("Error", "Please select a Feedback Code"); return; }
    if ((status === "PTP" || feedbackCode === "PTP") && !ptpDate) {
      Alert.alert("Error", "Please enter a PTP date");
      return;
    }
    setLoading(true);
    try {
      const url = new URL(`/api/bkt-cases/${item.id}/feedback`, getApiUrl()).toString();
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          status,
          feedback: comments,
          comments,
          ptp_date: status === "PTP" || feedbackCode === "PTP" ? toIsoDate(ptpDate) : null,
          rollback_yn: rollbackYn,
          customer_available: customerAvailable,
          vehicle_available: vehicleAvailable,
          third_party: thirdParty,
          third_party_name: thirdParty ? thirdPartyName : null,
          third_party_number: thirdParty ? thirdPartyNumber : null,
          feedback_code: feedbackCode,
          projection,
          non_starter: nonStarter,
          kyc_purchase: kycPurchase,
          workable,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      onSaved();
      onClose();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <View style={fbStyles.overlay}>
        <ScrollView style={fbStyles.sheet} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={fbStyles.handle} />
          <Text style={fbStyles.title}>Update Feedback</Text>
          {item && (
            <Text style={fbStyles.subtitle}>
              {item.customer_name} · {item.loan_no}
            </Text>
          )}

          <Text style={fbStyles.label}>Status</Text>
          <View style={fbStyles.chips}>
            {STATUS_OPTIONS.map((s) => (
              <Pressable
                key={s}
                style={[
                  fbStyles.chip,
                  status === s && {
                    backgroundColor: STATUS_COLORS[s] || Colors.primary,
                    borderColor: "transparent",
                  },
                ]}
                onPress={() => setStatus(s)}
              >
                <Text style={[fbStyles.chipText, status === s && { color: "#fff" }]}>{s}</Text>
              </Pressable>
            ))}
          </View>

          <YNToggle label="Customer Available" value={customerAvailable} onChange={setCustomerAvailable} />
          <YNToggle label="Vehicle Available" value={vehicleAvailable} onChange={setVehicleAvailable} />
          <YNToggle label="Third Party" value={thirdParty} onChange={setThirdParty} />

          {thirdParty === true && (
            <>
              <Text style={fbStyles.label}>Third Party Name</Text>
              <TextInput
                style={[fbStyles.input, { minHeight: 44, marginBottom: 8 }]}
                placeholder="Enter name"
                placeholderTextColor={Colors.textMuted}
                value={thirdPartyName}
                onChangeText={setThirdPartyName}
              />
              <Text style={fbStyles.label}>Third Party Number</Text>
              <TextInput
                style={[fbStyles.input, { minHeight: 44, marginBottom: 8 }]}
                placeholder="Enter number"
                placeholderTextColor={Colors.textMuted}
                value={thirdPartyNumber}
                onChangeText={setThirdPartyNumber}
                keyboardType="phone-pad"
              />
            </>
          )}

          <Text style={fbStyles.label}>Feedback Code</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {FEEDBACK_CODES.map((f) => (
                <Pressable
                  key={f}
                  style={[
                    fbStyles.chip,
                    feedbackCode === f && {
                      backgroundColor: Colors.primary,
                      borderColor: "transparent",
                    },
                  ]}
                  onPress={() => setFeedbackCode(f)}
                >
                  <Text style={[fbStyles.chipText, feedbackCode === f && { color: "#fff" }]}>{f}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <Text style={fbStyles.label}>Details Feedback</Text>
          <TextInput
            style={fbStyles.input}
            placeholder="Enter details..."
            placeholderTextColor={Colors.textMuted}
            value={comments}
            onChangeText={setComments}
            multiline
            numberOfLines={3}
          />

          {(status === "PTP" || feedbackCode === "PTP") && (
            <>
              <Text style={fbStyles.label}>PTP Date</Text>
              <TextInput
                style={[fbStyles.input, { minHeight: 44, marginBottom: 8 }]}
                placeholder="DD-MM-YYYY"
                placeholderTextColor={Colors.textMuted}
                value={ptpDate}
                onChangeText={setPtpDate}
                keyboardType="numeric"
              />
            </>
          )}

          <Text style={fbStyles.label}>Projection</Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
            {PROJECTION_OPTIONS.map((p) => (
              <Pressable
                key={p}
                style={[
                  fbStyles.chip,
                  { flex: 1, justifyContent: "center", alignItems: "center" },
                  projection === p && { backgroundColor: Colors.primary, borderColor: "transparent" },
                ]}
                onPress={() => setProjection(projection === p ? "" : p)}
              >
                <Text style={[fbStyles.chipText, projection === p && { color: "#fff" }]}>{p}</Text>
              </Pressable>
            ))}
          </View>

          <YNToggle label="Rollback" value={rollbackYn} onChange={setRollbackYn} />
          <YNToggle label="Non Starter" value={nonStarter} onChange={setNonStarter} />
          <YNToggle label="KYC Purchase" value={kycPurchase} onChange={setKycPurchase} />

          <Text style={fbStyles.label}>Workable</Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
            {(["Workable", "Non Workable"] as const).map((w) => {
              const val = w === "Workable";
              return (
                <Pressable
                  key={w}
                  style={[
                    fbStyles.chip,
                    { flex: 1, justifyContent: "center", alignItems: "center" },
                    workable === val && {
                      backgroundColor: val ? Colors.success : Colors.danger,
                      borderColor: "transparent",
                    },
                  ]}
                  onPress={() => setWorkable(workable === val ? null : val)}
                >
                  <Text style={[fbStyles.chipText, workable === val && { color: "#fff" }]}>{w}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={fbStyles.btnRow}>
            <Pressable style={fbStyles.cancelBtn} onPress={onClose}>
              <Text style={fbStyles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[fbStyles.saveBtn, loading && { opacity: 0.6 }]}
              onPress={save}
              disabled={loading}
            >
              <Text style={fbStyles.saveText}>{loading ? "Saving..." : "Save"}</Text>
            </Pressable>
          </View>
          <View style={{ height: 24 }} />
        </ScrollView>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function FosBktCases() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("bkt1");
  const [search, setSearch] = useState("");
  const [feedbackItem, setFeedbackItem] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/bkt-cases", activeTab],
    queryFn: async () => {
      const url = new URL(`/api/bkt-cases?category=${activeTab}`, getApiUrl());
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const cases: any[] = data?.cases || [];

  const filtered = useMemo(() => {
    if (!search.trim()) return cases;
    const q = search.toLowerCase();
    return cases.filter((c: any) =>
      (c.customer_name || "").toLowerCase().includes(q) ||
      (c.loan_no || "").toLowerCase().includes(q) ||
      (c.registration_no || "").toLowerCase().includes(q)
    );
  }, [cases, search]);

  const tabColor = TABS.find((t) => t.key === activeTab)?.color || Colors.primary;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={[styles.tabBar, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabScroll}
        >
          {TABS.map((tab) => (
            <Pressable
              key={tab.key}
              style={[
                styles.tab,
                activeTab === tab.key && { backgroundColor: tab.color, borderColor: tab.color },
              ]}
              onPress={() => { setActiveTab(tab.key); setSearch(""); }}
            >
              <Text style={[styles.tabText, activeTab === tab.key && { color: "#fff" }]}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, loan no, reg no..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          keyboardShouldPersistTaps="handled"
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 80 }]}
          scrollEnabled={!!filtered.length}
          ListHeaderComponent={
            <Text style={styles.count}>
              {filtered.length} case{filtered.length !== 1 ? "s" : ""}
            </Text>
          }
          renderItem={({ item }) => (
            <View style={[styles.card, { borderLeftColor: tabColor }]}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{item.customer_name}</Text>
                  {item.loan_no ? <Text style={styles.loanNo}>{item.loan_no}</Text> : null}
                </View>
                <View style={[styles.badge, { backgroundColor: (STATUS_COLORS[item.status] || Colors.textMuted) + "22" }]}>
                  <Text style={[styles.badgeText, { color: STATUS_COLORS[item.status] || Colors.textSecondary }]}>
                    {item.status}
                  </Text>
                </View>
              </View>

              <View style={styles.metaRow}>
                {item.bkt != null ? (
                  <View style={[styles.chip, { backgroundColor: tabColor + "20" }]}>
                    <Text style={[styles.chipText, { color: tabColor }]}>BKT {item.bkt}</Text>
                  </View>
                ) : null}
                {item.pos ? (
                  <View style={styles.chip}>
                    <Text style={styles.chipLabel}>POS </Text>
                    <Text style={styles.chipText}>₹{Number(item.pos).toLocaleString("en-IN")}</Text>
                  </View>
                ) : null}
                {item.cbc && Number(item.cbc) > 0 ? (
                  <View style={[styles.chip, { backgroundColor: Colors.primary + "20" }]}>
                    <Text style={styles.chipLabel}>CBC </Text>
                    <Text style={[styles.chipText, { color: Colors.primary }]}>
                      ₹{Number(item.cbc).toLocaleString("en-IN")}
                    </Text>
                  </View>
                ) : null}
                {item.lpp && Number(item.lpp) > 0 ? (
                  <View style={[styles.chip, { backgroundColor: Colors.warning + "20" }]}>
                    <Text style={styles.chipLabel}>LPP </Text>
                    <Text style={[styles.chipText, { color: Colors.warning }]}>
                      ₹{Number(item.lpp).toLocaleString("en-IN")}
                    </Text>
                  </View>
                ) : null}
              </View>

              {item.registration_no ? (
                <Text style={styles.reg}>Reg: {item.registration_no}</Text>
              ) : null}
              {item.mobile_no ? <Text style={styles.mobile}>{item.mobile_no}</Text> : null}

              {item.feedback_code ? (
                <Text style={styles.feedback} numberOfLines={1}>
                  [{item.feedback_code}] {item.latest_feedback || ""}
                </Text>
              ) : item.latest_feedback ? (
                <Text style={styles.feedback} numberOfLines={1}>{item.latest_feedback}</Text>
              ) : null}

              <View style={styles.cardBtnRow}>
                <Pressable
                  style={[styles.feedbackBtn, { backgroundColor: tabColor, flex: 1 }]}
                  onPress={() => setFeedbackItem(item)}
                  testID="update-bkt-feedback"
                >
                  <Ionicons name="chatbox-outline" size={14} color="#fff" />
                  <Text style={styles.feedbackBtnText}>Feedback</Text>
                </Pressable>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="layers-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>
                {search
                  ? "No cases match your search"
                  : `No ${TABS.find((t) => t.key === activeTab)?.label} cases assigned to you`}
              </Text>
            </View>
          }
        />
      )}

      {feedbackItem && (
        <FeedbackModal
          visible={!!feedbackItem}
          onClose={() => setFeedbackItem(null)}
          item={feedbackItem}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["/api/bkt-cases", activeTab] });
            qc.invalidateQueries({ queryKey: ["/api/bkt-perf-summary"] });
            setFeedbackItem(null);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: { backgroundColor: Colors.surface, paddingHorizontal: 16, paddingBottom: 12, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  tabScroll: { gap: 8, paddingVertical: 8 },
  tab: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background },
  tabText: { fontSize: 13, fontWeight: "700", color: Colors.textSecondary },
  searchWrap: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.surfaceAlt, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  searchInput: { flex: 1, fontSize: 14, color: Colors.text, paddingVertical: 0 },
  list: { padding: 12, gap: 10 },
  count: { fontSize: 13, color: Colors.textMuted, fontWeight: "600", paddingHorizontal: 4, paddingBottom: 4 },
  card: { backgroundColor: Colors.surface, borderRadius: 14, padding: 14, gap: 8, borderLeftWidth: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  name: { fontSize: 15, fontWeight: "700", color: Colors.text, flexShrink: 1 },
  loanNo: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { flexDirection: "row", backgroundColor: Colors.surfaceAlt, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  chipLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: "600" },
  chipText: { fontSize: 10, fontWeight: "700", color: Colors.text },
  reg: { fontSize: 11, color: Colors.textSecondary },
  mobile: { fontSize: 12, color: Colors.primary, fontWeight: "600" },
  feedback: { fontSize: 11, color: Colors.textSecondary, fontStyle: "italic" },
  cardBtnRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  feedbackBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, justifyContent: "center" },
  feedbackBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: "center" },
});

const fbStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "90%" },
  handle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: "center", marginBottom: 12 },
  title: { fontSize: 20, fontWeight: "700", color: Colors.text, marginBottom: 4 },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "700", color: Colors.textSecondary, marginBottom: 8, marginTop: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt },
  chipText: { fontSize: 13, fontWeight: "600", color: Colors.text },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 12, fontSize: 14, color: Colors.text, backgroundColor: Colors.surfaceAlt, marginBottom: 16, minHeight: 80, textAlignVertical: "top" },
  btnRow: { flexDirection: "row", gap: 12, paddingBottom: 8 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", borderWidth: 1, borderColor: Colors.border },
  cancelText: { fontSize: 15, fontWeight: "600", color: Colors.textSecondary },
  saveBtn: { flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: "center", backgroundColor: Colors.primary },
  saveText: { fontSize: 15, fontWeight: "700", color: "#fff" },
});

import React, { useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, Modal,
  TextInput, Alert, ActivityIndicator, ScrollView, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

const OUTCOMES = ["PTP", "Paid", "RTP", "ANF", "SKIP", "CAVNA", "SFT", "VSL", "EXP"];
const CONTACT_TYPES = ["visit", "call", "online"];

const OUTCOME_COLORS: Record<string, string> = {
  Paid:  Colors.success,
  PTP:   Colors.info,
  RTP:   Colors.danger,
  ANF:   Colors.warning,
  SKIP:  Colors.danger,
  CAVNA: Colors.warning,
  SFT:   Colors.textSecondary,
  VSL:   Colors.textSecondary,
  EXP:   Colors.textSecondary,
};

const TYPE_ICONS: Record<string, string> = {
  visit:  "walk",
  call:   "call",
  online: "card",
};

function fmtTime(ts: string) {
  return new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function LogModal({ visible, onClose, onSaved }: {
  visible: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [loanNo, setLoanNo] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [bkt, setBkt] = useState("");
  const [outcome, setOutcome] = useState("");
  const [contactType, setContactType] = useState("visit");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const save = async () => {
    if (!outcome) { Alert.alert("Error", "Please select an outcome"); return; }
    setLoading(true);
    try {
      const url = new URL("/api/visit-log", getApiUrl()).toString();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ loan_no: loanNo, customer_name: customerName, bkt, outcome, contact_type: contactType, note }),
      });
      if (!res.ok) throw new Error("Failed to save");
      onSaved();
      onClose();
      setLoanNo(""); setCustomerName(""); setBkt(""); setOutcome(""); setNote(""); setContactType("visit");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally { setLoading(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={mStyles.overlay}>
        <ScrollView style={mStyles.sheet} keyboardShouldPersistTaps="handled">
          <View style={mStyles.handle} />
          <Text style={mStyles.title}>Log a Visit / Call</Text>

          <Text style={mStyles.label}>Contact Type</Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
            {CONTACT_TYPES.map((t) => (
              <Pressable key={t} style={[mStyles.chip, contactType === t && { backgroundColor: Colors.primary, borderColor: Colors.primary }]} onPress={() => setContactType(t)}>
                <Ionicons name={TYPE_ICONS[t] as any} size={13} color={contactType === t ? "#fff" : Colors.textSecondary} />
                <Text style={[mStyles.chipText, contactType === t && { color: "#fff" }]}>{t.charAt(0).toUpperCase() + t.slice(1)}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={mStyles.label}>Loan No (optional)</Text>
          <TextInput style={mStyles.input} placeholder="e.g. HL-20240892" placeholderTextColor={Colors.textMuted} value={loanNo} onChangeText={setLoanNo} autoCapitalize="characters" />

          <Text style={mStyles.label}>Customer Name</Text>
          <TextInput style={mStyles.input} placeholder="Enter name" placeholderTextColor={Colors.textMuted} value={customerName} onChangeText={setCustomerName} />

          <Text style={mStyles.label}>Outcome</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            {OUTCOMES.map((o) => (
              <Pressable key={o} style={[mStyles.chip, outcome === o && { backgroundColor: OUTCOME_COLORS[o] || Colors.primary, borderColor: "transparent" }]} onPress={() => setOutcome(o)}>
                <Text style={[mStyles.chipText, outcome === o && { color: "#fff" }]}>{o}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={mStyles.label}>Note (optional)</Text>
          <TextInput style={[mStyles.input, { minHeight: 70, textAlignVertical: "top" }]} placeholder="What happened? e.g. Will pay Friday..." placeholderTextColor={Colors.textMuted} value={note} onChangeText={setNote} multiline />

          <View style={{ flexDirection: "row", gap: 12, marginTop: 8, marginBottom: 24 }}>
            <Pressable style={mStyles.cancelBtn} onPress={onClose}><Text style={mStyles.cancelText}>Cancel</Text></Pressable>
            <Pressable style={[mStyles.saveBtn, loading && { opacity: 0.6 }]} onPress={save} disabled={loading}>
              <Text style={mStyles.saveText}>{loading ? "Saving..." : "Save Log"}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function VisitLogScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [logModalVisible, setLogModalVisible] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/visit-log/today"],
    queryFn: async () => {
      const url = new URL("/api/visit-log/today", getApiUrl()).toString();
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const logs: any[] = data?.logs || [];

  const stats = {
    total:  logs.length,
    paid:   logs.filter((l) => l.outcome === "Paid").length,
    calls:  logs.filter((l) => l.contact_type === "call").length,
    visits: logs.filter((l) => l.contact_type === "visit").length,
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={[styles.header, { paddingTop: Platform.OS === "web" ? 67 : insets.top + 8 }]}>
        <View style={styles.statsRow}>
          {[
            { label: "Total", value: stats.total, color: Colors.primary },
            { label: "Visits", value: stats.visits, color: Colors.info },
            { label: "Calls", value: stats.calls, color: Colors.warning },
            { label: "Paid", value: stats.paid, color: Colors.success },
          ].map((s) => (
            <View key={s.label} style={styles.statBox}>
              <Text style={[styles.statVal, { color: s.color }]}>{s.value}</Text>
              <Text style={styles.statLbl}>{s.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="walk-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No visits logged today</Text>
              <Text style={styles.emptySubText}>Tap + to log a visit or call</Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const outColor = OUTCOME_COLORS[item.outcome] || Colors.textSecondary;
            const isLast = index === logs.length - 1;
            return (
              <View style={styles.timelineRow}>
                <View style={styles.timelineLeft}>
                  <Text style={styles.timeText}>{fmtTime(item.logged_at)}</Text>
                </View>
                <View style={styles.timelineMid}>
                  <View style={[styles.dot, { backgroundColor: outColor }]} />
                  {!isLast && <View style={styles.line} />}
                </View>
                <View style={[styles.logCard, { marginBottom: isLast ? 0 : 12 }]}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.logName}>{item.customer_name || "Unknown"}</Text>
                      {item.loan_no ? <Text style={styles.logLoan}>{item.loan_no}{item.bkt ? ` · BKT ${item.bkt}` : ""}</Text> : null}
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <View style={[styles.typePill, { backgroundColor: Colors.surfaceAlt }]}>
                        <Ionicons name={TYPE_ICONS[item.contact_type] as any || "walk"} size={11} color={Colors.textSecondary} />
                        <Text style={styles.typePillText}>{item.contact_type}</Text>
                      </View>
                      <View style={[styles.outcomePill, { backgroundColor: outColor + "20" }]}>
                        <Text style={[styles.outcomePillText, { color: outColor }]}>{item.outcome}</Text>
                      </View>
                    </View>
                  </View>
                  {item.note ? <Text style={styles.logNote}>{item.note}</Text> : null}
                  {item.amount > 0 ? (
                    <Text style={styles.logAmount}>₹{Number(item.amount).toLocaleString("en-IN")}{item.utr_no ? ` · UTR: ${item.utr_no}` : ""}</Text>
                  ) : null}
                </View>
              </View>
            );
          }}
        />
      )}

      <Pressable
        style={[styles.fab, { bottom: insets.bottom + 20 }]}
        onPress={() => setLogModalVisible(true)}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>

      <LogModal
        visible={logModalVisible}
        onClose={() => setLogModalVisible(false)}
        onSaved={() => { qc.invalidateQueries({ queryKey: ["/api/visit-log/today"] }); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header:       { backgroundColor: Colors.surface, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  statsRow:     { flexDirection: "row", gap: 8 },
  statBox:      { flex: 1, backgroundColor: Colors.surfaceAlt, borderRadius: 10, padding: 10, alignItems: "center" },
  statVal:      { fontSize: 20, fontWeight: "800" },
  statLbl:      { fontSize: 10, color: Colors.textMuted, fontWeight: "600", marginTop: 2 },
  list:         { padding: 16, gap: 0 },
  timelineRow:  { flexDirection: "row", gap: 0 },
  timelineLeft: { width: 52, alignItems: "flex-end", paddingRight: 8, paddingTop: 3 },
  timeText:     { fontSize: 10, color: Colors.textMuted, fontWeight: "600" },
  timelineMid:  { width: 20, alignItems: "center" },
  dot:          { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  line:         { width: 1.5, flex: 1, backgroundColor: Colors.border, minHeight: 24, marginTop: 4 },
  logCard:      { flex: 1, backgroundColor: Colors.surface, borderRadius: 12, padding: 12, gap: 5, marginLeft: 8, marginBottom: 12 },
  logName:      { fontSize: 13, fontWeight: "700", color: Colors.text },
  logLoan:      { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  logNote:      { fontSize: 11, color: Colors.textSecondary, fontStyle: "italic" },
  logAmount:    { fontSize: 12, fontWeight: "700", color: Colors.success },
  typePill:     { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  typePillText: { fontSize: 9, fontWeight: "600", color: Colors.textSecondary },
  outcomePill:  { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  outcomePillText: { fontSize: 10, fontWeight: "700" },
  fab:          { position: "absolute", right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 6 },
  empty:        { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 80 },
  emptyText:    { fontSize: 15, color: Colors.textMuted, fontWeight: "600" },
  emptySubText: { fontSize: 12, color: Colors.textMuted },
});

const mStyles = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet:      { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "90%" },
  handle:     { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: "center", marginBottom: 12 },
  title:      { fontSize: 18, fontWeight: "700", color: Colors.text, marginBottom: 16 },
  label:      { fontSize: 11, fontWeight: "700", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  input:      { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, padding: 12, fontSize: 14, color: Colors.text, backgroundColor: Colors.surfaceAlt, marginBottom: 14 },
  chip:       { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt },
  chipText:   { fontSize: 12, fontWeight: "600", color: Colors.text },
  cancelBtn:  { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, alignItems: "center" },
  cancelText: { fontSize: 15, fontWeight: "600", color: Colors.textSecondary },
  saveBtn:    { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: Colors.primary, alignItems: "center" },
  saveText:   { fontSize: 15, fontWeight: "700", color: "#fff" },
});

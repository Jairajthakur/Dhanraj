import React, { useMemo, useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  Pressable,
  Modal,
  TextInput,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";
import { useCompanyFilter } from "@/context/CompanyFilterContext";

// ─── Types ────────────────────────────────────────────────────────────────────
interface BktTargets { resTarget: number; rbTarget: number; }
type AllTargets = Record<string, BktTargets>;

const DEFAULT_TARGETS: AllTargets = {
  "1": { resTarget: 92, rbTarget: 22 },
  "2": { resTarget: 80, rbTarget: 18 },
  "3": { resTarget: 75, rbTarget: 17 },
};

const BKT_META: Record<string, { label: string; color: string }> = {
  "1": { label: "BKT 1", color: "#3B82F6" },
  "2": { label: "BKT 2", color: "#F59E0B" },
  "3": { label: "BKT 3", color: "#EF4444" },
};

const STORAGE_KEY = "agency_bkt_targets_v1";

function fmtAmt(n: number): string {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)}Cr`;
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(2)}L`;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}
function pct(a: number, b: number): number { return b > 0 ? (a / b) * 100 : 0; }

// ─── Edit Modal ───────────────────────────────────────────────────────────────
function EditTargetsModal({ visible, targets, onSave, onClose }: { visible: boolean; targets: AllTargets; onSave: (t: AllTargets) => void; onClose: () => void; }) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<Record<string, { resTarget: string; rbTarget: string }>>({});

  useEffect(() => {
    if (visible) {
      const init: Record<string, { resTarget: string; rbTarget: string }> = {};
      for (const k of ["1", "2", "3"]) {
        init[k] = {
          resTarget: String(targets[k]?.resTarget ?? DEFAULT_TARGETS[k].resTarget),
          rbTarget:  String(targets[k]?.rbTarget  ?? DEFAULT_TARGETS[k].rbTarget),
        };
      }
      setDraft(init);
    }
  }, [visible, targets]);

  const handleSave = () => {
    const result: AllTargets = {};
    for (const k of ["1", "2", "3"]) {
      const res = parseFloat(draft[k]?.resTarget ?? "");
      const rb  = parseFloat(draft[k]?.rbTarget  ?? "");
      if (isNaN(res) || res < 0 || res > 100) { Alert.alert("Invalid", `BKT ${k} Resolution must be 0–100.`); return; }
      if (isNaN(rb)  || rb  < 0 || rb  > 100) { Alert.alert("Invalid", `BKT ${k} Rollback must be 0–100.`); return; }
      result[k] = { resTarget: res, rbTarget: rb };
    }
    onSave(result);
  };

  const setField = (bkt: string, field: "resTarget" | "rbTarget", val: string) =>
    setDraft((prev) => ({ ...prev, [bkt]: { ...prev[bkt], [field]: val } }));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={em.overlay}>
        <Pressable style={em.backdrop} onPress={onClose} />
        <View style={[em.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={em.header}>
            <Text style={em.title}>Set Agency Targets</Text>
            <Pressable onPress={onClose} style={em.closeBtn}>
              <Ionicons name="close" size={20} color={Colors.text} />
            </Pressable>
          </View>
          <Text style={em.subtitle}>Customise resolution and rollback % targets for each BKT.</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {["1", "2", "3"].map((k) => {
              const meta = BKT_META[k];
              return (
                <View key={k} style={[em.bktSection, { borderLeftColor: meta.color }]}>
                  <View style={[em.bktBadge, { backgroundColor: meta.color + "22" }]}>
                    <Text style={[em.bktBadgeText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                  <View style={em.row}>
                    <View style={em.inputGroup}>
                      <Text style={em.inputLabel}>Resolution Target (%)</Text>
                      <View style={em.inputWrap}>
                        <TextInput style={em.input} keyboardType="numeric" value={draft[k]?.resTarget ?? ""} onChangeText={(v) => setField(k, "resTarget", v)} placeholder="e.g. 92" placeholderTextColor={Colors.textMuted} maxLength={5} />
                        <Text style={em.suffix}>%</Text>
                      </View>
                    </View>
                    <View style={em.inputGroup}>
                      <Text style={em.inputLabel}>Rollback Target (%)</Text>
                      <View style={em.inputWrap}>
                        <TextInput style={em.input} keyboardType="numeric" value={draft[k]?.rbTarget ?? ""} onChangeText={(v) => setField(k, "rbTarget", v)} placeholder="e.g. 22" placeholderTextColor={Colors.textMuted} maxLength={5} />
                        <Text style={em.suffix}>%</Text>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}
          </ScrollView>
          <Pressable style={em.saveBtn} onPress={handleSave}>
            <Ionicons name="checkmark-circle" size={18} color="#fff" />
            <Text style={em.saveBtnText}>Save Targets</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const em = StyleSheet.create({
  overlay:      { flex: 1, justifyContent: "flex-end" },
  backdrop:     { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet:        { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 14, maxHeight: "88%" },
  header:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title:        { fontSize: 18, fontWeight: "800", color: Colors.text },
  closeBtn:     { width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  subtitle:     { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  bktSection:   { backgroundColor: Colors.surfaceAlt, borderRadius: 12, padding: 14, gap: 10, marginBottom: 10, borderLeftWidth: 3 },
  bktBadge:     { alignSelf: "flex-start", borderRadius: 7, paddingHorizontal: 10, paddingVertical: 4 },
  bktBadgeText: { fontSize: 13, fontWeight: "800", textTransform: "uppercase" },
  row:          { flexDirection: "row", gap: 10 },
  inputGroup:   { flex: 1, gap: 5 },
  inputLabel:   { fontSize: 10, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.4 },
  inputWrap:    { flexDirection: "row", alignItems: "center", backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12 },
  input:        { flex: 1, fontSize: 16, fontWeight: "700", color: Colors.text, paddingVertical: 10 },
  suffix:       { fontSize: 14, fontWeight: "700", color: Colors.textMuted },
  saveBtn:      { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14, marginTop: 4 },
  saveBtnText:  { fontSize: 15, fontWeight: "800", color: "#fff" },
});

// ─── Progress Bar ─────────────────────────────────────────────────────────────
function ProgressBar({ value, target, color }: { value: number; target: number; color: string }) {
  const met = value >= target;
  return (
    <View style={pb.wrap}>
      <View style={pb.track}>
        <View style={[pb.fill, { width: `${Math.min(value, 100)}%` as any, backgroundColor: met ? Colors.success : color }]} />
        <View style={[pb.marker, { left: `${Math.min(target, 100)}%` as any }]} />
      </View>
      <View style={pb.labels}>
        <Text style={[pb.valText, { color: met ? Colors.success : color }]}>{value.toFixed(1)}%</Text>
        <Text style={pb.targetText}>Target {target}%</Text>
      </View>
    </View>
  );
}
const pb = StyleSheet.create({
  wrap:       { gap: 6 },
  track:      { height: 10, backgroundColor: Colors.border, borderRadius: 5, overflow: "visible", position: "relative" },
  fill:       { height: 10, borderRadius: 5, position: "absolute", left: 0, top: 0 },
  marker:     { position: "absolute", top: -4, width: 2, height: 18, backgroundColor: Colors.primary, borderRadius: 1 },
  labels:     { flexDirection: "row", justifyContent: "space-between" },
  valText:    { fontSize: 12, fontWeight: "800" },
  targetText: { fontSize: 11, color: Colors.textMuted, fontWeight: "600" },
});

function StatCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={sc.cell}>
      <Text style={sc.label}>{label}</Text>
      <Text style={[sc.value, color ? { color } : {}]}>{value}</Text>
    </View>
  );
}
const sc = StyleSheet.create({
  cell:  { flex: 1, alignItems: "center", gap: 2 },
  label: { fontSize: 9, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "center" },
  value: { fontSize: 14, fontWeight: "800", color: Colors.text, textAlign: "center" },
});

// ─── BKT Card ─────────────────────────────────────────────────────────────────
function BktTargetCard({ bktKey, data, targets }: { bktKey: string; data: any; targets: BktTargets }) {
  const meta = BKT_META[bktKey];
  if (!meta) return null;
  const totalPOS    = data.totalPOS    || 0;
  const paidPOS     = data.paidPOS     || 0;
  const unpaidPOS   = data.unpaidPOS   || 0;
  const ptpPOS      = data.ptpPOS      || 0;
  const rollbackPOS = data.rollbackPOS || 0;
  const caseCount   = data.caseCount   || 0;
  const paidCount   = data.paidCount   || 0;
  const resPct = pct(paidPOS, totalPOS);
  const rbPct  = pct(rollbackPOS, totalPOS);
  const resMet = resPct >= targets.resTarget;
  const rbMet  = rbPct  >= targets.rbTarget;
  const resRequired = Math.max(0, (targets.resTarget / 100) * totalPOS - paidPOS);
  const rbRequired  = Math.max(0, (targets.rbTarget  / 100) * totalPOS - rollbackPOS);

  return (
    <View style={[card.wrap, { borderLeftColor: meta.color }]}>
      <View style={card.header}>
        <View style={[card.badge, { backgroundColor: meta.color + "22" }]}>
          <Text style={[card.badgeText, { color: meta.color }]}>{meta.label}</Text>
        </View>
        <View style={card.headerRight}>
          <View style={card.countBadge}>
            <Ionicons name="documents-outline" size={12} color={Colors.textMuted} />
            <Text style={card.countText}>{caseCount} cases</Text>
          </View>
          <Text style={[card.bigAmt, { color: meta.color }]}>{fmtAmt(totalPOS)}</Text>
        </View>
      </View>
      <View style={card.divider} />
      <View style={card.row3}>
        <StatCell label="Paid POS"   value={fmtAmt(paidPOS)}   color={Colors.success} />
        <StatCell label="Unpaid POS" value={fmtAmt(unpaidPOS)} color={Colors.danger}  />
        <StatCell label="PTP POS"    value={fmtAmt(ptpPOS)}    color={Colors.info}    />
      </View>
      <View style={card.divider} />
      <View style={card.sectionHeader}>
        <Text style={card.sectionTitle}>Resolution</Text>
        <View style={[card.statusChip, { backgroundColor: resMet ? Colors.success + "20" : Colors.danger + "20" }]}>
          <Ionicons name={resMet ? "checkmark-circle" : "time-outline"} size={11} color={resMet ? Colors.success : Colors.danger} />
          <Text style={[card.statusChipText, { color: resMet ? Colors.success : Colors.danger }]}>
            {resMet ? "Target Met" : `Need ${fmtAmt(resRequired)} more`}
          </Text>
        </View>
      </View>
      <ProgressBar value={resPct} target={targets.resTarget} color={meta.color} />
      <View style={card.row3}>
        <StatCell label="Paid Cases" value={String(paidCount)} color={Colors.success} />
        <StatCell label="Res %"      value={resPct.toFixed(1) + "%"} color={meta.color} />
        <StatCell label="Required"   value={resMet ? "✓ Met" : fmtAmt(resRequired)} color={resMet ? Colors.success : Colors.danger} />
      </View>
      <View style={card.divider} />
      <View style={card.sectionHeader}>
        <Text style={card.sectionTitle}>Rollback</Text>
        <View style={[card.statusChip, { backgroundColor: rbMet ? Colors.success + "20" : Colors.info + "20" }]}>
          <Ionicons name={rbMet ? "checkmark-circle" : "refresh-circle-outline"} size={11} color={rbMet ? Colors.success : Colors.info} />
          <Text style={[card.statusChipText, { color: rbMet ? Colors.success : Colors.info }]}>
            {rbMet ? "Target Met" : `Need ${fmtAmt(rbRequired)} more`}
          </Text>
        </View>
      </View>
      <ProgressBar value={rbPct} target={targets.rbTarget} color={Colors.info} />
      <View style={card.row3}>
        <StatCell label="RB POS"   value={fmtAmt(rollbackPOS)} color={Colors.info} />
        <StatCell label="RB %"     value={rbPct.toFixed(1) + "%"} color={Colors.info} />
        <StatCell label="Required" value={rbMet ? "✓ Met" : fmtAmt(rbRequired)} color={rbMet ? Colors.success : Colors.info} />
      </View>
    </View>
  );
}

const card = StyleSheet.create({
  wrap:           { backgroundColor: Colors.surface, borderRadius: 16, borderLeftWidth: 4, padding: 16, gap: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
  header:         { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  badge:          { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  badgeText:      { fontSize: 14, fontWeight: "800", textTransform: "uppercase" },
  headerRight:    { alignItems: "flex-end", gap: 4 },
  countBadge:     { flexDirection: "row", alignItems: "center", gap: 4 },
  countText:      { fontSize: 11, color: Colors.textMuted, fontWeight: "600" },
  bigAmt:         { fontSize: 22, fontWeight: "900" },
  divider:        { height: 1, backgroundColor: Colors.border },
  row3:           { flexDirection: "row", gap: 4 },
  sectionHeader:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle:   { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6, color: Colors.textMuted },
  statusChip:     { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusChipText: { fontSize: 10, fontWeight: "700" },
});

// ─── Summary Strip ────────────────────────────────────────────────────────────
function SummaryStrip({ bktData, selectedCompany }: { bktData: Record<string, any>; selectedCompany: string | null }) {
  const overallTotal = Object.values(bktData).reduce((s: number, d: any) => s + (d.totalPOS  || 0), 0);
  const overallPaid  = Object.values(bktData).reduce((s: number, d: any) => s + (d.paidPOS   || 0), 0);
  const overallCases = Object.values(bktData).reduce((s: number, d: any) => s + (d.caseCount || 0), 0);
  const overallRes   = pct(overallPaid, overallTotal);
  return (
    <View style={ss.wrap}>
      <View style={ss.left}>
        <Text style={ss.subLabel}>
          {selectedCompany ? selectedCompany.toUpperCase() : "TW"} Portfolio
        </Text>
        <Text style={ss.bigNum}>{fmtAmt(overallTotal)}</Text>
      </View>
      <View style={ss.divider} />
      <View style={ss.stat}>
        <Text style={[ss.statVal, { color: Colors.success }]}>{fmtAmt(overallPaid)}</Text>
        <Text style={ss.statLabel}>Collected</Text>
      </View>
      <View style={ss.divider} />
      <View style={ss.stat}>
        <Text style={[ss.statVal, { color: "#fff" }]}>{overallRes.toFixed(1)}%</Text>
        <Text style={ss.statLabel}>Res %</Text>
      </View>
      <View style={ss.divider} />
      <View style={ss.stat}>
        <Text style={[ss.statVal, { color: "#fff" }]}>{overallCases}</Text>
        <Text style={ss.statLabel}>Cases</Text>
      </View>
    </View>
  );
}
const ss = StyleSheet.create({
  wrap:      { backgroundColor: Colors.primaryDeep || Colors.primary, borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "center" },
  left:      { flex: 1.5, gap: 2 },
  subLabel:  { fontSize: 10, color: "rgba(255,255,255,0.7)", fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  bigNum:    { fontSize: 22, fontWeight: "900", color: "#fff" },
  divider:   { width: 1, height: 32, backgroundColor: "rgba(255,255,255,0.2)", marginHorizontal: 12 },
  stat:      { alignItems: "center", gap: 2 },
  statVal:   { fontSize: 14, fontWeight: "800", color: "#fff" },
  statLabel: { fontSize: 9, color: "rgba(255,255,255,0.65)", fontWeight: "600", textTransform: "uppercase" },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function AgencyTargetScreen() {
  const insets = useSafeAreaInsets();
  const { selectedCompany } = useCompanyFilter();
  const [targets, setTargets]             = useState<AllTargets>(DEFAULT_TARGETS);
  const [targetsLoaded, setTargetsLoaded] = useState(false);
  const [editVisible, setEditVisible]     = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => { if (raw) setTargets(JSON.parse(raw)); })
      .catch(() => {})
      .finally(() => setTargetsLoaded(true));
  }, []);

  const saveTargets = useCallback(async (newTargets: AllTargets) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newTargets));
      setTargets(newTargets);
      setEditVisible(false);
      Alert.alert("Saved", "Agency targets updated successfully.");
    } catch {
      Alert.alert("Error", "Could not save targets. Please try again.");
    }
  }, []);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/admin/cases", selectedCompany],
    queryFn: () => api.admin.getCases(selectedCompany ? { company: selectedCompany } : undefined),
    refetchInterval: 15000,
  });

  const bktData = useMemo(() => {
    const cases: any[] = data?.cases || [];
    const map: Record<string, any> = {};
    for (const c of cases) {
      const bktRaw = String(c.bkt ?? "").trim();
      if (!bktRaw || !BKT_META[bktRaw]) continue;
      if (String(c.pro ?? "").trim().toUpperCase() !== "TW") continue;
      if (!map[bktRaw]) map[bktRaw] = { totalPOS: 0, paidPOS: 0, unpaidPOS: 0, ptpPOS: 0, rollbackPOS: 0, caseCount: 0, paidCount: 0 };
      const pos = parseFloat(c.pos || 0);
      const rb  = parseFloat(c.rollback || 0);
      map[bktRaw].totalPOS  += pos;
      map[bktRaw].caseCount += 1;
      if (c.status === "Paid")     { map[bktRaw].paidPOS += pos; map[bktRaw].paidCount += 1; }
      else if (c.status === "PTP") { map[bktRaw].ptpPOS  += pos; }
      else                         { map[bktRaw].unpaidPOS += pos; }
      if (c.rollback_yn === true || c.rollback_yn === "true" || c.rollback_yn === "t") {
        map[bktRaw].rollbackPOS += rb > 0 ? rb : pos;
      }
    }
    return map;
  }, [data]);

  if (isLoading || !targetsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background }}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  const hasBktData = Object.keys(bktData).length > 0;

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={[
          styles.container,
          Platform.OS === "web" ? { paddingTop: 16 } : {},
          { paddingBottom: insets.bottom + 24 },
        ]}
      >
        {/* Top bar */}
        <View style={styles.topBar}>
          <View style={styles.topBarLeft}>
            <Ionicons name="trophy" size={16} color={Colors.primary} />
            <Text style={styles.topBarTitle}>Agency Targets — TW</Text>
          </View>
          <Pressable style={styles.editBtn} onPress={() => setEditVisible(true)}>
            <Ionicons name="settings-outline" size={14} color={Colors.primary} />
            <Text style={styles.editBtnText}>Set Targets</Text>
          </Pressable>
        </View>

        {/* Active company indicator */}
        {selectedCompany && (
          <View style={styles.companyBanner}>
            <Ionicons name="business" size={14} color={Colors.primary} />
            <Text style={styles.companyBannerText}>
              Showing data for <Text style={{ fontWeight: "800" }}>{selectedCompany}</Text>
            </Text>
          </View>
        )}

        {/* Target chips */}
        <View style={styles.targetChipsRow}>
          {["1", "2", "3"].map((k) => {
            const meta = BKT_META[k];
            const t    = targets[k] ?? DEFAULT_TARGETS[k];
            return (
              <View key={k} style={[styles.targetChip, { borderColor: meta.color + "50", backgroundColor: meta.color + "12" }]}>
                <Text style={[styles.targetChipBkt, { color: meta.color }]}>{meta.label}</Text>
                <Text style={styles.targetChipVal}>Res {t.resTarget}%</Text>
                <Text style={styles.targetChipVal}>RB {t.rbTarget}%</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.infoBanner}>
          <Ionicons name="information-circle-outline" size={15} color={Colors.info} />
          <Text style={styles.infoText}>
            Showing <Text style={{ fontWeight: "700" }}>TW cases only</Text>
            {selectedCompany ? ` for ${selectedCompany}` : ""}. UC and RUC are excluded. Tap <Text style={{ fontWeight: "700" }}>Set Targets</Text> to customise goals.
          </Text>
        </View>

        {hasBktData ? (
          <>
            <SummaryStrip bktData={bktData} selectedCompany={selectedCompany} />
            {["1", "2", "3"].map((key) =>
              bktData[key] ? (
                <BktTargetCard key={key} bktKey={key} data={bktData[key]} targets={targets[key] ?? DEFAULT_TARGETS[key]} />
              ) : null
            )}
          </>
        ) : (
          <View style={styles.empty}>
            <Ionicons name="bar-chart-outline" size={56} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No TW Data Yet</Text>
            <Text style={styles.emptyText}>
              {selectedCompany
                ? `No TW cases found for ${selectedCompany}. Try selecting a different company.`
                : "Import an Allocation Excel from the Dashboard to populate TW agency targets."}
            </Text>
            <Pressable style={styles.retryBtn} onPress={() => refetch()}>
              <Ionicons name="refresh" size={14} color="#fff" />
              <Text style={styles.retryBtnText}>Refresh</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <EditTargetsModal visible={editVisible} targets={targets} onSave={saveTargets} onClose={() => setEditVisible(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  container:          { padding: 16, gap: 14 },
  topBar:             { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topBarLeft:         { flexDirection: "row", alignItems: "center", gap: 7 },
  topBarTitle:        { fontSize: 16, fontWeight: "800", color: Colors.text },
  editBtn:            { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.primary + "18", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: Colors.primary + "30" },
  editBtnText:        { fontSize: 13, fontWeight: "700", color: Colors.primary },
  companyBanner:      { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.primary + "12", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: Colors.primary + "25" },
  companyBannerText:  { flex: 1, fontSize: 13, color: Colors.text },
  targetChipsRow:     { flexDirection: "row", gap: 8 },
  targetChip:         { flex: 1, borderRadius: 10, borderWidth: 1, padding: 10, gap: 3, alignItems: "center" },
  targetChipBkt:      { fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  targetChipVal:      { fontSize: 10, fontWeight: "600", color: Colors.textSecondary },
  infoBanner:         { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: Colors.info + "15", borderRadius: 10, padding: 12, borderLeftWidth: 3, borderLeftColor: Colors.info },
  infoText:           { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  empty:              { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 80, gap: 12 },
  emptyTitle:         { fontSize: 18, fontWeight: "800", color: Colors.text },
  emptyText:          { fontSize: 13, color: Colors.textMuted, textAlign: "center", maxWidth: 280, lineHeight: 20 },
  retryBtn:           { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10, marginTop: 8 },
  retryBtnText:       { color: "#fff", fontSize: 13, fontWeight: "700" },
});

import React, { useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, Modal, Pressable, TextInput, FlatList,
  ActivityIndicator, Alert, Platform, KeyboardAvoidingView, ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";

interface Props {
  visible: boolean;
  onClose: () => void;
}

type Filter = "all" | "ptp" | "selected" | "1" | "2" | "3";

const fmt = (n: number) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;
const keyOf = (c: any) => `${c.source}:${c.id}`;

export function DrrPaymentPicker({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  // key -> amount text (only for selected customers)
  const [selected, setSelected] = useState<Record<string, string>>({});

  const [ready, setReady] = useState(false);

  // Fetched manually on open so the list always starts from the latest saved selection
  // (and a background refetch can never wipe what the agent is ticking).
  const { data, isError, isFetching, refetch } = useQuery({
    queryKey: ["/api/drr/today-candidates"],
    queryFn: () => api.getDrrTodayCandidates(),
    enabled: false,
  });

  const cases: any[] = data?.cases ?? [];
  const isLoading = !ready && (isFetching || !isError);

  useEffect(() => {
    if (!visible) { setReady(false); return; }
    let cancelled = false;
    setSearch("");
    setFilter("all");
    refetch().then((res) => {
      if (cancelled || !res.data) return;
      const init: Record<string, string> = {};
      for (const c of res.data.cases ?? []) {
        if (c.selected) init[keyOf(c)] = String(Math.round(c.expected_amount ?? c.default_amount ?? 0));
      }
      setSelected(init);
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [visible]);

  const save = useMutation({
    mutationFn: () => {
      const items = cases
        .filter((c) => selected[keyOf(c)] !== undefined)
        .map((c) => {
          const txt = (selected[keyOf(c)] ?? "").replace(/[^0-9.]/g, "");
          return {
            source: c.source,
            id: c.id,
            expected_amount: txt === "" ? null : Number(txt),
          };
        });
      return api.saveDrrTodayPayments(items);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/drr/today-payments"] });
      qc.invalidateQueries({ queryKey: ["/api/drr/today-candidates"] });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onClose();
    },
    onError: (e: any) => Alert.alert("Could not save", e?.message || "Please try again."),
  });

  const toggle = (c: any) => {
    const k = keyOf(c);
    setSelected((prev) => {
      const next = { ...prev };
      if (next[k] !== undefined) delete next[k];
      else next[k] = String(Math.round(c.default_amount || 0));
      return next;
    });
  };

  const setAmount = (c: any, text: string) =>
    setSelected((prev) => ({ ...prev, [keyOf(c)]: text.replace(/[^0-9.]/g, "") }));

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = cases.filter((c) => {
      if (filter === "ptp" && !c.ptp_today) return false;
      if (filter === "selected" && selected[keyOf(c)] === undefined) return false;
      if ((filter === "1" || filter === "2" || filter === "3") && String(c.bkt) !== filter) return false;
      if (!q) return true;
      return (
        (c.customer_name || "").toLowerCase().includes(q) ||
        (c.loan_no || "").toLowerCase().includes(q) ||
        (c.mobile_no || "").includes(q)
      );
    });
    // PTP-today first, then by name (API already sorted by name)
    rows = [...rows].sort((a, b) => Number(b.ptp_today) - Number(a.ptp_today));
    return rows;
  }, [cases, search, filter, selected]);

  const selectedKeys = Object.keys(selected);
  const totalAmount = selectedKeys.reduce((a, k) => a + (parseFloat(selected[k]) || 0), 0);
  const ptpCount = cases.filter((c) => c.ptp_today).length;

  const bktCount = (n: string) => cases.filter((c) => String(c.bkt) === n).length;
  const allShownSelected = list.length > 0 && list.every((c) => selected[keyOf(c)] !== undefined);
  const toggleAllShown = () =>
    setSelected((prev) => {
      const next = { ...prev };
      for (const c of list) {
        if (allShownSelected) delete next[keyOf(c)];
        else if (next[keyOf(c)] === undefined) next[keyOf(c)] = String(Math.round(c.default_amount || 0));
      }
      return next;
    });

  const chips: { key: Filter; label: string }[] = [
    { key: "all", label: `All (${cases.length})` },
    { key: "1", label: `BKT 1 (${bktCount("1")})` },
    { key: "2", label: `BKT 2 (${bktCount("2")})` },
    { key: "3", label: `BKT 3 (${bktCount("3")})` },
    { key: "ptp", label: `PTP Today (${ptpCount})` },
    { key: "selected", label: `Selected (${selectedKeys.length})` },
  ];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: Colors.background }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View style={[s.header, { paddingTop: (Platform.OS === "web" ? 16 : insets.top) + 8 }]}>
          <Pressable onPress={onClose} hitSlop={10} style={s.closeBtn}>
            <Ionicons name="close" size={22} color={Colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Today's Expected Payments</Text>
            <Text style={s.sub}>Tick the customers who can pay today</Text>
          </View>
        </View>

        {/* Search */}
        <View style={s.searchWrap}>
          <Ionicons name="search" size={16} color={Colors.textMuted} />
          <TextInput
            style={s.searchInput}
            placeholder="Search name, loan no, mobile"
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />
          {!!search && (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
            </Pressable>
          )}
        </View>

        {/* Filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={s.chipRow}>
          {chips.map((ch) => (
            <Pressable
              key={ch.key}
              onPress={() => setFilter(ch.key)}
              style={[s.chip, filter === ch.key && s.chipActive]}
            >
              <Text style={[s.chipText, filter === ch.key && s.chipTextActive]}>{ch.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {!isLoading && !isError && list.length > 0 && (
          <Pressable style={s.selAll} onPress={toggleAllShown}>
            <Ionicons name={allShownSelected ? "checkbox" : "square-outline"} size={20} color={allShownSelected ? Colors.success : Colors.textSecondary} />
            <Text style={s.selAllText}>
              {allShownSelected ? "Clear" : "Select all"} {list.length} shown
            </Text>
          </Pressable>
        )}

        {/* List */}
        {isLoading ? (
          <View style={s.center}><ActivityIndicator color={Colors.primary} size="large" /></View>
        ) : isError ? (
          <View style={s.center}>
            <Text style={s.emptyText}>Could not load customers</Text>
            <Pressable
              onPress={() => refetch().then((res) => {
                if (!res.data) return;
                const init: Record<string, string> = {};
                for (const c of res.data.cases ?? []) {
                  if (c.selected) init[keyOf(c)] = String(Math.round(c.expected_amount ?? c.default_amount ?? 0));
                }
                setSelected(init);
                setReady(true);
              })}
              style={s.retryBtn}
            >
              <Text style={s.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={list}
            keyExtractor={keyOf}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 12, paddingBottom: 24, gap: 8 }}
            ListEmptyComponent={
              <View style={s.center}>
                <Ionicons name="people-outline" size={40} color={Colors.textMuted} />
                <Text style={s.emptyText}>No customers found</Text>
              </View>
            }
            renderItem={({ item }) => {
              const k = keyOf(item);
              const isSel = selected[k] !== undefined;
              return (
                <View style={[s.row, isSel && s.rowSel]}>
                  <Pressable style={s.rowMain} onPress={() => toggle(item)}>
                    <Ionicons
                      name={isSel ? "checkbox" : "square-outline"}
                      size={24}
                      color={isSel ? Colors.success : Colors.textMuted}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={s.name} numberOfLines={1}>{item.customer_name}</Text>
                      <Text style={s.meta} numberOfLines={1}>
                        {item.loan_no}{item.pos ? ` · POS ${fmt(item.pos)}` : ""}{item.company_name ? ` · ${item.company_name}` : ""}
                      </Text>
                      <View style={s.tagRow}>
                        {item.bkt != null && (
                          <View style={s.tag}><Text style={s.tagText}>BKT {item.bkt}</Text></View>
                        )}
                        {!!item.status && (
                          <View style={s.tag}><Text style={s.tagText}>{item.status}</Text></View>
                        )}
                        {item.ptp_today && (
                          <View style={[s.tag, { backgroundColor: Colors.statusPTP + "20" }]}>
                            <Text style={[s.tagText, { color: Colors.statusPTP }]}>PTP Today</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </Pressable>

                  {isSel && (
                    <View style={s.amtWrap}>
                      <Text style={s.amtLabel}>Expected ₹</Text>
                      <TextInput
                        style={s.amtInput}
                        value={selected[k]}
                        onChangeText={(t) => setAmount(item, t)}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor={Colors.textMuted}
                        selectTextOnFocus
                      />
                    </View>
                  )}
                </View>
              );
            }}
          />
        )}

        {/* Footer */}
        <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.footCount}>{selectedKeys.length} selected</Text>
            <Text style={s.footAmt}>{fmt(totalAmount)} expected</Text>
          </View>
          <Pressable
            style={[s.saveBtn, save.isPending && { opacity: 0.6 }]}
            disabled={save.isPending || isLoading || isError}
            onPress={() => save.mutate()}
          >
            {save.isPending
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.saveText}>Save Today's List</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  header:        { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingBottom: 10, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  closeBtn:      { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  title:         { fontSize: 16, fontWeight: "800", color: Colors.text },
  sub:           { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  searchWrap:    { flexDirection: "row", alignItems: "center", gap: 8, margin: 12, marginBottom: 6, paddingHorizontal: 12, height: 42, backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border },
  searchInput:   { flex: 1, fontSize: 14, color: Colors.text, paddingVertical: 0 },
  chipRow:       { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingVertical: 6 },
  chip:          { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  chipActive:    { backgroundColor: Colors.primary, borderColor: Colors.primary },
  selAll:        { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 6 },
  selAllText:    { fontSize: 13, fontWeight: "700", color: Colors.textSecondary },
  chipText:      { fontSize: 12, fontWeight: "700", color: Colors.textSecondary },
  chipTextActive:{ color: "#fff" },
  center:        { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 50, gap: 10 },
  emptyText:     { fontSize: 14, fontWeight: "700", color: Colors.textMuted },
  retryBtn:      { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.primary },
  retryText:     { color: "#fff", fontWeight: "700" },
  row:           { backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 12, gap: 10 },
  rowSel:        { borderColor: Colors.success, backgroundColor: Colors.success + "0D" },
  rowMain:       { flexDirection: "row", alignItems: "center", gap: 10 },
  name:          { fontSize: 14, fontWeight: "800", color: Colors.text },
  meta:          { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  tagRow:        { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  tag:           { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: Colors.surfaceAlt },
  tagText:       { fontSize: 10, fontWeight: "700", color: Colors.textSecondary },
  amtWrap:       { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 34 },
  amtLabel:      { fontSize: 12, fontWeight: "700", color: Colors.textSecondary },
  amtInput:      { flex: 1, height: 38, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, paddingHorizontal: 12, fontSize: 15, fontWeight: "800", color: Colors.text },
  footer:        { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingTop: 12, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border },
  footCount:     { fontSize: 12, fontWeight: "700", color: Colors.textSecondary },
  footAmt:       { fontSize: 17, fontWeight: "900", color: Colors.text },
  saveBtn:       { minWidth: 160, height: 46, borderRadius: 12, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  saveText:      { color: "#fff", fontSize: 14, fontWeight: "800" },
});

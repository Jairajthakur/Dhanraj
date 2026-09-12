import React, { useState, useEffect, useMemo } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput,
  ActivityIndicator, Alert, Switch, KeyboardAvoidingView, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { tokenStore } from "@/lib/api";

interface Agent {
  id: number;
  name: string;
  username?: string;
  push_token?: string | null;
}

async function authedFetch(path: string, init: RequestInit = {}) {
  const base = getApiUrl().replace(/\/+$/, "");
  // Always read the token regardless of platform — web has no session cookie
  // here (API and web app can be on different origins), so it needs the
  // Bearer token from localStorage just like native reads it from
  // AsyncStorage. Skipping this on web is what silently breaks admin-only
  // fetches in the browser (401 with no visible error).
  const token = await tokenStore.get();
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(init.headers as any) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, { ...init, headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || "Request failed");
  return json;
}

export default function CustomNotificationScreen() {
  const insets = useSafeAreaInsets();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  // Voice alert is OFF by default — most custom notifications should be a
  // normal, quiet push. The admin has to explicitly opt in per-send for it
  // to play the loud spoken-word alert instead of the default sound.
  const [voiceAlert, setVoiceAlert] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await authedFetch("/api/admin/agents");
        setAgents(data.agents || []);
      } catch (e: any) {
        Alert.alert("Failed to load agents", e.message || "Something went wrong");
      } finally {
        setLoadingAgents(false);
      }
    })();
  }, []);

  const filteredAgents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter((a) => a.name?.toLowerCase().includes(q) || a.username?.toLowerCase().includes(q));
  }, [agents, search]);

  const toggleAgent = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filteredAgents.forEach((a) => next.add(a.id));
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleSend = async () => {
    if (selectedIds.size === 0) { Alert.alert("No agents selected", "Pick at least one agent to notify."); return; }
    if (!title.trim()) { Alert.alert("Missing title", "Enter a notification title."); return; }
    if (!message.trim()) { Alert.alert("Missing message", "Enter a notification message."); return; }

    const doSend = async () => {
      setSending(true);
      try {
        const result = await authedFetch("/api/admin/custom-notification", {
          method: "POST",
          body: JSON.stringify({
            agentIds: Array.from(selectedIds),
            title: title.trim(),
            message: message.trim(),
            voiceAlert,
          }),
        });
        const missingNote = result.missingDevices > 0 ? ` (${result.missingDevices} selected agent(s) have no registered device and were skipped.)` : "";
        Alert.alert("Sent", `Delivered to ${result.sent}/${result.total} device(s).${missingNote}`);
        setTitle("");
        setMessage("");
        setVoiceAlert(false);
        clearSelection();
      } catch (e: any) {
        Alert.alert("Failed to send", e.message || "Something went wrong");
      } finally {
        setSending(false);
      }
    };

    if (voiceAlert) {
      Alert.alert(
        "Send as voice alert?",
        `This will play a loud, spoken-word alert on ${selectedIds.size} agent's device(s), like the PTP break alert. Continue?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Send", style: "destructive", onPress: doSend },
        ]
      );
    } else {
      doSend();
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: Colors.background }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <FlatList
        data={filteredAgents}
        keyExtractor={(a) => String(a.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100 }}
        ListHeaderComponent={
          <View style={{ gap: 14, marginBottom: 12 }}>
            <Text style={s.label}>Title</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. Office Closed Tomorrow"
              placeholderTextColor={Colors.textMuted}
              value={title}
              onChangeText={setTitle}
            />

            <Text style={s.label}>Message</Text>
            <TextInput
              style={[s.input, s.textArea]}
              placeholder="Type the notification message..."
              placeholderTextColor={Colors.textMuted}
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={4}
            />

            <View style={s.voiceRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>Send as voice alert</Text>
                <Text style={s.voiceHint}>
                  Off by default. When on, this notification plays a loud spoken-word
                  alert instead of the normal sound — only for this send, only to the
                  agents selected below.
                </Text>
              </View>
              <Switch value={voiceAlert} onValueChange={setVoiceAlert} trackColor={{ false: Colors.border, true: Colors.primary }} />
            </View>

            <View style={s.sectionHeaderRow}>
              <Text style={s.sectionTitle}>Select agents ({selectedIds.size} selected)</Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable onPress={selectAllFiltered}><Text style={s.linkText}>Select all</Text></Pressable>
                <Pressable onPress={clearSelection}><Text style={s.linkText}>Clear</Text></Pressable>
              </View>
            </View>

            <TextInput
              style={s.input}
              placeholder="Search agents..."
              placeholderTextColor={Colors.textMuted}
              value={search}
              onChangeText={setSearch}
            />

            {loadingAgents && <ActivityIndicator style={{ marginTop: 10 }} color={Colors.primary} />}
          </View>
        }
        renderItem={({ item }) => {
          const checked = selectedIds.has(item.id);
          const hasDevice = !!item.push_token;
          return (
            <Pressable style={s.agentRow} onPress={() => toggleAgent(item.id)}>
              <View style={[s.checkbox, checked && s.checkboxChecked]}>
                {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.agentName}>{item.name}</Text>
                {!hasDevice && <Text style={s.noDeviceText}>No registered device</Text>}
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={!loadingAgents ? <Text style={s.emptyText}>No agents found.</Text> : null}
      />

      <View style={[s.sendBar, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable style={[s.sendBtn, sending && { opacity: 0.6 }]} onPress={handleSend} disabled={sending}>
          {sending
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.sendBtnText}>{voiceAlert ? "Send Voice Alert" : "Send Notification"}</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  label:         { fontSize: 13, fontWeight: "700", color: Colors.text },
  input:         { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: Colors.text },
  textArea:      { minHeight: 90, textAlignVertical: "top" },
  voiceRow:      { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, padding: 12 },
  voiceHint:     { fontSize: 12, color: Colors.textMuted, marginTop: 4, lineHeight: 16 },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  sectionTitle:  { fontSize: 14, fontWeight: "700", color: Colors.text },
  linkText:      { fontSize: 12, fontWeight: "700", color: Colors.primary },
  agentRow:      { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  checkbox:      { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Colors.border, alignItems: "center", justifyContent: "center" },
  checkboxChecked: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  agentName:     { fontSize: 14, fontWeight: "600", color: Colors.text },
  noDeviceText:  { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  emptyText:     { textAlign: "center", color: Colors.textMuted, marginTop: 30 },
  sendBar:       { position: "absolute", left: 0, right: 0, bottom: 0, padding: 12, backgroundColor: Colors.background, borderTopWidth: 1, borderTopColor: Colors.border },
  sendBtn:       { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  sendBtnText:   { color: "#fff", fontWeight: "700", fontSize: 15 },
});

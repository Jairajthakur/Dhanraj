import React from "react";
import { reloadAppAsync } from "expo";
import {
  StyleSheet, View, Pressable, Text, useColorScheme, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

export type ErrorFallbackProps = {
  error: Error;
  resetError: () => void;
};

export function ErrorFallback({ error, resetError }: ErrorFallbackProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const insets = useSafeAreaInsets();

  const bg   = isDark ? "#0A0A0A" : "#F8F8F8";
  const card = isDark ? "#1C1C1E" : "#FFFFFF";
  const text = isDark ? "#FFFFFF" : "#1C1C1E";
  const sub  = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)";
  const accent = "#4F7FFA";

  const handleReload = async () => {
    try { await reloadAppAsync(); }
    catch { resetError(); }
  };

  return (
    <View style={[s.root, { backgroundColor: bg, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={[s.card, { backgroundColor: card }]}>
        <View style={[s.iconWrap, { backgroundColor: accent + "18" }]}>
          <Ionicons name="cloud-offline-outline" size={40} color={accent} />
        </View>

        <Text style={[s.title, { color: text }]}>Something went wrong</Text>
        <Text style={[s.body, { color: sub }]}>
          This could be a network issue. Please check your connection and reload the app.
        </Text>

        <Pressable
          style={({ pressed }) => [s.btn, { backgroundColor: accent, opacity: pressed ? 0.85 : 1 }]}
          onPress={handleReload}
        >
          <Ionicons name="reload" size={16} color="#fff" style={{ marginRight: 8 }} />
          <Text style={s.btnText}>Reload App</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
    gap: 16,
  },
  iconWrap: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: "center", justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 20, fontWeight: "700", textAlign: "center",
  },
  body: {
    fontSize: 14, lineHeight: 22, textAlign: "center",
  },
  btn: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 14, paddingHorizontal: 28,
    borderRadius: 12, marginTop: 8,
  },
  btnText: {
    color: "#fff", fontWeight: "600", fontSize: 15,
  },
});

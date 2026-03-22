import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, router, useSegments, useRootNavigationState } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef, useState } from "react";
import { Text, View, Platform, Animated, Easing, Image, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFonts, Outfit_400Regular } from "@expo-google-fonts/outfit";
import { queryClient } from "../lib/query-client";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { setQueryClientRef } from "../lib/api";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { usePushNotifications } from "@/context/usePushNotifications";

setQueryClientRef(queryClient);

// ─── Branded Splash Loader ────────────────────────────────────────────────────
function SplashLoader() {
  const scaleAnim = useRef(new Animated.Value(0.7)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacityAnim, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== "web" }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 6, tension: 80, useNativeDriver: Platform.OS !== "web" }),
    ]).start();

    const dotAnimation = (dot: Animated.Value, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(dot, { toValue: -8, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== "web" }),
        Animated.timing(dot, { toValue: 0, duration: 300, easing: Easing.in(Easing.quad), useNativeDriver: Platform.OS !== "web" }),
        Animated.delay(600 - delay),
      ]));

    const d1 = dotAnimation(dot1, 0);
    const d2 = dotAnimation(dot2, 150);
    const d3 = dotAnimation(dot3, 300);
    d1.start(); d2.start(); d3.start();
    return () => { d1.stop(); d2.stop(); d3.stop(); };
  }, []);

  return (
    <View style={splashStyles.container}>
      <Animated.View style={[splashStyles.logoWrap, { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }]}>
        <Image source={require("../assets/images/dhanraj-logo.png")} style={splashStyles.logo} resizeMode="contain" />
        <Text style={splashStyles.appName}>DHANRAJ ENTERPRISES</Text>
        <Text style={splashStyles.tagline}>Field Collection Management</Text>
      </Animated.View>
      <Animated.View style={[splashStyles.dotsRow, { opacity: opacityAnim }]}>
        {[dot1, dot2, dot3].map((dot, i) => (
          <Animated.View key={i} style={[splashStyles.dot, { transform: [{ translateY: dot }] }]} />
        ))}
      </Animated.View>
    </View>
  );
}

const splashStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ECEAE4", justifyContent: "center", alignItems: "center", gap: 48 },
  logoWrap: { alignItems: "center", gap: 14 },
  logo: { width: 110, height: 110, borderRadius: 24 },
  appName: { fontSize: 18, fontWeight: "800", color: "#1A1A1A", letterSpacing: 1.5, textAlign: "center" },
  tagline: { fontSize: 12, fontWeight: "500", color: "#888", letterSpacing: 0.5, textAlign: "center" },
  dotsRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#1A1A1A", opacity: 0.7 },
});

if (Platform.OS !== "web") {
  SplashScreen.preventAutoHideAsync().catch(() => {});
}

function RootLayoutNav() {
  const { agent, isLoading } = useAuth();
  const segments = useSegments();
  const navigationState = useRootNavigationState();

  // ✅ Track the last route we redirected to — never redirect to the same place twice
  const lastRedirect = useRef<string | null>(null);

  usePushNotifications();

  useEffect(() => {
    if (!navigationState?.key || isLoading) return;

    const currentRoute = segments.join("/");

    const getTargetRoute = (): string | null => {
      if (!agent) {
        // Not logged in → always go to login
        const isAlreadyOnLogin = segments[0] === "(app)" && segments[1] === "login";
        return isAlreadyOnLogin ? null : "/(app)/login";
      }

      // Logged in → figure out correct home for this role
      const roleHome: Record<string, string> = {
        admin: "/(admin)",
        fos:   "/(app)/dashboard",
        repo:  "/(repo)",
      };
      const home = roleHome[agent.role];
      if (!home) return null;

      // Already in the right section — don't redirect
      const inCorrectSection =
        (agent.role === "admin" && segments[0] === "(admin)") ||
        (agent.role === "fos"   && segments[0] === "(app)" && segments[1] !== "login") ||
        (agent.role === "repo"  && segments[0] === "(repo)");

      if (inCorrectSection) return null;

      return home;
    };

    const target = getTargetRoute();

    // ✅ Only redirect if target is different from where we last redirected
    // This is the key fix — prevents the infinite loop
    if (target && target !== lastRedirect.current) {
      lastRedirect.current = target;
      router.replace(target as any);
    }
  }, [agent?.id, agent?.role, isLoading, navigationState?.key, segments.join("/")]);

  // Reset redirect tracker when agent changes (logout/login)
  useEffect(() => {
    lastRedirect.current = null;
  }, [agent?.id]);

  if (isLoading) return <SplashLoader />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(app)" />
      <Stack.Screen name="(admin)" />
      <Stack.Screen name="(repo)" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontTimeout, setFontTimeout] = useState(false);
  const [appMounted, setAppMounted] = useState(false);
  const [fontsLoaded, fontError] = useFonts(Platform.OS === "web" ? {} : { Outfit_400Regular });

  useEffect(() => { setAppMounted(true); }, []);

  useEffect(() => {
    const timeout = Platform.OS === "web" ? 500 : 2000;
    const t = setTimeout(() => setFontTimeout(true), timeout);
    return () => clearTimeout(t);
  }, []);

  // ✅ On web: skip splash entirely — render immediately
  // On native: wait for fonts (max 2s)
  const appReady = Platform.OS === "web"
    ? true
    : (fontsLoaded || !!fontError || fontTimeout) && appMounted;

  useEffect(() => {
    if (appReady && Platform.OS !== "web") SplashScreen.hideAsync().catch(() => {});
  }, [appReady]);

  if (!appReady) return <SplashLoader />;

  return (
    <QueryClientProvider client={queryClient}>
      {Platform.OS === "web" ? (
        <View style={{ flex: 1, width: "100%", height: "100%" }}>
          <StatusBar style="dark" />
          <AuthProvider>
            <RootLayoutNav />
          </AuthProvider>
        </View>
      ) : (
        <SafeAreaProvider>
          <StatusBar style="dark" />
          <AuthProvider>
            <RootLayoutNav />
          </AuthProvider>
        </SafeAreaProvider>
      )}
    </QueryClientProvider>
  );
}

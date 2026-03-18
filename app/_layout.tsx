import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, router, useSegments, useRootNavigationState } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef } from "react";
import { Text, View, Platform, Animated, Easing } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFonts, Outfit_400Regular } from "@expo-google-fonts/outfit";
import { queryClient } from "../lib/query-client";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";

SplashScreen.preventAutoHideAsync();

function CoolLoadingScreen() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(logoScale, { toValue: 1, tension: 50, friction: 7, useNativeDriver: true }),
      Animated.timing(logoOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start();

    const animateDot = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: -14, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 320, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          Animated.delay(400),
        ])
      );

    const a1 = animateDot(dot1, 0);
    const a2 = animateDot(dot2, 160);
    const a3 = animateDot(dot3, 320);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: "#ECEAE4", justifyContent: "center", alignItems: "center", gap: 40 }}>
      <Animated.View style={{ transform: [{ scale: logoScale }], opacity: logoOpacity, alignItems: "center", gap: 20 }}>
        <View style={{ width: 100, height: 100, justifyContent: "center", alignItems: "center" }}>
          <View style={{
            width: 72, height: 72, backgroundColor: "#111111", borderRadius: 20,
            transform: [{ rotate: "45deg" }], justifyContent: "center", alignItems: "center",
            shadowColor: "#111111", shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.25, shadowRadius: 16, elevation: 12,
          }} />
          <View style={{ position: "absolute" }}>
            <Text style={{ color: "#fff", fontSize: 28, fontWeight: "900", letterSpacing: -1 }}>D</Text>
          </View>
        </View>
        <View style={{ alignItems: "center", gap: 4 }}>
          <Text style={{ fontSize: 24, fontWeight: "800", color: "#111111", letterSpacing: -0.5 }}>Dhanraj</Text>
          <Text style={{ fontSize: 11, fontWeight: "600", color: "#888888", letterSpacing: 3.5, textTransform: "uppercase" }}>Enterprises</Text>
        </View>
      </Animated.View>

      <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
        {[dot1, dot2, dot3].map((dot, i) => (
          <Animated.View key={i} style={{
            width: 8, height: 8, borderRadius: 4, backgroundColor: "#111111",
            opacity: 0.6, transform: [{ translateY: dot }],
          }} />
        ))}
      </View>
    </View>
  );
}

function RootLayoutNav() {
  const { agent, isLoading } = useAuth();
  const segments = useSegments();
  const navigationState = useRootNavigationState();

  useEffect(() => {
    if (!navigationState?.key || isLoading) return;
    const inLogin = segments[0] === "login";
    if (!agent && !inLogin) { router.replace("/login"); return; }
    if (agent?.role === "admin") { router.replace("/(admin)"); return; }
    if (agent?.role === "fos") { router.replace("/(app)/dashboard"); return; }
    if (agent?.role === "repo") { router.replace("/(repo)"); return; }
  }, [agent, isLoading, navigationState?.key]);

  if (isLoading) return <CoolLoadingScreen />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="(app)" />
      <Stack.Screen name="(admin)" />
      <Stack.Screen name="(repo)" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(
    Platform.OS === "web" ? {} : { Outfit_400Regular }
  );

  const appReady = Platform.OS === "web" ? true : (fontsLoaded || !!fontError);

  useEffect(() => {
    if (appReady) SplashScreen.hideAsync();
  }, [appReady]);

  if (!appReady) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider
        initialMetrics={
          Platform.OS === "web"
            ? { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 0, height: 0 } }
            : initialWindowMetrics
        }
      >
        <StatusBar style="dark" />
        <AuthProvider>
          <RootLayoutNav />
        </AuthProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

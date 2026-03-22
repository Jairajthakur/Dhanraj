import { QueryClientProvider } from "@tanstack/react-query";
import {
  Stack,
  router,
  useSegments,
  useRootNavigationState,
} from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef, useState } from "react";
import {
  Text,
  View,
  Platform,
  Animated,
  Easing,
  Image,
  StyleSheet,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFonts, Outfit_400Regular } from "@expo-google-fonts/outfit";
import { queryClient } from "../lib/query-client";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { setQueryClientRef } from "../lib/api";
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
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
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: Platform.OS !== "web",
      }),
    ]).start();

    const dotAnimation = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: -8,
            duration: 300,
            easing: Easing.out(Easing.quad),
            useNativeDriver: Platform.OS !== "web",
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 300,
            easing: Easing.in(Easing.quad),
            useNativeDriver: Platform.OS !== "web",
          }),
          Animated.delay(600 - delay),
        ])
      );

    const d1 = dotAnimation(dot1, 0);
    const d2 = dotAnimation(dot2, 150);
    const d3 = dotAnimation(dot3, 300);
    d1.start();
    d2.start();
    d3.start();

    return () => {
      d1.stop();
      d2.stop();
      d3.stop();
    };
  }, []);

  return (
    <View style={splashStyles.container}>
      <Animated.View
        style={[
          splashStyles.logoWrap,
          { opacity: opacityAnim, transform: [{ scale: scaleAnim }] },
        ]}
      >
        <Image
          source={require("../assets/images/dhanraj-logo.png")}
          style={splashStyles.logo}
          resizeMode="contain"
        />
        <Text style={splashStyles.appName}>DHANRAJ ENTERPRISES</Text>
        <Text style={splashStyles.tagline}>Field Collection Management</Text>
      </Animated.View>

      <Animated.View style={[splashStyles.dotsRow, { opacity: opacityAnim }]}>
        {[dot1, dot2, dot3].map((dot, i) => (
          <Animated.View
            key={i}
            style={[
              splashStyles.dot,
              { transform: [{ translateY: dot }] },
            ]}
          />
        ))}
      </Animated.View>
    </View>
  );
}

const splashStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ECEAE4",
    justifyContent: "center",
    alignItems: "center",
    gap: 48,
  },
  logoWrap: { alignItems: "center", gap: 14 },
  logo: { width: 110, height: 110, borderRadius: 24 },
  appName: {
    fontSize: 18, fontWeight: "800", color: "#1A1A1A",
    letterSpacing: 1.5, textAlign: "center",
  },
  tagline: {
    fontSize: 12, fontWeight: "500", color: "#888",
    letterSpacing: 0.5, textAlign: "center",
  },
  dotsRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: "#1A1A1A", opacity: 0.7,
  },
});

// ✅ Only call SplashScreen on native — not supported on web
if (Platform.OS !== "web") {
  SplashScreen.preventAutoHideAsync().catch(() => {});
}

function RootLayoutNav() {
  const { agent, isLoading } = useAuth();
  const segments = useSegments();
  const navigationState = useRootNavigationState();
  const hasRedirected = useRef(false);

  // ✅ Push token registration (native only)
  usePushNotifications();

  useEffect(() => {
    if (!navigationState?.key || isLoading) return;

    // ✅ FIX: login screen is at /(app)/login, NOT /login
    // Check current segment to avoid redirect loops
    const inApp   = segments[0] === "(app)";
    const inAdmin = segments[0] === "(admin)";
    const inRepo  = segments[0] === "(repo)";
    const inLogin = inApp && segments[1] === "login";
    const inIndex = segments[0] === "index" || segments.length === 0;

    if (!agent) {
      // Not logged in — send to login screen
      if (!inLogin) {
        hasRedirected.current = false;
        router.replace("/(app)/login");
      }
      return;
    }

    // Already in the right place — don't redirect
    if (agent.role === "admin" && inAdmin) return;
    if (agent.role === "fos"   && inApp && !inLogin) return;
    if (agent.role === "repo"  && inRepo) return;

    // On login screen but already authenticated — redirect to home
    if (inLogin || inIndex) {
      if (hasRedirected.current) return;
      hasRedirected.current = true;

      if (agent.role === "admin")     router.replace("/(admin)");
      else if (agent.role === "fos")  router.replace("/(app)/dashboard");
      else if (agent.role === "repo") router.replace("/(repo)");
      return;
    }

    // Cross-role protection — wrong section for this role
    if (hasRedirected.current) return;
    hasRedirected.current = true;

    if (agent.role === "admin")     router.replace("/(admin)");
    else if (agent.role === "fos")  router.replace("/(app)/dashboard");
    else if (agent.role === "repo") router.replace("/(repo)");
  }, [agent?.role, isLoading, navigationState?.key, segments[0], segments[1]]);

  useEffect(() => {
    hasRedirected.current = false;
  }, [agent?.id]);

  if (isLoading) {
    return <SplashLoader />;
  }

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

  const [fontsLoaded, fontError] = useFonts(
    Platform.OS === "web" ? {} : { Outfit_400Regular }
  );

  useEffect(() => {
    setAppMounted(true);
  }, []);

  useEffect(() => {
    const timeout = Platform.OS === "web" ? 500 : 2000;
    const t = setTimeout(() => setFontTimeout(true), timeout);
    return () => clearTimeout(t);
  }, []);

  const appReady =
    Platform.OS === "web"
      ? appMounted && fontTimeout
      : (fontsLoaded || !!fontError || fontTimeout) && appMounted;

  useEffect(() => {
    if (appReady && Platform.OS !== "web") {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [appReady]);

  if (!appReady) {
    return <SplashLoader />;
  }

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

import { QueryClientProvider } from "@tanstack/react-query";
import {
  Stack,
  router,
  useSegments,
  useRootNavigationState,
} from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { Text, View, Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFonts, Outfit_400Regular } from "@expo-google-fonts/outfit";
import { queryClient } from "../lib/query-client";
import { AuthProvider, useAuth } from "../context/AuthContext";
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
// ✅ FIXED: Import usePushNotifications
import { usePushNotifications } from "@/lib/notifications";

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { agent, isLoading } = useAuth();
  const segments = useSegments();
  const navigationState = useRootNavigationState();

  // ✅ FIXED: Call push notifications hook here — inside AuthProvider,
  // so it runs after login and has access to auth context.
  // Only register on native (not web) and only when agent is logged in.
  usePushNotifications();

  useEffect(() => {
    if (!navigationState?.key || isLoading) return;
    const inLogin = segments[0] === "login";
    const inApp   = segments[0] === "(app)";
    const inAdmin  = segments[0] === "(admin)";
    const inRepo   = segments[0] === "(repo)";

    // Not logged in → go to login
    if (!agent) {
      if (!inLogin) router.replace("/login");
      return;
    }

    // Already in correct area → don't redirect (prevents infinite loop)
    if (agent.role === "admin" && inAdmin) return;
    if (agent.role === "fos"   && inApp)   return;
    if (agent.role === "repo"  && inRepo)  return;

    // Redirect to correct area
    if (agent.role === "admin") router.replace("/(admin)");
    else if (agent.role === "fos") router.replace("/(app)/dashboard");
    else if (agent.role === "repo") router.replace("/(repo)");
  }, [agent, isLoading, navigationState?.key, segments]);

  if (isLoading) {
    return (
      <View style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#ECEAE4",
      }}>
        <Text style={{ color: "#0D0D0D", fontSize: 14 }}>Loading...</Text>
      </View>
    );
  }

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
  const [fontTimeout, setFontTimeout] = useState(false);
  const [fontsLoaded, fontError] = useFonts(
    Platform.OS === "web" ? {} : { Outfit_400Regular }
  );

  // Safety: never block on font loading forever
  useEffect(() => {
    const t = setTimeout(() => setFontTimeout(true), 3000);
    return () => clearTimeout(t);
  }, []);

  const appReady =
    Platform.OS === "web" ? true : fontsLoaded || !!fontError || fontTimeout;

  useEffect(() => {
    if (appReady) SplashScreen.hideAsync();
  }, [appReady]);

  // Return empty View (not null) to prevent blank screen on Android
  if (!appReady) {
    return <View style={{ flex: 1, backgroundColor: "#ECEAE4" }} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider
        initialMetrics={
          Platform.OS === "web"
            ? {
                insets: { top: 0, left: 0, right: 0, bottom: 0 },
                frame: { x: 0, y: 0, width: 0, height: 0 },
              }
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

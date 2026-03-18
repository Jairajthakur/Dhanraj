import { QueryClientProvider } from "@tanstack/react-query";
import {
  Stack,
  router,
  useSegments,
  useRootNavigationState,
} from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { Text, View, Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFonts, Outfit_400Regular } from "@expo-google-fonts/outfit";
import { queryClient } from "../lib/query-client";
import { AuthProvider, useAuth } from "../context/AuthContext";
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { agent, isLoading } = useAuth();
  const segments = useSegments();
  const navigationState = useRootNavigationState();

  useEffect(() => {
    if (!navigationState?.key || isLoading) return;

    const inLogin = segments[0] === "login";

    if (!agent) {
      if (!inLogin) router.replace("/login");
      return;
    }

    if (agent.role === "admin") {
      router.replace("/(admin)");
    } else if (agent.role === "fos") {
      router.replace("/(app)/dashboard");
    } else if (agent.role === "repo") {
      router.replace("/(repo)");
    }
  }, [agent, isLoading, navigationState?.key]);

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#ECEAE4",
        }}
      >
        <Text style={{ color: "#0D0D0D" }}>Loading...</Text>
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
  const [fontsLoaded, fontError] = useFonts(
    Platform.OS === "web" ? {} : { Outfit_400Regular }
  );

  const appReady = Platform.OS === "web" ? true : fontsLoaded || !!fontError;

  useEffect(() => {
    if (appReady) {
      SplashScreen.hideAsync();
    }
  }, [appReady]);

  // ✅ FIXED: No more blank screen
  if (!appReady) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#ECEAE4",
        }}
      >
        <Text>Loading App...</Text>
      </View>
    );
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

import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, router, useSegments, useRootNavigationState } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef } from "react";
import { Platform, Text, View, AppState } from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  useFonts,
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
} from "@expo-google-fonts/outfit";
import * as Notifications from "expo-notifications";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { api } from "@/lib/api";

SplashScreen.preventAutoHideAsync();

// Notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Push token function (safe for web)
async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (__DEV__ || Platform.OS === "web") return null;

  if (Platform.OS === "android") {
    try {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
      });
    } catch {}
  }

  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return null;

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: "1b09251a-4423-4759-a22b-fc2f0a44fd8e",
    });

    return tokenData.data;
  } catch {
    return null;
  }
}

function RootLayoutNav() {
  const { agent, isLoading } = useAuth();
  const segments = useSegments();
  const navigationState = useRootNavigationState();

  const tokenSavedRef = useRef(false);

  // Save push token after login
  useEffect(() => {
    if (!agent || tokenSavedRef.current) return;

    const saveToken = async () => {
      try {
        const token = await registerForPushNotificationsAsync();
        if (token) {
          await api.savePushToken(token);
          tokenSavedRef.current = true;
        }
      } catch {}
    };

    saveToken();
  }, [agent]);

  // AppState listener
  const agentRef = useRef(agent);
  useEffect(() => {
    agentRef.current = agent;
  }, [agent]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", async (state) => {
      if (state === "active" && agentRef.current && !tokenSavedRef.current) {
        try {
          const token = await registerForPushNotificationsAsync();
          if (token) {
            await api.savePushToken(token);
            tokenSavedRef.current = true;
          }
        } catch {}
      }
    });

    return () => sub.remove();
  }, []);

  // Navigation logic (FIXED)
  useEffect(() => {
    if (!navigationState?.key || isLoading) return;

    SplashScreen.hideAsync();

    const inLogin = segments[0] === "login";

    if (!agent && !inLogin) {
      router.replace("/login");
      return;
    }

    if (agent?.role === "admin") {
      router.replace("/(admin)");
      return;
    }

    if (agent?.role === "fos") {
      router.replace("/(app)/dashboard");
      return;
    }

    if (agent?.role === "repo") {
      router.replace("/(repo)");
      return;
    }
  }, [agent, isLoading, navigationState?.key]);

  // ✅ CRITICAL FIX: Never return empty
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="(app)" />
      <Stack.Screen name="(admin)" />
      <Stack.Screen name="(repo)" />
      <Stack.Screen name="index" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
  });

  // ✅ Prevent blank screen during font load
  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <StatusBar style="dark" />
          <View style={{ flex: 1 }}>
            <AuthProvider>
              <RootLayoutNav />
            </AuthProvider>
          </View>
        </SafeAreaProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

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

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (__DEV__) return null;

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

  const notificationListener = useRef<any>(null);
  const responseListener = useRef<any>(null);
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

  // Notification listeners
  useEffect(() => {
    notificationListener.current =
      Notifications.addNotificationReceivedListener(() => {});

    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as any;

        if (!agent) return;

        if (data?.screen === "dashboard") {
          router.push("/(app)/dashboard");
        }
      });

    return () => {
      notificationListener.current?.remove?.();
      responseListener.current?.remove?.();
    };
  }, []);

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

  // Navigation logic
  useEffect(() => {
    if (!navigationState?.key) return;

    if (!isLoading) {
      SplashScreen.hideAsync();

      const inLogin = segments[0] === "login";
      const inApp = segments[0] === "(app)";
      const inAdmin = segments[0] === "(admin)";
      const inRepo = segments[0] === "(repo)";

      if (!agent && !inLogin) {
        router.replace("/login");
      } else if (agent?.role === "admin" && !inAdmin) {
        router.replace("/(admin)");
      } else if (agent?.role === "fos" && !inApp) {
        router.replace("/(app)/dashboard");
      } else if (agent?.role === "repo" && !inRepo) {
        router.replace("/(repo)");
      }
    }
  }, [agent, isLoading, navigationState?.key]);

  // ✅ FIXED: Always render something
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {!agent ? (
        <Stack.Screen name="login" />
      ) : agent.role === "admin" ? (
        <Stack.Screen name="(admin)" />
      ) : agent.role === "fos" ? (
        <Stack.Screen name="(app)" />
      ) : (
        <Stack.Screen name="(repo)" />
      )}
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

  // ✅ FIXED: No more blank screen
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

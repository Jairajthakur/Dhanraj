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
  if (__DEV__) {
    console.log("[push] Skipping push registration in dev mode");
    return null;
  }

  if (Platform.OS === "android") {
    try {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF231F7C",
        sound: "default",
      });
    } catch (e: any) {
      console.log("[push] Channel setup failed:", e.message);
    }
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("[push] Permission denied");
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: "1b09251a-4423-4759-a22b-fc2f0a44fd8e",
    });

    console.log("[push] Token:", tokenData.data);
    return tokenData.data;
  } catch (e: any) {
    console.log("[push] Token error:", e.message);
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

  // ✅ Save push token when agent logs in
  useEffect(() => {
    if (!agent || tokenSavedRef.current) return;

    const saveToken = async () => {
      try {
        const token = await registerForPushNotificationsAsync();
        if (token) {
          await api.savePushToken(token);
          tokenSavedRef.current = true;
          console.log("[push] token saved");
        }
      } catch (e) {
        console.log("[push] save token failed");
      }
    };

    saveToken();
  }, [agent]);

  // ✅ Notification listeners — mount once, never re-subscribe
  useEffect(() => {
    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        console.log("[push] received:", notification.request.content.title);
      });

    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as any;

        if (!agent) return;

        if (data?.screen === "dashboard") {
          router.push("/(app)/dashboard");
        }

        if (data?.type === "deposit_required") {
          if (agent.role === "admin") router.push("/(admin)/depositions");
          if (agent.role === "fos") router.push("/(app)/depositions");
        }
      });

    return () => {
      try {
        notificationListener.current?.remove?.();
      } catch {}

      try {
        responseListener.current?.remove?.();
      } catch {}

      notificationListener.current = null;
      responseListener.current = null;
    };
  }, []);

  // ✅ AppState listener — use agentRef to avoid re-subscribing on agent change
  const agentRef = useRef(agent);
  useEffect(() => {
    agentRef.current = agent;
  }, [agent]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", async (state) => {
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

    return () => subscription.remove(); // ✅ Direct call, no optional chaining
  }, []); // ✅ Empty deps — subscribes once only

  // ✅ Navigation/auth redirect
  useEffect(() => {
    if (!navigationState?.key || isLoading) return;

    SplashScreen.hideAsync();

    const inLogin = segments[0] === "login";
    const inApp = segments[0] === "(app)";
    const inAdmin = segments[0] === "(admin)";
    const inRepo = segments[0] === "(repo)";

    if (!agent) {
      if (!inLogin) router.replace("/login");
    } else if (agent.role === "admin" && !inAdmin) {
      router.replace("/(admin)");
    } else if (agent.role === "fos" && !inApp) {
      router.replace("/(app)/dashboard");
    } else if (agent.role === "repo" && !inRepo) {
      router.replace("/(repo)");
    }
  }, [agent, isLoading, navigationState?.key]);

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

  useEffect(() => {
    if (fontsLoaded || fontError) {
      if ((Text as any).defaultProps == null) (Text as any).defaultProps = {};
      (Text as any).defaultProps.style = { fontFamily: "Outfit_400Regular" };
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

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

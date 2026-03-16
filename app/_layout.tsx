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

if (Platform.OS === "web" && typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    if (event.reason?.message?.includes("ms timeout exceeded")) {
      event.preventDefault();
    }
  });
}

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
  // Skip in dev mode
  if (__DEV__) {
    console.log("[push] Skipping: dev mode");
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
      console.error("[push] Failed to set notification channel:", e.message);
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
  } catch (e: any) {
    console.error("[push] Failed to get/request permissions:", e.message);
    return null;
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: "1b09251a-4423-4759-a22b-fc2f0a44fd8e",
    });
    console.log("[push] Expo Token:", tokenData.data);
    return tokenData.data;
  } catch (e: any) {
    console.error("[push] Failed to get Expo token, trying FCM token:", e.message);
    try {
      const deviceToken = await Notifications.getDevicePushTokenAsync();
      console.log("[push] FCM Token:", deviceToken.data);
      return deviceToken.data as string;
    } catch (e2: any) {
      console.error("[push] Failed to get FCM token:", e2.message);
      return null;
    }
  }
}

function RootLayoutNav() {
  const { agent, isLoading } = useAuth();
  const segments = useSegments();
  const navigationState = useRootNavigationState();
  const notificationListener = useRef<any>(null);
  const responseListener = useRef<any>(null);
  const tokenSavedRef = useRef(false);

  useEffect(() => {
    if (!agent) {
      tokenSavedRef.current = false;
      return;
    }
    if (tokenSavedRef.current) return;

    const registerAndSave = async () => {
      try {
        const token = await registerForPushNotificationsAsync();
        if (token) {
          try {
            await api.savePushToken(token);
            tokenSavedRef.current = true;
            console.log("[push] Token saved to server successfully");
          } catch (e: any) {
            console.error("[push] Failed to save token to server:", e.message);
          }
        }
      } catch (e: any) {
        console.error("[push] Failed to register for push notifications:", e.message);
      }
    };

    registerAndSave();
  }, [agent]);

  useEffect(() => {
    // Set up notification listeners
    try {
      notificationListener.current = Notifications.addNotificationReceivedListener(
        (notification) => {
          console.log("[push] Notification received:", notification.request.content.title);
        }
      );
    } catch (e: any) {
      console.error("[push] Failed to add notification listener:", e.message);
    }

    try {
      responseListener.current = Notifications.addNotificationResponseReceivedListener(
        (response) => {
          try {
            const data = response.notification.request.content.data as any;
            console.log("[push] Notification tapped, data:", data);
            if (!agent) return;

            if (data?.screen === "dashboard") {
              if (agent.role === "fos") {
                router.push("/(app)/dashboard" as any);
              }
            } else if (data?.type === "deposit_required" || data?.type === "screenshot_uploaded") {
              if (agent.role === "admin") {
                router.push("/(admin)/depositions" as any);
              } else if (agent.role === "fos") {
                router.push("/(app)/depositions" as any);
              }
            }
          } catch (e: any) {
            console.error("[push] Error handling notification response:", e.message);
          }
        }
      );
    } catch (e: any) {
      console.error("[push] Failed to add response listener:", e.message);
    }

    // ✅ FIX: Safe cleanup that won't crash if removeNotificationSubscription is undefined
    return () => {
      try {
        if (
          notificationListener.current &&
          typeof Notifications.removeNotificationSubscription === "function"
        ) {
          Notifications.removeNotificationSubscription(notificationListener.current);
        }
      } catch (e: any) {
        console.error("[push] Failed to remove notification listener:", e.message);
      }
      try {
        if (
          responseListener.current &&
          typeof Notifications.removeNotificationSubscription === "function"
        ) {
          Notifications.removeNotificationSubscription(responseListener.current);
        }
      } catch (e: any) {
        console.error("[push] Failed to remove response listener:", e.message);
      }
      notificationListener.current = null;
      responseListener.current = null;
    };
  // ✅ FIX: Empty deps array — this effect runs once on mount and cleans up on unmount only
  // Previously had [agent] which caused re-runs and unsafe cleanups on every login/logout
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", async (nextState) => {
      if (nextState === "active" && agent && !tokenSavedRef.current) {
        try {
          const token = await registerForPushNotificationsAsync();
          if (token) {
            try {
              await api.savePushToken(token);
              tokenSavedRef.current = true;
            } catch (_) {
              // Non-critical: silently ignore
            }
          }
        } catch (_) {
          // Non-critical: silently ignore
        }
      }
    });
    return () => subscription.remove();
  }, [agent]);

  useEffect(() => {
    if (!navigationState?.key) return;
    if (isLoading) return;

    SplashScreen.hideAsync();

    const inLogin = segments[0] === "login";
    const inApp = segments[0] === "(app)";
    const inAdmin = segments[0] === "(admin)";
    const inRepo = segments[0] === "(repo)";

    if (!agent) {
      if (!inLogin) {
        router.replace("/login");
      }
    } else if (agent.role === "admin" && !inAdmin) {
      router.replace({ pathname: "/(admin)" } as any);
    } else if (agent.role === "fos" && !inApp) {
      router.replace({ pathname: "/(app)/dashboard" } as any);
    } else if (agent.role === "repo" && !inRepo) {
      router.replace({ pathname: "/(repo)" } as any);
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

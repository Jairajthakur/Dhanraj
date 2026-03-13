import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, router, useSegments, useRootNavigationState } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { Platform, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  useFonts,
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
} from "@expo-google-fonts/outfit";

// Suppress fontfaceobserver timeout unhandled rejections caused by a missing
// try/catch in @expo/vector-icons componentDidMount. The font loads correctly;
// the observer just can't confirm it within 6 s on some browsers.
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

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { agent, isLoading } = useAuth();
  const segments = useSegments();
  const navigationState = useRootNavigationState();

  useEffect(() => {
    // Wait for navigation container to be ready
    if (!navigationState?.key) return;
    // Wait for auth check to complete
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
      // Apply Outfit font globally to all Text components
      if ((Text as any).defaultProps == null) (Text as any).defaultProps = {};
      (Text as any).defaultProps.style = { fontFamily: "Outfit_400Regular" };
    }
  }, [fontsLoaded, fontError]);

  // Keep splash screen visible until fonts are ready
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

import { useEffect } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

// ─── Configure how notifications appear when app is foregrounded ─────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerPushToken(): Promise<string | null> {
  // Push notifications only work on real devices
  if (!Device.isDevice) {
    console.log("[Push] Not a real device — skipping push registration");
    return null;
  }

  // Android channel setup (required for Android 8+)
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
      sound: "default",
    });
  }

  // Request permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("[Push] Permission not granted");
    return null;
  }

  // Get Expo push token
  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      "1b09251a-4423-4759-a22b-fc2f0a44fd8e";

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;
    console.log("[Push] Token:", token);

    // Save to backend
    await api.savePushToken(token);
    console.log("[Push] Token saved to server ✅");
    return token;
  } catch (e: any) {
    console.error("[Push] Failed to get token:", e.message);
    return null;
  }
}

// ─── Hook — must be called inside AuthProvider ────────────────────────────────
// ✅ FIXED: Re-registers token whenever agent logs in
export function usePushNotifications() {
  const { agent } = useAuth();

  useEffect(() => {
    if (Platform.OS === "web") return;

    // Only register when agent is logged in
    if (!agent) return;

    console.log("[Push] Agent logged in, registering push token...");
    registerPushToken();

    // Handle notification tap when app is backgrounded/closed
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      console.log("[Push] Notification tapped:", data);
    });

    return () => sub.remove();
  }, [agent?.id]); // Re-run when agent changes
}

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
  console.log("[Push] Starting registration...");
  console.log("[Push] Platform:", Platform.OS);
  console.log("[Push] Is device:", Device.isDevice);

  if (!Device.isDevice) {
    console.log("[Push] Not a real device — skipping");
    return null;
  }

  // Android channel setup
  if (Platform.OS === "android") {
    try {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF231F7C",
        sound: "default",
      });
      console.log("[Push] Android channel created ✅");
    } catch (e: any) {
      console.error("[Push] Channel creation failed:", e.message);
    }
  }

  // Request permissions
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    console.log("[Push] Existing permission status:", existingStatus);
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
      console.log("[Push] New permission status:", finalStatus);
    }
    if (finalStatus !== "granted") {
      console.log("[Push] Permission denied — cannot register");
      return null;
    }
  } catch (e: any) {
    console.error("[Push] Permission check failed:", e.message);
    return null;
  }

  // Get Expo push token
  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      "1b09251a-4423-4759-a22b-fc2f0a44fd8e";

    console.log("[Push] Using projectId:", projectId);
    console.log("[Push] expoConfig extra:", JSON.stringify(Constants.expoConfig?.extra));

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;
    console.log("[Push] Token received:", token);

    console.log("[Push] Saving token to server...");
    await api.savePushToken(token);
    console.log("[Push] Token saved to server ✅");
    return token;
  } catch (e: any) {
    console.error("[Push] FAILED:", e.message);
    console.error("[Push] Error code:", (e as any)?.code);
    console.error("[Push] Full error:", JSON.stringify(e, Object.getOwnPropertyNames(e)));
    return null;
  }
}

// ─── Hook — must be called inside AuthProvider ────────────────────────────────
export function usePushNotifications() {
  const { agent } = useAuth();

  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!agent) {
      console.log("[Push] No agent — skipping registration");
      return;
    }
    console.log("[Push] Agent logged in:", agent.id, agent.name);
    registerPushToken();

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      console.log("[Push] Notification tapped:", data);
    });

    return () => sub.remove();
  }, [agent?.id]);
}

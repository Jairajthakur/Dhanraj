// context/usePushNotifications.ts
// ✅ Fully rewritten for OneSignal — replaces expo-notifications completely

import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import OneSignal, { NotificationClickEvent } from "react-native-onesignal";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const ONESIGNAL_APP_ID = "bff2c8e0-de24-4aad-a373-d030c210155f";

// ─── Initialize OneSignal once at module level ────────────────────────────────
// This runs when the file is first imported — safe to call once
let initialized = false;

function initOneSignal() {
  if (initialized || Platform.OS === "web") return;
  initialized = true;

  console.log("[OneSignal] Initializing...");
  OneSignal.initialize(ONESIGNAL_APP_ID);

  // Request permission from user (Android 13+ and iOS)
  OneSignal.Notifications.requestPermission(true);

  console.log("[OneSignal] ✅ Initialized");
}

// ─── Hook — must be called inside AuthProvider ────────────────────────────────
export function usePushNotifications() {
  const { agent } = useAuth();
  const savedRef = useRef(false);

  useEffect(() => {
    if (Platform.OS === "web") return;

    // Initialize on first mount
    initOneSignal();

    if (!agent) {
      console.log("[OneSignal] No agent — skipping token save");
      savedRef.current = false;
      return;
    }

    console.log("[OneSignal] Agent logged in:", agent.id, agent.name);

    // ── Save player ID when subscription changes ──────────────────────────
    const handleSubscriptionChange = async (event: any) => {
      const playerId = event?.current?.id;
      if (!playerId) return;

      console.log("[OneSignal] Player ID:", playerId);

      try {
        await api.savePushToken(playerId);
        savedRef.current = true;
        console.log("[OneSignal] ✅ Player ID saved to server");
      } catch (e: any) {
        console.warn("[OneSignal] Failed to save player ID:", e.message);
      }
    };

    OneSignal.User.pushSubscription.addEventListener(
      "change",
      handleSubscriptionChange
    );

    // ── Also try immediately with current ID (already subscribed case) ────
    const currentId = OneSignal.User.pushSubscription.id;
    if (currentId && !savedRef.current) {
      console.log("[OneSignal] Already have player ID:", currentId);
      api.savePushToken(currentId)
        .then(() => {
          savedRef.current = true;
          console.log("[OneSignal] ✅ Existing player ID saved");
        })
        .catch((e: any) => console.warn("[OneSignal] Save failed:", e.message));
    }

    // ── Handle notification tapped while app is open or background ────────
    const handleNotificationClick = (event: NotificationClickEvent) => {
      const data = event.notification.additionalData as any;
      console.log("[OneSignal] Notification tapped:", data);
      // You can add navigation here based on data.screen or data.type
      // Example:
      // if (data?.screen === "deposition") router.push("/(app)/depositions");
    };

    OneSignal.Notifications.addEventListener("click", handleNotificationClick);

    // ── Handle notification received while app is in foreground ──────────
    const handleForegroundWillDisplay = (event: any) => {
      console.log("[OneSignal] Notification received in foreground:", event?.notification?.title);
      // Call event.preventDefault() here if you want to suppress display
      // By default OneSignal shows it automatically
    };

    OneSignal.Notifications.addEventListener(
      "foregroundWillDisplay",
      handleForegroundWillDisplay
    );

    // ── Cleanup ───────────────────────────────────────────────────────────
    return () => {
      OneSignal.User.pushSubscription.removeEventListener(
        "change",
        handleSubscriptionChange
      );
      OneSignal.Notifications.removeEventListener("click", handleNotificationClick);
      OneSignal.Notifications.removeEventListener(
        "foregroundWillDisplay",
        handleForegroundWillDisplay
      );
    };
  }, [agent?.id]);
}

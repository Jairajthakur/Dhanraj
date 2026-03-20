// context/usePushNotifications.ts
// ✅ Fixed: robust OneSignal init with proper error handling

import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

// ✅ FIXED: Read App ID from Expo Constants so it works at runtime
// Falls back to hardcoded value if not in config
const ONESIGNAL_APP_ID =
  Constants.expoConfig?.extra?.oneSignalAppId ||
  "bff2c8e0-de24-4aad-a373-d030c210155f";

// ─── Lazy import OneSignal to prevent crash if native module missing ──────────
function getOneSignal() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const OneSignal = require("react-native-onesignal").default;
    return OneSignal;
  } catch (e) {
    console.warn("[OneSignal] Native module not available:", e);
    return null;
  }
}

// ─── Initialize OneSignal once ────────────────────────────────────────────────
let initialized = false;

function initOneSignal(): boolean {
  if (initialized || Platform.OS === "web") return false;

  const OneSignal = getOneSignal();
  if (!OneSignal) return false;

  try {
    initialized = true;
    console.log("[OneSignal] Initializing with App ID:", ONESIGNAL_APP_ID);
    OneSignal.initialize(ONESIGNAL_APP_ID);

    // ✅ FIXED: Small delay before requesting permission to avoid ANR on startup
    setTimeout(() => {
      try {
        OneSignal.Notifications.requestPermission(true);
        console.log("[OneSignal] ✅ Permission requested");
      } catch (e) {
        console.warn("[OneSignal] Permission request failed:", e);
      }
    }, 1500);

    console.log("[OneSignal] ✅ Initialized");
    return true;
  } catch (e) {
    console.error("[OneSignal] Initialization error:", e);
    initialized = false;
    return false;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function usePushNotifications() {
  const { agent } = useAuth();
  const savedRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") return;

    // ✅ FIXED: Initialize on mount with error boundary
    initOneSignal();

    if (!agent) {
      console.log("[OneSignal] No agent — skipping token save");
      savedRef.current = false;
      return;
    }

    console.log("[OneSignal] Setting up for agent:", agent.id, agent.name);

    const OneSignal = getOneSignal();
    if (!OneSignal) return;

    // ── Save player ID when subscription changes ──────────────────────────
    const handleSubscriptionChange = async (event: any) => {
      const playerId = event?.current?.id ?? event?.to?.id;
      if (!playerId) {
        console.log("[OneSignal] Subscription change — no player ID yet");
        return;
      }

      console.log("[OneSignal] Player ID from subscription change:", playerId);

      try {
        await api.savePushToken(playerId);
        savedRef.current = true;
        console.log("[OneSignal] ✅ Player ID saved to server");
      } catch (e: any) {
        console.warn("[OneSignal] Failed to save player ID:", e.message);
      }
    };

    // ── Try with current ID immediately ──────────────────────────────────
    const trySaveCurrentId = async () => {
      try {
        const currentId = OneSignal.User?.pushSubscription?.id;
        if (currentId && !savedRef.current) {
          console.log("[OneSignal] Already subscribed, saving player ID:", currentId);
          await api.savePushToken(currentId);
          savedRef.current = true;
          console.log("[OneSignal] ✅ Existing player ID saved");
        }
      } catch (e: any) {
        console.warn("[OneSignal] Failed to save existing player ID:", e.message);
      }
    };

    // ✅ FIXED: Retry saving current ID after a short delay
    // (subscription may not be ready immediately)
    const retryTimer = setTimeout(trySaveCurrentId, 3000);

    // ── Register listeners ────────────────────────────────────────────────
    try {
      OneSignal.User?.pushSubscription?.addEventListener(
        "change",
        handleSubscriptionChange
      );
    } catch (e) {
      console.warn("[OneSignal] Could not add subscription listener:", e);
    }

    // Handle notification tap
    const handleNotificationClick = (event: any) => {
      try {
        const data = event?.notification?.additionalData as any;
        console.log("[OneSignal] Notification tapped:", data);
      } catch (e) {
        console.warn("[OneSignal] Notification click handler error:", e);
      }
    };

    // Handle foreground notifications
    const handleForegroundWillDisplay = (event: any) => {
      try {
        console.log(
          "[OneSignal] Foreground notification:",
          event?.notification?.title
        );
        // ✅ Display the notification even when app is in foreground
        // event.preventDefault() would suppress it
      } catch (e) {
        console.warn("[OneSignal] Foreground handler error:", e);
      }
    };

    try {
      OneSignal.Notifications?.addEventListener("click", handleNotificationClick);
      OneSignal.Notifications?.addEventListener(
        "foregroundWillDisplay",
        handleForegroundWillDisplay
      );
    } catch (e) {
      console.warn("[OneSignal] Could not add notification listeners:", e);
    }

    // ── Cleanup ───────────────────────────────────────────────────────────
    cleanupRef.current = () => {
      clearTimeout(retryTimer);
      try {
        OneSignal.User?.pushSubscription?.removeEventListener(
          "change",
          handleSubscriptionChange
        );
        OneSignal.Notifications?.removeEventListener(
          "click",
          handleNotificationClick
        );
        OneSignal.Notifications?.removeEventListener(
          "foregroundWillDisplay",
          handleForegroundWillDisplay
        );
      } catch (e) {
        console.warn("[OneSignal] Cleanup error:", e);
      }
    };

    return () => {
      clearTimeout(retryTimer);
      cleanupRef.current?.();
    };
  }, [agent?.id]);
}

// context/usePushNotifications.ts
// ✅ Compatible with New Architecture (newArchEnabled: true)
// ✅ Exports registerPushToken() for use in AuthContext

import { useEffect, useRef } from "react";
import { Platform, InteractionManager } from "react-native";
import Constants from "expo-constants";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const ONESIGNAL_APP_ID =
  Constants.expoConfig?.extra?.oneSignalAppId ||
  "bff2c8e0-de24-4aad-a373-d030c210155f";

// ─── Lazy import to avoid crash if module not linked ─────────────────────────
function getOneSignal() {
  try {
    const OneSignal = require("react-native-onesignal").default;
    return OneSignal;
  } catch (e) {
    console.warn("[OneSignal] Native module not available:", e);
    return null;
  }
}

// ─── Initialize once, deferred so it doesn't block the JS bridge ─────────────
let initialized = false;

function initOneSignal() {
  if (initialized || Platform.OS === "web") return;

  const OneSignal = getOneSignal();
  if (!OneSignal) return;

  // ✅ Defer until after all startup interactions complete
  // Prevents blank screen on New Architecture builds
  InteractionManager.runAfterInteractions(() => {
    try {
      initialized = true;
      console.log("[OneSignal] Initializing (deferred)...");
      OneSignal.initialize(ONESIGNAL_APP_ID);
      console.log("[OneSignal] ✅ Initialized");

      // Request permission after bridge fully settles
      setTimeout(() => {
        try {
          OneSignal.Notifications.requestPermission(true);
          console.log("[OneSignal] ✅ Permission requested");
        } catch (e) {
          console.warn("[OneSignal] Permission request failed:", e);
        }
      }, 2000);
    } catch (e) {
      console.error("[OneSignal] Init error:", e);
      initialized = false;
    }
  });
}

// ─── Exported: called from AuthContext after login / app launch ───────────────
export async function registerPushToken(): Promise<void> {
  if (Platform.OS === "web") return;

  const OneSignal = getOneSignal();
  if (!OneSignal) return;

  // Retry up to 5 times with 2s gap — waits for subscription to be ready
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const playerId = OneSignal.User?.pushSubscription?.id;
      if (playerId) {
        await api.savePushToken(playerId);
        console.log(`[OneSignal] ✅ Player ID saved (attempt ${attempt}):`, playerId);
        return;
      }
    } catch (e: any) {
      console.warn(`[OneSignal] Save attempt ${attempt} failed:`, e.message);
    }
    if (attempt < 5) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  console.warn("[OneSignal] Could not get player ID after 5 attempts");
}

// ─── Hook — used in root _layout.tsx ─────────────────────────────────────────
export function usePushNotifications() {
  const { agent } = useAuth();
  const savedRef = useRef(false);

  useEffect(() => {
    if (Platform.OS === "web") return;

    // Init OneSignal deferred (non-blocking — won't cause blank screen)
    initOneSignal();

    if (!agent) {
      savedRef.current = false;
      return;
    }

    const OneSignal = getOneSignal();
    if (!OneSignal) return;

    console.log("[OneSignal] Agent ready:", agent.id, agent.name);

    // ── Listen for subscription changes ───────────────────────────────────
    const handleSubscriptionChange = async (event: any) => {
      const playerId = event?.current?.id ?? event?.to?.id;
      if (!playerId) return;
      console.log("[OneSignal] New subscription ID:", playerId);
      try {
        await api.savePushToken(playerId);
        savedRef.current = true;
        console.log("[OneSignal] ✅ Player ID saved via subscription change");
      } catch (e: any) {
        console.warn("[OneSignal] Subscription change save failed:", e.message);
      }
    };

    // ── Try saving existing ID after bridge settles ───────────────────────
    const retryTimer = setTimeout(async () => {
      if (savedRef.current) return;
      try {
        await registerPushToken();
        savedRef.current = true;
      } catch (e: any) {
        console.warn("[OneSignal] Delayed save failed:", e.message);
      }
    }, 5000);

    // ── Notification listeners ────────────────────────────────────────────
    const handleClick = (event: any) => {
      console.log("[OneSignal] Notification tapped:", event?.notification?.additionalData);
    };

    const handleForeground = (event: any) => {
      console.log("[OneSignal] Foreground notification:", event?.notification?.title);
    };

    try {
      OneSignal.User?.pushSubscription?.addEventListener("change", handleSubscriptionChange);
      OneSignal.Notifications?.addEventListener("click", handleClick);
      OneSignal.Notifications?.addEventListener("foregroundWillDisplay", handleForeground);
    } catch (e) {
      console.warn("[OneSignal] Could not add listeners:", e);
    }

    return () => {
      clearTimeout(retryTimer);
      try {
        OneSignal.User?.pushSubscription?.removeEventListener("change", handleSubscriptionChange);
        OneSignal.Notifications?.removeEventListener("click", handleClick);
        OneSignal.Notifications?.removeEventListener("foregroundWillDisplay", handleForeground);
      } catch (e) {
        console.warn("[OneSignal] Cleanup error:", e);
      }
    };
  }, [agent?.id]);
}

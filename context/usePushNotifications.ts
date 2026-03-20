// context/usePushNotifications.ts
// ✅ Complete rewrite — fixes token never registering on New Architecture
// Root cause: OneSignal.User?.pushSubscription?.id doesn't work the same way
// on react-native-onesignal v5+ with New Architecture

import { useEffect, useRef } from "react";
import { Platform, InteractionManager, PermissionsAndroid } from "react-native";
import Constants from "expo-constants";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const ONESIGNAL_APP_ID =
  Constants.expoConfig?.extra?.oneSignalAppId ||
  "bff2c8e0-de24-4aad-a373-d030c210155f";

// ─── Get OneSignal safely ─────────────────────────────────────────────────────
function getOneSignal() {
  try {
    return require("react-native-onesignal").default;
  } catch (e) {
    console.warn("[OneSignal] Native module not available");
    return null;
  }
}

// ─── Android 13+ permission ───────────────────────────────────────────────────
async function requestAndroid13Permission(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  try {
    // @ts-ignore
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      {
        title: "Notification Permission",
        message: "Dhanraj Enterprises needs permission to send you case updates and reminders.",
        buttonPositive: "Allow",
        buttonNegative: "Deny",
      }
    );
    const allowed = granted === PermissionsAndroid.RESULTS.GRANTED;
    console.log("[Push] Android 13 POST_NOTIFICATIONS:", allowed ? "✅ GRANTED" : "❌ DENIED");
    return allowed;
  } catch (e) {
    console.warn("[Push] Permission error:", e);
    return false;
  }
}

// ─── Init state ───────────────────────────────────────────────────────────────
let initialized = false;
let initPromise: Promise<void> | null = null;

function ensureInit(): Promise<void> {
  if (Platform.OS === "web") return Promise.resolve();
  if (initialized) return Promise.resolve();
  if (initPromise) return initPromise;

  initPromise = new Promise<void>((resolve) => {
    const OneSignal = getOneSignal();
    if (!OneSignal) { resolve(); return; }

    InteractionManager.runAfterInteractions(async () => {
      try {
        console.log("[OneSignal] Initializing with App ID:", ONESIGNAL_APP_ID);
        OneSignal.initialize(ONESIGNAL_APP_ID);
        initialized = true;
        console.log("[OneSignal] ✅ Initialized");

        // Android 13+ system permission
        const granted = await requestAndroid13Permission();
        console.log("[OneSignal] System permission granted:", granted);

        // OneSignal permission (handles iOS too)
        await new Promise(r => setTimeout(r, 1000));
        try {
          await OneSignal.Notifications.requestPermission(true);
          console.log("[OneSignal] ✅ Notification permission requested");
        } catch (e) {
          console.warn("[OneSignal] requestPermission error:", e);
        }
      } catch (e) {
        console.error("[OneSignal] Init failed:", e);
        initialized = false;
        initPromise = null;
      } finally {
        resolve();
      }
    });
  });

  return initPromise;
}

// ─── Get player ID using ALL possible API paths ───────────────────────────────
// Different versions of react-native-onesignal expose the ID differently
function getPlayerId(OneSignal: any): string | null {
  try {
    // v5+ New Architecture path
    const id1 = OneSignal?.User?.pushSubscription?.id;
    if (id1 && typeof id1 === "string" && id1.length > 10) {
      console.log("[OneSignal] Got ID via User.pushSubscription.id:", id1.slice(0, 20));
      return id1;
    }

    // v5+ alternative path
    const id2 = OneSignal?.User?.pushSubscription?.token;
    if (id2 && typeof id2 === "string" && id2.length > 10) {
      console.log("[OneSignal] Got ID via User.pushSubscription.token:", id2.slice(0, 20));
      return id2;
    }

    // v4 legacy path
    const id3 = OneSignal?.getDeviceState?.()?.userId;
    if (id3 && typeof id3 === "string" && id3.length > 10) {
      console.log("[OneSignal] Got ID via getDeviceState().userId:", id3.slice(0, 20));
      return id3;
    }

    // v5 async path — returns promise, handled separately
    console.log("[OneSignal] pushSubscription object:", JSON.stringify({
      id: OneSignal?.User?.pushSubscription?.id,
      token: OneSignal?.User?.pushSubscription?.token,
      optedIn: OneSignal?.User?.pushSubscription?.optedIn,
    }));

    return null;
  } catch (e) {
    console.warn("[OneSignal] getPlayerId error:", e);
    return null;
  }
}

// ─── Exported: save token to your server ─────────────────────────────────────
export async function registerPushToken(): Promise<void> {
  if (Platform.OS === "web") return;

  console.log("[OneSignal] registerPushToken() called");

  // Wait for init first
  await ensureInit();

  const OneSignal = getOneSignal();
  if (!OneSignal) {
    console.warn("[OneSignal] No OneSignal module");
    return;
  }

  // Poll for player ID — try every 3 seconds for up to 60 seconds
  const maxAttempts = 20;
  const delayMs = 3000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`[OneSignal] Token attempt ${attempt}/${maxAttempts}`);

    const playerId = getPlayerId(OneSignal);

    if (playerId) {
      try {
        await api.savePushToken(playerId);
        console.log(`[OneSignal] ✅ Token saved on attempt ${attempt}:`, playerId.slice(0, 20) + "...");
        return;
      } catch (e: any) {
        console.warn(`[OneSignal] API save failed on attempt ${attempt}:`, e.message);
      }
    }

    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  console.warn("[OneSignal] ❌ Failed to get player ID after", maxAttempts, "attempts");
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function usePushNotifications() {
  const { agent } = useAuth();
  const savedRef = useRef(false);
  const agentIdRef = useRef<number | null>(null);

  // Init OneSignal on mount
  useEffect(() => {
    if (Platform.OS === "web") return;
    ensureInit();
  }, []);

  // Register token whenever agent changes
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!agent) {
      savedRef.current = false;
      agentIdRef.current = null;
      return;
    }

    // Skip if same agent already saved
    if (agentIdRef.current === agent.id && savedRef.current) {
      console.log("[OneSignal] Same agent, token already saved");
      return;
    }

    agentIdRef.current = agent.id;
    savedRef.current = false;

    console.log("[OneSignal] Agent changed to:", agent.id, agent.name, "— registering token");

    const OneSignal = getOneSignal();
    if (!OneSignal) return;

    // ── Subscription change listener ──────────────────────────────────────
    const handleSubscriptionChange = async (event: any) => {
      console.log("[OneSignal] Subscription changed:", JSON.stringify(event));
      // Try all possible paths in the event
      const playerId =
        event?.current?.id ||
        event?.current?.token ||
        event?.to?.id ||
        event?.to?.token ||
        event?.id ||
        event?.token;

      if (!playerId) {
        console.warn("[OneSignal] No player ID in subscription change event");
        return;
      }

      console.log("[OneSignal] New player ID from event:", playerId.slice(0, 20));
      try {
        await api.savePushToken(playerId);
        savedRef.current = true;
        console.log("[OneSignal] ✅ Token saved via subscription change");
      } catch (e: any) {
        console.warn("[OneSignal] Token save failed:", e.message);
      }
    };

    try {
      OneSignal.User?.pushSubscription?.addEventListener("change", handleSubscriptionChange);
    } catch (e) {
      console.warn("[OneSignal] Could not add subscription listener:", e);
    }

    // ── Also actively poll for the token ─────────────────────────────────
    // Don't wait — start polling immediately in background
    registerPushToken().then(() => {
      savedRef.current = true;
    }).catch((e) => {
      console.warn("[OneSignal] registerPushToken failed:", e?.message);
    });

    // ── Notification listeners ────────────────────────────────────────────
    const handleClick = (event: any) => {
      console.log("[OneSignal] Notification tapped:", event?.notification?.additionalData);
    };

    const handleForeground = (event: any) => {
      console.log("[OneSignal] Foreground notification:", event?.notification?.title);
    };

    try {
      OneSignal.Notifications?.addEventListener("click", handleClick);
      OneSignal.Notifications?.addEventListener("foregroundWillDisplay", handleForeground);
    } catch (e) {
      console.warn("[OneSignal] Could not add notification listeners:", e);
    }

    return () => {
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

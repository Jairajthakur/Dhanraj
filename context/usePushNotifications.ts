// context/usePushNotifications.ts
// ✅ FINAL FIX based on debug output:
// - onesignalId EXISTS: "bfbaafc6-4a07-4fa8-9807-ab99ceb96fcb"
// - pushToken is null because user is NOT opted in
// - optIn() IS available
// - getToken() does NOT exist in this version
// SOLUTION: call optIn() then save onesignalId as the push token

import { useEffect, useRef } from "react";
import { Platform, InteractionManager, PermissionsAndroid } from "react-native";
import Constants from "expo-constants";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const ONESIGNAL_APP_ID =
  Constants.expoConfig?.extra?.oneSignalAppId ||
  "bff2c8e0-de24-4aad-a373-d030c210155f";

// ─── Get OneSignal (named export in v5) ──────────────────────────────────────
function getOneSignal() {
  try {
    const mod = require("react-native-onesignal");
    const OS = mod?.OneSignal ?? mod?.default ?? mod;
    if (!OS?.initialize) {
      console.warn("[OneSignal] Module found but missing initialize()");
      return null;
    }
    return OS;
  } catch (e) {
    console.warn("[OneSignal] Import failed:", e);
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
        message: "Dhanraj Enterprises needs permission to send you case updates.",
        buttonPositive: "Allow",
        buttonNegative: "Deny",
      }
    );
    const allowed = granted === PermissionsAndroid.RESULTS.GRANTED;
    console.log("[Push] Android 13:", allowed ? "✅ GRANTED" : "❌ DENIED");
    return allowed;
  } catch (e) {
    console.warn("[Push] Permission error:", e);
    return false;
  }
}

// ─── Get the player ID to save as push token ─────────────────────────────────
// From debug: onesignalId works, getToken() does NOT exist
// So we use getOnesignalId() — this IS the identifier OneSignal uses
async function getOnesignalPlayerId(OneSignal: any): Promise<string | null> {
  try {
    // ✅ PRIMARY: getOnesignalId() — confirmed working from debug
    if (typeof OneSignal.User?.getOnesignalId === "function") {
      const id = await OneSignal.User.getOnesignalId();
      if (id && id.length > 5) {
        console.log("[OneSignal] ✅ Got onesignalId:", id.slice(0, 20) + "...");
        return id;
      }
    }
    console.log("[OneSignal] getOnesignalId returned null/empty");
    return null;
  } catch (e: any) {
    console.warn("[OneSignal] getOnesignalId error:", e.message);
    return null;
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
        console.log("[OneSignal] Initializing...");
        OneSignal.initialize(ONESIGNAL_APP_ID);
        initialized = true;
        console.log("[OneSignal] ✅ Initialized");

        // Step 1: Android 13 system permission
        await requestAndroid13Permission();
        await new Promise((r) => setTimeout(r, 500));

        // Step 2: OneSignal permission request
        try {
          await OneSignal.Notifications.requestPermission(true);
          console.log("[OneSignal] ✅ Notification permission requested");
        } catch (e) {
          console.warn("[OneSignal] requestPermission error:", e);
        }

        await new Promise((r) => setTimeout(r, 500));

        // ✅ Step 3: Opt in — CRITICAL, this is what was missing
        // Debug showed optedIn: undefined, meaning user was never opted in
        try {
          await OneSignal.User.pushSubscription.optIn();
          console.log("[OneSignal] ✅ Push subscription opted in");
        } catch (e) {
          console.warn("[OneSignal] optIn error:", e);
        }
      } catch (e) {
        console.error("[OneSignal] Init error:", e);
        initialized = false;
        initPromise = null;
      } finally {
        resolve();
      }
    });
  });

  return initPromise;
}

// ─── Save token to server ─────────────────────────────────────────────────────
export async function registerPushToken(): Promise<void> {
  if (Platform.OS === "web") return;

  console.log("[OneSignal] registerPushToken() called");
  await ensureInit();

  const OneSignal = getOneSignal();
  if (!OneSignal) return;

  // Poll every 3s for up to 60s
  // After optIn(), OneSignal registers with its servers — this takes a few seconds
  const maxAttempts = 20;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`[OneSignal] Attempt ${attempt}/${maxAttempts}`);

    // ✅ Ensure opted in on every attempt (in case it wasn't ready during init)
    try {
      await OneSignal.User.pushSubscription.optIn();
    } catch (_) {}

    const playerId = await getOnesignalPlayerId(OneSignal);

    if (playerId) {
      try {
        await api.savePushToken(playerId);
        console.log(`[OneSignal] ✅ Token saved on attempt ${attempt}:`, playerId.slice(0, 20) + "...");
        return;
      } catch (e: any) {
        console.warn("[OneSignal] Server save failed:", e.message);
        // Got the ID but server save failed — retry
      }
    }

    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  console.warn("[OneSignal] ❌ Could not save token after", maxAttempts, "attempts");
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function usePushNotifications() {
  const { agent } = useAuth();
  const savedRef = useRef(false);
  const agentIdRef = useRef<number | null>(null);

  // Init on mount
  useEffect(() => {
    if (Platform.OS === "web") return;
    ensureInit();
  }, []);

  // Register token when agent changes
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!agent) {
      savedRef.current = false;
      agentIdRef.current = null;
      return;
    }

    // Skip if same agent already saved
    if (agentIdRef.current === agent.id && savedRef.current) {
      console.log("[OneSignal] Same agent, already saved");
      return;
    }

    agentIdRef.current = agent.id;
    savedRef.current = false;
    console.log("[OneSignal] Agent:", agent.id, agent.name);

    const OneSignal = getOneSignal();
    if (!OneSignal) return;

    // Listen for subscription changes
    const handleSubscriptionChange = async (event: any) => {
      console.log("[OneSignal] Subscription event:", JSON.stringify(event));
      // Try getting onesignalId after any subscription change
      const id = await getOnesignalPlayerId(OneSignal);
      if (id) {
        try {
          await api.savePushToken(id);
          savedRef.current = true;
          console.log("[OneSignal] ✅ Token saved via subscription change");
        } catch (e: any) {
          console.warn("[OneSignal] Event save failed:", e.message);
        }
      }
    };

    try {
      OneSignal.User?.pushSubscription?.addEventListener("change", handleSubscriptionChange);
    } catch (e) {
      console.warn("[OneSignal] Listener error:", e);
    }

    // Start registration immediately
    registerPushToken()
      .then(() => { savedRef.current = true; })
      .catch((e) => console.warn("[OneSignal] registerPushToken error:", e?.message));

    const handleClick = (event: any) => {
      console.log("[OneSignal] Notification tapped:", event?.notification?.additionalData);
    };
    const handleForeground = (event: any) => {
      console.log("[OneSignal] Foreground:", event?.notification?.title);
    };

    try {
      OneSignal.Notifications?.addEventListener("click", handleClick);
      OneSignal.Notifications?.addEventListener("foregroundWillDisplay", handleForeground);
    } catch (e) {
      console.warn("[OneSignal] Notification listener error:", e);
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

// context/usePushNotifications.ts
// ✅ FIXED: Always re-registers push token on every app launch / agent login
// so if token is deleted from DB it gets picked up again automatically.

import { useEffect, useRef } from "react";
import { Platform, InteractionManager, PermissionsAndroid } from "react-native";
import Constants from "expo-constants";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const ONESIGNAL_APP_ID =
  Constants.expoConfig?.extra?.oneSignalAppId ||
  "bff2c8e0-de24-4aad-a373-d030c210155f";

// ─── Get OneSignal ────────────────────────────────────────────────────────────
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

// ─── Get OneSignal player ID ──────────────────────────────────────────────────
async function getOnesignalPlayerId(OneSignal: any): Promise<string | null> {
  try {
    if (typeof OneSignal.User?.getOnesignalId === "function") {
      const id = await OneSignal.User.getOnesignalId();
      if (id && id.length > 5) {
        console.log("[OneSignal] ✅ Got onesignalId:", id.slice(0, 20) + "...");
        return id;
      }
    }
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

        await requestAndroid13Permission();
        await new Promise((r) => setTimeout(r, 500));

        try {
          await OneSignal.Notifications.requestPermission(true);
          console.log("[OneSignal] ✅ Notification permission requested");
        } catch (e) {
          console.warn("[OneSignal] requestPermission error:", e);
        }

        await new Promise((r) => setTimeout(r, 500));

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

  const maxAttempts = 20;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`[OneSignal] Attempt ${attempt}/${maxAttempts}`);

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
  const agentIdRef = useRef<number | null>(null);

  // Init on mount
  useEffect(() => {
    if (Platform.OS === "web") return;
    ensureInit();
  }, []);

  // ✅ FIX: Register token on EVERY agent load — no savedRef guard
  // This ensures if token is deleted from DB, it gets re-saved on next app open
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!agent) {
      agentIdRef.current = null;
      return;
    }

    agentIdRef.current = agent.id;
    console.log("[OneSignal] Agent:", agent.id, agent.name, "— registering token...");

    const OneSignal = getOneSignal();
    if (!OneSignal) return;

    // Listen for subscription changes (token refreshes)
    const handleSubscriptionChange = async (event: any) => {
      console.log("[OneSignal] Subscription changed:", JSON.stringify(event));
      const id = await getOnesignalPlayerId(OneSignal);
      if (id) {
        try {
          await api.savePushToken(id);
          console.log("[OneSignal] ✅ Token re-saved via subscription change");
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

    // ✅ Always attempt registration — no guard so deleted tokens get restored
    registerPushToken().catch((e) =>
      console.warn("[OneSignal] registerPushToken error:", e?.message)
    );

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
  }, [agent?.id]); // ✅ Runs every time agent changes — always re-registers
}

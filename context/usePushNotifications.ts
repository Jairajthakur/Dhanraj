// context/usePushNotifications.ts
// ✅ Works on both APK and Web
// ✅ Always re-registers token on every login — deleted tokens auto-restore

import { useEffect, useRef } from "react";
import { Platform, InteractionManager, PermissionsAndroid } from "react-native";
import Constants from "expo-constants";
import { getApiUrl } from "@/lib/query-client";
import { tokenStore } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const ONESIGNAL_APP_ID =
  Constants.expoConfig?.extra?.oneSignalAppId ||
  "bff2c8e0-de24-4aad-a373-d030c210155f";

// ─── Save token directly to server ───────────────────────────────────────────
async function savePushTokenToServer(playerId: string): Promise<void> {
  const base = getApiUrl();
  const authToken = Platform.OS !== "web" ? await tokenStore.get() : null;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

  const res = await fetch(`${base}/api/push-token`, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({ token: playerId }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`);
  console.log("[OneSignal] ✅ Server confirmed token saved:", json);
}

// ─── Get OneSignal module (native only) ──────────────────────────────────────
function getOneSignal() {
  if (Platform.OS === "web") return null;
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

// ─── Android 13+ notification permission ─────────────────────────────────────
async function requestAndroid13Permission(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  try {
    // @ts-ignore — POST_NOTIFICATIONS added in Android 13
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

// ─── Get OneSignal player/subscription ID ────────────────────────────────────
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

// ─── One-time init guard ──────────────────────────────────────────────────────
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
          console.log("[OneSignal] ✅ Permission requested");
        } catch (e) {
          console.warn("[OneSignal] requestPermission error:", e);
        }

        await new Promise((r) => setTimeout(r, 500));

        try {
          await OneSignal.User.pushSubscription.optIn();
          console.log("[OneSignal] ✅ Opted in");
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

// ─── Register push token (polls until available) ──────────────────────────────
export async function registerPushToken(): Promise<void> {
  if (Platform.OS === "web") return;

  console.log("[OneSignal] registerPushToken() called");
  await ensureInit();

  const OneSignal = getOneSignal();
  if (!OneSignal) return;

  const maxAttempts = 20;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`[OneSignal] Attempt ${attempt}/${maxAttempts}`);

    try { await OneSignal.User.pushSubscription.optIn(); } catch (_) {}

    const playerId = await getOnesignalPlayerId(OneSignal);

    if (playerId) {
      try {
        await savePushTokenToServer(playerId);
        console.log(`[OneSignal] ✅ Token saved on attempt ${attempt}`);
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

// ─── Hook — call inside RootLayoutNav ────────────────────────────────────────
export function usePushNotifications() {
  const { agent } = useAuth();
  const agentIdRef = useRef<number | null>(null);

  // Init OneSignal on mount (native only)
  useEffect(() => {
    if (Platform.OS === "web") return;
    ensureInit();
  }, []);

  // ✅ Register token every time agent loads — no savedRef guard
  // This means deleted tokens are always restored on next app open/login
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!agent) {
      agentIdRef.current = null;
      return;
    }

    agentIdRef.current = agent.id;
    console.log("[OneSignal] Agent logged in:", agent.id, agent.name);

    const OneSignal = getOneSignal();
    if (!OneSignal) return;

    // Re-save token if OneSignal refreshes it
    const handleSubscriptionChange = async (event: any) => {
      console.log("[OneSignal] Subscription changed:", JSON.stringify(event));
      const id = await getOnesignalPlayerId(OneSignal);
      if (id) {
        try {
          await savePushTokenToServer(id);
          console.log("[OneSignal] ✅ Token re-saved via subscription change");
        } catch (e: any) {
          console.warn("[OneSignal] Re-save failed:", e.message);
        }
      }
    };

    try {
      OneSignal.User?.pushSubscription?.addEventListener("change", handleSubscriptionChange);
    } catch (e) {
      console.warn("[OneSignal] Listener setup error:", e);
    }

    // Always register — no guard — so deleted tokens restore automatically
    registerPushToken().catch((e) =>
      console.warn("[OneSignal] registerPushToken error:", e?.message)
    );

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
  }, [agent?.id]); // Runs on every agent change — always re-registers
}

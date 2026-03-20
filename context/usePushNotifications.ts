// context/usePushNotifications.ts
// ✅ Fixed: correct import for react-native-onesignal v5.2.5
// The module does NOT use .default — import named exports directly

import { useEffect, useRef } from "react";
import { Platform, InteractionManager, PermissionsAndroid } from "react-native";
import Constants from "expo-constants";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const ONESIGNAL_APP_ID =
  Constants.expoConfig?.extra?.oneSignalAppId ||
  "bff2c8e0-de24-4aad-a373-d030c210155f";

// ─── Correct import for react-native-onesignal v5 ────────────────────────────
// v5 exports: { OneSignal, LogLevel, OSNotification, ... }
// NOT a default export — must use named import
function getOneSignal() {
  try {
    const mod = require("react-native-onesignal");
    // v5 named export
    if (mod?.OneSignal) {
      return mod.OneSignal;
    }
    // fallback: default export (older builds)
    if (mod?.default) {
      return mod.default;
    }
    // fallback: module itself
    if (mod?.initialize) {
      return mod;
    }
    console.warn("[OneSignal] Could not find OneSignal in module:", Object.keys(mod || {}));
    return null;
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

// ─── Get player ID — all possible v5 paths ───────────────────────────────────
async function getPlayerIdV5(OneSignal: any): Promise<string | null> {
  try {
    // v5 primary async method
    if (typeof OneSignal?.User?.getOnesignalId === "function") {
      const id = await OneSignal.User.getOnesignalId();
      if (id && id.length > 5) {
        console.log("[OneSignal] ID via getOnesignalId():", id.slice(0, 20));
        return id;
      }
    }

    // v5 push token async
    if (typeof OneSignal?.User?.pushSubscription?.getToken === "function") {
      const token = await OneSignal.User.pushSubscription.getToken();
      if (token && token.length > 5) {
        console.log("[OneSignal] ID via pushSubscription.getToken():", token.slice(0, 20));
        return token;
      }
    }

    // v5 sync fallbacks
    const syncId = OneSignal?.User?.pushSubscription?.id;
    if (syncId && typeof syncId === "string" && syncId.length > 5) {
      console.log("[OneSignal] ID via pushSubscription.id (sync):", syncId.slice(0, 20));
      return syncId;
    }

    console.log("[OneSignal] No ID found yet. optedIn:", OneSignal?.User?.pushSubscription?.optedIn);
    return null;
  } catch (e: any) {
    console.warn("[OneSignal] getPlayerId error:", e.message);
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
    if (!OneSignal) {
      console.warn("[OneSignal] Module not available — skipping init");
      resolve();
      return;
    }

    InteractionManager.runAfterInteractions(async () => {
      try {
        console.log("[OneSignal] Initializing v5 (named export)...");
        OneSignal.initialize(ONESIGNAL_APP_ID);
        initialized = true;
        console.log("[OneSignal] ✅ Initialized");

        // Android 13 system permission
        await requestAndroid13Permission();

        // OneSignal permission request
        await new Promise((r) => setTimeout(r, 1000));
        try {
          await OneSignal.Notifications.requestPermission(true);
          console.log("[OneSignal] ✅ Permission requested");
        } catch (e) {
          console.warn("[OneSignal] requestPermission error:", e);
        }

        // Opt in to push (required in v5)
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

// ─── Exported: save token to server ──────────────────────────────────────────
export async function registerPushToken(): Promise<void> {
  if (Platform.OS === "web") return;

  console.log("[OneSignal] registerPushToken() starting...");
  await ensureInit();

  const OneSignal = getOneSignal();
  if (!OneSignal) return;

  const maxAttempts = 20;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`[OneSignal] Token attempt ${attempt}/${maxAttempts}`);
    const playerId = await getPlayerIdV5(OneSignal);
    if (playerId) {
      try {
        await api.savePushToken(playerId);
        console.log(`[OneSignal] ✅ Token saved (attempt ${attempt}):`, playerId.slice(0, 20) + "...");
        return;
      } catch (e: any) {
        console.warn(`[OneSignal] Server save failed:`, e.message);
      }
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  console.warn("[OneSignal] ❌ Failed after", maxAttempts, "attempts");
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function usePushNotifications() {
  const { agent } = useAuth();
  const savedRef = useRef(false);
  const agentIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") return;
    ensureInit();
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!agent) {
      savedRef.current = false;
      agentIdRef.current = null;
      return;
    }

    if (agentIdRef.current === agent.id && savedRef.current) return;

    agentIdRef.current = agent.id;
    savedRef.current = false;
    console.log("[OneSignal] Agent:", agent.id, agent.name, "— registering token");

    const OneSignal = getOneSignal();
    if (!OneSignal) return;

    const handleSubscriptionChange = async (event: any) => {
      console.log("[OneSignal] Subscription changed:", JSON.stringify(event));
      const playerId =
        event?.current?.id ||
        event?.current?.token ||
        event?.to?.id ||
        event?.to?.token;
      if (playerId && playerId.length > 5) {
        try {
          await api.savePushToken(playerId);
          savedRef.current = true;
          console.log("[OneSignal] ✅ Token saved via event:", playerId.slice(0, 20));
        } catch (e: any) {
          console.warn("[OneSignal] Event save failed:", e.message);
        }
        return;
      }
      // Try fetching if event didn't have ID
      const id = await getPlayerIdV5(OneSignal);
      if (id) {
        try {
          await api.savePushToken(id);
          savedRef.current = true;
          console.log("[OneSignal] ✅ Token saved after event:", id.slice(0, 20));
        } catch (e: any) {
          console.warn("[OneSignal] Post-event save failed:", e.message);
        }
      }
    };

    try {
      OneSignal.User?.pushSubscription?.addEventListener("change", handleSubscriptionChange);
    } catch (e) {
      console.warn("[OneSignal] Listener error:", e);
    }

    registerPushToken()
      .then(() => { savedRef.current = true; })
      .catch((e) => console.warn("[OneSignal] registerPushToken error:", e?.message));

    const handleClick = (event: any) => {
      console.log("[OneSignal] Tapped:", event?.notification?.additionalData);
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

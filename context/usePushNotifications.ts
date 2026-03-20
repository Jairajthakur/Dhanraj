// context/usePushNotifications.ts
// ✅ Written specifically for react-native-onesignal v5.2.5
// In v5, you must use OneSignal.User.getOnesignalId() — async method
// OneSignal.User.pushSubscription.id does NOT work synchronously in v5

import { useEffect, useRef } from "react";
import { Platform, InteractionManager, PermissionsAndroid } from "react-native";
import Constants from "expo-constants";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const ONESIGNAL_APP_ID =
  Constants.expoConfig?.extra?.oneSignalAppId ||
  "bff2c8e0-de24-4aad-a373-d030c210155f";

// ─── Lazy import ──────────────────────────────────────────────────────────────
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
    // @ts-ignore — POST_NOTIFICATIONS added in RN 0.71+
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      {
        title: "Notification Permission",
        message:
          "Dhanraj Enterprises needs permission to send you case updates and reminders.",
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

// ─── OneSignal v5 — get player/onesignal ID ──────────────────────────────────
// In v5, use OneSignal.User.getOnesignalId() — this is the correct async method
async function getPlayerIdV5(OneSignal: any): Promise<string | null> {
  try {
    // ✅ v5 primary method — async
    if (typeof OneSignal.User?.getOnesignalId === "function") {
      const id = await OneSignal.User.getOnesignalId();
      if (id && id.length > 5) {
        console.log("[OneSignal] Got ID via getOnesignalId():", id.slice(0, 20));
        return id;
      }
    }

    // ✅ v5 push subscription token (available after opt-in)
    if (typeof OneSignal.User?.pushSubscription?.getToken === "function") {
      const token = await OneSignal.User.pushSubscription.getToken();
      if (token && token.length > 5) {
        console.log("[OneSignal] Got ID via pushSubscription.getToken():", token.slice(0, 20));
        return token;
      }
    }

    // ✅ v5 sync fallback (sometimes works)
    const syncId = OneSignal.User?.pushSubscription?.token;
    if (syncId && typeof syncId === "string" && syncId.length > 5) {
      console.log("[OneSignal] Got ID via pushSubscription.token (sync):", syncId.slice(0, 20));
      return syncId;
    }

    const syncId2 = OneSignal.User?.pushSubscription?.id;
    if (syncId2 && typeof syncId2 === "string" && syncId2.length > 5) {
      console.log("[OneSignal] Got ID via pushSubscription.id (sync):", syncId2.slice(0, 20));
      return syncId2;
    }

    console.log("[OneSignal] No ID found. optedIn:", OneSignal.User?.pushSubscription?.optedIn);
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
    if (!OneSignal) { resolve(); return; }

    InteractionManager.runAfterInteractions(async () => {
      try {
        console.log("[OneSignal] Initializing v5...");
        OneSignal.initialize(ONESIGNAL_APP_ID);
        initialized = true;
        console.log("[OneSignal] ✅ Initialized");

        // Step 1: Android 13 system permission
        await requestAndroid13Permission();

        // Step 2: Wait a moment then request OneSignal permission
        await new Promise((r) => setTimeout(r, 1000));
        try {
          await OneSignal.Notifications.requestPermission(true);
          console.log("[OneSignal] ✅ Permission requested");
        } catch (e) {
          console.warn("[OneSignal] requestPermission error:", e);
        }

        // Step 3: Opt in to push (v5 requires explicit opt-in)
        await new Promise((r) => setTimeout(r, 500));
        try {
          await OneSignal.User.pushSubscription.optIn();
          console.log("[OneSignal] ✅ Opted in to push subscription");
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

// ─── Exported: save OneSignal player ID to your server ───────────────────────
export async function registerPushToken(): Promise<void> {
  if (Platform.OS === "web") return;

  console.log("[OneSignal] registerPushToken() starting...");
  await ensureInit();

  const OneSignal = getOneSignal();
  if (!OneSignal) return;

  // Poll every 3s for up to 60s total (20 attempts)
  // v5 needs time to register with OneSignal servers after opt-in
  const maxAttempts = 20;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`[OneSignal] ID attempt ${attempt}/${maxAttempts}...`);

    const playerId = await getPlayerIdV5(OneSignal);

    if (playerId) {
      try {
        await api.savePushToken(playerId);
        console.log(`[OneSignal] ✅ Token saved on attempt ${attempt}:`, playerId.slice(0, 20) + "...");
        return;
      } catch (e: any) {
        console.warn(`[OneSignal] Server save failed:`, e.message);
        // Still got the ID — retry save on next attempt
      }
    }

    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  console.warn("[OneSignal] ❌ Could not register token after", maxAttempts, "attempts");
}

// ─── Hook — used in root _layout.tsx ─────────────────────────────────────────
export function usePushNotifications() {
  const { agent } = useAuth();
  const savedRef = useRef(false);
  const agentIdRef = useRef<number | null>(null);

  // Init on mount
  useEffect(() => {
    if (Platform.OS === "web") return;
    ensureInit();
  }, []);

  // Re-register whenever agent changes (login / account switch)
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!agent) {
      savedRef.current = false;
      agentIdRef.current = null;
      return;
    }

    // Skip if same agent already registered
    if (agentIdRef.current === agent.id && savedRef.current) {
      console.log("[OneSignal] Same agent already registered, skipping");
      return;
    }

    agentIdRef.current = agent.id;
    savedRef.current = false;
    console.log("[OneSignal] New agent:", agent.id, agent.name, "— registering token");

    const OneSignal = getOneSignal();
    if (!OneSignal) return;

    // ── v5 subscription change listener ──────────────────────────────────
    const handleSubscriptionChange = async (event: any) => {
      console.log("[OneSignal] Subscription changed event:", JSON.stringify(event));

      // In v5 the event has { current: { id, token, optedIn } }
      const playerId =
        event?.current?.id ||
        event?.current?.token ||
        event?.to?.id ||
        event?.to?.token;

      if (playerId && playerId.length > 5) {
        try {
          await api.savePushToken(playerId);
          savedRef.current = true;
          console.log("[OneSignal] ✅ Token saved via subscription change:", playerId.slice(0, 20));
        } catch (e: any) {
          console.warn("[OneSignal] Save via event failed:", e.message);
        }
        return;
      }

      // If event didn't have the ID, try fetching it
      const id = await getPlayerIdV5(OneSignal);
      if (id) {
        try {
          await api.savePushToken(id);
          savedRef.current = true;
          console.log("[OneSignal] ✅ Token saved after subscription change:", id.slice(0, 20));
        } catch (e: any) {
          console.warn("[OneSignal] Save after event failed:", e.message);
        }
      }
    };

    try {
      OneSignal.User?.pushSubscription?.addEventListener("change", handleSubscriptionChange);
    } catch (e) {
      console.warn("[OneSignal] Could not add subscription listener:", e);
    }

    // ── Actively poll for token ───────────────────────────────────────────
    registerPushToken()
      .then(() => { savedRef.current = true; })
      .catch((e) => console.warn("[OneSignal] registerPushToken error:", e?.message));

    // ── Notification listeners ────────────────────────────────────────────
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

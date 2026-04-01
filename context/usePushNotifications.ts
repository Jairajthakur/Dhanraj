// context/usePushNotifications.ts
// ✅ Works on both APK and Web
// ✅ Always re-registers token on every login — deleted tokens auto-restore
// ✅ Fixed: post-APK-update token loss on Android (FCM re-registration race)

import { useEffect, useRef } from "react";
import { Platform, InteractionManager, PermissionsAndroid } from "react-native";
import Constants from "expo-constants";
import { getApiUrl } from "@/lib/query-client";
import { tokenStore } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const ONESIGNAL_APP_ID =
  Constants.expoConfig?.extra?.oneSignalAppId ||
  "bff2c8e0-de24-4aad-a373-d030c210155f";

// ─── App version tracking — detect APK updates ───────────────────────────────
const CURRENT_VERSION =
  Constants.expoConfig?.version ||
  (Constants as any).manifest?.version ||
  "unknown";

// ─── Save token directly to server ───────────────────────────────────────────
async function savePushTokenToServer(playerId: string): Promise<void> {
  const base = getApiUrl();
  const authToken = Platform.OS !== "web" ? await tokenStore.get() : null;

  if (!authToken) {
    throw new Error("NO_AUTH_TOKEN");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${authToken}`,
  };

  console.log("[OneSignal] Saving token to server:", playerId.slice(0, 20) + "...");

  const res = await fetch(`${base}/api/push-token`, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({ token: playerId }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any).message || `HTTP ${res.status}`);
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
    const perm = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
    if (!perm) {
      console.log("[Push] Android < 13, no POST_NOTIFICATIONS perm needed");
      return true;
    }
    // Check before requesting to avoid nagging the user every time
    const already = await PermissionsAndroid.check(perm);
    if (already) {
      console.log("[Push] Android 13: already GRANTED");
      return true;
    }
    const granted = await PermissionsAndroid.request(perm, {
      title: "Notification Permission",
      message: "Dhanraj Enterprises needs permission to send you case updates.",
      buttonPositive: "Allow",
      buttonNegative: "Deny",
    });
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
    // Method 1: getOnesignalId (v5 primary)
    if (typeof OneSignal.User?.getOnesignalId === "function") {
      const id = await OneSignal.User.getOnesignalId();
      if (id && id.length > 5) {
        console.log("[OneSignal] ✅ Got id via getOnesignalId:", id.slice(0, 20) + "...");
        return id;
      }
    }

    // Method 2: pushSubscription.id (v5 fallback)
    const subId = OneSignal.User?.pushSubscription?.id;
    if (subId && typeof subId === "string" && subId.length > 5) {
      console.log("[OneSignal] ✅ Got id via pushSubscription.id:", subId.slice(0, 20) + "...");
      return subId;
    }

    // Method 3: getPushSubscriptionState (older SDK)
    if (typeof OneSignal.User?.pushSubscription?.getPushSubscriptionState === "function") {
      const state = await OneSignal.User.pushSubscription.getPushSubscriptionState();
      const stateId = state?.current?.id ?? state?.id;
      if (stateId && stateId.length > 5) {
        console.log("[OneSignal] ✅ Got id via getPushSubscriptionState:", stateId.slice(0, 20) + "...");
        return stateId;
      }
    }

    console.log("[OneSignal] ⚠️ All ID methods returned null");
    return null;
  } catch (e: any) {
    console.warn("[OneSignal] getOnesignalPlayerId error:", e.message);
    return null;
  }
}

// ─── Force re-subscription (post-APK-update recovery) ────────────────────────
// After an Android APK update, FCM generates a new token. OneSignal won't
// know about it until it's explicitly triggered via optOut → optIn.
// Skipping this step = getOnesignalPlayerId returns null indefinitely.
async function forceResubscribe(OneSignal: any): Promise<void> {
  console.log("[OneSignal] 🔄 Running post-update re-subscription...");
  try {
    await OneSignal.User.pushSubscription.optOut();
    console.log("[OneSignal] Opted out");
  } catch (e) {
    console.warn("[OneSignal] optOut error (non-fatal):", e);
  }

  // Give Android time to clear the stale FCM registration
  await new Promise((r) => setTimeout(r, 2000));

  try {
    await OneSignal.User.pushSubscription.optIn();
    console.log("[OneSignal] Opted back in");
  } catch (e) {
    console.warn("[OneSignal] optIn error:", e);
  }

  // FCM re-registration with Google servers takes time — this is exactly
  // why getOnesignalPlayerId returns null after an APK update.
  await new Promise((r) => setTimeout(r, 5000));
  console.log("[OneSignal] ✅ Re-subscription complete");
}

// ─── Init state ───────────────────────────────────────────────────────────────
let initPromise: Promise<void> | null = null;
let initCompleted = false;

export function resetPushInit() {
  initPromise = null;
  initCompleted = false;
  console.log("[OneSignal] Init state reset (logout)");
}

function ensureInit(): Promise<void> {
  if (Platform.OS === "web") return Promise.resolve();
  if (initCompleted) return Promise.resolve();
  if (initPromise) return initPromise;

  initPromise = new Promise<void>((resolve) => {
    const OneSignal = getOneSignal();
    if (!OneSignal) {
      console.warn("[OneSignal] Module not available — skipping init");
      initCompleted = true;
      resolve();
      return;
    }

    InteractionManager.runAfterInteractions(async () => {
      try {
        console.log("[OneSignal] Initializing with appId:", ONESIGNAL_APP_ID);
        OneSignal.initialize(ONESIGNAL_APP_ID);
        console.log("[OneSignal] ✅ Initialized");

        // Android permission must be granted before optIn will work
        await requestAndroid13Permission();
        await new Promise((r) => setTimeout(r, 1000));

        try {
          await OneSignal.Notifications.requestPermission(true);
          console.log("[OneSignal] ✅ Notification permission requested");
        } catch (e) {
          console.warn("[OneSignal] requestPermission error:", e);
        }

        await new Promise((r) => setTimeout(r, 1500));

        try {
          await OneSignal.User.pushSubscription.optIn();
          console.log("[OneSignal] ✅ Opted in");
        } catch (e) {
          console.warn("[OneSignal] optIn error:", e);
        }

        // Critical: wait for FCM registration to complete on Android.
        // Too short here is the #1 reason getOnesignalPlayerId returns null.
        await new Promise((r) => setTimeout(r, 4000));

        initCompleted = true;
        console.log("[OneSignal] ✅ Init complete, version:", CURRENT_VERSION);
      } catch (e) {
        console.error("[OneSignal] Init error:", e);
        // Reset so next call retries instead of hanging on the broken promise
        initPromise = null;
        initCompleted = false;
      } finally {
        resolve();
      }
    });
  });

  return initPromise;
}

// ─── Register push token ──────────────────────────────────────────────────────
export async function registerPushToken(isPostUpdate = false): Promise<void> {
  if (Platform.OS === "web") return;

  console.log("[OneSignal] registerPushToken() — isPostUpdate:", isPostUpdate);
  await ensureInit();

  const OneSignal = getOneSignal();
  if (!OneSignal) {
    console.warn("[OneSignal] Module not available — cannot register token");
    return;
  }

  if (isPostUpdate) {
    // Post-APK-update: force a full FCM re-registration cycle
    await forceResubscribe(OneSignal);
  } else {
    // Normal path: only opt-in if not already subscribed
    try {
      const isOptedIn = OneSignal.User?.pushSubscription?.optedIn;
      console.log("[OneSignal] Current optedIn status:", isOptedIn);
      if (!isOptedIn) {
        await OneSignal.User.pushSubscription.optIn();
        await new Promise((r) => setTimeout(r, 3000));
      }
    } catch (_) {}
  }

  // Poll for subscription ID — it arrives asynchronously after FCM registers
  const maxAttempts = 40; // 40 × 3s = up to 2 minutes
  let noAuthTokenCount = 0;
  let nullIdStreak = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`[OneSignal] Polling attempt ${attempt}/${maxAttempts}`);

    const playerId = await getOnesignalPlayerId(OneSignal);

    if (playerId) {
      nullIdStreak = 0;
      try {
        await savePushTokenToServer(playerId);
        console.log(`[OneSignal] ✅ Token registered on attempt ${attempt}`);
        return;
      } catch (e: any) {
        if (e.message === "NO_AUTH_TOKEN") {
          noAuthTokenCount++;
          console.warn(`[OneSignal] ⏳ Auth token not ready (${noAuthTokenCount}x) — retrying in 5s`);
          if (noAuthTokenCount >= 20) {
            console.error("[OneSignal] ❌ Auth token never appeared — aborting");
            return;
          }
          await new Promise((r) => setTimeout(r, 5000));
          continue;
        }
        console.warn("[OneSignal] Server save failed:", e.message);
        noAuthTokenCount = 0;
      }
    } else {
      nullIdStreak++;
      console.log(`[OneSignal] No ID yet (null streak: ${nullIdStreak})`);

      // After ~18s of consecutive nulls, trigger a fresh opt-out/opt-in.
      // This kicks Android's FCM registration if it silently stalled.
      if (nullIdStreak % 6 === 0) {
        console.log("[OneSignal] Extended null streak — triggering optOut/optIn cycle");
        try {
          await OneSignal.User.pushSubscription.optOut();
          await new Promise((r) => setTimeout(r, 1500));
          await OneSignal.User.pushSubscription.optIn();
          await new Promise((r) => setTimeout(r, 5000));
          continue; // skip the normal 3s delay — we already waited
        } catch (_) {}
      } else if (attempt % 2 === 0) {
        // Light re-optIn every other attempt
        try { await OneSignal.User.pushSubscription.optIn(); } catch (_) {}
      }
    }

    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  console.warn("[OneSignal] ❌ Could not register token after", maxAttempts, "attempts");
}

// ─── Hook — call inside RootLayoutNav ────────────────────────────────────────
export function usePushNotifications() {
  const { agent } = useAuth();
  const agentIdRef = useRef<number | null>(null);
  const lastVersionRef = useRef<string>(CURRENT_VERSION);

  // Init OneSignal on app mount
  useEffect(() => {
    if (Platform.OS === "web") return;
    ensureInit();
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!agent) {
      agentIdRef.current = null;
      return;
    }

    // Detect APK update: version changed since last registration
    const isPostUpdate = lastVersionRef.current !== CURRENT_VERSION;
    if (isPostUpdate) {
      console.log(
        `[OneSignal] APK update detected: ${lastVersionRef.current} → ${CURRENT_VERSION}`
      );
    }

    // Skip if same agent and same version already registered
    if (agentIdRef.current === agent.id && !isPostUpdate) return;

    agentIdRef.current = agent.id;
    lastVersionRef.current = CURRENT_VERSION;

    console.log("[OneSignal] Agent logged in:", agent.id, agent.name);

    const OneSignal = getOneSignal();
    if (!OneSignal) return;

    // Re-save token whenever OneSignal rotates the subscription
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

    registerPushToken(isPostUpdate).catch((e) =>
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
  }, [agent?.id]);
}

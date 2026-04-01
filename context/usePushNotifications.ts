// context/usePushNotifications.ts
// DEBUG VERSION — add this temporarily to find where token generation fails

import { useEffect, useRef } from "react";
import { Platform, InteractionManager, PermissionsAndroid } from "react-native";
import Constants from "expo-constants";
import { getApiUrl } from "@/lib/query-client";
import { tokenStore } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const ONESIGNAL_APP_ID =
  Constants.expoConfig?.extra?.oneSignalAppId ||
  "bff2c8e0-de24-4aad-a373-d030c210155f";

const CURRENT_VERSION =
  Constants.expoConfig?.version ||
  (Constants as any).manifest?.version ||
  "unknown";

// ─── Save token to server ─────────────────────────────────────────────────────
async function savePushTokenToServer(playerId: string): Promise<void> {
  const base = getApiUrl();
  const authToken = Platform.OS !== "web" ? await tokenStore.get() : null;

  if (!authToken) throw new Error("NO_AUTH_TOKEN");

  const res = await fetch(`${base}/api/push-token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    credentials: "include",
    body: JSON.stringify({ token: playerId }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any).message || `HTTP ${res.status}`);
  console.log("[OneSignal] ✅ Server save confirmed:", json);
}

// ─── Get OneSignal module ─────────────────────────────────────────────────────
function getOneSignal() {
  if (Platform.OS === "web") return null;
  try {
    const mod = require("react-native-onesignal");
    const OS = mod?.OneSignal ?? mod?.default ?? mod;
    if (!OS?.initialize) {
      console.warn("[OneSignal] ❌ Module found but missing initialize()");
      return null;
    }
    return OS;
  } catch (e) {
    console.warn("[OneSignal] ❌ Import failed:", e);
    return null;
  }
}

// ─── Android 13+ permission ───────────────────────────────────────────────────
async function requestAndroid13Permission(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  try {
    // @ts-ignore
    const perm = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
    if (!perm) {
      console.log("[Push] Android < 13, POST_NOTIFICATIONS not needed");
      return true;
    }
    const already = await PermissionsAndroid.check(perm);
    if (already) {
      console.log("[Push] POST_NOTIFICATIONS: already GRANTED");
      return true;
    }
    const result = await PermissionsAndroid.request(perm, {
      title: "Notification Permission",
      message: "Dhanraj Enterprises needs permission to send you case updates.",
      buttonPositive: "Allow",
      buttonNegative: "Deny",
    });
    const allowed = result === PermissionsAndroid.RESULTS.GRANTED;
    console.log("[Push] POST_NOTIFICATIONS:", allowed ? "✅ GRANTED" : "❌ DENIED");
    return allowed;
  } catch (e) {
    console.warn("[Push] Permission check error:", e);
    return false;
  }
}

// ─── DEBUG: dump every possible ID field from OneSignal ──────────────────────
async function debugDumpOneSignalState(OneSignal: any, label: string): Promise<void> {
  console.log(`\n[DEBUG][${label}] ── OneSignal state dump ──`);
  try {
    console.log("[DEBUG] pushSubscription object:", JSON.stringify(OneSignal.User?.pushSubscription));
    console.log("[DEBUG] optedIn:", OneSignal.User?.pushSubscription?.optedIn);
    console.log("[DEBUG] id (direct):", OneSignal.User?.pushSubscription?.id);
    console.log("[DEBUG] token (direct):", OneSignal.User?.pushSubscription?.token);
  } catch (e) { console.log("[DEBUG] pushSubscription dump error:", e); }

  try {
    if (typeof OneSignal.User?.getOnesignalId === "function") {
      const id = await OneSignal.User.getOnesignalId();
      console.log("[DEBUG] getOnesignalId():", id);
    } else {
      console.log("[DEBUG] getOnesignalId: NOT A FUNCTION");
    }
  } catch (e) { console.log("[DEBUG] getOnesignalId error:", e); }

  try {
    if (typeof OneSignal.User?.pushSubscription?.getPushSubscriptionState === "function") {
      const state = await OneSignal.User.pushSubscription.getPushSubscriptionState();
      console.log("[DEBUG] getPushSubscriptionState():", JSON.stringify(state));
    } else {
      console.log("[DEBUG] getPushSubscriptionState: NOT A FUNCTION");
    }
  } catch (e) { console.log("[DEBUG] getPushSubscriptionState error:", e); }

  try {
    if (typeof OneSignal.User?.pushSubscription?.getOptedIn === "function") {
      const opted = await OneSignal.User.pushSubscription.getOptedIn();
      console.log("[DEBUG] getOptedIn():", opted);
    }
  } catch (e) { /* not all SDK versions have this */ }

  try {
    console.log("[DEBUG] Notifications.permission:", OneSignal.Notifications?.permission);
    console.log("[DEBUG] Notifications.permissionNative:", OneSignal.Notifications?.permissionNative);
    console.log("[DEBUG] Notifications.hasPermission:", await OneSignal.Notifications?.hasPermission?.());
  } catch (e) { console.log("[DEBUG] Notifications state error:", e); }

  console.log(`[DEBUG][${label}] ── end dump ──\n`);
}

// ─── Get player ID (with debug logging) ──────────────────────────────────────
async function getOnesignalPlayerId(OneSignal: any): Promise<string | null> {
  try {
    if (typeof OneSignal.User?.getOnesignalId === "function") {
      const id = await OneSignal.User.getOnesignalId();
      if (id && id.length > 5) return id;
    }
    const subId = OneSignal.User?.pushSubscription?.id;
    if (subId && typeof subId === "string" && subId.length > 5) return subId;

    if (typeof OneSignal.User?.pushSubscription?.getPushSubscriptionState === "function") {
      const state = await OneSignal.User.pushSubscription.getPushSubscriptionState();
      const stateId = state?.current?.id ?? state?.id;
      if (stateId && stateId.length > 5) return stateId;
    }
    return null;
  } catch (e: any) {
    console.warn("[OneSignal] getOnesignalPlayerId error:", e.message);
    return null;
  }
}

// ─── Force re-subscription ────────────────────────────────────────────────────
async function forceResubscribe(OneSignal: any): Promise<void> {
  console.log("[OneSignal] 🔄 Force re-subscribing...");
  try { await OneSignal.User.pushSubscription.optOut(); console.log("[OneSignal] optOut done"); }
  catch (e) { console.warn("[OneSignal] optOut error:", e); }
  await new Promise((r) => setTimeout(r, 2000));
  try { await OneSignal.User.pushSubscription.optIn(); console.log("[OneSignal] optIn done"); }
  catch (e) { console.warn("[OneSignal] optIn error:", e); }
  await new Promise((r) => setTimeout(r, 5000));
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
      console.warn("[OneSignal] ❌ No module — skipping init");
      initCompleted = true;
      resolve();
      return;
    }

    InteractionManager.runAfterInteractions(async () => {
      try {
        console.log("[OneSignal] Initializing, appId:", ONESIGNAL_APP_ID);
        OneSignal.initialize(ONESIGNAL_APP_ID);
        console.log("[OneSignal] initialize() called");

        // DEBUG: dump state right after initialize
        await new Promise((r) => setTimeout(r, 500));
        await debugDumpOneSignalState(OneSignal, "after-initialize");

        const permGranted = await requestAndroid13Permission();
        console.log("[OneSignal] Android permission granted:", permGranted);
        await new Promise((r) => setTimeout(r, 1000));

        try {
          await OneSignal.Notifications.requestPermission(true);
          console.log("[OneSignal] requestPermission() done");
        } catch (e) { console.warn("[OneSignal] requestPermission error:", e); }

        await new Promise((r) => setTimeout(r, 1500));

        // DEBUG: dump before optIn
        await debugDumpOneSignalState(OneSignal, "before-optIn");

        try {
          await OneSignal.User.pushSubscription.optIn();
          console.log("[OneSignal] optIn() done");
        } catch (e) { console.warn("[OneSignal] optIn error:", e); }

        // Wait for FCM registration
        await new Promise((r) => setTimeout(r, 4000));

        // DEBUG: dump after optIn + FCM wait
        await debugDumpOneSignalState(OneSignal, "after-optIn-wait");

        initCompleted = true;
        console.log("[OneSignal] ✅ Init complete");
      } catch (e) {
        console.error("[OneSignal] ❌ Init error:", e);
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

  console.log("\n[OneSignal] ═══ registerPushToken START ═══");
  console.log("[OneSignal] isPostUpdate:", isPostUpdate);
  console.log("[OneSignal] appVersion:", CURRENT_VERSION);

  await ensureInit();

  const OneSignal = getOneSignal();
  if (!OneSignal) {
    console.warn("[OneSignal] ❌ No module after ensureInit");
    return;
  }

  // DEBUG: dump state at the start of registration
  await debugDumpOneSignalState(OneSignal, "registerPushToken-start");

  if (isPostUpdate) {
    await forceResubscribe(OneSignal);
    await debugDumpOneSignalState(OneSignal, "after-forceResubscribe");
  } else {
    try {
      const isOptedIn = OneSignal.User?.pushSubscription?.optedIn;
      console.log("[OneSignal] optedIn at registration start:", isOptedIn);
      if (!isOptedIn) {
        await OneSignal.User.pushSubscription.optIn();
        console.log("[OneSignal] optIn triggered (was not opted in)");
        await new Promise((r) => setTimeout(r, 3000));
        await debugDumpOneSignalState(OneSignal, "after-optIn-in-register");
      }
    } catch (e) { console.warn("[OneSignal] pre-register optIn error:", e); }
  }

  const maxAttempts = 40;
  let noAuthTokenCount = 0;
  let nullIdStreak = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`\n[OneSignal] ── Poll attempt ${attempt}/${maxAttempts} ──`);

    const playerId = await getOnesignalPlayerId(OneSignal);
    console.log("[OneSignal] playerId this attempt:", playerId ?? "NULL");

    if (playerId) {
      nullIdStreak = 0;
      console.log("[OneSignal] Got ID, attempting server save...");

      // DEBUG: confirm auth token is present
      const tok = await tokenStore.get();
      console.log("[OneSignal] Auth token present:", !!tok, tok ? `(${tok.slice(0, 20)}...)` : "MISSING");

      try {
        await savePushTokenToServer(playerId);
        console.log(`[OneSignal] ✅ Token saved on attempt ${attempt}`);
        console.log("[OneSignal] ═══ registerPushToken END (success) ═══\n");
        return;
      } catch (e: any) {
        console.warn("[OneSignal] Save error:", e.message);
        if (e.message === "NO_AUTH_TOKEN") {
          noAuthTokenCount++;
          console.warn(`[OneSignal] Auth token missing (${noAuthTokenCount}x), waiting 5s`);
          if (noAuthTokenCount >= 20) {
            console.error("[OneSignal] ❌ Auth token never appeared — aborting");
            return;
          }
          await new Promise((r) => setTimeout(r, 5000));
          continue;
        }
        noAuthTokenCount = 0;
      }
    } else {
      nullIdStreak++;
      console.log(`[OneSignal] Null ID streak: ${nullIdStreak}`);

      // Every 6 nulls (~18s), do a full state dump + re-optIn cycle
      if (nullIdStreak % 6 === 0) {
        console.log("[OneSignal] Extended null streak — dumping state and re-triggering");
        await debugDumpOneSignalState(OneSignal, `null-streak-${nullIdStreak}`);
        try {
          await OneSignal.User.pushSubscription.optOut();
          await new Promise((r) => setTimeout(r, 1500));
          await OneSignal.User.pushSubscription.optIn();
          await new Promise((r) => setTimeout(r, 5000));
          continue;
        } catch (_) {}
      } else if (attempt % 2 === 0) {
        try { await OneSignal.User.pushSubscription.optIn(); } catch (_) {}
      }
    }

    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  console.warn("[OneSignal] ❌ registerPushToken FAILED after", maxAttempts, "attempts");
  await debugDumpOneSignalState(OneSignal, "final-failure");
  console.log("[OneSignal] ═══ registerPushToken END (failed) ═══\n");
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function usePushNotifications() {
  const { agent } = useAuth();
  const agentIdRef = useRef<number | null>(null);
  const lastVersionRef = useRef<string>(CURRENT_VERSION);

  useEffect(() => {
    if (Platform.OS === "web") return;
    ensureInit();
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!agent) { agentIdRef.current = null; return; }

    const isPostUpdate = lastVersionRef.current !== CURRENT_VERSION;
    if (isPostUpdate) {
      console.log(`[OneSignal] APK update: ${lastVersionRef.current} → ${CURRENT_VERSION}`);
    }

    if (agentIdRef.current === agent.id && !isPostUpdate) return;

    agentIdRef.current = agent.id;
    lastVersionRef.current = CURRENT_VERSION;

    console.log("[OneSignal] Agent:", agent.id, agent.name);

    const OneSignal = getOneSignal();
    if (!OneSignal) return;

    const handleSubscriptionChange = async (event: any) => {
      console.log("[OneSignal] Subscription changed:", JSON.stringify(event));
      const id = await getOnesignalPlayerId(OneSignal);
      if (id) {
        try { await savePushTokenToServer(id); console.log("[OneSignal] ✅ Token re-saved"); }
        catch (e: any) { console.warn("[OneSignal] Re-save failed:", e.message); }
      }
    };

    try {
      OneSignal.User?.pushSubscription?.addEventListener("change", handleSubscriptionChange);
    } catch (e) { console.warn("[OneSignal] Listener error:", e); }

    registerPushToken(isPostUpdate).catch((e) =>
      console.warn("[OneSignal] registerPushToken error:", e?.message)
    );

    const handleClick = (event: any) =>
      console.log("[OneSignal] Tapped:", event?.notification?.additionalData);
    const handleForeground = (event: any) =>
      console.log("[OneSignal] Foreground:", event?.notification?.title);

    try {
      OneSignal.Notifications?.addEventListener("click", handleClick);
      OneSignal.Notifications?.addEventListener("foregroundWillDisplay", handleForeground);
    } catch (e) { console.warn("[OneSignal] Notification listener error:", e); }

    return () => {
      try {
        OneSignal.User?.pushSubscription?.removeEventListener("change", handleSubscriptionChange);
        OneSignal.Notifications?.removeEventListener("click", handleClick);
        OneSignal.Notifications?.removeEventListener("foregroundWillDisplay", handleForeground);
      } catch (e) { console.warn("[OneSignal] Cleanup error:", e); }
    };
  }, [agent?.id]);
}

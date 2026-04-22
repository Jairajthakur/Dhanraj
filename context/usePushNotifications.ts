// context/usePushNotifications.ts
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
  console.log("[OneSignal] ✅ Token saved to server");
}

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

async function requestAndroid13Permission(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  try {
    // @ts-ignore
    const perm = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
    if (!perm) return true;
    const already = await PermissionsAndroid.check(perm);
    if (already) return true;
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
    console.warn("[Push] Permission error:", e);
    return false;
  }
}

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

async function forceResubscribe(OneSignal: any): Promise<void> {
  console.log("[OneSignal] 🔄 Running post-update re-subscription...");
  try { await OneSignal.User.pushSubscription.optOut(); } catch (_) {}
  await new Promise((r) => setTimeout(r, 2000));
  try { await OneSignal.User.pushSubscription.optIn(); } catch (_) {}
  await new Promise((r) => setTimeout(r, 5000));
  console.log("[OneSignal] ✅ Re-subscription complete");
}

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
        console.log("[OneSignal] Initializing, appId:", ONESIGNAL_APP_ID);
        OneSignal.initialize(ONESIGNAL_APP_ID);

        // Register high-importance notification channel for PTP alerts
        // This makes notifications loud with vibration like PhonePe/BharatPe
        if (Platform.OS === "android") {
          try {
            OneSignal.Notifications?.registerForProvisionalAuthorization?.(() => {});
            // Set sound + vibration for all notifications from this app
            OneSignal.InAppMessages?.setPaused?.(false);
          } catch (_) {}
        }

        await requestAndroid13Permission();
        await new Promise((r) => setTimeout(r, 1000));

        try {
          await OneSignal.Notifications.requestPermission(true);
          console.log("[OneSignal] ✅ Permission requested");
        } catch (e) { console.warn("[OneSignal] requestPermission error:", e); }

        await new Promise((r) => setTimeout(r, 1500));

        try {
          await OneSignal.User.pushSubscription.optIn();
          console.log("[OneSignal] ✅ Opted in");
        } catch (e) { console.warn("[OneSignal] optIn error:", e); }

        await new Promise((r) => setTimeout(r, 4000));

        initCompleted = true;
        console.log("[OneSignal] ✅ Init complete");
      } catch (e) {
        console.error("[OneSignal] Init error:", e);
        initPromise = null;
        initCompleted = false;
      } finally {
        resolve();
      }
    });
  });

  return initPromise;
}

async function waitForAuthToken(timeoutMs = 15000): Promise<string | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const tok = await tokenStore.get();
    if (tok) return tok;
    await new Promise((r) => setTimeout(r, 400));
  }
  return null;
}

export async function registerPushToken(isPostUpdate = false): Promise<void> {
  if (Platform.OS === "web") return;

  console.log("[OneSignal] registerPushToken() — isPostUpdate:", isPostUpdate);

  console.log("[OneSignal] Waiting for auth token...");
  const authToken = await waitForAuthToken(15000);
  if (!authToken) {
    console.error("[OneSignal] ❌ Auth token never appeared — aborting push registration");
    return;
  }
  console.log("[OneSignal] ✅ Auth token ready");

  await ensureInit();

  const OneSignal = getOneSignal();
  if (!OneSignal) {
    console.warn("[OneSignal] Module not available");
    return;
  }

  if (isPostUpdate) {
    await forceResubscribe(OneSignal);
  } else {
    try {
      const isOptedIn = OneSignal.User?.pushSubscription?.optedIn;
      if (!isOptedIn) {
        await OneSignal.User.pushSubscription.optIn();
        await new Promise((r) => setTimeout(r, 3000));
      }
    } catch (_) {}
  }

  const maxAttempts = 40;
  let nullIdStreak = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`[OneSignal] Poll ${attempt}/${maxAttempts}`);

    const playerId = await getOnesignalPlayerId(OneSignal);

    if (playerId) {
      nullIdStreak = 0;
      try {
        await savePushTokenToServer(playerId);
        console.log(`[OneSignal] ✅ Token registered on attempt ${attempt}`);
        return;
      } catch (e: any) {
        if (e.message === "NO_AUTH_TOKEN") {
          console.error("[OneSignal] ❌ Auth token lost mid-registration — aborting");
          return;
        }
        console.warn("[OneSignal] Server save failed:", e.message);
      }
    } else {
      nullIdStreak++;
      if (nullIdStreak % 6 === 0) {
        console.log("[OneSignal] Extended null streak — re-triggering optOut/optIn");
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

    if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, 3000));
  }

  console.warn("[OneSignal] ❌ Could not register token after", maxAttempts, "attempts");
}

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
    if (agentIdRef.current === agent.id && !isPostUpdate) return;

    agentIdRef.current = agent.id;
    lastVersionRef.current = CURRENT_VERSION;

    if (isPostUpdate) {
      console.log(`[OneSignal] APK update: ${lastVersionRef.current} → ${CURRENT_VERSION}`);
    }

    console.log("[OneSignal] Agent logged in:", agent.id, agent.name);

    const OneSignal = getOneSignal();
    if (!OneSignal) return;

    const handleSubscriptionChange = async (event: any) => {
      console.log("[OneSignal] Subscription changed:", JSON.stringify(event));
      const tok = await tokenStore.get();
      if (!tok) return;
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
    const handleForeground = (event: any) => {
      console.log("[OneSignal] Foreground:", event?.notification?.title);
      // Always show the notification banner even when app is open
      // This is what makes it appear like a payment app alert
      try { event?.preventDefault?.(); } catch (_) {}
      try { event?.notification?.display?.(); } catch (_) {}
    };

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

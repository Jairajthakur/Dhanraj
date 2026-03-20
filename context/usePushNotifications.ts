// context/usePushNotifications.ts
// ✅ Fixes token not generating after login with a different FOS account
// ✅ Android 13+ POST_NOTIFICATIONS permission handled correctly
// ✅ Compatible with New Architecture (newArchEnabled: true)

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

// ─── Android 13+ POST_NOTIFICATIONS permission ───────────────────────────────
async function requestAndroid13Permission(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  try {
    const granted = await PermissionsAndroid.request(
      // @ts-ignore
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      {
        title: "Notification Permission",
        message:
          "Dhanraj Enterprises needs notification permission to send you case updates and reminders.",
        buttonPositive: "Allow",
        buttonNegative: "Deny",
      }
    );
    const allowed = granted === PermissionsAndroid.RESULTS.GRANTED;
    console.log("[Push] Android 13 permission:", allowed ? "GRANTED" : "DENIED");
    return allowed;
  } catch (e) {
    console.warn("[Push] Android permission error:", e);
    return false;
  }
}

// ─── OneSignal init state ────────────────────────────────────────────────────
let initialized = false;
let initializationPromise: Promise<void> | null = null;

// ✅ Returns a promise so callers can WAIT for init to complete
function ensureOneSignalInit(): Promise<void> {
  if (Platform.OS === "web") return Promise.resolve();
  if (initialized) return Promise.resolve();

  // If already initializing, return the same promise (don't double-init)
  if (initializationPromise) return initializationPromise;

  initializationPromise = new Promise<void>((resolve) => {
    const OneSignal = getOneSignal();
    if (!OneSignal) {
      resolve();
      return;
    }

    InteractionManager.runAfterInteractions(async () => {
      try {
        console.log("[OneSignal] Initializing...");
        OneSignal.initialize(ONESIGNAL_APP_ID);
        initialized = true;
        console.log("[OneSignal] ✅ Initialized");

        // Request Android 13 permission
        const systemGranted = await requestAndroid13Permission();
        if (systemGranted) {
          try {
            OneSignal.Notifications.requestPermission(true);
            console.log("[OneSignal] ✅ OneSignal permission requested");
          } catch (e) {
            console.warn("[OneSignal] requestPermission failed:", e);
          }
        }
      } catch (e) {
        console.error("[OneSignal] Init error:", e);
        initialized = false;
        initializationPromise = null;
      } finally {
        resolve();
      }
    });
  });

  return initializationPromise;
}

// ─── Exported: save player ID to server ──────────────────────────────────────
// Called from AuthContext after login and on app launch
export async function registerPushToken(): Promise<void> {
  if (Platform.OS === "web") return;

  // ✅ CRITICAL FIX: Wait for OneSignal to be fully initialized first
  // Without this, calling registerPushToken() right after login
  // finds no subscription ID because OneSignal isn't ready yet
  await ensureOneSignalInit();

  const OneSignal = getOneSignal();
  if (!OneSignal) return;

  // ✅ Poll for subscription ID — it may take a few seconds after init
  // especially on first login or after reinstall
  const maxAttempts = 10;
  const delayMs = 2000; // 2 seconds between attempts = 20s max wait

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const playerId = OneSignal.User?.pushSubscription?.id;

      if (playerId && playerId.length > 0) {
        await api.savePushToken(playerId);
        console.log(
          `[OneSignal] ✅ Token saved on attempt ${attempt}:`,
          playerId.slice(0, 20) + "..."
        );
        return; // ✅ Success — exit
      } else {
        console.log(
          `[OneSignal] Attempt ${attempt}/${maxAttempts}: no ID yet, waiting ${delayMs}ms...`
        );
      }
    } catch (e: any) {
      console.warn(`[OneSignal] Attempt ${attempt} error:`, e.message);
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  console.warn(
    `[OneSignal] ❌ Could not get player ID after ${maxAttempts} attempts`
  );
}

// ─── Hook — used in root _layout.tsx ─────────────────────────────────────────
export function usePushNotifications() {
  const { agent } = useAuth();
  const savedRef = useRef(false);
  const agentIdRef = useRef<number | null>(null);

  // ✅ Run OneSignal init once on mount (non-blocking)
  useEffect(() => {
    if (Platform.OS === "web") return;
    ensureOneSignalInit();
  }, []);

  // ✅ Re-run token registration whenever the logged-in agent changes
  // This handles: first login, switching accounts, app restart
  useEffect(() => {
    if (Platform.OS === "web") return;

    if (!agent) {
      // Logged out — reset saved flag
      savedRef.current = false;
      agentIdRef.current = null;
      return;
    }

    // ✅ If same agent, skip (already saved)
    if (agentIdRef.current === agent.id && savedRef.current) {
      console.log("[OneSignal] Same agent, token already saved — skipping");
      return;
    }

    // New agent logged in (or first login)
    agentIdRef.current = agent.id;
    savedRef.current = false;

    console.log(
      "[OneSignal] New agent detected:",
      agent.id,
      agent.name,
      "— starting token registration"
    );

    const OneSignal = getOneSignal();
    if (!OneSignal) return;

    // ── Subscription change listener ──────────────────────────────────────
    const handleSubscriptionChange = async (event: any) => {
      const playerId = event?.current?.id ?? event?.to?.id;
      if (!playerId) return;

      console.log(
        "[OneSignal] Subscription changed, new ID:",
        playerId.slice(0, 20) + "..."
      );

      try {
        await api.savePushToken(playerId);
        savedRef.current = true;
        console.log("[OneSignal] ✅ Token saved via subscription change");
      } catch (e: any) {
        console.warn("[OneSignal] Subscription change save failed:", e.message);
      }
    };

    try {
      OneSignal.User?.pushSubscription?.addEventListener(
        "change",
        handleSubscriptionChange
      );
    } catch (e) {
      console.warn("[OneSignal] Could not add subscription listener:", e);
    }

    // ── Also try immediately after init settles ───────────────────────────
    // ✅ This is what fixes "token not generating after login"
    // We wait for init, then poll for the ID
    const saveToken = async () => {
      try {
        await registerPushToken();
        savedRef.current = true;
      } catch (e: any) {
        console.warn("[OneSignal] Token save failed:", e.message);
      }
    };

    saveToken(); // Fire immediately — registerPushToken() waits for init internally

    // ── Notification listeners ────────────────────────────────────────────
    const handleClick = (event: any) => {
      const data = event?.notification?.additionalData as any;
      console.log("[OneSignal] Notification tapped:", data);
    };

    const handleForeground = (event: any) => {
      console.log(
        "[OneSignal] Foreground notification:",
        event?.notification?.title
      );
    };

    try {
      OneSignal.Notifications?.addEventListener("click", handleClick);
      OneSignal.Notifications?.addEventListener(
        "foregroundWillDisplay",
        handleForeground
      );
    } catch (e) {
      console.warn("[OneSignal] Could not add notification listeners:", e);
    }

    return () => {
      try {
        OneSignal.User?.pushSubscription?.removeEventListener(
          "change",
          handleSubscriptionChange
        );
        OneSignal.Notifications?.removeEventListener("click", handleClick);
        OneSignal.Notifications?.removeEventListener(
          "foregroundWillDisplay",
          handleForeground
        );
      } catch (e) {
        console.warn("[OneSignal] Cleanup error:", e);
      }
    };
  }, [agent?.id]); // ✅ Runs every time a different agent logs in
}

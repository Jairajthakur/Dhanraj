// lib/notificationChannels.ts
//
// Registers a custom Android notification channel with IMPORTANCE_MAX so that
// PTP break alerts play a loud, spoken-word alert and vibrate like
// PhonePe/BharatPe.
//
// On Android 8+, per-notification priority is IGNORED — sound and vibration
// are controlled entirely by the channel's importance level (and sound) set
// at registration time. The OneSignal SDK's default channel uses
// IMPORTANCE_DEFAULT (silent). This creates a fresh "ptp_alerts" channel at
// MAX importance instead, with a custom voice-alert sound bundled via the
// expo-notifications config plugin (see app.config.js "sounds") from
// assets/sounds/ptp_voice_alert.wav — referenced below WITHOUT the file
// extension, which is how Android looks up the res/raw resource.
//
// expo-notifications (v0.32.16) is present in node_modules as a transitive
// dependency of expo SDK 54, so no extra install is needed.

import { Platform } from "react-native";

export function registerNotificationChannels(): void {
  if (Platform.OS !== "android") return;

  try {
    // require() is used so the JS bundle still loads on iOS/web even if the
    // native module is somehow absent on a specific build variant.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Notifications = require("expo-notifications");

    Notifications.setNotificationChannelAsync("ptp_alerts", {
      name:                 "PTP Break Alerts",
      importance:           Notifications.AndroidImportance.MAX,   // heads-up + loud
      vibrationPattern:     [0, 500, 200, 500],                    // like PhonePe
      enableVibrate:        true,
      // Filename WITHOUT extension — must match the bundled res/raw resource
      // name produced by the expo-notifications "sounds" config plugin.
      sound:                "ptp_voice_alert",
      showBadge:            true,
      // Show on lock screen even when phone is locked
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      // Do NOT set bypassDnd — users should be able to silence the app in DND
      bypassDnd:            false,
    })
      .then(() =>  console.log("[channels] ✅ ptp_alerts channel registered (IMPORTANCE_MAX)"))
      .catch((e: any) => console.warn("[channels] ⚠️ channel registration failed:", e?.message));

  } catch (e: any) {
    // Graceful fallback — if expo-notifications native module is somehow absent,
    // notifications still arrive (just without the custom channel importance).
    console.warn("[channels] ⚠️ expo-notifications unavailable:", e?.message);
  }
}

// lib/notificationChannels.ts
import { Platform } from "react-native";

export function registerNotificationChannels() {
  if (Platform.OS !== "android") return;
  // Android notification channels are handled by the OneSignal SDK automatically
  // via the onesignal-expo-plugin config in app.config.js
}

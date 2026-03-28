module.exports = ({ config }) => {
  return {
    ...config,
    name: "Dhanraj Enterprises",
    slug: "dhanraj-enterprises",
    owner: "jai234",
    version: "1.0.2",
    orientation: "portrait",
    scheme: "dhanrajenterprises",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,

    updates: {
      url: "https://u.expo.dev/1b09251a-4423-4759-a22b-fc2f0a44fd8e",
    },
    runtimeVersion: {
      policy: "sdkVersion",
    },

    // ── App icon (iOS + Android fallback) ─────────────────────────────────────
    icon: "./assets/images/dhanraj-logo.png",

    // ── Root-level notification config (required by OneSignal Expo plugin) ────
    // This sets the small icon used in the status bar & notification tray.
    // Must be a WHITE icon on TRANSPARENT background (Android requirement).
    // Using the logo directly here — EAS build will auto-process it.
    notification: {
      icon: "./assets/images/dhanraj-logo.png",
      color: "#FF6B00",
      iosDisplayInForeground: true,
    },

    splash: {
      image: "./assets/images/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#000000",
    },

    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.dhanraj.app",
    },

    android: {
      package: "com.dhanraj.app",
      permissions: [
        "NOTIFICATIONS",
        "RECEIVE_BOOT_COMPLETED",
        "VIBRATE",
        "ACCESS_NETWORK_STATE",
      ],
      backgroundColor: "#000000",

      // ── Android notification config ────────────────────────────────────────
      // large_icon in OneSignal payload uses "ic_launcher" which maps to
      // the adaptive icon below (full-color logo shown in expanded notification)
      notification: {
        icon: "./assets/images/dhanraj-logo.png",  // small status-bar icon
        color: "#FF6B00",                           // accent color for icon tint
      },

      // ── Adaptive icon (home screen + large notification icon) ─────────────
      adaptiveIcon: {
        foregroundImage: "./assets/images/dhanraj-logo.png",
        backgroundColor: "#EDE8DC",
      },
    },

    web: {
      bundler: "metro",
      favicon: "./assets/images/favicon.png",
      output: "static",
      baseUrl: process.env.EXPO_PUBLIC_BASE_URL || "/",
    },

    plugins: [
      "expo-router",
      "expo-font",
      "expo-web-browser",
      [
        "onesignal-expo-plugin",
        {
          mode: "production",
          devTeam: "",
          // ✅ These tell the OneSignal plugin which icons to bundle into the APK
          // ic_launcher      → used as large_icon (full-color, shown expanded)
          // ic_stat_onesignal_default → small status-bar icon (white silhouette)
          smallIcon: "./assets/images/dhanraj-logo.png",
          largeIcon: "./assets/images/dhanraj-logo.png",
          accentColor: "#FF6B00",
        },
      ],
    ],

    experiments: {
      typedRoutes: true,
      reactCompiler: false,
    },

    extra: {
      apiUrl: "https://dhanraj-production.up.railway.app",
      oneSignalAppId: "bff2c8e0-de24-4aad-a473-d030c210155f",
      eas: {
        projectId: "1b09251a-4423-4759-a22b-fc2f0a44fd8e",
      },
    },
  };
};

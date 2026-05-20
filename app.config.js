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
      enabled: true,
      checkAutomatically: "ON_LOAD",
      fallbackToCacheTimeout: 0,
    },
    runtimeVersion: {
      policy: "sdkVersion",
    },
    icon: "./assets/images/dhanraj-logo.png",
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
      infoPlist: {
        NSSpeechRecognitionUsageDescription: "Dhanraj Collections uses speech recognition to convert your voice to text for remarks and comments.",
        NSMicrophoneUsageDescription: "Dhanraj Collections needs microphone access to record your voice for speech-to-text.",
      },
    },
    android: {
      package: "com.dhanraj.app",
      permissions: [
        "NOTIFICATIONS",
        "RECEIVE_BOOT_COMPLETED",
        "VIBRATE",
        "ACCESS_NETWORK_STATE",
        "USE_FULL_SCREEN_INTENT",   // allows heads-up / full screen alert
        "READ_EXTERNAL_STORAGE",    // needed for sharing files/images
        "WRITE_EXTERNAL_STORAGE",   // needed for sharing files/images
        "RECORD_AUDIO",             // needed for speech-to-text mic input
      ],
      intentFilters: [],
      // Allow Linking.canOpenURL to query WhatsApp on Android 11+
      blockedPermissions: [],
      backgroundColor: "#000000",
      notification: {
        icon: "./assets/images/dhanraj-logo.png",
        color: "#E24B4A",
      },
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
          // Registers a high-importance Android notification channel
          // This is what makes the notification loud like PhonePe/BharatPe
          smallIcons: ["./assets/images/dhanraj-logo.png"],
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: false,
    },
    extra: {
      apiUrl: "https://dhanraj-production.up.railway.app",
      oneSignalAppId: "bff2c8e0-de24-4aad-a373-d030c210155f",
      eas: {
        projectId: "1b09251a-4423-4759-a22b-fc2f0a44fd8e",
      },
    },
  };
};

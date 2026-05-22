module.exports = ({ config }) => {
  return {
    ...config,

    name: "Dhanraj Enterprises",
    slug: "dhanraj-enterprises",

    version: "1.0.2",
    orientation: "portrait",

    icon: "./assets/images/dhanraj-logo.png",

    userInterfaceStyle: "automatic",

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

      // ✅ Fix 1: Allow HTTPS traffic on all Android versions (required for Railway)
      usesCleartextTraffic: false,

      permissions: [
        "INTERNET",
        "ACCESS_NETWORK_STATE",
        "NOTIFICATIONS",
        "RECORD_AUDIO",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE",
      ],

      adaptiveIcon: {
        foregroundImage: "./assets/images/dhanraj-logo.png",
        backgroundColor: "#EDE8DC",
      },
    },

    web: {
      bundler: "metro",
      favicon: "./assets/images/favicon.png",
    },

    plugins: [
      "expo-router",
      "expo-font",
    ],

    experiments: {
      typedRoutes: true,
    },

    extra: {
      // ✅ Fix 2: Read from EAS env var first, fallback to hardcoded URL
      apiUrl: process.env.EXPO_PUBLIC_API_URL || "https://dhanraj-production.up.railway.app",
    },
  };
};

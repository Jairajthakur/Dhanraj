module.exports = ({ config }) => {
  return {
    ...config,

    name: "Dhanraj Enterprises",
    slug: "dhanraj-enterprises",

    version: "1.0.2",
    orientation: "portrait",

    icon: "./assets/images/dhanraj-logo.png",

    userInterfaceStyle: "automatic",

    // ✅ Required for EAS Update (eas update --channel production)
    updates: {
      url: "https://u.expo.dev/1b09251a-4423-4759-a22b-fc2f0a44fd8e",
    },

    // ✅ Ties OTA updates to the app binary version — prevents mismatched JS bundles
    runtimeVersion: {
      policy: "appVersion",
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
      apiUrl: process.env.EXPO_PUBLIC_API_URL || "https://dhanraj-production.up.railway.app",
      eas: {
        projectId: "1b09251a-4423-4759-a22b-fc2f0a44fd8e",
      },
    },
  };
};

module.exports = ({ config }) => {
  return {
    ...config,
    name: "Dhanraj Enterprises",
    slug: "dhanraj-enterprises",
    owner: "jai234",
    version: "1.0.0",
    orientation: "portrait",
    scheme: "dhanrajenterprises",
    userInterfaceStyle: "automatic",
    // ✅ MUST stay true — react-native-reanimated v3+ REQUIRES New Architecture
    // OneSignal blank screen is fixed via proper initialization timing instead
    newArchEnabled: true,
    icon: "./assets/images/dhanraj-logo.png",
    splash: {
      image: "./assets/images/dhanraj-logo.png",
      resizeMode: "contain",
      backgroundColor: "#ECEAE4",
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.dhanraj.app",
    },
    android: {
      package: "com.dhanraj.app",
      // ✅ FIXED: Added all required permissions for notifications
      permissions: [
        "NOTIFICATIONS",
        "RECEIVE_BOOT_COMPLETED",
        "VIBRATE",
        "ACCESS_NETWORK_STATE",
      ],
      backgroundColor: "#ECEAE4",
      adaptiveIcon: {
        foregroundImage: "./assets/images/dhanraj-logo.png",
        backgroundColor: "#ECEAE4",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
    },
    web: {
      bundler: "metro",
      favicon: "./assets/images/dhanraj-logo.png",
      output: "static",
      baseUrl: "/Dhanraj/",
    },
    plugins: [
      "expo-router",
      "expo-font",
      "expo-web-browser",
      // ✅ OneSignal plugin — production mode
      [
        "onesignal-expo-plugin",
        {
          mode: "production",
          // ✅ FIXED: Pass App ID here so native layer is configured at build time
          devTeam: "",
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: false,
    },
    extra: {
      apiUrl: "https://dhanraj-production.up.railway.app",
      // ✅ FIXED: Expose OneSignal App ID via Expo constants so it's accessible in JS
      oneSignalAppId: "bff2c8e0-de24-4aad-a373-d030c210155f",
      eas: {
        projectId: "1b09251a-4423-4759-a22b-fc2f0a44fd8e",
      },
    },
  };
};

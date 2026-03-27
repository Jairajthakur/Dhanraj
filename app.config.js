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
    newArchEnabled: true,
    updates: {
      url: "https://u.expo.dev/1b09251a-4423-4759-a22b-fc2f0a44fd8e",
    },
    runtimeVersion: {
      policy: "sdkVersion",
    },
    icon: "./assets/images/dhanraj-logo.png",
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
      notification: {
        icon: "./assets/images/ic_stat_notify.png",
        color: "#FF6B00",
      },
      adaptiveIcon: {
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundColor: "#000000",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
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
          smallIcons: ["ic_stat_notify"],                        // ← filename only (no path/ext) for small
          largeIcons: ["./assets/images/dhanraj-logo.png"],      // ← full path for large icon
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

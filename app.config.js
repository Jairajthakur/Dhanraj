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
        icon: "./assets/images/dhanraj-logo.png",
        color: "#FF6B00",
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

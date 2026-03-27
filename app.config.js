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
          smallIcons: ["./assets/images/ic_stat_notify.png"],
          largeIcons: ["./assets/images/dhanraj-logo.png"],
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

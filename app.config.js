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
    icon: "./assets/images/dhanraj-logo.png",
    splash: {
      image: "./assets/images/dhanraj-logo.png",
      resizeMode: "contain",
      backgroundColor: "#ECEAE4",
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.dhanrajenterprises.app",
    },
    android: {
      package: "com.dhanrajenterprises.app",
      googleServicesFile: "./google-services.json",
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
      [
        "expo-notifications",
        {
          icon: "./assets/images/dhanraj-logo.png",
          color: "#111111",
          // ✅ Required for Android 13+ notification permissions
          sounds: ["./assets/sounds/notification.wav"],
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: false,
    },
    extra: {
      apiUrl: "https://dhanraj-production.up.railway.app",
      eas: {
        projectId: "1b09251a-4423-4759-a22b-fc2f0a44fd8e",
      },
    },
  };
};

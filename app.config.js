module.exports = ({ config }) => {
  const androidConfig = { ...config.android };

  // Always set google-services.json path for FCM to work
  androidConfig.googleServicesFile = process.env.GOOGLE_SERVICES_JSON || "./google-services.json";

  return {
    ...config,
    android: androidConfig,
    extra: {
      ...config.extra,
      apiUrl: "https://dhanraj-production.up.railway.app",
      eas: {
        projectId: "1b09251a-4423-4759-a22b-fc2f0a44fd8e",
      },
    },
  };
};

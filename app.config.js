module.exports = ({ config }) => {
  const androidConfig = { ...config.android };
  if (process.env.GOOGLE_SERVICES_JSON) {
    androidConfig.googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  }
  return {
    ...config,
    android: androidConfig,
    extra: {
      ...config.extra,
      apiUrl: "https://dhanraj-production-09c4.up.railway.app",
      eas: {
        projectId: "1b09251a-4423-4759-a22b-fc2f0a44fd8e",
      },
    },
  };
};

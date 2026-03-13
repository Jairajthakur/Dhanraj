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
        projectId: "b08c1d58-d13e-4200-af9b-710e2bc10fb0",
      },
    },
  };
};

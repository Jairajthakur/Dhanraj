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
        projectId: "5f92ce47-05cb-4edb-8020-07e23ca5a029",
      },
    },
  };
};

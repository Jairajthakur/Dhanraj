module.exports = ({ config }) => {
  const androidConfig = { ...config.android };
  if (process.env.GOOGLE_SERVICES_JSON) {
    androidConfig.googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  }
  return {
    ...config,
    android: androidConfig,
    extra: {
      apiUrl: "https://dhanraj-production-09c4.up.railway.app",
    },
  };
};

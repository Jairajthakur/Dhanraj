module.exports = ({ config }) => {
  return {
    ...config,
    extra: {
      ...config.extra,
      apiUrl: "https://dhanraj-production.up.railway.app",
      eas: {
        projectId: "1b09251a-4423-4759-a22b-fc2f0a44fd8e",
      },
    },
  };
};

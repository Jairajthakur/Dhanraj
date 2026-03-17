module.exports = ({ config }) => ({
  ...config,
  web: {
    bundler: "webpack",
    output: "static",
  },
  extra: {
    ...config.extra,
    apiUrl: "https://dhanraj-production.up.railway.app",
    eas: {
      projectId: "1b09251a-4423-4759-a22b-fc2f0a44fd8e",
    },
  },
});

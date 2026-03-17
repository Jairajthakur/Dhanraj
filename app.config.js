module.exports = ({ config }) => {
  return {
    ...config,
    platforms: ["ios", "android", "web"],
    web: {
      bundler: "metro",
      output: "static",
    },
    experiments: {
      baseUrl: "/Dhanraj",
    },
    plugins: [
      [
        "expo-font",
        {
          fonts: [
            "./node_modules/@expo-google-fonts/outfit/Outfit_400Regular.ttf"
          ]
        }
      ]
    ],
    extra: {
      ...config.extra,
      apiUrl: "https://dhanraj-production.up.railway.app",
      eas: {
        projectId: "1b09251a-4423-4759-a22b-fc2f0a44fd8e",
      },
    },
  };
};

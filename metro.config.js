const { getDefaultConfig } = require("expo/metro-config");
const { createProxyMiddleware } = require("http-proxy-middleware");
const path = require("path");

const config = getDefaultConfig(__dirname);

// ✅ Configure resolver (keep your existing + add nanoid fix)
config.resolver = {
  ...config.resolver,
  sourceExts: ["ts", "tsx", "js", "jsx", "json", "mjs"],

  extraNodeModules: {
    "@": path.resolve(__dirname),
  },

  // 🔥 FIX: nanoid issue for Expo web build
  alias: {
    ...(config.resolver.alias || {}),
    "nanoid/non-secure": "nanoid",
  },
};

// ✅ Ensure Metro watches project files
config.watchFolders = [
  path.resolve(__dirname),
];

// ✅ API proxy (your existing setup)
config.server = {
  enhanceMiddleware: (metroMiddleware) => {
    const apiProxy = createProxyMiddleware({
      target: "http://localhost:5000",
      changeOrigin: false,
      on: {
        error: (err, req, res) => {
          console.error("[Metro API Proxy] Error:", err.message);
          if (!res.headersSent) {
            res.writeHead(503, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ message: "API server unavailable" }));
          }
        },
      },
    });

    return (req, res, next) => {
      if (req.url && req.url.startsWith("/api")) {
        return apiProxy(req, res, next);
      }
      return metroMiddleware(req, res, next);
    };
  },
};

module.exports = config;

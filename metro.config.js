const { getDefaultConfig } = require("expo/metro-config");
const { createProxyMiddleware } = require("http-proxy-middleware");
const path = require("path");

const config = getDefaultConfig(__dirname);

// ✅ Extend resolver safely
config.resolver.sourceExts = [
  ...config.resolver.sourceExts,
  "mjs",
];

// ✅ Alias fix (CRITICAL for nanoid issue)
config.resolver.alias = {
  ...(config.resolver.alias || {}),
  "nanoid/non-secure": "nanoid",
};

// ✅ Support root import (@/)
config.resolver.extraNodeModules = {
  "@": path.resolve(__dirname),
};

// ✅ Watch folders
config.watchFolders = [path.resolve(__dirname)];

// ✅ API Proxy (keep as is, just cleaned)
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
      if (req.url?.startsWith("/api")) {
        return apiProxy(req, res, next);
      }
      return metroMiddleware(req, res, next);
    };
  },
};

module.exports = config;

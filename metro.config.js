const { getDefaultConfig } = require("expo/metro-config");
const { createProxyMiddleware } = require("http-proxy-middleware");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Fix path alias resolution for @/ imports
config.resolver = {
  ...config.resolver,
  extraNodeModules: {
    "@": path.resolve(__dirname),
  },
};

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

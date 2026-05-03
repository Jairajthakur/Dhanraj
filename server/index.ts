import express from "express";
import type { Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import * as fs from "fs";
import * as path from "path";

const app = express();

// ─── Betterstack Logging ──────────────────────────────────────────────────────
const BETTERSTACK_TOKEN = process.env.BETTERSTACK_SOURCE_TOKEN || "";

const sendToBetterstack = async (level: string, message: string, extra: Record<string, unknown> = {}) => {
  if (!BETTERSTACK_TOKEN) return;
  try {
    await fetch("https://in.logs.betterstack.com", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${BETTERSTACK_TOKEN}`,
      },
      body: JSON.stringify({
        level,
        message,
        timestamp: new Date().toISOString(),
        service: "dhanraj-railway",
        ...extra,
      }),
    });
  } catch (_) {
    // Never let logging crash the app
  }
};

// Override console.log and console.error to forward to Betterstack
const _log = console.log.bind(console);
const _error = console.error.bind(console);
const _warn = console.warn.bind(console);

console.log = (...args: unknown[]) => {
  _log(...args);
  sendToBetterstack("info", args.map(String).join(" "));
};
console.error = (...args: unknown[]) => {
  _error(...args);
  sendToBetterstack("error", args.map(String).join(" "));
};
console.warn = (...args: unknown[]) => {
  _warn(...args);
  sendToBetterstack("warn", args.map(String).join(" "));
};

const log = console.log;
// ─────────────────────────────────────────────────────────────────────────────

// Prevent crashes from unhandled rejections
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

function setupCors(app: express.Application) {
  app.use((req, res, next) => {
    const origin = req.header("origin");

    const origins = new Set<string>();

    if (process.env.RAILWAY_PUBLIC_DOMAIN) {
      origins.add(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
    }
    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }
    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }
    if (process.env.ALLOWED_ORIGINS) {
      process.env.ALLOWED_ORIGINS.split(",").forEach((o) => {
        origins.add(o.trim());
      });
    }

    const isLocalhost =
      origin?.startsWith("http://localhost:") ||
      origin?.startsWith("http://127.0.0.1:");

    if (!origin) {
      res.header("Access-Control-Allow-Origin", "*");
    } else if (origins.has(origin) || isLocalhost) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Access-Control-Allow-Credentials", "true");
    } else {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Access-Control-Allow-Credentials", "true");
    }

    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });
}

function setupBodyParsing(app: express.Application) {
  app.use((req, res, next) => {
    // Skip body parsing for multipart/form-data — let multer handle it
    if (req.headers["content-type"]?.includes("multipart/form-data")) {
      return next();
    }
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    })(req, res, next);
  });
  app.use((req, res, next) => {
    if (req.headers["content-type"]?.includes("multipart/form-data")) {
      return next();
    }
    express.urlencoded({ extended: false })(req, res, next);
  });
}

function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    const reqPath = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      if (!reqPath.startsWith("/api")) return;
      const duration = Date.now() - start;
      let logLine = `${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) logLine = logLine.slice(0, 79) + "…";

      // ✅ Send API request logs to Betterstack with extra metadata
      const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
      sendToBetterstack(level, logLine, {
        method: req.method,
        path: reqPath,
        status: res.statusCode,
        duration_ms: duration,
      });

      log(logLine);
    });

    next();
  });
}

function serveExpoManifest(platform: string, res: Response) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json"
  );
  if (!fs.existsSync(manifestPath)) {
    return res.status(404).json({ error: `Manifest not found for platform: ${platform}` });
  }
  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");
  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}

function configureExpoAndLanding(app: express.Application) {
  log("Configuring static file serving...");

  // Serve uploads and assets
  app.use("/uploads", express.static(path.resolve(process.cwd(), "server/uploads")));
  app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));

  const webBuildPath = path.resolve(process.cwd(), "static-build");
  const webIndexPath = path.join(webBuildPath, "index.html");

  const webBuildExists = fs.existsSync(webBuildPath) && fs.existsSync(webIndexPath);

  if (webBuildExists) {
    log(`[web] ✅ Web build found at: ${webBuildPath}`);

    app.use(express.static(webBuildPath, { index: false }));

    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith("/api")) return next();

      const platform = req.header("expo-platform");
      if (platform === "ios" || platform === "android") {
        return serveExpoManifest(platform, res);
      }

      return res.sendFile(webIndexPath);
    });

  } else {
    log("[web] ⚠️ Web build NOT found — serving API only");
    log(`[web] Expected at: ${webBuildPath}`);

    app.get("/", (_req: Request, res: Response) => {
      res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dhanraj Enterprises</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; background: #0f172a; color: #e2e8f0; display: flex; align-items: center; justify-content: center; height: 100vh; }
    .card { background: #1e293b; padding: 40px; border-radius: 12px; text-align: center; max-width: 420px; width: 90%; }
    h1 { color: #6366f1; margin-bottom: 8px; font-size: 28px; }
    p { color: #94a3b8; margin-bottom: 24px; }
    .badge { background: #22c55e; color: white; padding: 6px 16px; border-radius: 20px; font-size: 14px; }
    .warn { background: #f59e0b; color: white; padding: 10px 16px; border-radius: 8px; font-size: 13px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Dhanraj Enterprises</h1>
    <p>Backend API Server is running</p>
    <span class="badge">🟢 Online</span>
    <div class="warn">⚠️ Web app build not found.<br>Check Railway build logs.</div>
  </div>
</body>
</html>`);
    });
  }
}

function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const error = err as { status?: number; statusCode?: number; message?: string };
    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";
    console.error("Internal Server Error:", err);
    if (res.headersSent) return next(err);
    return res.status(status).json({ message });
  });
}

(async () => {
  app.set("trust proxy", true);
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  configureExpoAndLanding(app);

  const server = await registerRoutes(app);

  setupErrorHandler(app);

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(port, "0.0.0.0", () => {
    log(`express server serving on port ${port}`);
  });
})();

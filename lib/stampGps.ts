/**
 * stampGpsOnPhoto
 * ──────────────────────────────────────────────────────────────────────────
 * Draws a GPS/location overlay onto a JPEG photo using a hidden HTML5 Canvas
 * rendered inside a React Native WebView. Returns the path to the stamped
 * image saved in the device's cache directory.
 *
 * Works entirely with packages already in the project (react-native-webview,
 * expo-file-system) — no new native dependencies required.
 *
 * Usage:
 *   const stampedPath = await stampGpsOnPhoto(localPhotoUri, visit);
 *   // share stampedPath via expo-sharing
 */

import React, { useRef, useCallback } from "react";
import { Modal, StyleSheet, View } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import * as FileSystem from "expo-file-system";

export interface StampInfo {
  lat:          number;
  lng:          number;
  accuracy?:    number;
  agentName?:   string;
  visitedAt?:   string;   // ISO timestamp
}

/**
 * Builds the HTML page that does the canvas drawing.
 * The page:
 *   1. Reads the base64 photo (sent via postMessage)
 *   2. Draws it onto a canvas
 *   3. Renders the GPS overlay (bottom banner, like GPS Camera apps)
 *   4. Exports to base64 JPEG and posts back
 */
function buildStampHtml(info: StampInfo): string {
  // Format date/time from ISO
  const dt = info.visitedAt ? new Date(info.visitedAt) : new Date();
  const dateStr = dt.toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
  const timeStr = dt.toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", hour12: false,
  });

  const latLng = `${info.lat.toFixed(6)}°N  ${info.lng.toFixed(6)}°E`;
  const accuracy = info.accuracy != null ? `±${Math.round(info.accuracy)}m` : "";
  const mapsUrl = `https://maps.google.com/?q=${info.lat},${info.lng}`;
  const agent   = info.agentName ?? "";
  const dateTime = `${dateStr}  ${timeStr} IST`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>*{margin:0;padding:0;box-sizing:border-box;}body{background:#000;}</style>
</head><body>
<canvas id="c"></canvas>
<script>
(function() {
  window.addEventListener("message", function(e) {
    var base64 = e.data;
    var img = new Image();
    img.onload = function() {
      var W = img.naturalWidth;
      var H = img.naturalHeight;

      var c = document.getElementById("c");
      c.width  = W;
      c.height = H;
      var ctx = c.getContext("2d");

      // Draw original photo
      ctx.drawImage(img, 0, 0, W, H);

      // ── GPS Overlay ──────────────────────────────────────────────────────
      var bannerH = Math.round(H * 0.14);   // 14% of height
      var y0      = H - bannerH;

      // Semi-transparent dark banner
      ctx.fillStyle = "rgba(0,0,0,0.72)";
      ctx.fillRect(0, y0, W, bannerH);

      // Red left accent bar
      ctx.fillStyle = "#E53935";
      ctx.fillRect(0, y0, Math.round(W * 0.012), bannerH);

      // GPS pin icon (simple circle + dot)
      var pinX   = Math.round(W * 0.045);
      var pinY   = y0 + Math.round(bannerH * 0.35);
      var pinR   = Math.round(bannerH * 0.18);
      ctx.beginPath();
      ctx.arc(pinX, pinY, pinR, 0, Math.PI * 2);
      ctx.fillStyle = "#E53935";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(pinX, pinY, pinR * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();

      var textX = Math.round(W * 0.078);
      var fs1   = Math.round(bannerH * 0.28);  // large text
      var fs2   = Math.round(bannerH * 0.20);  // medium
      var fs3   = Math.round(bannerH * 0.17);  // small

      // Lat/Lng (big, white)
      ctx.fillStyle = "#FFFFFF";
      ctx.font      = "bold " + fs1 + "px Arial, sans-serif";
      ctx.fillText("${latLng}", textX, y0 + Math.round(bannerH * 0.36));

      // Accuracy
      if ("${accuracy}") {
        ctx.fillStyle = "#B0BEC5";
        ctx.font      = fs3 + "px Arial, sans-serif";
        ctx.fillText("Accuracy: ${accuracy}", textX, y0 + Math.round(bannerH * 0.56));
      }

      // Maps URL
      ctx.fillStyle = "#64B5F6";
      ctx.font      = fs3 + "px Arial, sans-serif";
      ctx.fillText("${mapsUrl}", textX, y0 + Math.round(bannerH * 0.72));

      // Date/Time (right-aligned)
      ctx.fillStyle = "#FFD54F";
      ctx.font      = "bold " + fs2 + "px Arial, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText("${dateTime}", W - Math.round(W * 0.03), y0 + Math.round(bannerH * 0.36));

      // Agent name (right-aligned, below date)
      if ("${agent}") {
        ctx.fillStyle = "#FFFFFF";
        ctx.font      = fs3 + "px Arial, sans-serif";
        ctx.fillText("${agent}", W - Math.round(W * 0.03), y0 + Math.round(bannerH * 0.58));
      }

      ctx.textAlign = "left";

      // Export to base64 JPEG at 90% quality
      var out = c.toDataURL("image/jpeg", 0.90);
      window.ReactNativeWebView.postMessage(out);
    };
    img.onerror = function() {
      window.ReactNativeWebView.postMessage("ERROR:image_load_failed");
    };
    img.src = base64;
  });
  // Signal ready
  window.ReactNativeWebView.postMessage("READY");
})();
</script>
</body></html>`;
}

// ─── React hook ──────────────────────────────────────────────────────────────

type Resolver = (path: string) => void;
type Rejecter = (err: Error)   => void;

interface UseGpsStamperResult {
  /** Call once. Returns the stamped image path in the cache directory. */
  stampPhoto: (localPhotoUri: string, info: StampInfo) => Promise<string>;
  /** Render this inside your component tree (hidden). */
  StamperView: React.ReactElement | null;
}

export function useGpsStamper(): UseGpsStamperResult {
  const webviewRef  = useRef<WebView>(null);
  const resolverRef = useRef<Resolver | null>(null);
  const rejecterRef = useRef<Rejecter | null>(null);
  const readyRef    = useRef(false);
  const pendingB64  = useRef<string | null>(null);
  const [info,   setInfo]   = React.useState<StampInfo | null>(null);
  const [visible, setVisible] = React.useState(false);

  const handleMessage = useCallback((e: WebViewMessageEvent) => {
    const data = e.nativeEvent.data;

    if (data === "READY") {
      readyRef.current = true;
      // If a photo was queued before WebView was ready, send it now
      if (pendingB64.current && webviewRef.current) {
        webviewRef.current.postMessage(pendingB64.current);
        pendingB64.current = null;
      }
      return;
    }

    if (data.startsWith("ERROR:")) {
      const err = new Error(data.replace("ERROR:", ""));
      rejecterRef.current?.(err);
      resolverRef.current = null;
      rejecterRef.current = null;
      setVisible(false);
      return;
    }

    // data is a base64 data: URL
    (async () => {
      try {
        const base64 = data.replace(/^data:image\/jpeg;base64,/, "");
        const outputPath = `${FileSystem.cacheDirectory}visit_stamped_${Date.now()}.jpg`;
        await FileSystem.writeAsStringAsync(outputPath, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        resolverRef.current?.(outputPath);
      } catch (err) {
        rejecterRef.current?.(err as Error);
      } finally {
        resolverRef.current = null;
        rejecterRef.current = null;
        setVisible(false);
      }
    })();
  }, []);

  const stampPhoto = useCallback(
    (localPhotoUri: string, stampInfo: StampInfo): Promise<string> => {
      return new Promise(async (resolve, reject) => {
        resolverRef.current = resolve;
        rejecterRef.current = reject;
        readyRef.current    = false;

        // Read photo as base64
        let base64: string;
        try {
          base64 = await FileSystem.readAsStringAsync(localPhotoUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
        } catch (err) {
          reject(new Error("Could not read photo file: " + (err as Error).message));
          return;
        }

        const dataUrl = `data:image/jpeg;base64,${base64}`;
        setInfo(stampInfo);
        setVisible(true);

        // WebView may not be ready yet — queue the message
        pendingB64.current = dataUrl;
        // If already ready (re-use), post immediately
        if (readyRef.current && webviewRef.current) {
          webviewRef.current.postMessage(dataUrl);
          pendingB64.current = null;
        }
      });
    },
    [],
  );

  const StamperView = visible && info ? (
    <Modal visible transparent animationType="none" style={styles.modal}>
      <View style={styles.hidden}>
        <WebView
          ref={webviewRef}
          source={{ html: buildStampHtml(info) }}
          style={styles.wv}
          onMessage={handleMessage}
          javaScriptEnabled
          originWhitelist={["*"]}
          // Allow reading large base64 payloads
          injectedJavaScriptBeforeContentLoaded=""
        />
      </View>
    </Modal>
  ) : null;

  return { stampPhoto, StamperView };
}

const styles = StyleSheet.create({
  modal:  { margin: 0 },
  hidden: { position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" },
  wv:     { width: 1, height: 1 },
});

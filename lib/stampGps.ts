/**
 * stampGps.tsx
 * GPS overlay stamper using a hidden WebView canvas.
 * Uses react-native-webview + expo-file-system (already in the project).
 */

import React, { useRef, useCallback, useState } from "react";
import { Modal, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import type { WebViewMessageEvent } from "react-native-webview";
import * as FileSystem from "expo-file-system";

export interface StampInfo {
  lat:       number;
  lng:       number;
  accuracy?: number;
  agentName?: string;
  visitedAt?: string; // ISO timestamp
}

function buildStampHtml(info: StampInfo): string {
  const dt      = info.visitedAt ? new Date(info.visitedAt) : new Date();
  const dateStr = dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });

  const latLng   = `${info.lat.toFixed(6)}\u00b0N  ${info.lng.toFixed(6)}\u00b0E`;
  const accuracy = info.accuracy != null ? `\u00b1${Math.round(info.accuracy)}m` : "";
  const mapsUrl  = `maps.google.com/?q=${info.lat},${info.lng}`;
  const agent    = (info.agentName ?? "").replace(/'/g, "\\'");
  const dateTime = `${dateStr}  ${timeStr} IST`;

  // Values interpolated into the HTML string (not into JS template literals inside the script)
  const latLngSafe   = latLng.replace(/'/g, "\\'");
  const accuracySafe = accuracy.replace(/'/g, "\\'");
  const mapsUrlSafe  = mapsUrl.replace(/'/g, "\\'");
  const dateTimeSafe = dateTime.replace(/'/g, "\\'");

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>*{margin:0;padding:0;}body{background:#000;}</style>
</head><body>
<canvas id="c"></canvas>
<script>
(function(){
  var LAT_LNG   = '${latLngSafe}';
  var ACCURACY  = '${accuracySafe}';
  var MAPS_URL  = '${mapsUrlSafe}';
  var DATE_TIME = '${dateTimeSafe}';
  var AGENT     = '${agent}';

  window.addEventListener('message', function(e) {
    var base64 = e.data;
    var img = new Image();
    img.onload = function() {
      var W = img.naturalWidth;
      var H = img.naturalHeight;
      var c = document.getElementById('c');
      c.width = W; c.height = H;
      var ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, W, H);

      var bannerH = Math.round(H * 0.14);
      var y0 = H - bannerH;

      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(0, y0, W, bannerH);
      ctx.fillStyle = '#E53935';
      ctx.fillRect(0, y0, Math.round(W * 0.012), bannerH);

      var pinX = Math.round(W * 0.045);
      var pinY = y0 + Math.round(bannerH * 0.35);
      var pinR = Math.round(bannerH * 0.18);
      ctx.beginPath(); ctx.arc(pinX, pinY, pinR, 0, Math.PI*2);
      ctx.fillStyle = '#E53935'; ctx.fill();
      ctx.beginPath(); ctx.arc(pinX, pinY, pinR*0.45, 0, Math.PI*2);
      ctx.fillStyle = '#fff'; ctx.fill();

      var textX = Math.round(W * 0.078);
      var fs1 = Math.round(bannerH * 0.28);
      var fs2 = Math.round(bannerH * 0.20);
      var fs3 = Math.round(bannerH * 0.17);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold ' + fs1 + 'px Arial,sans-serif';
      ctx.fillText(LAT_LNG, textX, y0 + Math.round(bannerH * 0.36));

      if (ACCURACY) {
        ctx.fillStyle = '#B0BEC5';
        ctx.font = fs3 + 'px Arial,sans-serif';
        ctx.fillText('Accuracy: ' + ACCURACY, textX, y0 + Math.round(bannerH * 0.56));
      }

      ctx.fillStyle = '#64B5F6';
      ctx.font = fs3 + 'px Arial,sans-serif';
      ctx.fillText(MAPS_URL, textX, y0 + Math.round(bannerH * 0.72));

      ctx.fillStyle = '#FFD54F';
      ctx.font = 'bold ' + fs2 + 'px Arial,sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(DATE_TIME, W - Math.round(W * 0.03), y0 + Math.round(bannerH * 0.36));

      if (AGENT) {
        ctx.fillStyle = '#ECEFF1';
        ctx.font = fs3 + 'px Arial,sans-serif';
        ctx.fillText(AGENT, W - Math.round(W * 0.03), y0 + Math.round(bannerH * 0.58));
      }

      ctx.textAlign = 'left';
      var out = c.toDataURL('image/jpeg', 0.90);
      window.ReactNativeWebView.postMessage(out);
    };
    img.onerror = function() {
      window.ReactNativeWebView.postMessage('ERROR:image_load_failed');
    };
    img.src = base64;
  });
  window.ReactNativeWebView.postMessage('READY');
})();
</script>
</body></html>`;
}

type Resolver = (path: string) => void;
type Rejecter = (err: Error) => void;

export interface UseGpsStamperResult {
  stampPhoto: (localPhotoUri: string, info: StampInfo) => Promise<string>;
  StamperView: React.ReactElement | null;
}

export function useGpsStamper(): UseGpsStamperResult {
  const webviewRef  = useRef<WebView>(null);
  const resolverRef = useRef<Resolver | null>(null);
  const rejecterRef = useRef<Rejecter | null>(null);
  const readyRef    = useRef(false);
  const pendingB64  = useRef<string | null>(null);
  const [info,    setInfo]    = useState<StampInfo | null>(null);
  const [visible, setVisible] = useState(false);

  const handleMessage = useCallback((e: WebViewMessageEvent) => {
    const data = e.nativeEvent.data;

    if (data === "READY") {
      readyRef.current = true;
      if (pendingB64.current && webviewRef.current) {
        webviewRef.current.postMessage(pendingB64.current);
        pendingB64.current = null;
      }
      return;
    }

    if (data.startsWith("ERROR:")) {
      rejecterRef.current?.(new Error(data.replace("ERROR:", "")));
      resolverRef.current = null;
      rejecterRef.current = null;
      setVisible(false);
      return;
    }

    // data is a base64 JPEG data: URL
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
    (localPhotoUri: string, stampInfo: StampInfo): Promise<string> =>
      new Promise(async (resolve, reject) => {
        resolverRef.current = resolve;
        rejecterRef.current = reject;
        readyRef.current    = false;

        let base64: string;
        try {
          base64 = await FileSystem.readAsStringAsync(localPhotoUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
        } catch (err) {
          reject(new Error("Could not read photo: " + (err as Error).message));
          return;
        }

        const dataUrl = `data:image/jpeg;base64,${base64}`;
        pendingB64.current = dataUrl;
        setInfo(stampInfo);
        setVisible(true);

        if (readyRef.current && webviewRef.current) {
          webviewRef.current.postMessage(dataUrl);
          pendingB64.current = null;
        }
      }),
    [],
  );

  const StamperView: React.ReactElement | null = visible && info ? (
    <Modal visible transparent animationType="none">
      <View style={styles.hidden}>
        <WebView
          ref={webviewRef}
          source={{ html: buildStampHtml(info) }}
          style={styles.wv}
          onMessage={handleMessage}
          javaScriptEnabled
          originWhitelist={["*"]}
        />
      </View>
    </Modal>
  ) : null;

  return { stampPhoto, StamperView };
}

const styles = StyleSheet.create({
  hidden: { position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" },
  wv:     { width: 1, height: 1 },
});

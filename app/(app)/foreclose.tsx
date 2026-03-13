import React, { useRef, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ActivityIndicator,
  Pressable, Platform, Linking,
} from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

const FORECLOSE_URL = "https://payments.herofincorp.com/retail";

function buildInjection(loanNo: string): string {
  return `
(function() {
  if (window.__fosAutoFillDone) return;
  var LOAN = ${JSON.stringify(loanNo)};
  var done = false;

  function setNativeInput(el, value) {
    try {
      var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, value);
    } catch(e) { el.value = value; }
    ['input','change','keyup','keydown'].forEach(function(ev) {
      el.dispatchEvent(new Event(ev, { bubbles: true }));
    });
  }

  function setNativeSelect(el, value) {
    try {
      var setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(el, value);
    } catch(e) { el.value = value; }
    ['change','input'].forEach(function(ev) {
      el.dispatchEvent(new Event(ev, { bubbles: true }));
    });
  }

  function clickEl(el) {
    ['mousedown','mouseup','click'].forEach(function(ev) {
      el.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true }));
    });
  }

  function tryFill() {
    if (done) return false;

    // 1. Native <select> with loan/application option
    var selects = document.querySelectorAll('select');
    for (var s = 0; s < selects.length; s++) {
      var opts = Array.from(selects[s].options);
      var loanOpt = opts.find(function(o) {
        return /loan.?application/i.test(o.text) || /loan/i.test(o.text);
      });
      if (loanOpt) { setNativeSelect(selects[s], loanOpt.value); break; }
    }

    // 2. Custom dropdowns (React select, MUI, etc.)
    var allEls = document.querySelectorAll('[role="combobox"], [class*="select__control"], [class*="Select"]');
    for (var d = 0; d < allEls.length && !done; d++) {
      var el = allEls[d];
      if (/application.type/i.test(el.textContent) || /loan/i.test(el.getAttribute('aria-label') || '')) {
        clickEl(el);
        var optEls = document.querySelectorAll('[role="option"], [class*="select__option"], [class*="Option"]');
        for (var o = 0; o < optEls.length; o++) {
          if (/loan.?application/i.test(optEls[o].textContent)) { clickEl(optEls[o]); break; }
        }
      }
    }

    // 3. Find the loan number input
    var inputs = Array.from(document.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([disabled])'
    ));

    var loanInput = inputs.find(function(inp) {
      var ph = (inp.placeholder || '').toLowerCase();
      var nm = (inp.name || '').toLowerCase();
      var id = (inp.id || '').toLowerCase();
      var lbl = inp.labels && inp.labels[0] ? inp.labels[0].textContent.toLowerCase() : '';
      return ph.includes('loan') || ph.includes('application') || ph.includes('account') ||
             nm.includes('loan') || nm.includes('application') ||
             id.includes('loan') || id.includes('application') ||
             lbl.includes('loan') || lbl.includes('application');
    }) || (inputs.length > 0 ? inputs[inputs.length - 1] : null);

    if (loanInput && LOAN) {
      loanInput.focus();
      setNativeInput(loanInput, LOAN);
      done = true;
      window.__fosAutoFillDone = true;
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
        JSON.stringify({ type: 'filled', loanNo: LOAN })
      );
      obs.disconnect();
      clearInterval(fastPoll);
      return true;
    }
    return false;
  }

  // MutationObserver — fires synchronously on any DOM change (fastest possible)
  var obs = new MutationObserver(function() { if (!done) tryFill(); });
  obs.observe(document.documentElement, { childList: true, subtree: true });

  // Immediate attempts
  tryFill();
  if (document.readyState !== 'complete') {
    document.addEventListener('DOMContentLoaded', function() { if (!done) tryFill(); }, { once: true });
    window.addEventListener('load', function() { if (!done) tryFill(); }, { once: true });
  }

  // 50ms fast poll for 3s, then slow down
  var fastPoll = setInterval(function() { if (tryFill() || done) clearInterval(fastPoll); }, 50);
  setTimeout(function() {
    clearInterval(fastPoll);
    if (!done) {
      var slowPoll = setInterval(function() { if (tryFill() || done) clearInterval(slowPoll); }, 500);
      setTimeout(function() { clearInterval(slowPoll); obs.disconnect(); }, 12000);
    } else {
      obs.disconnect();
    }
  }, 3000);
})();
true;
  `.trim();
}

export default function ForecloseScreen() {
  const { loanNo } = useLocalSearchParams<{ loanNo: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const webRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [filled, setFilled] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);

  const loan = String(loanNo || "");

  const handleMessage = useCallback((e: any) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === "filled") setFilled(true);
    } catch {}
  }, []);

  const reload = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    setFilled(false);
    webRef.current?.reload();
  }, []);

  if (Platform.OS === "web") {
    Linking.openURL(FORECLOSE_URL);
    router.back();
    return null;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="foreclose-back">
          <Ionicons name="arrow-back" size={20} color={Colors.text} />
        </Pressable>

        <View style={styles.headerMid}>
          <Text style={styles.headerTitle}>Foreclosure Report</Text>
          <Text style={styles.headerSub}>Hero FinCorp Portal</Text>
        </View>

        <Pressable onPress={reload} style={styles.iconBtn} testID="foreclose-reload">
          <Ionicons name="refresh" size={20} color={Colors.primary} />
        </Pressable>
      </View>

      {loan ? (
        <View style={styles.loanBar} testID="loan-bar">
          <View style={styles.loanBarLeft}>
            <View style={styles.loanIconWrap}>
              <Ionicons name="document-text" size={16} color={Colors.primary} />
            </View>
            <View>
              <Text style={styles.loanBarLabel}>LOAN NUMBER</Text>
              <Text style={styles.loanBarValue}>{loan}</Text>
            </View>
          </View>
          <View style={styles.loanBarRight}>
            {filled ? (
              <View style={styles.filledBadge}>
                <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                <Text style={styles.filledText}>Auto-filled</Text>
              </View>
            ) : (
              <View style={styles.fillingBadge}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.fillingText}>Filling…</Text>
              </View>
            )}
          </View>
        </View>
      ) : null}

      {loading && !loadError && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingTitle}>Opening Portal…</Text>
          <Text style={styles.loadingSubtitle}>Hero FinCorp Payments</Text>
        </View>
      )}

      {loadError && (
        <View style={styles.errorState}>
          <View style={styles.errorIconWrap}>
            <Ionicons name="wifi-outline" size={36} color={Colors.textMuted} />
          </View>
          <Text style={styles.errorTitle}>Could not load portal</Text>
          <Text style={styles.errorSub}>Check your internet connection</Text>
          <Pressable style={styles.retryBtn} onPress={reload}>
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={styles.retryText}>Try Again</Text>
          </Pressable>
        </View>
      )}

      {!loadError && (
        <WebView
          ref={webRef}
          source={{ uri: FORECLOSE_URL }}
          style={styles.webview}
          injectedJavaScriptBeforeContentLoaded={buildInjection(loan)}
          injectedJavaScript={buildInjection(loan)}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          cacheEnabled
          cacheMode="LOAD_CACHE_ELSE_NETWORK"
          allowsInlineMediaPlayback
          allowsBackForwardNavigationGestures={canGoBack}
          renderToHardwareTextureAndroid
          setSupportMultipleWindows={false}
          onLoadStart={() => { setLoading(true); setFilled(false); }}
          onLoadEnd={() => {
            setLoading(false);
            webRef.current?.injectJavaScript(buildInjection(loan));
          }}
          onError={() => { setLoading(false); setLoadError(true); }}
          onHttpError={(e) => { if (e.nativeEvent.statusCode >= 500) setLoadError(true); }}
          onNavigationStateChange={(state) => setCanGoBack(state.canGoBack)}
          onMessage={handleMessage}
          userAgent="Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
        />
      )}

      {canGoBack && !loading && (
        <View style={[styles.navBar, { paddingBottom: insets.bottom || 8 }]}>
          <Pressable
            style={[styles.navBtn, !canGoBack && styles.navBtnDisabled]}
            onPress={() => webRef.current?.goBack()}
            disabled={!canGoBack}
          >
            <Ionicons name="chevron-back" size={22} color={canGoBack ? Colors.text : Colors.textMuted} />
          </Pressable>
          <Pressable style={styles.navBtn} onPress={reload}>
            <Ionicons name="refresh" size={20} color={Colors.primary} />
          </Pressable>
          <Pressable style={styles.navBtn} onPress={() => webRef.current?.goForward()}>
            <Ionicons name="chevron-forward" size={22} color={Colors.textMuted} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
    backgroundColor: Colors.surfaceAlt,
  },
  headerMid: { flex: 1, alignItems: "center" },
  headerTitle: { fontSize: 15, fontWeight: "700", color: Colors.text },
  headerSub: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },

  loanBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.primary + "40",
  },
  loanBarLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  loanIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.primary + "20",
    alignItems: "center", justifyContent: "center",
  },
  loanBarLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: "700", letterSpacing: 1 },
  loanBarValue: { fontSize: 15, color: Colors.primary, fontWeight: "900", letterSpacing: 0.5 },
  loanBarRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  filledBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: Colors.success + "18",
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
  },
  filledText: { fontSize: 12, color: Colors.success, fontWeight: "700" },
  fillingBadge: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.primary + "15",
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
  },
  fillingText: { fontSize: 12, color: Colors.primary, fontWeight: "700" },

  loadingOverlay: {
    position: "absolute", top: 110, left: 0, right: 0, bottom: 0,
    backgroundColor: Colors.background,
    alignItems: "center", justifyContent: "center", gap: 12, zIndex: 10,
  },
  loadingTitle: { fontSize: 16, fontWeight: "700", color: Colors.text },
  loadingSubtitle: { fontSize: 13, color: Colors.textMuted },

  errorState: {
    flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32,
  },
  errorIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.surfaceAlt,
    alignItems: "center", justifyContent: "center",
    marginBottom: 4,
  },
  errorTitle: { fontSize: 18, fontWeight: "700", color: Colors.text, textAlign: "center" },
  errorSub: { fontSize: 14, color: Colors.textMuted, textAlign: "center" },
  retryBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.primary, borderRadius: 14,
    paddingHorizontal: 28, paddingVertical: 14, marginTop: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  retryText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  webview: { flex: 1 },

  navBar: {
    flexDirection: "row", justifyContent: "space-around", alignItems: "center",
    backgroundColor: Colors.surface, paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border,
  },
  navBtn: { padding: 12 },
  navBtnDisabled: { opacity: 0.35 },
});

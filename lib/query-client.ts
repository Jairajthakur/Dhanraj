import { Platform } from "react-native";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  QueryClient,
  QueryFunction,
} from "@tanstack/react-query";

// ✅ Fix: Check multiple sources for the API URL in priority order:
//   1. Web browser — use relative URL (same origin) so ISP DNS never matters
//   2. EAS build env var (EXPO_PUBLIC_API_URL)  — set in eas.json
//   3. app.config.js extra.apiUrl               — baked in at build time
//   4. Hardcoded fallback                        — last resort
export function getApiUrl(): string {
  // On web (browser), always use relative URLs — the API is served from the
  // same origin, so there's no need to resolve an external domain at all.
  // This means ISP DNS issues with *.railway.app never affect API calls.
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return window.location.origin;
  }

  // EAS / Expo public env var (available at JS runtime in EAS builds)
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  // Expo config extra (baked in via app.config.js)
  const extraUrl = Constants.expoConfig?.extra?.apiUrl;
  if (extraUrl) {
    return extraUrl;
  }

  // Absolute fallback
  return "https://www.thdhanraj.co.in";
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

function buildUrl(path: string, base: string): string {
  try {
    return new URL(path, base).toString();
  } catch {
    return `${base}${path}`;
  }
}

async function getStoredToken() {
  // ✅ FIX: Always read token regardless of platform — the native app stores
  // it in AsyncStorage, web stores it in localStorage via tokenStore in api.ts.
  // Previously web returned null here, so Bearer auth was never sent on web.
  try {
    if (Platform.OS === "web") {
      return typeof localStorage !== "undefined"
        ? localStorage.getItem("auth_token")
        : null;
    }
    return await AsyncStorage.getItem("auth_token");
  } catch {
    return null;
  }
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown
): Promise<Response> {
  const controller = new AbortController();

  // ✅ Fix: Increased timeout to 45s — covers Railway cold-start + 4G latency
  const timeout = setTimeout(() => {
    controller.abort();
  }, 45000);

  try {
    const baseUrl = getApiUrl();
    const url = buildUrl(route, baseUrl);

    console.log("API URL:", url);

    const headers: Record<string, string> = {
      ...(data ? { "Content-Type": "application/json" } : {}),
    };

    const token = await getStoredToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeout);
    await throwIfResNotOk(res);
    return res;
  } catch (err: any) {
    clearTimeout(timeout);

    // ✅ Fix: Give a more specific error message based on failure type
    const isTimeout = err?.name === "AbortError";
    const isNetworkError =
      err?.message?.includes("Network request failed") ||
      err?.message?.includes("Failed to fetch") ||
      err?.message?.includes("network");

    console.log("NETWORK ERROR:", err);

    if (isTimeout) {
      throw new Error(
        "Server took too long to respond. Please check your internet connection and try again."
      );
    }
    if (isNetworkError) {
      throw new Error(
        "Cannot reach server. Please check your internet connection and try again."
      );
    }

    throw err;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";

export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const baseUrl = getApiUrl();
    // ✅ FIX: queryKey is often ["/api/route", extraParam]. Only the first
    // element is the URL path — joining all with "/" produced broken URLs like
    // "https://host/api/admin/stats/SomeCompany" when company was passed.
    const path = queryKey[0] as string;
    const url = buildUrl(path, baseUrl);

    const headers: Record<string, string> = {};
    const token = await getStoredToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    // ✅ Mobile fix: retry up to 3 times with exponential back-off
    //    before surfacing a network error to React Query
    const MAX_RETRIES = 3;
    let lastError: any;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      // ✅ Fix: Consistent 45s timeout
      const timeout = setTimeout(() => {
        controller.abort();
      }, 45000);

      try {
        const res = await fetch(url, {
          credentials: "include",
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (unauthorizedBehavior === "returnNull" && res.status === 401) {
          return null;
        }

        await throwIfResNotOk(res);
        return await res.json();
      } catch (err: any) {
        clearTimeout(timeout);
        lastError = err;

        const isTimeout = err?.name === "AbortError";
        const isNetworkError =
          err?.message?.includes("Network request failed") ||
          err?.message?.includes("Failed to fetch") ||
          err?.message?.includes("network") ||
          err?.message?.includes("Cannot reach");
        const isRetryable = isTimeout || isNetworkError;

        if (isRetryable && attempt < MAX_RETRIES) {
          const delay = (attempt + 1) * 3000; // 3s, 6s, 9s
          console.warn(
            `[QueryFn] Retrying ${url} in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})…`
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        // Non-retryable or exhausted retries — rethrow
        throw err;
      }
    }

    throw lastError;
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      // ✅ Mobile fix: data stays fresh for 5 min, but is kept in cache for
      //    30 min (gcTime). This means navigating back to a screen after a
      //    brief network drop still shows the last good data instead of
      //    an error or a full re-fetch over a weak signal.
      staleTime: 5 * 60 * 1000,   // 5 minutes
      gcTime:    30 * 60 * 1000,  // 30 minutes — keep cache alive across app-resume
      // ✅ Mobile fix: React Query will retry failed queries up to 2 times
      //    with its own built-in exponential back-off before showing an error.
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15000),
    },
    mutations: {
      retry: false,
    },
  },
});

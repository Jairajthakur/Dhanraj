import { fetch } from "expo/fetch";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { QueryClient, QueryFunction } from "@tanstack/react-query";

/**
 * Gets the base URL for the Express API server.
 *
 * Priority:
 *  1. EXPO_PUBLIC_API_URL — set in eas.json env for APK builds (most reliable for production)
 *  2. EXPO_PUBLIC_DOMAIN env var (baked in by Metro from workflow env)
 *  3. app.json extra.apiUrl (always baked in by Expo — most reliable for native)
 *  4. Web: window.location.origin (deployed web — same domain as backend)
 *  5. Native fallback: derive host from Expo manifest connection data
 */
export function getApiUrl(): string {
  // 1. EAS build-time env var — set in eas.json for APK/production builds
  const easApiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (easApiUrl) {
    return easApiUrl.startsWith("http") ? easApiUrl : `https://${easApiUrl}`;
  }

  // 2. Env var baked in by Metro
  const envDomain = process.env.EXPO_PUBLIC_DOMAIN;
  if (envDomain) {
    const url = envDomain.startsWith("http") ? envDomain : `https://${envDomain}`;
    console.log("[getApiUrl] using EXPO_PUBLIC_DOMAIN:", url);
    return url;
  }

  // 3. app.json extra.apiUrl — always baked in, most reliable on native
  const extraUrl = Constants.expoConfig?.extra?.apiUrl as string | undefined;
  if (extraUrl) {
    console.log("[getApiUrl] using extra.apiUrl:", extraUrl);
    return extraUrl;
  }

  // 3. Web fallback — deployed app shares domain with Express backend
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return window.location.origin;
  }

  // 4. Native/Expo Go last resort — extract host from manifest connection data
  const candidates: (string | undefined)[] = [
    (Constants.expoConfig as any)?.hostUri,
    (Constants as any).expoGoConfig?.debuggerHost,
    (Constants as any).manifest?.debuggerHost,
    (Constants as any).manifest2?.extra?.expoClient?.debuggerHost,
    Constants.linkingUri,
  ];

  for (const raw of candidates) {
    if (!raw) continue;
    const stripped = raw
      .replace(/^exp?s?:\/\//i, "")
      .replace(/^https?:\/\//i, "")
      .split("/")[0]
      .replace(/:\d+$/, "");
    if (stripped && stripped.includes(".")) {
      return `https://${stripped}`;
    }
  }

  throw new Error(
    "Cannot reach backend. Check your network connection and try again."
  );
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown | undefined,
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);

  const res = await fetch(url.toString(), {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const baseUrl = getApiUrl();
    const url = new URL(queryKey.join("/") as string, baseUrl);

    const res = await fetch(url.toString(), {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 30 * 1000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

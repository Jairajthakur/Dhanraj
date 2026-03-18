import { Platform } from "react-native";
import Constants from "expo-constants";
import { QueryClient, QueryFunction } from "@tanstack/react-query";

// ─── Get API URL — NEVER throws, always returns valid URL ────────────────────
export function getApiUrl(): string {
  // 1. EAS build-time env var
  const easApiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (easApiUrl) {
    return easApiUrl.startsWith("http") ? easApiUrl : `https://${easApiUrl}`;
  }

  // 2. Metro env var
  const envDomain = process.env.EXPO_PUBLIC_DOMAIN;
  if (envDomain) {
    return envDomain.startsWith("http") ? envDomain : `https://${envDomain}`;
  }

  // 3. app.json extra.apiUrl — most reliable for APK builds
  const extraUrl = Constants.expoConfig?.extra?.apiUrl as string | undefined;
  if (extraUrl) return extraUrl;

  // 4. Web fallback
  if (Platform.OS === "web") {
    return "https://dhanraj-production.up.railway.app";
  }

  // 5. Expo Go dev server detection
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

  // ✅ FIXED: Never throw — hardcoded fallback so APK never crashes
  console.warn("[API] Using hardcoded fallback URL");
  return "https://dhanraj-production.up.railway.app";
}

// ─── Safe fetch helper ───────────────────────────────────────────────────────
async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// ─── Safe URL builder — never throws ────────────────────────────────────────
function buildUrl(path: string, base: string): string {
  try {
    return new URL(path, base).toString();
  } catch {
    return `${base}${path}`;
  }
}

// ─── apiRequest (used by old web code) ──────────────────────────────────────
export async function apiRequest(
  method: string,
  route: string,
  data?: unknown,
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = buildUrl(route, baseUrl);

  // ✅ FIXED: No localStorage — use credentials/cookies only (matches backend)
  const res = await fetch(url, {
    method,
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

// ─── Query function ──────────────────────────────────────────────────────────
type UnauthorizedBehavior = "returnNull" | "throw";

export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const baseUrl = getApiUrl();
    const url = buildUrl(queryKey.join("/") as string, baseUrl);

    // ✅ FIXED: No localStorage — cookies only
    const res = await fetch(url, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

// ─── Query client ────────────────────────────────────────────────────────────
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

import { Platform } from "react-native";
import Constants from "expo-constants";
import { QueryClient, QueryFunction } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";

export function getApiUrl(): string {
  const easApiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (easApiUrl) return easApiUrl.startsWith("http") ? easApiUrl : `https://${easApiUrl}`;
  const envDomain = process.env.EXPO_PUBLIC_DOMAIN;
  if (envDomain) return envDomain.startsWith("http") ? envDomain : `https://${envDomain}`;
  const extraUrl = Constants.expoConfig?.extra?.apiUrl as string | undefined;
  if (extraUrl) return extraUrl;
  if (Platform.OS === "web") return "https://dhanraj-production.up.railway.app";
  const candidates: (string | undefined)[] = [
    (Constants.expoConfig as any)?.hostUri,
    (Constants as any).expoGoConfig?.debuggerHost,
    (Constants as any).manifest?.debuggerHost,
    (Constants as any).manifest2?.extra?.expoClient?.debuggerHost,
    Constants.linkingUri,
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const stripped = raw.replace(/^exp?s?:\/\//i, "").replace(/^https?:\/\//i, "").split("/")[0].replace(/:\d+$/, "");
    if (stripped && stripped.includes(".")) return `https://${stripped}`;
  }
  return "https://dhanraj-production.up.railway.app";
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

function buildUrl(path: string, base: string): string {
  try { return new URL(path, base).toString(); }
  catch { return `${base}${path}`; }
}

async function getStoredToken(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try { return await AsyncStorage.getItem("auth_token"); }
  catch { return null; }
}

// ─── Persistent disk cache (survives app restarts, works offline) ─────────────
const CACHE_PREFIX = "rq_cache_v1:";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours on disk

interface CacheEntry { data: any; ts: number }

async function readCache(key: string): Promise<any | null> {
  try {
    const raw = Platform.OS === "web"
      ? localStorage.getItem(CACHE_PREFIX + key)
      : await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.ts > CACHE_TTL_MS) return null;
    return entry.data;
  } catch { return null; }
}

async function writeCache(key: string, data: any): Promise<void> {
  try {
    const entry: CacheEntry = { data, ts: Date.now() };
    const raw = JSON.stringify(entry);
    if (Platform.OS === "web") localStorage.setItem(CACHE_PREFIX + key, raw);
    else await AsyncStorage.setItem(CACHE_PREFIX + key, raw);
  } catch {}
}

export async function clearAllCache(): Promise<void> {
  try {
    if (Platform.OS === "web") {
      Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX)).forEach(k => localStorage.removeItem(k));
    } else {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = (keys as readonly string[]).filter(k => k.startsWith(CACHE_PREFIX));
      if (cacheKeys.length > 0) await AsyncStorage.multiRemove(cacheKeys as string[]);
    }
  } catch {}
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown,
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = buildUrl(route, baseUrl);
  const headers: Record<string, string> = {
    ...(data ? { "Content-Type": "application/json" } : {}),
  };
  const token = await getStoredToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, {
    method,
    headers,
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
    const cacheKey = (queryKey as string[]).join("/");
    const url = buildUrl(cacheKey, baseUrl);
    const headers: Record<string, string> = {};
    const token = await getStoredToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, {
        credentials: "include",
        headers,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (unauthorizedBehavior === "returnNull" && res.status === 401) return null;
      await throwIfResNotOk(res);
      const json = await res.json();
      // Persist fresh data to disk — available next time even offline
      await writeCache(cacheKey, json);
      return json;
    } catch (err: any) {
      // Network error / timeout / low signal — serve last known good data silently
      const cached = await readCache(cacheKey);
      if (cached !== null) return cached as T;
      throw err;
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      // Data stays "fresh" for 5 min — no re-fetch on every screen visit
      staleTime: 5 * 60 * 1000,
      // Keep in memory for 30 min even when component unmounts — instant navigation
      gcTime: 30 * 60 * 1000,
      // Never retry — fall back to disk cache instead of hammering the server
      retry: false,
      // Show cached data instantly while re-fetching in background
      placeholderData: (prev: any) => prev,
      // Works even when fully offline
      networkMode: "offlineFirst",
    },
    mutations: {
      retry: false,
      networkMode: "always",
    },
  },
});

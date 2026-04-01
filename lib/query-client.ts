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
  console.warn("[API] Using hardcoded fallback URL");
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
    const url = buildUrl(queryKey.join("/") as string, baseUrl);
    const headers: Record<string, string> = {};
    const token = await getStoredToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(url, { 
      credentials: "include",
      headers,
    });
    if (unauthorizedBehavior === "returnNull" && res.status === 401) return null;
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
    mutations: { retry: false },
  },
});

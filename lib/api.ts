import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "./query-client";

const SESSION_KEY = "session_agent";
const TOKEN_KEY = "auth_token";

// ─── Agent cache ─────────────────────────────────────────────────────────────
export const agentCache = {
  get: async (): Promise<any | null> => {
    try {
      if (Platform.OS === "web") {
        const v = localStorage.getItem(SESSION_KEY);
        return v ? JSON.parse(v) : null;
      }
      const v = await AsyncStorage.getItem(SESSION_KEY);
      return v ? JSON.parse(v) : null;
    } catch { return null; }
  },
  set: async (agent: any): Promise<void> => {
    try {
      const v = JSON.stringify(agent);
      if (Platform.OS === "web") { localStorage.setItem(SESSION_KEY, v); return; }
      await AsyncStorage.setItem(SESSION_KEY, v);
    } catch {}
  },
  clear: async (): Promise<void> => {
    try {
      if (Platform.OS === "web") { localStorage.removeItem(SESSION_KEY); return; }
      await AsyncStorage.removeItem(SESSION_KEY);
    } catch {}
  },
};

// ─── Token store ─────────────────────────────────────────────────────────────
export const tokenStore = {
  get: async (): Promise<string | null> => {
    try {
      if (Platform.OS === "web") return null;
      return await AsyncStorage.getItem(TOKEN_KEY);
    } catch { return null; }
  },
  set: async (token: string): Promise<void> => {
    try {
      if (Platform.OS === "web") return;
      await AsyncStorage.setItem(TOKEN_KEY, token);
    } catch {}
  },
  clear: async (): Promise<void> => {
    try {
      if (Platform.OS === "web") return;
      await AsyncStorage.removeItem(TOKEN_KEY);
    } catch {}
  },
};

// ─── Safe URL builder ────────────────────────────────────────────────────────
function buildUrl(route: string, base: string): string {
  try { return new URL(route, base).toString(); }
  catch { return `${base}${route}`; }
}

// ─── Core request ────────────────────────────────────────────────────────────
async function apiRequest(method: string, route: string, data?: any) {
  const baseUrl = getApiUrl();
  const url = buildUrl(route, baseUrl);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (Platform.OS !== "web") {
    const token = await tokenStore.get();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    credentials: "include",
    body: data ? JSON.stringify(data) : undefined,
  });

  if (res.status === 401) {
    await agentCache.clear();
    await tokenStore.clear();
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = `HTTP ${res.status}`;
    try {
      const json = JSON.parse(text);
      msg = json.message || json.error || msg;
    } catch {
      if (text) msg = text;
    }
    console.error(`[API] ${method} ${route} → ${res.status}:`, msg);
    throw new Error(msg);
  }

  const text = await res.text();
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { return {}; }
}

// ─── Helper for React Native file upload ─────────────────────────────────────
function createFormData(file: any, extraData?: any) {
  const form = new FormData();

  form.append("file", {
    uri: file.uri,
    name: file.name || "file.xlsx",
    type:
      file.mimeType ||
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  } as any);

  if (extraData) {
    Object.keys(extraData).forEach((key) => {
      form.append(key, extraData[key]);
    });
  }

  return form;
}

// ─── API ─────────────────────────────────────────────────────────────────────
export const api = {
  login: async (username: string, password: string) => {
    const res = await apiRequest("POST", "/api/auth/login", { username, password });
    if (res?.agent) await agentCache.set(res.agent);
    if (res?.token && Platform.OS !== "web") await tokenStore.set(res.token);
    return res;
  },

  logout: async () => {
    await agentCache.clear();
    await tokenStore.clear();
    try { await apiRequest("POST", "/api/auth/logout"); } catch {}
  },

  me: async () => {
    try {
      const res = await apiRequest("GET", "/api/auth/me");
      if (res?.agent) {
        await agentCache.set(res.agent);
        if (res?.token && Platform.OS !== "web") await tokenStore.set(res.token);
      }
      return res;
    } catch (e: any) {
      if (Platform.OS !== "web" && e?.message !== "Unauthorized") {
        const cached = await agentCache.get();
        if (cached) return { agent: cached };
      }
      throw e;
    }
  },

  getCases: () => apiRequest("GET", "/api/cases"),
  getBktCases: (category?: string) =>
    apiRequest("GET", `/api/bkt-cases${category ? `?category=${category}` : ""}`),
  getStats: () => apiRequest("GET", "/api/stats"),

  // ─── FILE UPLOADS ──────────────────────────────────────────────────────────

  admin: {
    importCases: async (file: any) => {
      const form = createFormData(file);
      const token = await tokenStore.get();

      const r = await fetch(`${getApiUrl()}/api/admin/import`, {
        method: "POST",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: form,
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.message || `HTTP ${r.status}`);
      return json;
    },

    importBkt: async (file: any) => {
      const form = createFormData(file);
      const token = await tokenStore.get();

      const r = await fetch(`${getApiUrl()}/api/admin/import-bkt`, {
        method: "POST",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: form,
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.message || `HTTP ${r.status}`);
      return json;
    },

    importBktPerf: async (file: any, bkt?: string) => {
      const form = createFormData(file, { bkt });
      const token = await tokenStore.get();

      const r = await fetch(`${getApiUrl()}/api/admin/import-bkt-perf`, {
        method: "POST",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: form,
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.message || `HTTP ${r.status}`);
      return json;
    },

    // ✅ NEW: importDepositions
    importDepositions: async (file: any) => {
      const form = createFormData(file);
      const token = await tokenStore.get();

      const r = await fetch(`${getApiUrl()}/api/admin/import-depositions`, {
        method: "POST",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: form,
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.message || `HTTP ${r.status}`);
      return json;
    },
  },
};

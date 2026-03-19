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
    const json = await res.json().catch(() => ({}));
    throw new Error((json as any).message || "API Error");
  }

  const text = await res.text();
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { return {}; }
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
  getTodayPtp: () => apiRequest("GET", "/api/today-ptp"),
  updateFeedback: (id: number, data: any) =>
    apiRequest("PUT", `/api/cases/${id}/feedback`, data),
  updateBktFeedback: (id: number, data: any) =>
    apiRequest("PUT", `/api/bkt-cases/${id}/feedback`, data),
  getDepositions: () => apiRequest("GET", "/api/depositions"),
  createDeposition: (data: any) => apiRequest("POST", "/api/depositions", data),
  getSalary: () => apiRequest("GET", "/api/salary"),
  checkIn: () => apiRequest("POST", "/api/attendance/checkin"),
  checkOut: () => apiRequest("POST", "/api/attendance/checkout"),
  getBktPerformance: () => apiRequest("GET", "/api/bkt-performance"),
  getBktPerfSummary: () => apiRequest("GET", "/api/bkt-perf-summary"),
  getRequiredDeposits: () => apiRequest("GET", "/api/required-deposits"),
  changePassword: (data: any) => apiRequest("PUT", "/api/auth/password", data),
  getProfile: () => apiRequest("GET", "/api/profile"),

  savePushToken: async (token: string) => {
    try {
      await apiRequest("POST", "/api/push-token", { token });
      console.log("[Push] Token saved ✅");
    } catch (e: any) {
      console.error("[Push] Failed to save token:", e.message);
    }
  },

  admin: {
    getCases: () => apiRequest("GET", "/api/admin/cases"),
    getCasesByAgent: (agentId: number) =>
      apiRequest("GET", `/api/admin/cases/agent/${agentId}`),
    getBktCases: (category?: string) =>
      apiRequest("GET", `/api/admin/bkt-cases${category ? `?category=${category}` : ""}`),
    getAgents: () => apiRequest("GET", "/api/admin/agents"),
    getStats: () => apiRequest("GET", "/api/admin/stats"),
    getAgentStats: (agentId: number) =>
      apiRequest("GET", `/api/admin/agent/${agentId}/stats`),
    getSalary: () => apiRequest("GET", "/api/admin/salary"),
    createSalary: (data: any) => apiRequest("POST", "/api/admin/salary", data),
    getDepositions: () => apiRequest("GET", "/api/admin/depositions"),
    getRequiredDeposits: () => apiRequest("GET", "/api/admin/required-deposits"),
    createRequiredDeposit: (data: any) =>
      apiRequest("POST", "/api/admin/required-deposits", data),
    deleteRequiredDeposit: (id: number) =>
      apiRequest("DELETE", `/api/admin/required-deposits/${id}`),

    // ✅ Verify screenshot
    verifyDeposit: (id: number) =>
      apiRequest("PUT", `/api/admin/required-deposits/${id}/verify`),

    // ✅ FIXED: was called verifyScreenshot in depositions screen
    verifyScreenshot: (id: number) =>
      apiRequest("PUT", `/api/admin/required-deposits/${id}/verify`),

    // ✅ NEW: Mark cash collected
    markCashCollected: (id: number) =>
      apiRequest("PUT", `/api/admin/required-deposits/${id}/cash-collected`),

    getAttendance: () => apiRequest("GET", "/api/admin/attendance"),
    getBktPerformance: () => apiRequest("GET", "/api/admin/bkt-performance"),
    getBktPerfSummary: () => apiRequest("GET", "/api/admin/bkt-perf-summary"),
    updateCaseStatus: (
      id: number,
      data: {
        status: "Paid" | "Unpaid" | "PTP";
        rollback_yn?: boolean | null;
        table: "loan" | "bkt";
      }
    ) => apiRequest("PUT", `/api/admin/cases/${id}/status`, data),
    resetFeedbackAgent: (agentId: number) =>
      apiRequest("POST", `/api/admin/reset-feedback/agent/${agentId}`),
    resetFeedbackCase: (caseId: number, table: "loan" | "bkt") =>
      apiRequest("POST", `/api/admin/reset-feedback/case/${caseId}`, { table }),

    // ✅ File uploads with Bearer token on native
    importCases: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      const token = await tokenStore.get();
      return fetch(`${getApiUrl()}/api/admin/import`, {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      }).then((r) => r.json());
    },
    importBkt: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      const token = await tokenStore.get();
      return fetch(`${getApiUrl()}/api/admin/import-bkt`, {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      }).then((r) => r.json());
    },
    importBktPerf: async (file: File, bkt?: string) => {
      const form = new FormData();
      form.append("file", file);
      if (bkt) form.append("bkt", bkt);
      const token = await tokenStore.get();
      return fetch(`${getApiUrl()}/api/admin/import-bkt-perf`, {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      }).then((r) => r.json());
    },
    getPushStatus: () => apiRequest("GET", "/api/admin/push-status"),
    testPush: (agentId: number) =>
      apiRequest("POST", `/api/admin/test-push/${agentId}`),
    testPushAll: () => apiRequest("POST", "/api/admin/test-push-all"),
    clearPtp: () => apiRequest("POST", "/api/admin/clear-ptp"),
  },
};

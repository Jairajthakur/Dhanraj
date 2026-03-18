import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "./query-client";

const SESSION_KEY = "session_agent";

// ─── Agent cache — works on both web and native ─────────────────────────────
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

// ─── Core request function ───────────────────────────────────────────────────
async function apiRequest(method: string, route: string, data?: any) {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);

  const res = await fetch(url.toString(), {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "include", // session cookie auth — matches your Express backend
    body: data ? JSON.stringify(data) : undefined,
  });

  if (res.status === 401) {
    await agentCache.clear();
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error((json as any).message || "API Error");
  }

  return res.json();
}

// ─── API ─────────────────────────────────────────────────────────────────────
export const api = {
  login: async (username: string, password: string) => {
    const res = await apiRequest("POST", "/api/auth/login", { username, password });
    if (res?.agent) await agentCache.set(res.agent);
    return res;
  },

  logout: async () => {
    await agentCache.clear();
    try { await apiRequest("POST", "/api/auth/logout"); } catch {}
  },

  me: async () => {
    try {
      const res = await apiRequest("GET", "/api/auth/me");
      if (res?.agent) await agentCache.set(res.agent);
      return res;
    } catch (e: any) {
      // On native: fall back to cache if server unreachable
      if (Platform.OS !== "web") {
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

  // ✅ Push token — only called after agent is confirmed logged in
  savePushToken: async (token: string) => {
    try {
      await apiRequest("POST", "/api/push-token", { token });
      console.log("[Push] Token saved to server ✅");
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
    verifyDeposit: (id: number) =>
      apiRequest("PUT", `/api/admin/required-deposits/${id}/verify`),
    getAttendance: () => apiRequest("GET", "/api/admin/attendance"),
    getBktPerformance: () => apiRequest("GET", "/api/admin/bkt-performance"),
    getBktPerfSummary: () => apiRequest("GET", "/api/admin/bkt-perf-summary"),
    updateCaseStatus: (id: number, data: {
      status: "Paid" | "Unpaid" | "PTP";
      rollback_yn?: boolean | null;
      table: "loan" | "bkt";
    }) => apiRequest("PUT", `/api/admin/cases/${id}/status`, data),
    resetFeedbackAgent: (agentId: number) =>
      apiRequest("POST", `/api/admin/reset-feedback/agent/${agentId}`),
    resetFeedbackCase: (caseId: number, table: "loan" | "bkt") =>
      apiRequest("POST", `/api/admin/reset-feedback/case/${caseId}`, { table }),
    importCases: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return fetch(`${getApiUrl()}/api/admin/import`, {
        method: "POST", credentials: "include", body: form,
      }).then(r => r.json());
    },
    importBkt: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return fetch(`${getApiUrl()}/api/admin/import-bkt`, {
        method: "POST", credentials: "include", body: form,
      }).then(r => r.json());
    },
    importBktPerf: (file: File, bkt?: string) => {
      const form = new FormData();
      form.append("file", file);
      if (bkt) form.append("bkt", bkt);
      return fetch(`${getApiUrl()}/api/admin/import-bkt-perf`, {
        method: "POST", credentials: "include", body: form,
      }).then(r => r.json());
    },
    getPushStatus: () => apiRequest("GET", "/api/admin/push-status"),
    testPush: (agentId: number) =>
      apiRequest("POST", `/api/admin/test-push/${agentId}`),
    testPushAll: () => apiRequest("POST", "/api/admin/test-push-all"),
    clearPtp: () => apiRequest("POST", "/api/admin/clear-ptp"),
  },
};

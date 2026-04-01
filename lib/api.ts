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

// ─── Multipart upload (file + optional extra fields) ─────────────────────────
async function apiUpload(route: string, form: FormData) {
  const baseUrl = getApiUrl();
  const url = buildUrl(route, baseUrl);
  const token = await tokenStore.get();
  const r = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form,
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.message || `HTTP ${r.status}`);
  return json;
}

// ─── Helper for React Native file upload ─────────────────────────────────────
function createFormData(file: any, extraData?: Record<string, any>) {
  const form = new FormData();
  form.append("file", {
    uri: file.uri,
    name: file.name || "file.xlsx",
    type:
      file.mimeType ||
      file.type ||
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  } as any);
  if (extraData) {
    Object.keys(extraData).forEach((key) => {
      form.append(key, extraData[key]);
    });
  }
  return form;
}

// ─── Screenshot upload helper ─────────────────────────────────────────────────
async function uploadScreenshot(route: string, file: any, extraFields?: Record<string, any>) {
  const baseUrl = getApiUrl();
  const url = buildUrl(route, baseUrl);
  const token = await tokenStore.get();

  const form = new FormData();
  form.append("screenshot", {
    uri: file.uri,
    name: file.name || "screenshot.jpg",
    type: file.mimeType || file.type || "image/jpeg",
  } as any);

  if (extraFields) {
    Object.keys(extraFields).forEach((key) => {
      form.append(key, String(extraFields[key]));
    });
  }

  const r = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form,
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.message || `HTTP ${r.status}`);
  return json;
}

// ─── Query client helpers ────────────────────────────────────────────────────
let _queryClient: any = null;
export function setQueryClientRef(qc: any) {
  _queryClient = qc;
}
function invalidateAfterImport() {
  if (!_queryClient) return;
  _queryClient.invalidateQueries({ queryKey: ["/api/admin/cases"] });
  _queryClient.invalidateQueries({ queryKey: ["/api/admin/agents"] });
  _queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
  _queryClient.invalidateQueries({ queryKey: ["/api/cases"] });
  _queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
  _queryClient.invalidateQueries({ queryKey: ["/api/admin/fos-depositions"] });
  _queryClient.invalidateQueries({ queryKey: ["/api/fos-depositions"] });
  _queryClient.invalidateQueries({ queryKey: ["/api/admin/bkt-cases"] });
  _queryClient.invalidateQueries({ queryKey: ["/api/bkt-cases"] });
}

// ─── API ─────────────────────────────────────────────────────────────────────
export const api = {

  // ── Auth ──────────────────────────────────────────────────────────────────
  login: async (username: string, password: string) => {
    // FIX #3: clear any stale token BEFORE sending the login request
    // previously, a leftover invalid token was being sent in the Authorization
    // header of the login POST itself, causing the server to reject re-login
    await tokenStore.clear();

    const res = await apiRequest("POST", "/api/auth/login", { username, password });
    if (res?.agent) await agentCache.set(res.agent);
    if (res?.token && Platform.OS !== "web") await tokenStore.set(res.token);
    return res;
  },

  logout: async () => {
    try { await apiRequest("POST", "/api/auth/logout"); } catch {}
  },

  // FIX #2: removed the catch block that was masking errors by returning the
  // cached agent on ANY non-401 error — this caused AuthContext to re-save
  // stale cache data and obscured real error states. AuthContext already
  // handles network errors correctly, so no catch needed here.
  me: async () => {
    const res = await apiRequest("GET", "/api/auth/me");
    if (res?.agent) {
      await agentCache.set(res.agent);
      if (res?.token && Platform.OS !== "web") await tokenStore.set(res.token);
    }
    return res;
  },

  changePassword: (currentPassword: string, newPassword: string) =>
    apiRequest("PUT", "/api/auth/password", { currentPassword, newPassword }),

  // ── Profile ───────────────────────────────────────────────────────────────
  getProfile: () => apiRequest("GET", "/api/profile"),
  saveProfilePhoto: (photoUrl: string) =>
    apiRequest("POST", "/api/profile-photo", { photoUrl }),

  // ── Cases ─────────────────────────────────────────────────────────────────
  getCases: () => apiRequest("GET", "/api/cases"),
  getCaseById: (id: number) => apiRequest("GET", `/api/cases/${id}`),

  getBktCases: (category?: string) =>
    apiRequest("GET", `/api/bkt-cases${category ? `?category=${category}` : ""}`),

  getStats: () => apiRequest("GET", "/api/stats"),

  updateFeedback: (id: number, data: any) =>
    apiRequest("PUT", `/api/cases/${id}/feedback`, data),

  updateBktFeedback: (id: number, data: any) =>
    apiRequest("PUT", `/api/bkt-cases/${id}/feedback`, data),

  getTodayPtp: () => apiRequest("GET", "/api/today-ptp"),

  addExtraNumber: (id: number, number: string, table: string) =>
  apiRequest("POST", `/api/cases/${id}/extra-numbers`, { number, table }),

  removeExtraNumber: (id: number, number: string, table: string) =>
  apiRequest("DELETE", `/api/cases/${id}/extra-numbers`, { number, table }),
  // ── Attendance ────────────────────────────────────────────────────────────
  checkIn:  () => apiRequest("POST", "/api/attendance/checkin"),
  checkOut: () => apiRequest("POST", "/api/attendance/checkout"),
  getAttendanceToday: () => apiRequest("GET", "/api/attendance/today"),

  // ── Salary ────────────────────────────────────────────────────────────────
  getSalary: () => apiRequest("GET", "/api/salary"),

  // ── Depositions ───────────────────────────────────────────────────────────
  getDepositions: () => apiRequest("GET", "/api/depositions"),
  createDeposition: (data: any) => apiRequest("POST", "/api/depositions", data),

  // ── Required deposits ─────────────────────────────────────────────────────
  getRequiredDeposits: () => apiRequest("GET", "/api/required-deposits"),

  uploadDepositScreenshot: (depositId: number, file: any) =>
    uploadScreenshot(`/api/required-deposits/${depositId}/screenshot`, file),

  // ── FOS Depositions ───────────────────────────────────────────────────────
  getFosDepositions: () => apiRequest("GET", "/api/fos-depositions"),

  fosDepositPayCash: (id: number, cashAmount: number) =>
    apiRequest("POST", `/api/fos-depositions/${id}/pay-cash`, { cashAmount }),

  fosDepositPayOnline: async (id: number, file: any) =>
    uploadScreenshot(`/api/fos-depositions/${id}/pay-online`, file),

  fosDepositPayBoth: async (id: number, cashAmount: number, onlineAmount: number, file?: any) => {
    const baseUrl = getApiUrl();
    const url = buildUrl(`/api/fos-depositions/${id}/pay-both`, baseUrl);
    const token = await tokenStore.get();
    const form = new FormData();
    form.append("cashAmount", String(cashAmount));
    form.append("onlineAmount", String(onlineAmount));
    if (file) {
      form.append("screenshot", {
        uri: file.uri,
        name: file.name || "screenshot.jpg",
        type: file.mimeType || file.type || "image/jpeg",
      } as any);
    }
    const r = await fetch(url, {
      method: "PUT",
      credentials: "include",
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: form,
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(json.message || `HTTP ${r.status}`);
    return json;
  },

  // ── BKT Performance ───────────────────────────────────────────────────────
  getBktPerfSummary: () => apiRequest("GET", "/api/bkt-perf-summary"),

  // ── Push token ────────────────────────────────────────────────────────────
  savePushToken: (token: string) =>
    apiRequest("POST", "/api/push-token", { token }),
  
    // ── Receipt requests ──────────────────────────────────────────────────────
  getReceiptPermission: () => apiRequest("GET", "/api/receipt-permission"),

  requestReceipt: (caseId: number, data: {
    loan_no?: string;
    customer_name?: string;
    table_type?: string;
    notes?: string;
  }) => apiRequest("POST", `/api/cases/${caseId}/request-receipt`, data),

  getMyReceiptRequests: () => apiRequest("GET", "/api/receipt-requests"),


  // ── Call recordings ───────────────────────────────────────────────────────
  getCallRecordings: () => apiRequest("GET", "/api/call-recordings"),

  // ── Twilio outbound call ──────────────────────────────────────────────────
  makeCall: (data: {
    customerPhone: string;
    agentName: string;
    caseId: string | number;
    loanNo: string;
  }) => apiRequest("POST", "/api/make-call", data),

  // ─── ADMIN ────────────────────────────────────────────────────────────────
  admin: {

    // ── Agents ──────────────────────────────────────────────────────────────
    getAgents: () => apiRequest("GET", "/api/admin/agents"),
    getStats:  () => apiRequest("GET", "/api/admin/stats"),

    getAgentStats: (agentId: number) =>
      apiRequest("GET", `/api/admin/agent/${agentId}/stats`),

    // ── Cases ────────────────────────────────────────────────────────────────
    getCases: () => apiRequest("GET", "/api/admin/cases"),
    getCasesByAgent: (agentId: number) =>
      apiRequest("GET", `/api/admin/cases/agent/${agentId}`),
    createCase: (data: any) => apiRequest("POST", "/api/admin/cases", data),

    updateCaseStatus: (id: number, data: {
      status: string;
      rollback_yn?: boolean | null;
      table: "loan" | "bkt";
    }) => apiRequest("PUT", `/api/admin/cases/${id}/status`, data),

    // ── BKT cases ────────────────────────────────────────────────────────────
    getBktCases: (category?: string) =>
      apiRequest("GET", `/api/admin/bkt-cases${category ? `?category=${category}` : ""}`),

    // ── Feedback ─────────────────────────────────────────────────────────────
   resetFeedbackForCase: (caseId: number, table: string) =>
  apiRequest("POST", `/api/admin/reset-feedback/case/${caseId}`, { table }),

    resetMonthlyFeedbackForAgent: (agentId: number) =>
    apiRequest("POST", `/api/admin/reset-monthly-feedback/agent/${agentId}`),

  resetMonthlyFeedbackForCase: (caseId: number, table: string) =>
  apiRequest("POST", `/api/admin/reset-monthly-feedback/case/${caseId}`, { table }),
    
    removeExtraNumber: (id: number, number: string, table: string) =>
      apiRequest("DELETE", `/api/admin/cases/${id}/extra-numbers`, { number, table }),

    // ── Salary ───────────────────────────────────────────────────────────────
    getAllSalary: () => apiRequest("GET", "/api/admin/salary"),
    getSalary:   () => apiRequest("GET", "/api/admin/salary"),
    createSalary: (data: any) => apiRequest("POST", "/api/admin/salary", data),
    deleteSalary: (id: number) => apiRequest("DELETE", `/api/admin/salary/${id}`),

    // ── Depositions ──────────────────────────────────────────────────────────
    getAllDepositions: () => apiRequest("GET", "/api/admin/depositions"),

    // ── Required deposits ────────────────────────────────────────────────────
    getRequiredDeposits: () => apiRequest("GET", "/api/admin/required-deposits"),
    createRequiredDeposit: (data: {
      agentId: number;
      amount: number;
      description?: string;
      dueDate?: string;
    }) => apiRequest("POST", "/api/admin/required-deposits", data),
    deleteRequiredDeposit: (id: number) =>
      apiRequest("DELETE", `/api/admin/required-deposits/${id}`),
    markCashCollected: (id: number) =>
      apiRequest("PUT", `/api/admin/required-deposits/${id}/cash-collected`),
    verifyDeposit: (id: number) =>
      apiRequest("PUT", `/api/admin/required-deposits/${id}/verify`),

    // ── FOS Depositions ──────────────────────────────────────────────────────
    getFosDepositions: () => apiRequest("GET", "/api/admin/fos-depositions"),
    getFosDepositionsByAgent: (agentId: number) =>
      apiRequest("GET", `/api/admin/fos-depositions/${agentId}`),
    createFosDeposition: (data: any) =>
      apiRequest("POST", "/api/admin/fos-depositions", data),
    updateFosDepositionPayment: (id: number, data: any) =>
      apiRequest("PUT", `/api/admin/fos-depositions/${id}/payment`, data),
    deleteFosDeposition: (id: number) =>
      apiRequest("DELETE", `/api/admin/fos-depositions/${id}`),

    // ── Attendance ───────────────────────────────────────────────────────────
    getAllAttendance:  () => apiRequest("GET", "/api/admin/attendance"),
    getAttendance:    () => apiRequest("GET", "/api/admin/attendance"),

    // ── BKT perf ─────────────────────────────────────────────────────────────
    getBktPerfSummary: () => apiRequest("GET", "/api/admin/bkt-perf-summary"),

    // ── Push ─────────────────────────────────────────────────────────────────
    getPushStatus: () => apiRequest("GET", "/api/admin/push-status"),
    testPush: (agentId: number) =>
      apiRequest("POST", `/api/admin/test-push/${agentId}`),
    testPushAll: () => apiRequest("POST", "/api/admin/test-push-all"),

    // ── Call recordings ───────────────────────────────────────────────────────
    getCallRecordings: () => apiRequest("GET", "/api/admin/call-recordings"),

    // ─── ADD THESE TO api.ts ───────────────────────────────────────────────────────

// Inside the main api object (alongside getCases, etc.):

  getReceiptPermission: () => apiRequest("GET", "/api/receipt-permission"),

  requestReceipt: (caseId: number, data: {
    loan_no?: string;
    customer_name?: string;
    table_type?: string;
    notes?: string;
  }) => apiRequest("POST", `/api/cases/${caseId}/request-receipt`, data),

  getMyReceiptRequests: () => apiRequest("GET", "/api/receipt-requests"),

// Inside the admin object (alongside admin.getCases, etc.):

    getReceiptRequests: () => apiRequest("GET", "/api/admin/receipt-requests"),

    resolveReceiptRequest: (id: number, status: "approved" | "rejected", notes?: string) =>
      apiRequest("PUT", `/api/admin/receipt-requests/${id}/resolve`, { status, notes }),

    setReceiptPermission: (agentId: number, enabled: boolean) =>
      apiRequest("PUT", `/api/admin/agents/${agentId}/receipt-permission`, { enabled }),

    // ── Exports ──────────────────────────────────────────────────────────────
    exportPtp: async () => {
      const baseUrl = getApiUrl();
      const token = await tokenStore.get();
      const r = await fetch(buildUrl("/api/admin/ptp-export", baseUrl), {
        credentials: "include",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.blob();
    },

    exportFeedback: async () => {
      const baseUrl = getApiUrl();
      const token = await tokenStore.get();
      const r = await fetch(buildUrl("/api/admin/feedback-export", baseUrl), {
        credentials: "include",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.blob();
    },

    exportFosDepositions: async () => {
      const baseUrl = getApiUrl();
      const token = await tokenStore.get();
      const r = await fetch(buildUrl("/api/admin/fos-depositions-export", baseUrl), {
        credentials: "include",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.blob();
    },

    clearPtp: () => apiRequest("POST", "/api/admin/clear-ptp"),

    // ── Imports ──────────────────────────────────────────────────────────────
    importCases: async (file: any) => {
      const json = await apiUpload("/api/admin/import", createFormData(file));
      invalidateAfterImport();
      return json;
    },

    importBkt: async (file: any) => {
      const json = await apiUpload("/api/admin/import-bkt", createFormData(file));
      invalidateAfterImport();
      return json;
    },

    importBktPerf: async (file: any, bkt?: string) => {
      const json = await apiUpload("/api/admin/import-bkt-perf", createFormData(file, bkt ? { bkt } : undefined));
      return json;
    },

    importDepositions: async (file: any) => {
      const json = await apiUpload("/api/admin/import-depositions", createFormData(file));
      invalidateAfterImport();
      return json;
    },
  },
};

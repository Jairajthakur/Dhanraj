import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "./query-client";

const SESSION_KEY = "session_agent";
const TOKEN_KEY   = "auth_token";

export const agentCache = {
  get: async (): Promise<any | null> => {
    try {
      if (Platform.OS === "web") { const v = localStorage.getItem(SESSION_KEY); return v ? JSON.parse(v) : null; }
      const v = await AsyncStorage.getItem(SESSION_KEY); return v ? JSON.parse(v) : null;
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

export const tokenStore = {
  get: async (): Promise<string | null> => {
    try {
      if (Platform.OS === "web") return localStorage.getItem(TOKEN_KEY);
      return await AsyncStorage.getItem(TOKEN_KEY);
    } catch { return null; }
  },
  set: async (token: string): Promise<void> => {
    try {
      if (Platform.OS === "web") { localStorage.setItem(TOKEN_KEY, token); return; }
      await AsyncStorage.setItem(TOKEN_KEY, token);
    } catch {}
  },
  clear: async (): Promise<void> => {
    try {
      if (Platform.OS === "web") { localStorage.removeItem(TOKEN_KEY); return; }
      await AsyncStorage.removeItem(TOKEN_KEY);
    } catch {}
  },
};

function buildUrl(route: string, base: string): string {
  try { return new URL(route, base).toString(); }
  catch { return `${base}${route}`; }
}

async function apiRequest(method: string, route: string, data?: any) {
  const baseUrl = getApiUrl();
  const url     = buildUrl(route, baseUrl);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
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
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = `HTTP ${res.status}`;
    try { const json = JSON.parse(text); msg = json.message || json.error || msg; } catch { if (text) msg = text; }
    console.error(`[API] ${method} ${route} → ${res.status}:`, msg);
    throw new Error(msg);
  }
  const text = await res.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return {}; }
}

async function apiUpload(route: string, form: FormData) {
  const baseUrl = getApiUrl();
  const url     = buildUrl(route, baseUrl);
  const token   = await tokenStore.get();
  const r = await fetch(url, {
    method:      "POST",
    credentials: "include",
    headers:     { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body:        form,
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.message || `HTTP ${r.status}`);
  return json;
}

function createFormData(file: any, extraData?: Record<string, any>) {
  const form = new FormData();
  form.append("file", {
    uri:  file.uri,
    name: file.name || "file.xlsx",
    type: file.mimeType || file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  } as any);
  if (extraData) Object.keys(extraData).forEach((key) => form.append(key, extraData[key]));
  return form;
}

async function uploadScreenshot(route: string, file: any, extraFields?: Record<string, any>) {
  const baseUrl = getApiUrl();
  const url     = buildUrl(route, baseUrl);
  const token   = await tokenStore.get();
  const form    = new FormData();
  form.append("screenshot", {
    uri:  file.uri,
    name: file.name || "screenshot.jpg",
    type: file.mimeType || file.type || "image/jpeg",
  } as any);
  if (extraFields) Object.keys(extraFields).forEach((key) => form.append(key, String(extraFields[key])));
  const r = await fetch(url, {
    method:      "POST",
    credentials: "include",
    headers:     { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body:        form,
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.message || `HTTP ${r.status}`);
  return json;
}

// ─── Query cache invalidation helper ─────────────────────────────────────────
let _queryClient: any = null;
export function setQueryClientRef(qc: any) { _queryClient = qc; }
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
  _queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
}

// ─── Query-string builder ─────────────────────────────────────────────────────
function qs(params: Record<string, string | number | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

// ─── API ──────────────────────────────────────────────────────────────────────
export const api = {

  // ── Auth ──────────────────────────────────────────────────────────────────
  login: async (username: string, password: string) => {
    await tokenStore.clear();
    const res = await apiRequest("POST", "/api/auth/login", { username, password });
    if (res?.agent) await agentCache.set(res.agent);
    if (res?.token) await tokenStore.set(res.token);
    return res;
  },
  logout: async () => { try { await apiRequest("POST", "/api/auth/logout"); } catch {} },
  me: async () => {
    const res = await apiRequest("GET", "/api/auth/me");
    if (res?.agent) { await agentCache.set(res.agent); if (res?.token) await tokenStore.set(res.token); }
    return res;
  },
  changePassword: (currentPassword: string, newPassword: string) =>
    apiRequest("PUT", "/api/auth/password", { currentPassword, newPassword }),

  // ── Profile ───────────────────────────────────────────────────────────────
  getProfile:       () => apiRequest("GET", "/api/profile"),
  saveProfilePhoto: (photoUrl: string) => apiRequest("POST", "/api/profile-photo", { photoUrl }),

  // ── Companies ─────────────────────────────────────────────────────────────
  /** Returns distinct company names for the current FOS agent's cases */
  getCompanies: (): Promise<{ companies: string[] }> =>
    apiRequest("GET", "/api/companies"),

  // ── Cases ─────────────────────────────────────────────────────────────────
  getCases: (params?: { company?: string | null }) =>
    apiRequest("GET", `/api/cases${qs({ company: params?.company })}`),

  getCaseById: (id: number) => apiRequest("GET", `/api/cases/${id}`),

  getBktCases: (params?: { category?: string; company?: string | null }) =>
    apiRequest(
      "GET",
      `/api/bkt-cases${qs({ category: params?.category, company: params?.company })}`,
    ),

  getStats: (params?: { company?: string | null }) =>
    apiRequest("GET", `/api/stats${qs({ company: params?.company })}`),

  updateFeedback: (id: number, data: any) =>
    apiRequest("PUT", `/api/cases/${id}/feedback`, data),

  updateBktFeedback: (id: number, data: any) =>
    apiRequest("PUT", `/api/bkt-cases/${id}/feedback`, data),

  getTodayPtp: (params?: { company?: string | null }) =>
    apiRequest("GET", `/api/today-ptp${qs({ company: params?.company })}`),

  getBrokenPtps: (): Promise<import("@/components/BlockingActionModal").BlockingItem[]> =>
  apiRequest("GET", "/api/broken-ptps"),

snoozeBlocking: () =>
  apiRequest("POST", "/api/broken-ptps/snooze"),

  addExtraNumber: (id: number, number: string, table: string) =>
    apiRequest("POST", `/api/cases/${id}/extra-numbers`, { number, table }),

  removeExtraNumber: (id: number, number: string, table: string) =>
    apiRequest("DELETE", `/api/cases/${id}/extra-numbers`, { number, table }),

  // ── Field visits ──────────────────────────────────────────────────────────
  getFieldVisits: (caseId: number) => apiRequest("GET", `/api/cases/${caseId}/visits`),

  recordFieldVisit: async (
    caseId: number,
    data: {
      lat: number; lng: number; accuracy?: number; case_type?: string;
      photo?: { uri: string; name?: string; mimeType?: string } | null;
      visit_outcome?: string; visit_remarks?: string;
    },
  ) => {
    if (data.photo) {
      const baseUrl = getApiUrl();
      const url     = buildUrl(`/api/cases/${caseId}/visit`, baseUrl);
      const token   = await tokenStore.get();
      const form    = new FormData();
      form.append("lat",  String(data.lat));
      form.append("lng",  String(data.lng));
      if (data.accuracy     != null) form.append("accuracy",       String(data.accuracy));
      if (data.case_type)            form.append("case_type",       data.case_type);
      if (data.visit_outcome)        form.append("visit_outcome",   data.visit_outcome);
      if (data.visit_remarks)        form.append("visit_remarks",   data.visit_remarks);
      if (Platform.OS === "web") {
        const fetchRes = await fetch(data.photo.uri);
        const blob = await fetchRes.blob();
        form.append("photo", blob, data.photo.name || "visit.jpg");
      } else {
        form.append("photo", {
          uri:  data.photo.uri,
          name: data.photo.name || "visit.jpg",
          type: data.photo.mimeType || "image/jpeg",
        } as any);
      }
      const r = await fetch(url, {
        method:      "POST",
        credentials: "include",
        headers:     { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body:        form,
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.message || `HTTP ${r.status}`);
      return json;
    }
    return apiRequest("POST", `/api/cases/${caseId}/visit`, {
      lat: data.lat, lng: data.lng, accuracy: data.accuracy,
      case_type: data.case_type, visit_outcome: data.visit_outcome, visit_remarks: data.visit_remarks,
    });
  },

  // ── Attendance ────────────────────────────────────────────────────────────
  checkIn:             () => apiRequest("POST", "/api/attendance/checkin"),
  checkOut:            () => apiRequest("POST", "/api/attendance/checkout"),
  getAttendanceToday:  () => apiRequest("GET",  "/api/attendance/today"),

  // ── Salary ────────────────────────────────────────────────────────────────
  getSalary: () => apiRequest("GET", "/api/salary"),

  // ── Depositions ───────────────────────────────────────────────────────────
  getDepositions:       () => apiRequest("GET",  "/api/depositions"),
  createDeposition:     (data: any) => apiRequest("POST", "/api/depositions", data),
  getRequiredDeposits:  () => apiRequest("GET",  "/api/required-deposits"),
  uploadDepositScreenshot: (depositId: number, file: any) =>
    uploadScreenshot(`/api/required-deposits/${depositId}/screenshot`, file),

  // ── FOS Depositions ───────────────────────────────────────────────────────
  getFosDepositions: () => apiRequest("GET", "/api/fos-depositions"),
  fosDepositPayCash: (id: number, cashAmount: number) =>
    apiRequest("POST", `/api/fos-depositions/${id}/pay-cash`, { cashAmount }),
  fosDepositPayOnline: async (id: number, file: any) =>
    uploadScreenshot(`/api/fos-depositions/${id}/pay-online`, file),
  fosDepositPayBoth: async (
    id: number, cashAmount: number, onlineAmount: number, file?: any,
  ) => {
    const baseUrl = getApiUrl();
    const url     = buildUrl(`/api/fos-depositions/${id}/pay-both`, baseUrl);
    const token   = await tokenStore.get();
    const form    = new FormData();
    form.append("cashAmount",   String(cashAmount));
    form.append("onlineAmount", String(onlineAmount));
    if (file) form.append("screenshot", {
      uri:  file.uri,
      name: file.name || "screenshot.jpg",
      type: file.mimeType || file.type || "image/jpeg",
    } as any);
    const r = await fetch(url, {
      method:      "PUT",
      credentials: "include",
      headers:     { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body:        form,
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(json.message || `HTTP ${r.status}`);
    return json;
  },

  // ── BKT Performance ───────────────────────────────────────────────────────
  /** company=null → all companies combined */
  getBktPerfSummary: (params?: { company?: string | null }) =>
    apiRequest("GET", `/api/bkt-perf-summary${qs({ company: params?.company })}`),

  getBktTwCollectionSummary: (params?: { company?: string | null }) =>
    apiRequest("GET", `/api/bkt-tw-collection-summary${qs({ company: params?.company })}`),

  // ── Push token ────────────────────────────────────────────────────────────
  savePushToken: (token: string) => apiRequest("POST", "/api/push-token", { token }),

  // ── Receipt requests ──────────────────────────────────────────────────────
  getReceiptPermission: () => apiRequest("GET", "/api/receipt-permission"),
  requestReceipt: (
    caseId: number,
    data: {
      loan_no?: string; customer_name?: string; table_type?: string;
      notes?: string; emi_amount?: number; cbc?: number; lpp?: number;
    },
  ) => apiRequest("POST", `/api/cases/${caseId}/request-receipt`, data),
  getMyReceiptRequests: () => apiRequest("GET", "/api/receipt-requests"),

  // ── Call recordings ───────────────────────────────────────────────────────
  getCallRecordings: () => apiRequest("GET", "/api/call-recordings"),
  makeCall: (data: {
    customerPhone: string; agentName: string; caseId: string | number; loanNo: string;
  }) => apiRequest("POST", "/api/make-call", data),

  // ─── ADMIN ────────────────────────────────────────────────────────────────
  admin: {

    // ── Agents ──────────────────────────────────────────────────────────────
    getAgents:     () => apiRequest("GET", "/api/admin/agents"),
    getStats:      (company?: string | null) =>
      apiRequest("GET", `/api/admin/stats${qs({ company })}`),
    getAgentStats: (agentId: number) =>
      apiRequest("GET", `/api/admin/agent/${agentId}/stats`),

    // ── Companies ────────────────────────────────────────────────────────────
    getCompanies: (): Promise<{ companies: string[] }> =>
      apiRequest("GET", "/api/admin/companies"),

    // ── Cases ────────────────────────────────────────────────────────────────
    getCases: (params?: { company?: string | null }) =>
      apiRequest("GET", `/api/admin/cases${qs({ company: params?.company })}`),

    getCasesByAgent: (agentId: number) =>
      apiRequest("GET", `/api/admin/cases/agent/${agentId}`),

    createCase: (data: any) => apiRequest("POST", "/api/admin/cases", data),

    updateCaseStatus: (
      id: number,
      data: { status: string; rollback_yn?: boolean | null; table: "loan" | "bkt" },
    ) => apiRequest("PUT", `/api/admin/cases/${id}/status`, data),

    reassignCase: (
      caseId: number,
      data: { to_agent_id: number; case_type?: string; reason?: string },
    ) => apiRequest("PATCH", `/api/admin/cases/${caseId}/reassign`, data),

    getReassignLog: (caseId: number) =>
      apiRequest("GET", `/api/admin/cases/${caseId}/reassign-log`),

    // ── BKT cases ────────────────────────────────────────────────────────────
    getBktCases: (params?: { category?: string; company?: string | null }) =>
      apiRequest(
        "GET",
        `/api/admin/bkt-cases${qs({ category: params?.category, company: params?.company })}`,
      ),

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
    getAllSalary:  () => apiRequest("GET",    "/api/admin/salary"),
    getSalary:    () => apiRequest("GET",    "/api/admin/salary"),
    createSalary: (data: any) => apiRequest("POST",   "/api/admin/salary", data),
    deleteSalary: (id: number) => apiRequest("DELETE", `/api/admin/salary/${id}`),

    // ── Depositions ──────────────────────────────────────────────────────────
    getAllDepositions: () => apiRequest("GET", "/api/admin/depositions"),

    // ── Required deposits ────────────────────────────────────────────────────
    getRequiredDeposits:   () => apiRequest("GET", "/api/admin/required-deposits"),
    createRequiredDeposit: (data: {
      agentId: number; amount: number; description?: string; dueDate?: string;
    }) => apiRequest("POST", "/api/admin/required-deposits", data),
    deleteRequiredDeposit: (id: number) =>
      apiRequest("DELETE", `/api/admin/required-deposits/${id}`),
    markCashCollected: (id: number) =>
      apiRequest("PUT", `/api/admin/required-deposits/${id}/cash-collected`),
    verifyDeposit: (id: number) =>
      apiRequest("PUT", `/api/admin/required-deposits/${id}/verify`),

    // ── FOS Depositions ──────────────────────────────────────────────────────
    getFosDepositions:        () => apiRequest("GET",  "/api/admin/fos-depositions"),
    getFosDepositionsByAgent: (agentId: number) =>
      apiRequest("GET", `/api/admin/fos-depositions/${agentId}`),
    createFosDeposition:      (data: any) => apiRequest("POST", "/api/admin/fos-depositions", data),
    updateFosDepositionPayment: (id: number, data: any) =>
      apiRequest("PUT", `/api/admin/fos-depositions/${id}/payment`, data),
    deleteFosDeposition: (id: number) =>
      apiRequest("DELETE", `/api/admin/fos-depositions/${id}`),

    // ── Field Visits ─────────────────────────────────────────────────────────
    getAdminFieldVisits: (params?: {
      agent_id?: number; date?: string; company?: string | null;
    }) => apiRequest("GET", `/api/admin/field-visits${qs(params ?? {})}`),

    getDailyReport: (date?: string) =>
      apiRequest("GET", `/api/admin/daily-report${qs({ date })}`),

    // ── Attendance ───────────────────────────────────────────────────────────
    getAllAttendance: () => apiRequest("GET", "/api/admin/attendance"),
    getAttendance:   () => apiRequest("GET", "/api/admin/attendance"),

    // ── BKT perf ─────────────────────────────────────────────────────────────
    getBktPerfSummary: (company?: string | null) =>
      apiRequest("GET", `/api/admin/bkt-perf-summary${qs({ company })}`),

    // ── Push ─────────────────────────────────────────────────────────────────
    getPushStatus: () => apiRequest("GET",  "/api/admin/push-status"),
    testPush:      (agentId: number) => apiRequest("POST", `/api/admin/test-push/${agentId}`),
    testPushAll:   () => apiRequest("POST", "/api/admin/test-push-all"),

    // ── Call recordings ───────────────────────────────────────────────────────
    getCallRecordings: () => apiRequest("GET", "/api/admin/call-recordings"),

    // ── Receipt requests ──────────────────────────────────────────────────────
    getReceiptRequests: () => apiRequest("GET", "/api/admin/receipt-requests"),
    resolveReceiptRequest: (id: number, status: "approved" | "rejected", notes?: string) =>
      apiRequest("PUT", `/api/admin/receipt-requests/${id}/resolve`, { status, notes }),
    setReceiptPermission: (agentId: number, enabled: boolean) =>
      apiRequest("PUT", `/api/admin/agents/${agentId}/receipt-permission`, { enabled }),

    // ── Exports ──────────────────────────────────────────────────────────────
    exportPtp: async () => {
      const baseUrl = getApiUrl();
      const token   = await tokenStore.get();
      const r = await fetch(buildUrl("/api/admin/ptp-export", baseUrl), {
        credentials: "include",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.blob();
    },
    exportFeedback: async () => {
      const baseUrl = getApiUrl();
      const token   = await tokenStore.get();
      const r = await fetch(buildUrl("/api/admin/feedback-export", baseUrl), {
        credentials: "include",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.blob();
    },
    exportFosDepositions: async () => {
      const baseUrl = getApiUrl();
      const token   = await tokenStore.get();
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

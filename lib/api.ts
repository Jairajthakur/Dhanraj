import { getApiUrl } from "./query-client";

async function apiRequest(method: string, route: string, data?: any) {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);
  const token = localStorage.getItem("token");
  const res = await fetch(url.toString(), {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    credentials: "include",
    body: data ? JSON.stringify(data) : undefined,
  });
  if (res.status === 401) {
    localStorage.removeItem("token");
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error((json as any).message || "API Error");
  }
  return res.json();
}

export const api = {
  login: (username: string, password: string) =>
    apiRequest("POST", "/api/auth/login", { username, password }),
  logout: () => apiRequest("POST", "/api/auth/logout"),
  me: () => apiRequest("GET", "/api/auth/me"),
  getCases: () => apiRequest("GET", "/api/cases"),
  getStats: () => apiRequest("GET", "/api/stats"),
  updateFeedback: (id: number, data: any) =>
    apiRequest("PUT", `/api/cases/${id}/feedback`, data),
  updateBktFeedback: (id: number, data: any) =>
    apiRequest("PUT", `/api/bkt-cases/${id}/feedback`, data),
  getDepositions: () => apiRequest("GET", "/api/depositions"),
  createDeposition: (data: any) => apiRequest("POST", "/api/depositions", data),
  getSalary: () => apiRequest("GET", "/api/salary"),
  checkIn: () => apiRequest("POST", "/api/attendance/checkin"),
  checkOut: () => apiRequest("POST", "/api/attendance/checkout"),
  savePushToken: (token: string) => apiRequest("POST", "/api/push-token", { token }),
  admin: {
    getCases: () => apiRequest("GET", "/api/admin/cases"),
    getBktCases: (category?: string) =>
      apiRequest("GET", `/api/admin/bkt-cases${category ? `?category=${category}` : ""}`),
    getAgents: () => apiRequest("GET", "/api/admin/agents"),
    getStats: () => apiRequest("GET", "/api/admin/stats"),
    getSalary: () => apiRequest("GET", "/api/admin/salary"),
    getDepositions: () => apiRequest("GET", "/api/admin/depositions"),
    getAttendance: () => apiRequest("GET", "/api/admin/attendance"),
    getBktPerformance: () => apiRequest("GET", "/api/admin/bkt-performance"),
    // ✅ New: update case status from admin
    updateCaseStatus: (id: number, data: {
      status: "Paid" | "Unpaid" | "PTP";
      rollback_yn?: boolean | null;
      table: "loan" | "bkt";
    }) => apiRequest("PUT", `/api/admin/cases/${id}/status`, data),
  },
};

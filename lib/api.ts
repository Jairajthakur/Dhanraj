import { fetch } from "expo/fetch";
import { getApiUrl } from "./query-client";

export async function apiRequest(method: string, route: string, data?: any) {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);
  const res = await fetch(url.toString(), {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try { msg = JSON.parse(text).message; } catch {}
    throw new Error(msg || res.statusText);
  }
  return res.json();
}

async function uploadFile(route: string, fileUri: string, fileName: string, mimeType: string, extraFields?: Record<string, string>, fieldName: string = "file") {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);
  const formData = new FormData();
  if (extraFields) {
    for (const [k, v] of Object.entries(extraFields)) {
      formData.append(k, v);
    }
  }
  // Use { uri, name, type } object — supported by React Native's XHR FormData
  formData.append(fieldName, { uri: fileUri, name: fileName, type: mimeType } as any);
  return new Promise<any>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url.toString());
    xhr.withCredentials = true;
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(json);
        } else {
          reject(new Error(json.message || xhr.statusText));
        }
      } catch {
        reject(new Error(xhr.responseText || xhr.statusText));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));
    xhr.timeout = 60000;
    xhr.send(formData);
  });
}

export const api = {
  login: (username: string, password: string) =>
    apiRequest("POST", "/api/auth/login", { username, password }),
  logout: () => apiRequest("POST", "/api/auth/logout"),
  me: () => apiRequest("GET", "/api/auth/me"),
  getCases: () => apiRequest("GET", "/api/cases"),
  getCaseById: (id: number) => apiRequest("GET", `/api/cases/${id}`),
  updateFeedback: (id: number, data: any) =>
    apiRequest("PUT", `/api/cases/${id}/feedback`, data),
  getStats: () => apiRequest("GET", "/api/stats"),
  getTodayPtp: () => apiRequest("GET", "/api/today-ptp"),
  getTodayAttendance: () => apiRequest("GET", "/api/attendance/today"),
  checkIn: () => apiRequest("POST", "/api/attendance/checkin"),
  checkOut: () => apiRequest("POST", "/api/attendance/checkout"),
  getSalary: () => apiRequest("GET", "/api/salary"),
  getDepositions: () => apiRequest("GET", "/api/depositions"),
  createDeposition: (data: any) => apiRequest("POST", "/api/depositions", data),
  getRequiredDeposits: () => apiRequest("GET", "/api/required-deposits"),
  savePushToken: (token: string) => apiRequest("POST", "/api/push-token", { token }),
  saveProfilePhoto: (photoUrl: string) => apiRequest("POST", "/api/profile-photo", { photoUrl }),
  getProfile: () => apiRequest("GET", "/api/profile"),
  uploadScreenshot: (depositId: number, fileUri: string) =>
    uploadFile(
      `/api/required-deposits/${depositId}/screenshot`,
      fileUri,
      "screenshot.jpg",
      "image/jpeg",
      undefined,
      "screenshot"  // ✅ Fixed: matches server's screenshotUpload.single("screenshot")
    ),
  changePassword: (data: any) => apiRequest("PUT", "/api/auth/password", data),
  admin: {
    getStats: () => apiRequest("GET", "/api/admin/stats"),
    getAgents: () => apiRequest("GET", "/api/admin/agents"),
    getCases: () => apiRequest("GET", "/api/admin/cases"),
    getAgentCases: (agentId: number) =>
      apiRequest("GET", `/api/admin/cases/agent/${agentId}`),
    getSalary: () => apiRequest("GET", "/api/admin/salary"),
    createSalary: (data: any) => apiRequest("POST", "/api/admin/salary", data),
    getDepositions: () => apiRequest("GET", "/api/admin/depositions"),
    getRequiredDeposits: () => apiRequest("GET", "/api/admin/required-deposits"),
    createRequiredDeposit: (data: any) => apiRequest("POST", "/api/admin/required-deposits", data),
    deleteRequiredDeposit: (id: number) => apiRequest("DELETE", `/api/admin/required-deposits/${id}`),
    verifyScreenshot: (id: number) => apiRequest("PUT", `/api/admin/required-deposits/${id}/verify`),
    getAttendance: () => apiRequest("GET", "/api/admin/attendance"),
    getAgentStats: (agentId: number) =>
      apiRequest("GET", `/api/admin/agent/${agentId}/stats`),
    createCase: (data: any) => apiRequest("POST", "/api/admin/cases", data),
    importExcel: (fileUri: string, fileName: string, mimeType: string, agentId?: number) =>
      uploadFile("/api/admin/import", fileUri, fileName, mimeType, agentId ? { agentId: String(agentId) } : undefined),
  },
  repo: {
    getCases: () => apiRequest("GET", "/api/repo/cases"),
  },
};

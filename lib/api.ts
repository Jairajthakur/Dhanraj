import { getApiUrl } from "./query-client";

// Centralized API request function
export async function apiRequest(method: string, route: string, data?: any) {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);

  let token: string | null = null;

  if (typeof window !== "undefined") {
    token = localStorage.getItem("token");
  }

  const headers: Record<string, string> = {};

  if (data) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  // ✅ Handle 401 (important fix)
  if (res.status === 401) {
    if (typeof window !== "undefined") {
      localStorage.removeItem("token");
    }
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const text = await res.text();
    let msg = text;

    try {
      msg = JSON.parse(text).message;
    } catch {}

    throw new Error(msg || res.statusText);
  }

  return res.json();
}

export const api = {
  login: async (username: string, password: string) => {
    const data = await apiRequest("POST", "/api/auth/login", {
      username,
      password,
    });

    if (data?.token && typeof window !== "undefined") {
      localStorage.setItem("token", data.token);
    }

    return data;
  },

  logout: async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
    } catch {
      // ignore error
    } finally {
      if (typeof window !== "undefined") {
        localStorage.removeItem("token");
      }
    }
  },

  me: async () => {
    return apiRequest("GET", "/api/auth/me");
  },

  // Other endpoints
  getCases: () => apiRequest("GET", "/api/cases"),

  getCaseById: (id: number) =>
    apiRequest("GET", `/api/cases/${id}`),

  updateFeedback: (id: number, data: any) =>
    apiRequest("PUT", `/api/cases/${id}/feedback`, data),

  // ✅ Push token API (you were using this but missing)
  savePushToken: (token: string) =>
    apiRequest("POST", "/api/notifications/token", { token }),
};

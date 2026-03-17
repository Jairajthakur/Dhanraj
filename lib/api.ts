// lib/api.ts
import { getApiUrl } from "./query-client";

// Centralized API request function with token support
export async function apiRequest(method: string, route: string, data?: any) {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);

  // Get token from localStorage (web) or AsyncStorage (mobile)
  let token: string | null = null;
  if (typeof window !== "undefined") {
    token = localStorage.getItem("token");
  } else {
    // For mobile, you can use expo-secure-store or AsyncStorage
    // Example: token = await SecureStore.getItemAsync("token");
  }

  const headers: Record<string, string> = data ? { "Content-Type": "application/json" } : {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url.toString(), {
    method,
    headers,
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

export const api = {
  login: async (username: string, password: string) => {
    const data = await apiRequest("POST", "/api/auth/login", { username, password });
    if (data.token) {
      if (typeof window !== "undefined") localStorage.setItem("token", data.token);
      // For mobile: await SecureStore.setItemAsync("token", data.token);
    }
    return data;
  },
  logout: async () => {
    await apiRequest("POST", "/api/auth/logout");
    if (typeof window !== "undefined") localStorage.removeItem("token");
    // For mobile: await SecureStore.deleteItemAsync("token");
  },
  me: () => apiRequest("GET", "/api/auth/me"),

  // Example other endpoints
  getCases: () => apiRequest("GET", "/api/cases"),
  getCaseById: (id: number) => apiRequest("GET", `/api/cases/${id}`),
  updateFeedback: (id: number, data: any) => apiRequest("PUT", `/api/cases/${id}/feedback`, data),
};

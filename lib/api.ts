import { getApiUrl } from "./query-client";

export async function apiRequest(method: string, route: string, data?: any) {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);

  const token = localStorage.getItem("token");

  const res = await fetch(url.toString(), {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: data ? JSON.stringify(data) : undefined,
  });

  if (res.status === 401) {
    localStorage.removeItem("token");
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    throw new Error("API Error");
  }

  return res.json();
}

export const api = {
  login: (username: string, password: string) =>
    apiRequest("POST", "/api/auth/login", { username, password }),

  logout: () => apiRequest("POST", "/api/auth/logout"),

  me: () => apiRequest("GET", "/api/auth/me"),
};

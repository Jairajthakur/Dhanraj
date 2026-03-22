// context/AuthContext.tsx
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { AppState, AppStateStatus, Platform } from "react-native";
import { api, agentCache, tokenStore } from "../lib/api";

interface Agent {
  id: number;
  name: string;
  username: string;
  role: "fos" | "admin" | "repo";
  phone?: string;
  photo_url?: string;
}

interface AuthContextType {
  agent: Agent | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  agent: null,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ─── Initial Auth Check ─────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const cached = await agentCache.get();

        // ✅ KEY FIX: On web, cookies are sent automatically by the browser.
        // We MUST always call /api/auth/me on web to check if the session cookie
        // is valid — we cannot rely on agentCache (which uses AsyncStorage and
        // is always empty on web). Skipping this check caused agent=null on every
        // page load, triggering a redirect loop and blank admin screen.
        if (Platform.OS === "web") {
          try {
            const res = await api.me();
            if (!cancelled && res?.agent) {
              setAgent(res.agent);
              // Also persist to cache so subsequent non-web checks work
              await agentCache.set(res.agent);
            } else if (!cancelled) {
              setAgent(null);
            }
          } catch (e: any) {
            if (!cancelled) {
              const isAuthError =
                e?.message === "Unauthorized" ||
                e?.message?.includes("401") ||
                e?.status === 401 ||
                e?.statusCode === 401;
              // On auth error, user needs to login
              // On network error, leave agent as null (can't verify)
              setAgent(null);
              if (!isAuthError) {
                console.warn("[AuthContext] Network error on web bootstrap:", e?.message);
              }
            }
          }
          return;
        }

        // ── Native (iOS / Android) path ──────────────────────────────────
        // No cache means definitely not logged in — skip server check
        if (!cached) {
          if (!cancelled) {
            setAgent(null);
            setIsLoading(false);
          }
          return;
        }

        // Show cached agent immediately so UI doesn't wait for network
        if (!cancelled) setAgent(cached);

        // Verify cached session is still valid with server
        const res = await api.me();
        if (!cancelled && res?.agent) {
          setAgent(res.agent);
          await agentCache.set(res.agent);
          if (res?.token) {
            await tokenStore.set(res.token);
          }
        }
      } catch (e: any) {
        if (!cancelled) {
          const isAuthError =
            e?.message === "Unauthorized" ||
            e?.message?.includes("401") ||
            e?.status === 401 ||
            e?.statusCode === 401;

          if (isAuthError) {
            // Session expired — clear and show login
            await agentCache.clear();
            await tokenStore.clear();
            setAgent(null);
          } else {
            // Network error — keep cached session, stay logged in
            const cached = await agentCache.get();
            setAgent(cached ?? null);
          }
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    // Safety timeout — never block UI for more than 6s
    const timeout = setTimeout(() => {
      if (!cancelled) {
        agentCache.get().then((cached) => {
          if (!cancelled) {
            setAgent(cached ?? null);
            setIsLoading(false);
          }
        });
      }
    }, 6000);

    bootstrap().finally(() => {
      clearTimeout(timeout);
      if (!cancelled) setIsLoading(false);
    });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, []);

  // ─── Re-validate session when app comes to foreground ──────────────────
  useEffect(() => {
    if (Platform.OS === "web") return;

    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState !== "active") return;
      try {
        const cached = await agentCache.get();
        if (!cached) return;
        const res = await api.me();
        if (res?.agent) {
          setAgent(res.agent);
          await agentCache.set(res.agent);
        }
      } catch (e: any) {
        if (e?.message === "Unauthorized") {
          await agentCache.clear();
          await tokenStore.clear();
          setAgent(null);
        }
      }
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => subscription.remove();
  }, []);

  // ─── Login ──────────────────────────────────────────────────────────────
  const login = async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await api.login(username, password);
      if (!res?.agent) throw new Error("Invalid response from server");

      await agentCache.set(res.agent);
      if (res?.token && Platform.OS !== "web") {
        await tokenStore.set(res.token);
      }
      setAgent(res.agent);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Logout ─────────────────────────────────────────────────────────────
  const logout = async () => {
    try {
      await api.logout();
    } catch (_) {}
    await agentCache.clear();
    await tokenStore.clear();
    setAgent(null);
  };

  return (
    <AuthContext.Provider value={{ agent, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}

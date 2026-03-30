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
  agent_id?: string;
}

export function formatAgentId(id: number): string {
  return "DE" + String(id).padStart(3, "0");
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
    // FIX #1: resolved flag prevents race between timeout and bootstrap
    // both were calling setAgent/setIsLoading causing flicker to login screen
    let resolved = false;

    const bootstrap = async () => {
      try {
        const cached = await agentCache.get();

        if (Platform.OS === "web") {
          try {
            const res = await api.me();
            if (!cancelled && res?.agent) {
              setAgent(res.agent);
              await agentCache.set(res.agent);
            } else if (!cancelled) {
              setAgent(null);
            }
          } catch (e: any) {
            if (!cancelled) {
              const isAuthError =
                e?.message === "Unauthorized" ||
                e?.message?.toLowerCase().includes("unauthorized") ||
                e?.message?.includes("401") ||
                e?.status === 401 ||
                e?.statusCode === 401;
              setAgent(null);
              if (!isAuthError) {
                console.warn("[AuthContext] Network error on web bootstrap:", e?.message);
              }
            }
          }
          return;
        }

        // ✅ On mobile: immediately show cached agent so user is never
        // logged out due to a slow/failed network on startup
        if (!cached) {
          if (!cancelled) {
            setAgent(null);
            setIsLoading(false);
          }
          return;
        }

        // Show cached agent right away
        if (!cancelled) setAgent(cached);

        // Then revalidate in background
        try {
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
            // FIX #4: broadened auth error check — server may return lowercase
            // or slightly different message, causing false "stay logged in"
            const isAuthError =
              e?.message === "Unauthorized" ||
              e?.message?.toLowerCase().includes("unauthorized") ||
              e?.message?.includes("401") ||
              e?.status === 401 ||
              e?.statusCode === 401;

            if (isAuthError) {
              // ✅ Only clear and logout on a confirmed 401
              await agentCache.clear();
              await tokenStore.clear();
              setAgent(null);
            } else {
              // ✅ Network error / server down — keep cached agent, stay logged in
              console.warn("[AuthContext] Network error during revalidation, keeping cached session:", e?.message);
              setAgent(cached);
            }
          }
        }
      } catch (e: any) {
        if (!cancelled) {
          const cached = await agentCache.get();
          setAgent(cached ?? null);
        }
      } finally {
        if (!cancelled) {
          resolved = true; // FIX #1: mark as resolved so timeout won't overwrite
          setIsLoading(false);
        }
      }
    };

    // Safety timeout — if bootstrap takes too long, fall back to cache
    // FIX #1: check resolved so this doesn't race with bootstrap finish
    const timeout = setTimeout(() => {
      if (!cancelled && !resolved) {
        agentCache.get().then((cached) => {
          if (!cancelled && !resolved) {
            resolved = true;
            setAgent(cached ?? null);
            setIsLoading(false);
          }
        });
      }
    }, 6000);

    bootstrap().finally(() => {
      resolved = true; // FIX #1: ensure resolved is always set
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
        // FIX #4: broadened auth error detection — was only checking exact
        // "Unauthorized" string, would miss "unauthorized", "401", etc.
        const isAuthError =
          e?.message === "Unauthorized" ||
          e?.message?.toLowerCase().includes("unauthorized") ||
          e?.message?.includes("401") ||
          e?.status === 401;

        if (isAuthError) {
          await agentCache.clear();
          await tokenStore.clear();
          setAgent(null);
        }
        // else: network blip, stay logged in
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
  // ✅ AuthContext is the single source of truth for clearing session
  const logout = async () => {
    await agentCache.clear();
    await tokenStore.clear();
    setAgent(null);
    try { await api.logout(); } catch (_) {}
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

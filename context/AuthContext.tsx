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
        // Step 1: Load cached agent immediately (prevents flash to login)
        const cached = await agentCache.get();
        if (cached && !cancelled) {
          setAgent(cached);
        }

        // Step 2: Verify with server
        const res = await api.me();
        if (!cancelled && res?.agent) {
          setAgent(res.agent);
          await agentCache.set(res.agent);
        }
      } catch (e: any) {
        if (!cancelled) {
          const cached = await agentCache.get();
          const isAuthError = e?.message === "Unauthorized";

          if (isAuthError || !cached) {
            // Genuine 401 or no cache — clear everything and force login
            await agentCache.clear();
            await tokenStore.clear();
            setAgent(null);
          } else {
            // Network/server error — keep the cached agent alive
            // This prevents blank screen on APK when cookies fail
            setAgent(cached);
          }
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    // Safety net — never stay stuck on loading screen
    const timeout = setTimeout(() => {
      if (!cancelled) {
        console.warn("[Auth] Bootstrap timed out — falling back to cache");
        agentCache.get().then((cached) => {
          if (!cancelled) {
            if (cached) setAgent(cached);
            setIsLoading(false);
          }
        });
      }
    }, 6000);

    bootstrap().finally(() => clearTimeout(timeout));

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, []);

  // ─── Re-validate on foreground (native only) ────────────────────────────
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
        // Only log out on explicit 401, not network errors
        if (e?.message === "Unauthorized") {
          await agentCache.clear();
          await tokenStore.clear();
          setAgent(null);
        }
        // Otherwise keep existing agent (network hiccup)
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
      // Save token for native APK (bearer auth)
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
    } catch (_) {
      // Ignore server errors on logout
    }
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

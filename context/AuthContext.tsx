import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { AppState, AppStateStatus, Platform } from "react-native";
import { api, agentCache } from "../lib/api";

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

  // ─── Initial Auth Check ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        // Step 1: Show cached agent immediately (fast path — no flash)
        const cached = await agentCache.get();
        if (cached && !cancelled) {
          setAgent(cached);
        }

        // Step 2: Verify with server in background
        const res = await api.me();
        if (!cancelled && res?.agent) {
          setAgent(res.agent);
          await agentCache.set(res.agent);
        }
      } catch (e: any) {
        // Server says not authenticated
        if (!cancelled) {
          const cached = await agentCache.get();
          // On native: keep cached agent if server unreachable (offline support)
          // On web: always trust server response
          if (Platform.OS === "web" || !cached) {
            await agentCache.clear();
            setAgent(null);
          }
          // If native + cached exists: keep agent (already set above)
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    // Safety net — never stay stuck on loading screen
    const timeout = setTimeout(() => {
      if (!cancelled) {
        console.warn("[Auth] Bootstrap timed out — forcing isLoading=false");
        setIsLoading(false);
      }
    }, 6000);

    bootstrap().finally(() => clearTimeout(timeout));

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, []);

  // ─── Re-validate on App Foreground ───────────────────────────────────────
  useEffect(() => {
    if (Platform.OS === "web") return;

    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState !== "active") return;

      try {
        const cached = await agentCache.get();
        if (!cached) return; // not logged in, skip

        const res = await api.me();
        if (res?.agent) {
          setAgent(res.agent);
          await agentCache.set(res.agent);
        }
      } catch {
        // Session expired while app was in background
        const cached = await agentCache.get();
        if (!cached) {
          setAgent(null);
        }
        // If still cached, keep user logged in (offline tolerance)
      }
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => subscription.remove();
  }, []);

  // ─── Login ────────────────────────────────────────────────────────────────
  const login = async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await api.login(username, password);
      if (!res?.agent) throw new Error("Invalid response from server");
      await agentCache.set(res.agent);
      setAgent(res.agent);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Logout ───────────────────────────────────────────────────────────────
  const logout = async () => {
    try {
      await api.logout();
    } catch (_) {
      // Even if server call fails, clear local state
    } finally {
      await agentCache.clear();
      setAgent(null);
    }
  };

  return (
    <AuthContext.Provider value={{ agent, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

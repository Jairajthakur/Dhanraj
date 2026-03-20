// context/AuthContext.tsx
// ✅ Fixed: token registration is now fully handled by usePushNotifications hook
// The hook watches agent?.id and re-registers whenever a different user logs in

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
        // Show cached agent immediately so UI doesn't wait for network
        const cached = await agentCache.get();
        if (cached && !cancelled) setAgent(cached);

        // Verify with server
        const res = await api.me();
        if (!cancelled && res?.agent) {
          setAgent(res.agent);
          await agentCache.set(res.agent);
          if (res?.token && Platform.OS !== "web") {
            await tokenStore.set(res.token);
          }
          // ✅ Token registration is handled by usePushNotifications hook
          // which watches agent?.id — no need to call it here
        }
      } catch (e: any) {
        if (!cancelled) {
          const cached = await agentCache.get();
          const isAuthError = e?.message === "Unauthorized";
          if (isAuthError || !cached) {
            await agentCache.clear();
            await tokenStore.clear();
            setAgent(null);
          } else {
            // Network error but cached session exists — stay logged in
            setAgent(cached);
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

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );
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

      // ✅ Setting agent here triggers usePushNotifications hook (agent?.id changes)
      // The hook will call registerPushToken() which waits for OneSignal init
      // and polls until the subscription ID is available
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

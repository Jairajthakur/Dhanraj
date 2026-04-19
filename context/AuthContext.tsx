// context/AuthContext.tsx
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  ReactNode,
} from "react";
import { AppState, AppStateStatus, Platform } from "react-native";
import { api, agentCache, tokenStore } from "../lib/api";
import { resetPushInit, isPushRegistering } from "@/context/usePushNotifications";

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

const MAX_CONSECUTIVE_401 = 10;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const consecutive401Ref = useRef(0);
  const lastValidatedRef = useRef<number>(0);
  const revalidatingRef = useRef(false);
  const agentRef = useRef<Agent | null>(null);

  useEffect(() => {
    agentRef.current = agent;
  }, [agent]);

  const revalidateSession = async (cached: Agent | null): Promise<void> => {
    if (revalidatingRef.current) return;
    if (isPushRegistering()) return;
    revalidatingRef.current = true;
    try {
      const res = await api.me();
      if (res?.agent) {
        consecutive401Ref.current = 0;
        lastValidatedRef.current = Date.now();
        setAgent(res.agent);
        agentRef.current = res.agent;
        await agentCache.set(res.agent);
        if (res?.token && Platform.OS !== "web") {
          await tokenStore.set(res.token);
        }
      }
    } catch (e: any) {
      const is401 =
        e?.message === "Unauthorized" ||
        e?.message?.toLowerCase().includes("unauthorized") ||
        e?.message?.includes("401") ||
        e?.status === 401 ||
        e?.statusCode === 401;

      if (is401) {
        consecutive401Ref.current += 1;
        console.warn(
          `[AuthContext] 401 received (${consecutive401Ref.current}/${MAX_CONSECUTIVE_401})`
        );
        if (consecutive401Ref.current >= MAX_CONSECUTIVE_401) {
          console.warn("[AuthContext] Session definitively expired — logging out");
          await agentCache.clear();
          await tokenStore.clear();
          consecutive401Ref.current = 0;
          agentRef.current = null;
          setAgent(null);
        }
      } else {
        consecutive401Ref.current = 0;
        console.warn("[AuthContext] Network error, keeping session:", e?.message);
      }
    } finally {
      revalidatingRef.current = false;
    }
  };

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        if (Platform.OS === "web") {
          try {
            const res = await api.me();
            if (!cancelled && res?.agent) {
              setAgent(res.agent);
              agentRef.current = res.agent;
              await agentCache.set(res.agent);
              consecutive401Ref.current = 0;
              lastValidatedRef.current = Date.now();
            } else if (!cancelled) {
              const cached = await agentCache.get();
              setAgent(cached ?? null);
              agentRef.current = cached ?? null;
            }
          } catch (e: any) {
            if (!cancelled) {
              const is401 =
                e?.message === "Unauthorized" ||
                e?.message?.toLowerCase().includes("unauthorized") ||
                e?.message?.includes("401") ||
                e?.status === 401;
              if (is401) {
                await agentCache.clear();
                setAgent(null);
                agentRef.current = null;
              } else {
                const cached = await agentCache.get();
                setAgent(cached ?? null);
                agentRef.current = cached ?? null;
              }
            }
          }
          return;
        }

        const cached = await agentCache.get();

        if (!cancelled) {
          setAgent(cached ?? null);
          agentRef.current = cached ?? null;
        }

        if (cached) {
          revalidateSession(cached).catch(() => {});
        }
      } catch (e: any) {
        if (!cancelled) {
          const cached = await agentCache.get().catch(() => null);
          setAgent(cached ?? null);
          agentRef.current = cached ?? null;
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    const timeout = setTimeout(() => {
      if (!cancelled) {
        agentCache.get().then((cached) => {
          if (!cancelled) {
            setAgent(cached ?? null);
            agentRef.current = cached ?? null;
            setIsLoading(false);
          }
        }).catch(() => {
          if (!cancelled) setIsLoading(false);
        });
      }
    }, 4000);

    bootstrap().finally(() => {
      clearTimeout(timeout);
      if (!cancelled) setIsLoading(false);
    });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;

    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState !== "active") return;
      const elapsed = Date.now() - lastValidatedRef.current;
      if (elapsed < 5 * 60 * 1000) return;
      const cached = agentRef.current ?? (await agentCache.get().catch(() => null));
      if (!cached) return;
      revalidateSession(cached).catch(() => {});
    };

    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => sub.remove();
  }, []);

  const login = async (username: string, password: string) => {
    setIsLoading(true);
    try {
      await tokenStore.clear();
      await agentCache.clear();
      consecutive401Ref.current = 0;

      const res = await api.login(username, password);
      if (!res?.agent) throw new Error("Invalid response from server");

      await agentCache.set(res.agent);
      if (res?.token && Platform.OS !== "web") {
        await tokenStore.set(res.token);
      }
      lastValidatedRef.current = Date.now();
      agentRef.current = res.agent;
      setAgent(res.agent);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    consecutive401Ref.current = 0;
    lastValidatedRef.current = 0;
    agentRef.current = null;
    await agentCache.clear();
    await tokenStore.clear();
    setAgent(null);
    try { await api.logout(); } catch (_) {}
    resetPushInit();
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

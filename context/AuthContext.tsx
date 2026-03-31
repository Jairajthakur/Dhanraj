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

// Only log out after this many consecutive 401s — prevents fluke logouts
const MAX_CONSECUTIVE_401 = 3;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [agent, setAgent] = useState<Agent | null>(null);

  // KEY: stays TRUE until we've read the cache and set the correct agent.
  // This means NO screen renders until we know if user is logged in or not.
  // Eliminates the login-screen flash entirely.
  const [isLoading, setIsLoading] = useState(true);

  const consecutive401Ref = useRef(0);
  const lastValidatedRef = useRef<number>(0);
  const revalidatingRef = useRef(false);
  // Mirror of agent state for use in closures/callbacks
  const agentRef = useRef<Agent | null>(null);

  useEffect(() => {
    agentRef.current = agent;
  }, [agent]);

  // ─── Background revalidation — never blocks UI, rarely triggers logout ──
  const revalidateSession = async (cached: Agent | null): Promise<void> => {
    if (revalidatingRef.current) return;
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
        // Only log out after multiple consecutive 401s
        if (consecutive401Ref.current >= MAX_CONSECUTIVE_401) {
          console.warn("[AuthContext] Session definitively expired — logging out");
          await agentCache.clear();
          await tokenStore.clear();
          consecutive401Ref.current = 0;
          agentRef.current = null;
          setAgent(null);
        }
        // else: keep the user logged in — single 401 could be a fluke
      } else {
        // Network error — never log out for this
        consecutive401Ref.current = 0;
        console.warn("[AuthContext] Network error, keeping session:", e?.message);
      }
    } finally {
      revalidatingRef.current = false;
    }
  };

  // ─── Bootstrap ──────────────────────────────────────────────────────────
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
                // Network error — use cache
                const cached = await agentCache.get();
                setAgent(cached ?? null);
                agentRef.current = cached ?? null;
              }
            }
          }
          return;
        }

        // ── Mobile: read cache FIRST, set agent, THEN set isLoading=false ─
        // The order here is critical:
        //   1. Read cache
        //   2. setAgent(cached)   ← correct screen is ready to show
        //   3. setIsLoading(false) ← NOW render (in finally block)
        // This guarantees zero flash — user sees home or login, never both.
        const cached = await agentCache.get();

        if (!cancelled) {
          setAgent(cached ?? null);
          agentRef.current = cached ?? null;
        }

        // Kick off background revalidation — won't block or flash anything
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
        // This is the ONLY place isLoading becomes false on mobile.
        // It runs after setAgent, so the navigator always gets the right
        // initial route on the very first render.
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    // Absolute fallback — if AsyncStorage hangs, unblock after 4s
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
      // Ensure isLoading is always cleared even on unexpected errors
      if (!cancelled) setIsLoading(false);
    });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, []);

  // ─── Foreground revalidation — throttled to once per 5 minutes ─────────
  useEffect(() => {
    if (Platform.OS === "web") return;

    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState !== "active") return;
      const elapsed = Date.now() - lastValidatedRef.current;
      if (elapsed < 5 * 60 * 1000) return; // skip if validated recently
      const cached = agentRef.current ?? (await agentCache.get().catch(() => null));
      if (!cached) return;
      revalidateSession(cached).catch(() => {});
    };

    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => sub.remove();
  }, []);

  // ─── Login ──────────────────────────────────────────────────────────────
  const login = async (username: string, password: string) => {
    setIsLoading(true);
    try {
      // Always clear stale data before a fresh login
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

  // ─── Logout ─────────────────────────────────────────────────────────────
  const logout = async () => {
    consecutive401Ref.current = 0;
    lastValidatedRef.current = 0;
    agentRef.current = null;
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

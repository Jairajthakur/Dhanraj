import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
  useMemo,
} from "react";
import { api } from "../lib/api";

interface Agent {
  id: number;
  name: string;
  username: string;
  role: string;
  phone?: string;
}

interface AuthContextValue {
  agent: Agent | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const token =
          typeof window !== "undefined"
            ? localStorage.getItem("token")
            : null;

        if (!token) {
          setAgent(null);
          return;
        }

        const data = await api.me();
        setAgent(data.agent);
      } catch {
        if (typeof window !== "undefined") {
          localStorage.removeItem("token");
        }
        setAgent(null);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const data = await api.login(username, password);

      if (data?.agent) {
        setAgent(data.agent);
      } else {
        throw new Error("Invalid login response");
      }
    } catch (err) {
      setAgent(null);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await api.logout();
    } catch {
      // ignore error
    } finally {
      if (typeof window !== "undefined") {
        localStorage.removeItem("token");
      }
      setAgent(null);
      setIsLoading(false);
    }
  }, []);

  const value = useMemo(
    () => ({
      agent,
      isLoading,
      login,
      logout,
    }),
    [agent, isLoading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

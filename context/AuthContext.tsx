import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import { api } from "@/lib/api";

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
    api.me()
      .then((data) => setAgent(data.agent))
      .catch(() => setAgent(null))
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const data = await api.login(username, password);
    setAgent(data.agent);
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setAgent(null);
  }, []);

  const value = useMemo(() => ({ agent, isLoading, login, logout }), [agent, isLoading, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

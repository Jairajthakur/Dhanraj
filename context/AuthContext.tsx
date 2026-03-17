import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { api } from "../lib/api";

const AuthContext = createContext<any>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [agent, setAgent] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      setIsLoading(false);
      return;
    }

    api
      .me()
      .then((res) => setAgent(res.agent))
      .catch(() => {
        localStorage.removeItem("token");
        setAgent(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (username: string, password: string) => {
    setIsLoading(true);
    const res = await api.login(username, password);
    setAgent(res.agent);
    setIsLoading(false);
  };

  const logout = async () => {
    await api.logout();
    localStorage.removeItem("token");
    setAgent(null);
  };

  return (
    <AuthContext.Provider value={{ agent, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { AppState, AppStateStatus, Platform } from "react-native";
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
        // Only clear if token is gone (401 clears it in apiRequest)
        const stillHasToken = localStorage.getItem("token");
        if (!stillHasToken) setAgent(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  // Re-validate when app comes to foreground — do NOT logout on background
  useEffect(() => {
    if (Platform.OS === "web") return;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "active") {
        const token = localStorage.getItem("token");
        if (!token) return;
        api
          .me()
          .then((res) => setAgent(res.agent))
          .catch(() => {
            const stillHasToken = localStorage.getItem("token");
            if (!stillHasToken) setAgent(null);
          });
      }
      // Do nothing on background/inactive — keep session alive
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => subscription.remove();
  }, []);

  const login = async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await api.login(username, password);
      setAgent(res.agent);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (_) {}
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

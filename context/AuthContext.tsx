import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { AppState, AppStateStatus, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../lib/api";

const AuthContext = createContext<any>(null);

const TOKEN_KEY = "auth_token";

// Safe storage that works on both web and native
const storage = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === "web") return localStorage.getItem(key);
    return AsyncStorage.getItem(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === "web") { localStorage.setItem(key, value); return; }
    return AsyncStorage.setItem(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === "web") { localStorage.removeItem(key); return; }
    return AsyncStorage.removeItem(key);
  },
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [agent, setAgent] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const token = await storage.getItem(TOKEN_KEY);
        if (!token) {
          setIsLoading(false);
          return;
        }
        try {
          const res = await api.me();
          setAgent(res.agent);
        } catch {
          const stillHasToken = await storage.getItem(TOKEN_KEY);
          if (!stillHasToken) setAgent(null);
        }
      } catch (e) {
        console.error("Auth bootstrap error:", e);
      } finally {
        setIsLoading(false); // always unblock
      }
    };

    // Safety timeout — never stay stuck loading
    const timeout = setTimeout(() => setIsLoading(false), 5000);
    bootstrap().finally(() => clearTimeout(timeout));
  }, []);

  // Re-validate when app comes to foreground
  useEffect(() => {
    if (Platform.OS === "web") return;
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "active") {
        storage.getItem(TOKEN_KEY).then((token) => {
          if (!token) return;
          api.me()
            .then((res) => setAgent(res.agent))
            .catch(async () => {
              const stillHasToken = await storage.getItem(TOKEN_KEY);
              if (!stillHasToken) setAgent(null);
            });
        });
      }
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
    try { await api.logout(); } catch (_) {}
    await storage.removeItem(TOKEN_KEY);
    setAgent(null);
  };

  return (
    <AuthContext.Provider value={{ agent, isLoading, login, logout, storage }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// Export storage so api.ts can use it too
export { storage, TOKEN_KEY };

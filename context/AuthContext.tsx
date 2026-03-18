import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../lib/api";

const AuthContext = createContext<any>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [agent, setAgent] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const token = await AsyncStorage.getItem("token");

        if (!token) {
          setIsLoading(false);
          return;
        }

        const res = await api.me();
        setAgent(res.agent);
      } catch (e) {
        await AsyncStorage.removeItem("token");
        setAgent(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadUser();
  }, []);

  const login = async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await api.login(username, password);

      // ✅ store token
      if (res.token) {
        await AsyncStorage.setItem("token", res.token);
      }

      setAgent(res.agent);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    await api.logout();
    await AsyncStorage.removeItem("token");
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

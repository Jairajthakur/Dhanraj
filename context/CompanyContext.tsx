import React, {
  createContext, useContext, useState, useEffect, useCallback, useRef,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { api } from "@/lib/api";

interface CompanyContextType {
  companies:           string[];
  selectedCompany:     string | null;   // null = "All"
  setSelectedCompany:  (c: string | null) => void;
  loadCompanies:       () => Promise<void>;
  isLoading:           boolean;
}

const CompanyContext = createContext<CompanyContextType>({
  companies:          [],
  selectedCompany:    null,
  setSelectedCompany: () => {},
  loadCompanies:      async () => {},
  isLoading:          false,
});

const STORAGE_KEY = "fos_selected_company_v2";

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const [companies,        setCompanies]             = useState<string[]>([]);
  const [selectedCompany,  setSelectedCompanyState]  = useState<string | null>(null);
  const [isLoading,        setIsLoading]             = useState(false);
  const loadedRef = useRef(false);

  // Restore last selection from storage
  useEffect(() => {
    const restore = async () => {
      try {
        const v = Platform.OS === "web"
          ? localStorage.getItem(STORAGE_KEY)
          : await AsyncStorage.getItem(STORAGE_KEY);
        if (v && v !== "null" && v !== "") setSelectedCompanyState(v);
      } catch {}
    };
    restore();
  }, []);

  const setSelectedCompany = useCallback(async (c: string | null) => {
    setSelectedCompanyState(c);
    try {
      const val = c ?? "null";
      if (Platform.OS === "web") localStorage.setItem(STORAGE_KEY, val);
      else await AsyncStorage.setItem(STORAGE_KEY, val);
    } catch {}
  }, []);

  const loadCompanies = useCallback(async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const res = await api.getCompanies();
      const list: string[] = (res?.companies ?? []).filter(Boolean);
      setCompanies(list);
      // Reset selected company if it no longer exists
      setSelectedCompanyState((prev) => {
        if (prev && !list.includes(prev)) {
          if (Platform.OS === "web") localStorage.setItem(STORAGE_KEY, "null");
          else AsyncStorage.setItem(STORAGE_KEY, "null").catch(() => {});
          return null;
        }
        return prev;
      });
    } catch {
      setCompanies([]);
    } finally {
      setIsLoading(false);
      loadedRef.current = true;
    }
  }, [isLoading]);

  return (
    <CompanyContext.Provider
      value={{ companies, selectedCompany, setSelectedCompany, loadCompanies, isLoading }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  return useContext(CompanyContext);
}

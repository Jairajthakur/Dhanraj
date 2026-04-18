import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";

interface CompanyFilterContextType {
  companies: string[];
  selectedCompany: string | null;
  setSelectedCompany: (c: string | null) => void;
  isLoading: boolean;
  refreshCompanies: () => void;
}

export const CompanyFilterContext = createContext<CompanyFilterContextType>({
  companies: [],
  selectedCompany: null,
  setSelectedCompany: () => {},
  isLoading: false,
  refreshCompanies: () => {},
});

export function useCompanyFilter() {
  return useContext(CompanyFilterContext);
}

export function CompanyFilterProvider({ children }: { children: React.ReactNode }) {
  const [companies, setCompanies] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refreshCompanies = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.admin.getCompanies();
      setCompanies(res?.companies ?? []);
    } catch {
      setCompanies([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCompanies();
  }, [refreshCompanies]);

  return (
    <CompanyFilterContext.Provider
      value={{ companies, selectedCompany, setSelectedCompany, isLoading, refreshCompanies }}
    >
      {children}
    </CompanyFilterContext.Provider>
  );
}

/**
 * BlockingContext
 *
 * Runs the broken-PTP / overdue-deposition query in a React Context
 * so ANY screen can read isBlocking without putting useQuery in the layout.
 *
 * The query only activates after the agent is authenticated.
 * This prevents crashes caused by polling intervals firing during navigation.
 */
import React, {
  createContext, useContext, useState, useEffect, useRef, ReactNode,
} from "react";
import { AppState, AppStateStatus } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { BlockingItem } from "@/components/BlockingActionModal";

const SNOOZE_MS = 60 * 60 * 1000; // 1 hour

interface BlockingContextValue {
  items:       BlockingItem[];
  isBlocking:  boolean;
  snooze:      () => void;
  refetch:     () => void;
}

const BlockingContext = createContext<BlockingContextValue>({
  items:      [],
  isBlocking: false,
  snooze:     () => {},
  refetch:    () => {},
});

export function BlockingProvider({ children }: { children: ReactNode }) {
  const { agent } = useAuth();
  const qc        = useQueryClient();
  const enabled   = !!agent && agent.role === "fos";

  const [snoozedUntil, setSnoozedUntil] = useState(0);
  const appStateRef = useRef(AppState.currentState);

  const { data, refetch } = useQuery<BlockingItem[]>({
    queryKey: ["/api/broken-ptps"],
    queryFn:  () => api.getBrokenPtps(),
    enabled,
    staleTime: 0,
    refetchInterval: enabled ? 30_000 : false,
    refetchIntervalInBackground: false, // never poll in background — prevents crashes
  });

  // Refetch when app comes back to foreground
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        next === "active" &&
        enabled
      ) {
        refetch();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [enabled, refetch]);

  // Reset snooze when agent logs out
  useEffect(() => {
    if (!agent) setSnoozedUntil(0);
  }, [agent]);

  const items      = (data ?? []) as BlockingItem[];
  const isBlocking = enabled && items.length > 0 && Date.now() >= snoozedUntil;

  const snooze = () => {
    setSnoozedUntil(Date.now() + SNOOZE_MS);
    api.snoozeBlocking().catch(() => {});
  };

  const forceRefetch = () => {
    qc.invalidateQueries({ queryKey: ["/api/broken-ptps"] });
  };

  return (
    <BlockingContext.Provider value={{ items, isBlocking, snooze, refetch: forceRefetch }}>
      {children}
    </BlockingContext.Provider>
  );
}

export function useBlocking() {
  return useContext(BlockingContext);
}

import { useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { BlockingItem } from "@/components/BlockingActionModal";
import { api } from "@/lib/api";

const SNOOZE_MS = 60 * 60 * 1000; // 1 hour
const HIDE_MS   =  2 * 60 * 1000; // 2 min temp hide

export function useBlockingItems(enabled: boolean = true) {
  const [snoozedUntil, setSnoozedUntil] = useState(0);
  const [hiddenUntil,  setHiddenUntil]  = useState(0);
  const appStateRef = useRef(AppState.currentState);

  const { data, refetch } = useQuery<BlockingItem[]>({
    queryKey:        ["/api/broken-ptps"],
    queryFn:         () => api.getBrokenPtps(),
    enabled,
    staleTime:       0,
    refetchInterval: enabled ? 30_000 : false,
  });

  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && next === "active") {
        setHiddenUntil(0); // show again on foreground
        refetch();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [enabled, refetch]);

  const items      = data ?? [] as BlockingItem[];
  const now        = Date.now();
  const isBlocking = enabled && items.length > 0 && now >= snoozedUntil && now >= hiddenUntil;

  const snooze = () => {
    setSnoozedUntil(Date.now() + SNOOZE_MS);
    api.snoozeBlocking().catch(() => {});
  };

  const hideToResolve = () => {
    setHiddenUntil(Date.now() + HIDE_MS);
    refetch();
  };

  return { items, isBlocking, snooze, hideToResolve };
}

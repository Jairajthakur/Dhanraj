import { useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { BlockingItem } from "@/components/BlockingActionModal";
import { api } from "@/lib/api";

const SNOOZE_MS = 60 * 60 * 1000; // 1 hour

export function useBlockingItems(enabled: boolean = true) {
  const [snoozedUntil, setSnoozedUntil] = useState(0);
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
        refetch();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [enabled, refetch]);

  const items      = (data ?? []) as BlockingItem[];
  const isBlocking = enabled && items.length > 0 && Date.now() >= snoozedUntil;

  const snooze = () => {
    setSnoozedUntil(Date.now() + SNOOZE_MS);
    api.snoozeBlocking().catch(() => {});
  };

  return { items, isBlocking, snooze };
}

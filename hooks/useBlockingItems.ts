import { useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { BlockingItem } from "@/components/BlockingActionModal";
import { api } from "@/lib/api";

const SNOOZE_DURATION_MS = 60 * 60 * 1000; // 1 hour

export function useBlockingItems(enabled: boolean = true) {
  const [snoozedUntil, setSnoozedUntil] = useState<number>(0);
  const appStateRef = useRef(AppState.currentState);

  const { data, refetch } = useQuery<BlockingItem[]>({
    queryKey: ["/api/broken-ptps"],
    queryFn:  () => api.getBrokenPtps(),
    enabled,                      // ← only runs when agent is logged in
    staleTime: 0,
    refetchInterval: enabled ? 30 * 1000 : false,
    refetchOnWindowFocus: true,
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
  }, [refetch, enabled]);

  const items: BlockingItem[] = data ?? [];
  const isSnoozed = Date.now() < snoozedUntil;
  const isBlocking = enabled && items.length > 0 && !isSnoozed;

  const snooze = () => {
    setSnoozedUntil(Date.now() + SNOOZE_DURATION_MS);
    api.snoozeBlocking().catch(() => {});
  };

  const checkResolved = () => { refetch(); };

  return { items, isBlocking, snooze, refetch: checkResolved };
}

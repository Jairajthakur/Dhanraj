import { useEffect, useRef, useState, useCallback } from "react";
import { AppState, AppStateStatus } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { BlockingItem } from "@/components/BlockingActionModal";
import { api } from "@/lib/api";

const SNOOZE_DURATION_MS = 60 * 60 * 1000; // 1 hour

export function useBlockingItems(enabled: boolean = true) {
  const [snoozedUntil, setSnoozedUntil] = useState<number>(0);
  const [hidden,       setHidden]       = useState(false); // temporarily hidden while agent resolves
  const appStateRef = useRef(AppState.currentState);

  const { data, refetch } = useQuery<BlockingItem[]>({
    queryKey: ["/api/broken-ptps"],
    queryFn:  () => api.getBrokenPtps(),
    enabled,
    staleTime: 0,
    refetchInterval: enabled ? 30 * 1000 : false,
    refetchOnWindowFocus: true,
  });

  // Re-check every time the app comes to foreground
  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && next === "active") {
        // Unhide modal on foreground so agent is reminded if still unresolved
        setHidden(false);
        refetch();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [refetch, enabled]);

  // When refetch completes with 0 items, auto-unhide for next time
  useEffect(() => {
    if (data && data.length === 0) setHidden(false);
  }, [data]);

  const items: BlockingItem[] = data ?? [];
  const isSnoozed  = Date.now() < snoozedUntil;
  const isBlocking = enabled && items.length > 0 && !isSnoozed && !hidden;

  /** Full 1-hour snooze — persisted to server */
  const snooze = () => {
    setSnoozedUntil(Date.now() + SNOOZE_DURATION_MS);
    api.snoozeBlocking().catch(() => {});
  };

  /** Temporarily hide modal so agent can use allocation/deposition to resolve.
   *  Modal reappears on next app foreground or after 30s refetch if still unresolved. */
  const hideToResolve = useCallback(() => {
    setHidden(true);
    // Schedule un-hide after 2 minutes so modal comes back if not resolved
    setTimeout(() => { setHidden(false); }, 2 * 60 * 1000);
    refetch();
  }, [refetch]);

  const checkResolved = useCallback(() => { refetch(); }, [refetch]);

  return { items, isBlocking, snooze, hideToResolve, refetch: checkResolved };
}

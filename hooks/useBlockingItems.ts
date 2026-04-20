/**
 * useBlockingItems
 *
 * Returns any items that should block the agent from using the app:
 *   - Broken PTPs (status was PTP, ptp_date has passed)
 *   - Overdue depositions (assigned > 7 hours ago, still pending)
 *
 * The hook manages snooze state both locally (for instant UI feedback)
 * and on the server (so the block stays dismissed across app restarts).
 */

import { useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BlockingItem } from "@/components/BlockingActionModal";
import { api } from "@/lib/api";

const SNOOZE_DURATION_MS = 60 * 60 * 1000; // 1 hour
const QUERY_KEY = ["/api/broken-ptps"];

export function useBlockingItems() {
  const qc = useQueryClient();
  const [snoozedUntil, setSnoozedUntil] = useState<number>(0);
  const appStateRef = useRef(AppState.currentState);

  const { data, refetch } = useQuery<BlockingItem[]>({
    queryKey: QUERY_KEY,
    queryFn:  () => api.getBrokenPtps(),
    staleTime: 5 * 60 * 1000,   // re-fetch every 5 min in background
    refetchOnWindowFocus: true,
  });

  // Re-check every time the app comes to foreground
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && next === "active") {
        refetch();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [refetch]);

  const items: BlockingItem[] = data ?? [];
  const isSnoozed = Date.now() < snoozedUntil;
  const isBlocking = items.length > 0 && !isSnoozed;

  /** Snooze locally for instant UI response, and persist to server. */
  const snooze = () => {
    setSnoozedUntil(Date.now() + SNOOZE_DURATION_MS);
    api.snoozeBlocking().catch(() => {/* silent — local snooze already applied */});
  };

  /** Call after the agent resolves an item so the modal clears straight away. */
  const clearAndRefetch = () => {
    qc.invalidateQueries({ queryKey: QUERY_KEY });
  };

  return { items, isBlocking, snooze, refetch: clearAndRefetch };
}

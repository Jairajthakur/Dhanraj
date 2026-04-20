/**
 * useBlockingItems
 *
 * Blocks the agent from using the app until all broken PTPs and
 * overdue depositions are resolved. The modal stays visible until
 * the server confirms no blocking items remain.
 *
 * Snooze is applied locally (instant UI) AND on the server
 * (persists across app restarts via the snooze_until DB column).
 */

import { useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { BlockingItem } from "@/components/BlockingActionModal";
import { api } from "@/lib/api";

const SNOOZE_DURATION_MS = 60 * 60 * 1000; // 1 hour

export function useBlockingItems() {
  const [snoozedUntil, setSnoozedUntil] = useState<number>(0);
  const appStateRef = useRef(AppState.currentState);

  const { data, refetch } = useQuery<BlockingItem[]>({
    queryKey: ["/api/broken-ptps"],
    queryFn:  () => api.getBrokenPtps(),
    staleTime: 0,                 // always re-fetch — we need fresh data to unblock
    refetchInterval: 30 * 1000,   // poll every 30s so modal clears as soon as PTP resolved
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

  /** Snooze locally for instant UI, and persist to server. */
  const snooze = () => {
    setSnoozedUntil(Date.now() + SNOOZE_DURATION_MS);
    api.snoozeBlocking().catch(() => {});
  };

  /**
   * Call this after the agent takes action (e.g. submits a PTP update).
   * Uses refetch() directly — safe, does NOT touch auth/session queries.
   */
  const checkResolved = () => {
    refetch();
  };

  return { items, isBlocking, snooze, refetch: checkResolved };
}

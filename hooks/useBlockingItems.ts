/**
 * useBlockingItems
 *
 * Returns any items that should block the agent from using the app:
 *   - Broken PTPs (status was PTP, ptp_date has passed)
 *   - Overdue depositions (assigned > 7 hours ago, still pending)
 *
 * The hook manages the snooze state locally so the modal won't
 * re-appear within 1 hour after the agent taps "Remind me later".
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

  const snooze = () => {
    setSnoozedUntil(Date.now() + SNOOZE_DURATION_MS);
  };

  return { items, isBlocking, snooze, refetch };
}

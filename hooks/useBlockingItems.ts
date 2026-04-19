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

  const { data, refetch, isError, isLoading } = useQuery<BlockingItem[]>({
    queryKey: ["/api/broken-ptps"],
    queryFn: async () => {
      try {
        const result = await api.getBrokenPtps();
        // If result is not an array, return empty array safely
        return Array.isArray(result) ? result : [];
      } catch {
        return [];
      }
    },
    staleTime: 5 * 60 * 1000,      // re-fetch every 5 min in background
    refetchOnWindowFocus: true,
    retry: false,                   // don't retry on failure — avoids blocking UI
    // @ts-ignore — older react-query versions use throwOnError
    throwOnError: false,
  });

  // Re-check every time the app comes to foreground
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        next === "active"
      ) {
        refetch();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [refetch]);

  const items: BlockingItem[] = data ?? [];
  const isSnoozed = Date.now() < snoozedUntil;

  // Don't block if still loading or if query errored — avoids black screen
  const isBlocking = items.length > 0 && !isSnoozed && !isLoading && !isError;

  const snooze = () => {
    setSnoozedUntil(Date.now() + SNOOZE_DURATION_MS);
  };

  return { items, isBlocking, snooze, refetch };
}

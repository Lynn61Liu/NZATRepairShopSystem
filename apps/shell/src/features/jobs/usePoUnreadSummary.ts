import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from "react";
import { requestJson } from "@/utils/api";

export type PoUnreadJobItem = {
  jobId: string;
  correlationId: string;
  unreadReplyCount: number;
  latestReplyAt: string;
};

export type PoUnreadSummary = {
  totalUnreadReplies: number;
  affectedJobs: number;
  items: PoUnreadJobItem[];
};

const EMPTY_SUMMARY: PoUnreadSummary = {
  totalUnreadReplies: 0,
  affectedJobs: 0,
  items: [],
};

export const PO_UNREAD_SUMMARY_POLL_MS = 5 * 60 * 1000;

const PoUnreadSummaryContext = createContext<PoUnreadSummary | null>(null);

function normalizeSummary(data: PoUnreadSummary | null | undefined): PoUnreadSummary {
  return {
    totalUnreadReplies: Number(data?.totalUnreadReplies) || 0,
    affectedJobs: Number(data?.affectedJobs) || 0,
    items: Array.isArray(data?.items) ? data.items : [],
  };
}

function usePoUnreadSummaryPolling(pollMs = PO_UNREAD_SUMMARY_POLL_MS, enabled = true) {
  const [summary, setSummary] = useState<PoUnreadSummary>(EMPTY_SUMMARY);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const load = async () => {
      const res = await requestJson<PoUnreadSummary>("/api/jobs/po-unread-summary");
      if (!res.ok || !res.data || cancelled) return;
      setSummary(normalizeSummary(res.data));
    };

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, Math.max(15000, pollMs));

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, pollMs]);

  return enabled ? summary : EMPTY_SUMMARY;
}

export function PoUnreadSummaryProvider({
  children,
  pollMs = PO_UNREAD_SUMMARY_POLL_MS,
}: {
  children: ReactNode;
  pollMs?: number;
}) {
  const summary = usePoUnreadSummaryPolling(pollMs);
  return createElement(PoUnreadSummaryContext.Provider, { value: summary }, children);
}

export function usePoUnreadSummary(pollMs = PO_UNREAD_SUMMARY_POLL_MS) {
  const context = useContext(PoUnreadSummaryContext);
  const fallbackSummary = usePoUnreadSummaryPolling(pollMs, context === null);
  return context ?? fallbackSummary;
}

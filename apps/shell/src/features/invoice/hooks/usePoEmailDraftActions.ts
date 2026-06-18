import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui";
import type { EmailTimelineEvent, InvoiceDashboardState } from "@/features/invoice/types";
import {
  createPoRequestDraft,
  getPoRequestDraftState,
  type GmailPoDraftStateResponse,
} from "@/features/invoice/api/gmailDraftApi";

type UsePoEmailDraftActionsArgs = {
  invoice: InvoiceDashboardState;
  timeline: EmailTimelineEvent[];
  poLocked: boolean;
  poLockReason: string;
  enabled?: boolean;
};

type DraftComposePayload = {
  to: string;
  subject: string;
  body: string;
};

export type PoDraftState = {
  mode: "loading" | "none" | "available" | "missing";
  draftId?: string;
  composeUrl?: string;
  sentMailboxUrl?: string;
  gmailAccountEmail?: string | null;
  message?: string | null;
};

function buildSentMailboxUrl(accountEmail?: string | null) {
  if (accountEmail?.trim()) {
    return `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(accountEmail.trim())}#sent`;
  }

  return "https://mail.google.com/mail/u/0/#sent";
}

function openDraftWindow() {
  return typeof window !== "undefined" ? window.open("about:blank", "_blank") : null;
}

function openTargetUrl(url: string, draftWindow: Window | null) {
  if (draftWindow && !draftWindow.closed) {
    draftWindow.location.href = url;
    return;
  }

  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function mapDraftStateResponse(response: GmailPoDraftStateResponse): PoDraftState {
  return {
    mode: response.draftState,
    draftId: response.draftId ?? undefined,
    composeUrl: response.composeUrl ?? undefined,
    sentMailboxUrl: response.sentMailboxUrl ?? undefined,
    gmailAccountEmail: response.gmailAccountEmail ?? null,
    message: response.message ?? null,
  };
}

export function usePoEmailDraftActions({
  invoice,
  timeline,
  poLocked,
  poLockReason,
  enabled = true,
}: UsePoEmailDraftActionsArgs) {
  const toast = useToast();
  const refreshRequestSeq = useRef(0);
  const [draftState, setDraftState] = useState<PoDraftState>({ mode: "loading" });

  const latestThreadEvent = timeline.find((event) => ["sent", "reminder", "reply"].includes(event.type));
  const latestReplyToRfcMessageId = latestThreadEvent?.rfcMessageId || null;
  const latestReferencesHeader = latestThreadEvent?.referencesHeader || null;

  const refreshDraftState = useCallback(async () => {
    if (!enabled) {
      setDraftState({ mode: "none" });
      return null;
    }

    const correlationId = invoice.correlationId.trim();
    if (!correlationId) {
      setDraftState({ mode: "none" });
      return null;
    }

    const requestSeq = ++refreshRequestSeq.current;
    setDraftState((prev) => (prev.mode === "available" || prev.mode === "missing" ? prev : { mode: "loading" }));

    const result = await getPoRequestDraftState(correlationId);
    if (requestSeq !== refreshRequestSeq.current) {
      return null;
    }

    if (!result.ok || !result.data) {
      const message = result.error || "Failed to load Gmail draft state";
      toast.error(message);
      setDraftState((prev) => (prev.mode === "available" || prev.mode === "missing" ? prev : { mode: "none" }));
      return null;
    }

    const nextState = mapDraftStateResponse(result.data);
    setDraftState(nextState);
    return nextState;
  }, [enabled, invoice.correlationId, toast]);

  useEffect(() => {
    if (!enabled) {
      setDraftState({ mode: "none" });
      return;
    }

    void refreshDraftState();
  }, [enabled, refreshDraftState]);

  const buildDraftPayload = useCallback(
    (payload: DraftComposePayload, forceCreate = false) => ({
      to: payload.to,
      subject: payload.subject,
      body: payload.body,
      correlationId: invoice.correlationId,
      isHtmlBody: true,
      replyToRfcMessageId: latestReplyToRfcMessageId,
      referencesHeader: latestReferencesHeader,
      forceCreate,
    }),
    [invoice.correlationId, latestReplyToRfcMessageId, latestReferencesHeader]
  );

  const submitDraft = useCallback(
    async (payload: DraftComposePayload, forceCreate: boolean) => {
      if (poLocked) {
        toast.error(poLockReason);
        return false;
      }
      if (!enabled) {
        toast.error("PO draft status is not available for this job.");
        return false;
      }

      const draftWindow = openDraftWindow();

      try {
        const result = await createPoRequestDraft({
          ...buildDraftPayload(payload, forceCreate),
        });

        if (!result.ok || !result.data) {
          if (result.status === 409) {
            await refreshDraftState();
            if (draftWindow && !draftWindow.closed) {
              draftWindow.close();
            }
            return false;
          }

          throw new Error(result.error || "Failed to generate Gmail draft");
        }

        const nextState: PoDraftState = {
          mode: "available",
          draftId: result.data.draftId,
          composeUrl: result.data.composeUrl,
          sentMailboxUrl: buildSentMailboxUrl(result.data.gmailAccountEmail),
          gmailAccountEmail: result.data.gmailAccountEmail ?? null,
          message: null,
        };
        setDraftState(nextState);

        openTargetUrl(result.data.composeUrl || "https://mail.google.com", draftWindow);
        toast.success(forceCreate ? "草稿已重新创建" : "草稿已创建");
        return true;
      } catch (error) {
        if (draftWindow && !draftWindow.closed) {
          draftWindow.close();
        }

        const message = error instanceof Error ? error.message : "Failed to generate Gmail draft";
        toast.error(message);
        return false;
      }
    },
    [buildDraftPayload, enabled, poLockReason, poLocked, refreshDraftState, toast]
  );

  const createPoDraft = useCallback(
    async (payload: DraftComposePayload) => submitDraft(payload, false),
    [submitDraft]
  );

  const recreatePoDraft = useCallback(
    async (payload: DraftComposePayload) => submitDraft(payload, true),
    [submitDraft]
  );

  const viewPoDraft = useCallback(async () => {
    if (!enabled) {
      toast.error("PO draft status is not available for this job.");
      return false;
    }

    const draftWindow = openDraftWindow();

    try {
      let nextState = draftState;
      if (nextState.mode !== "available" || !nextState.composeUrl) {
        const refreshed = await refreshDraftState();
        if (refreshed) {
          nextState = refreshed;
        }
      }

      if (nextState.mode !== "available" || !nextState.composeUrl) {
        if (nextState.mode === "none") {
          const message = "当前还没有创建草稿。";
          setDraftState(nextState);
          toast.error(message);
          if (draftWindow && !draftWindow.closed) {
            draftWindow.close();
          }
          return false;
        }

        const message = nextState.message || "草稿创建过，但当前找不到，可能已经发送或删除。";
        setDraftState({
          mode: "missing",
          draftId: nextState.draftId,
          sentMailboxUrl: nextState.sentMailboxUrl,
          gmailAccountEmail: nextState.gmailAccountEmail,
          message,
        });
        toast.error(message);
        if (draftWindow && !draftWindow.closed) {
          draftWindow.close();
        }
        return false;
      }

      openTargetUrl(nextState.composeUrl, draftWindow);
      return true;
    } catch (error) {
      if (draftWindow && !draftWindow.closed) {
        draftWindow.close();
      }

      const message = error instanceof Error ? error.message : "Failed to open Gmail draft";
      toast.error(message);
      return false;
    }
  }, [draftState, enabled, refreshDraftState, toast]);

  const openSentMailbox = useCallback(() => {
    if (!enabled) {
      toast.error("PO draft status is not available for this job.");
      return false;
    }

    const targetUrl = draftState.sentMailboxUrl || buildSentMailboxUrl(draftState.gmailAccountEmail);
    openTargetUrl(targetUrl, null);
    return true;
  }, [draftState.gmailAccountEmail, draftState.sentMailboxUrl, enabled, toast]);

  return {
    draftState,
    refreshDraftState,
    createPoDraft,
    recreatePoDraft,
    viewPoDraft,
    openSentMailbox,
  };
}

import { requestJson } from "@/utils/api";

export type GmailPoDraftRequestPayload = {
  to: string;
  subject: string;
  body: string;
  correlationId: string;
  isHtmlBody?: boolean;
  htmlBodyOverride?: string | null;
  replyToRfcMessageId?: string | null;
  referencesHeader?: string | null;
  gmailAccountId?: number | null;
  forceCreate?: boolean;
};

export type GmailPoDraftResponse = {
  draftId: string;
  draftMessageId: string;
  composeUrl: string;
  draftStatus: string;
  gmailAccountId?: number | null;
  gmailAccountEmail?: string | null;
  scope?: string | null;
  accessTokenExpiresIn?: number | null;
};

export type GmailPoDraftStateResponse = {
  draftState: "none" | "available" | "missing";
  draftId?: string | null;
  composeUrl?: string | null;
  sentMailboxUrl?: string | null;
  gmailAccountId?: number | null;
  gmailAccountEmail?: string | null;
  message?: string | null;
  scope?: string | null;
  accessTokenExpiresIn?: number | null;
};

export type GmailPoSendRequestPayload = {
  to: string;
  subject: string;
  body: string;
  correlationId: string;
  isHtmlBody?: boolean;
  threadId?: string | null;
  replyToRfcMessageId?: string | null;
  referencesHeader?: string | null;
  gmailAccountId?: number | null;
};

export type GmailPoSendResponse = {
  id: string;
  threadId: string;
  rfcMessageId: string;
  referencesHeader: string;
  gmailAccountId?: number | null;
  gmailAccountEmail?: string | null;
  waitingForPoLabelApplied?: boolean;
  labelWarning?: string | null;
};

export function createPoRequestDraft(payload: GmailPoDraftRequestPayload) {
  return requestJson<GmailPoDraftResponse>("/api/gmail/drafts/po-request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      isHtmlBody: payload.isHtmlBody ?? true,
    }),
  });
}

export function getPoRequestDraftState(correlationId: string, gmailAccountId?: number | null) {
  const query = new URLSearchParams({ correlationId });
  if (gmailAccountId !== undefined && gmailAccountId !== null) {
    query.set("gmailAccountId", String(gmailAccountId));
  }

  return requestJson<GmailPoDraftStateResponse>(`/api/gmail/drafts/po-request/status?${query.toString()}`);
}

export function sendPoRequest(payload: GmailPoSendRequestPayload) {
  return requestJson<GmailPoSendResponse>("/api/gmail/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      isHtmlBody: payload.isHtmlBody ?? true,
    }),
  });
}

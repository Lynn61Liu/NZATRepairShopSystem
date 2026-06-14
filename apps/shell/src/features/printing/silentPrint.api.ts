import { requestJson } from "@/utils/api";
import { resolveSilentPrintRoute, type SilentPrintRouteKey } from "./silentPrint.routes";

export type SilentPrintJobSubmitRequest = {
  routeKey: SilentPrintRouteKey;
  html: string;
  assetBaseUrl: string;
  sourceSystem?: string;
  sourceRef?: string;
  documentName?: string;
};

export type SilentPrintJobSubmitResponse = {
  accepted: boolean;
  routeKey: SilentPrintRouteKey;
  printerName: string;
  printerFamily: string;
  jobId: string;
};

export function wrapHtmlWithBaseUrl(html: string, assetBaseUrl: string) {
  const normalizedBaseUrl = assetBaseUrl.trim().replace(/\/+$/, "");
  if (!normalizedBaseUrl) return html;

  if (/<base\s/i.test(html)) return html;

  const baseTag = `<base href="${escapeHtmlAttribute(normalizedBaseUrl)}/">`;
  const headCloseMatch = html.match(/<\/head\s*>/i);
  if (headCloseMatch?.index !== undefined) {
    return `${html.slice(0, headCloseMatch.index)}${baseTag}${html.slice(headCloseMatch.index)}`;
  }

  return `${baseTag}${html}`;
}

export async function submitSilentPrintJob(request: SilentPrintJobSubmitRequest) {
  return requestJson<SilentPrintJobSubmitResponse>("/api/silent-print/jobs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
}

export function describeSilentPrintRoute(routeKey: SilentPrintRouteKey) {
  return resolveSilentPrintRoute(routeKey);
}

function escapeHtmlAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

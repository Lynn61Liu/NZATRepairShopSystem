import { useCallback, useRef } from "react";
import { buildTemplateHtml, type RoutedPrintTemplatePayload } from "./printTemplates";
import { DEFAULT_PRINT_MODE } from "./printModes";
import { getSilentPrintRouteUnavailableMessage } from "./silentPrint.availability";
import { resolveSilentPrintRoute, type SilentPrintRouteKey } from "./silentPrint.routes";
import { submitSilentPrintJob, wrapHtmlWithBaseUrl } from "./silentPrint.api";
import { openJobSheetPopup, renderJobSheetPopup } from "./jobSheetPrint";

type UseTemplatePrinterOptions = {
  onPopupBlocked?: () => void;
  onUnavailable?: (message: string) => void;
  onError?: (message: string) => void;
};

const PRINT_QUEUE_IDLE = Promise.resolve();

export type PrintDispatchResult = {
  ok: boolean;
  mode: "preview" | "silent";
  error?: string;
};

function resolveDefaultRouteKey(payload: RoutedPrintTemplatePayload): SilentPrintRouteKey {
  if (payload.routeKey) {
    return payload.routeKey;
  }

  if (payload.type === "wof") {
    return "wof-record";
  }

  return payload.type === "paint" ? "job-pnp" : "job-mech";
}

export function useTemplatePrinter(options: UseTemplatePrinterOptions = {}) {
  const { onPopupBlocked, onUnavailable, onError } = options;
  const printQueueRef = useRef(PRINT_QUEUE_IDLE);

  const enqueuePrint = useCallback(<T,>(task: () => Promise<T>) => {
    const next = printQueueRef.current.then(task, task);
    printQueueRef.current = next.then(() => undefined, () => undefined);
    return next;
  }, []);

  const printTemplate = useCallback(
    (payload: RoutedPrintTemplatePayload): Promise<PrintDispatchResult> => {
      return enqueuePrint(async () => {
        if (typeof window === "undefined") {
          return { ok: false, mode: payload.printMode ?? DEFAULT_PRINT_MODE, error: "window_unavailable" };
        }

        try {
          const mode = payload.printMode ?? DEFAULT_PRINT_MODE;
          const html = buildTemplateHtml(payload);
          const htmlWithBaseUrl = wrapHtmlWithBaseUrl(html, window.location.origin);

          if (mode === "preview") {
            const popup = openJobSheetPopup(onPopupBlocked);
            if (!popup) {
              return { ok: false, mode };
            }

            renderJobSheetPopup(popup, htmlWithBaseUrl);
            return { ok: true, mode };
          }

          const routeKey = resolveDefaultRouteKey(payload);
          const unavailableMessage = getSilentPrintRouteUnavailableMessage(routeKey);
          if (unavailableMessage) {
            onUnavailable?.(unavailableMessage);
            return { ok: false, mode, error: unavailableMessage };
          }

          const route = resolveSilentPrintRoute(routeKey);
          const result = await submitSilentPrintJob({
            printMode: "silent",
            routeKey,
            html: htmlWithBaseUrl,
            assetBaseUrl: window.location.origin,
            sourceSystem: "shell",
            sourceRef: route.templateKey,
            documentName: `${route.templateKey}.html`,
          });

          if (!result.ok || !result.data?.accepted) {
            const errorMessage = result.error || "静默打印失败，请检查打印服务。";
            onError?.(errorMessage);
            return { ok: false, mode, error: errorMessage };
          }

          return { ok: true, mode };
        } catch {
          const mode = payload.printMode ?? DEFAULT_PRINT_MODE;
          const errorMessage = "静默打印失败，请检查打印服务。";
          onError?.(errorMessage);
          return { ok: false, mode, error: errorMessage };
        }
      });
    },
    [enqueuePrint, onError, onPopupBlocked, onUnavailable]
  );

  return { printTemplate };
}

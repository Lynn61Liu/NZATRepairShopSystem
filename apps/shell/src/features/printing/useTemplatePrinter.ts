import { useCallback, useRef } from "react";
import { buildTemplateHtml, type RoutedPrintTemplatePayload } from "./printTemplates";
import { resolveSilentPrintRoute, type SilentPrintRouteKey } from "./silentPrint.routes";
import { submitSilentPrintJob, wrapHtmlWithBaseUrl } from "./silentPrint.api";

type UseTemplatePrinterOptions = {
  onPopupBlocked?: () => void;
};

const PRINT_QUEUE_IDLE = Promise.resolve();

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
  const { onPopupBlocked } = options;
  const printQueueRef = useRef(PRINT_QUEUE_IDLE);

  const enqueuePrint = useCallback((task: () => Promise<void>) => {
    printQueueRef.current = printQueueRef.current.then(task, task).catch(() => undefined);
  }, []);

  const printTemplate = useCallback(
    (payload: RoutedPrintTemplatePayload) => {
      enqueuePrint(async () => {
        if (typeof window === "undefined") {
          return;
        }

        try {
          const routeKey = resolveDefaultRouteKey(payload);
          const route = resolveSilentPrintRoute(routeKey);
          const html = wrapHtmlWithBaseUrl(buildTemplateHtml(payload), window.location.origin);

          const result = await submitSilentPrintJob({
            routeKey,
            html,
            assetBaseUrl: window.location.origin,
            sourceSystem: "shell",
            sourceRef: route.templateKey,
            documentName: `${route.templateKey}.html`,
          });

          if (!result.ok || !result.data?.accepted) {
            onPopupBlocked?.();
          }
        } catch {
          onPopupBlocked?.();
        }
      });
    },
    [enqueuePrint, onPopupBlocked]
  );

  return { printTemplate };
}

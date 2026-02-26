import { useCallback } from "react";
import { buildTemplateHtml, type PrintTemplatePayload } from "./printTemplates";

type UseTemplatePrinterOptions = {
  onPopupBlocked?: () => void;
};

const PRINT_FRAME_ID = "print-template-frame";

const isPrintDebugEnabled = () => {
  try {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("printDebug");
    if (flag === "1" || flag === "true") return true;
    const stored = window.localStorage.getItem("printDebug");
    return stored === "1" || stored === "true";
  } catch {
    return false;
  }
};

export function useTemplatePrinter(options: UseTemplatePrinterOptions = {}) {
  const { onPopupBlocked } = options;

  const printTemplate = useCallback(
    (payload: PrintTemplatePayload) => {
      if (!document.body) {
        onPopupBlocked?.();
        return;
      }

      const existing = document.getElementById(PRINT_FRAME_ID);
      if (existing) existing.remove();

      const debug = isPrintDebugEnabled();
      if (debug) {
        const width = window.screen?.availWidth ?? 1200;
        const height = window.screen?.availHeight ?? 900;
        const features = [
          `width=${width}`,
          `height=${height}`,
          "left=0",
          "top=0",
          "resizable=yes",
          "scrollbars=yes",
        ].join(",");
        const popup = window.open("", "_blank", features);
        if (!popup) {
          onPopupBlocked?.();
          return;
        }
        const html = buildTemplateHtml(payload);
        popup.document.open();
        popup.document.write(html);
        popup.document.close();
        popup.focus();
        return;
      }

      const iframe = document.createElement("iframe");
      iframe.id = PRINT_FRAME_ID;
      iframe.title = debug ? "Print Template Preview (Debug)" : "Print Template Frame";
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.style.visibility = "hidden";
      iframe.style.pointerEvents = "none";

      iframe.onload = () => {
        const win = iframe.contentWindow;
        if (!win) return;
        const cleanup = () => {
          if (iframe.parentNode) iframe.remove();
        };
        try {
          win.addEventListener("afterprint", cleanup, { once: true });
          win.focus();
          win.print();
        } catch {
          cleanup();
          return;
        }

        window.setTimeout(cleanup, 15000);
      };

      const html = buildTemplateHtml(payload);
      iframe.srcdoc = html;
      document.body.appendChild(iframe);
    },
    [onPopupBlocked]
  );

  return { printTemplate };
}

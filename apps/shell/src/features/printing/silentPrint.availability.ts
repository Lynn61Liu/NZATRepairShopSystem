import { resolveSilentPrintRoute, type SilentPrintPrinterFamily, type SilentPrintRouteKey } from "./silentPrint.routes";

export type SilentPrintEnv = {
  VITE_SILENT_PRINT_QUEUE_HP?: string;
  VITE_SILENT_PRINT_QUEUE_EPSON?: string;
  VITE_SILENT_PRINT_QUEUE_BROTHER?: string;
};

function readSilentPrintEnv(): SilentPrintEnv {
  if (typeof import.meta === "undefined" || !import.meta.env) {
    return {};
  }

  const env = import.meta.env as ImportMetaEnv & SilentPrintEnv;
  return {
    VITE_SILENT_PRINT_QUEUE_HP: env.VITE_SILENT_PRINT_QUEUE_HP,
    VITE_SILENT_PRINT_QUEUE_EPSON: env.VITE_SILENT_PRINT_QUEUE_EPSON,
    VITE_SILENT_PRINT_QUEUE_BROTHER: env.VITE_SILENT_PRINT_QUEUE_BROTHER,
  };
}

const PRINT_QUEUE_ENV_BY_FAMILY: Record<SilentPrintPrinterFamily, keyof SilentPrintEnv> = {
  hp: "VITE_SILENT_PRINT_QUEUE_HP",
  epson: "VITE_SILENT_PRINT_QUEUE_EPSON",
  brother: "VITE_SILENT_PRINT_QUEUE_BROTHER",
};

function getQueueName(printerFamily: SilentPrintPrinterFamily, env: SilentPrintEnv) {
  return env[PRINT_QUEUE_ENV_BY_FAMILY[printerFamily]]?.trim();
}

export function isSilentPrintRouteAvailable(routeKey: SilentPrintRouteKey, env: SilentPrintEnv = readSilentPrintEnv()) {
  const route = resolveSilentPrintRoute(routeKey);
  const queueName = getQueueName(route.printerFamily, env);

  if (queueName) {
    return true;
  }

  return route.printerFamily === "hp";
}

export function getSilentPrintRouteUnavailableMessage(
  routeKey: SilentPrintRouteKey,
  env: SilentPrintEnv = readSilentPrintEnv()
) {
  if (isSilentPrintRouteAvailable(routeKey, env)) {
    return null;
  }

  const route = resolveSilentPrintRoute(routeKey);
  if (route.printerFamily === "epson") {
    return "当前电脑未配置 EPSON LQ-730KII 打印机，请先设置 VITE_SILENT_PRINT_QUEUE_EPSON。";
  }

  if (route.printerFamily === "brother") {
    return "当前电脑未配置 Brother QL-810W 打印机，请先设置 VITE_SILENT_PRINT_QUEUE_BROTHER。";
  }

  return `当前电脑未配置 ${route.printerName} 打印机。`;
}

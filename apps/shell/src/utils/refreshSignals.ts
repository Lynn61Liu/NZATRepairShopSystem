const PAINT_BOARD_REFRESH_EVENT = "paint-board:refresh";
const WOF_SCHEDULE_REFRESH_EVENT = "wof-schedule:refresh";
const PARTS_FLOW_REFRESH_EVENT = "parts-flow:refresh";
const WORKLOG_COST_ALERT_EVENT = "worklog:cost-alert";
const PO_DASHBOARD_REFRESH_EVENT = "po-dashboard:refresh";

export function notifyPaintBoardRefresh() {
  try {
    localStorage.setItem(PAINT_BOARD_REFRESH_EVENT, String(Date.now()));
  } catch {
    // ignore storage errors
  }
  window.dispatchEvent(new Event(PAINT_BOARD_REFRESH_EVENT));
}

export function subscribePaintBoardRefresh(handler: () => void) {
  const onCustomEvent = () => handler();
  const onStorage = (event: StorageEvent) => {
    if (event.key === PAINT_BOARD_REFRESH_EVENT) {
      handler();
    }
  };

  window.addEventListener(PAINT_BOARD_REFRESH_EVENT, onCustomEvent);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(PAINT_BOARD_REFRESH_EVENT, onCustomEvent);
    window.removeEventListener("storage", onStorage);
  };
}

export function notifyWofScheduleRefresh() {
  try {
    localStorage.setItem(WOF_SCHEDULE_REFRESH_EVENT, String(Date.now()));
  } catch {
    // ignore storage errors
  }
  window.dispatchEvent(new Event(WOF_SCHEDULE_REFRESH_EVENT));
}

export function subscribeWofScheduleRefresh(handler: () => void) {
  const onCustomEvent = () => handler();
  const onStorage = (event: StorageEvent) => {
    if (event.key === WOF_SCHEDULE_REFRESH_EVENT) {
      handler();
    }
  };

  window.addEventListener(WOF_SCHEDULE_REFRESH_EVENT, onCustomEvent);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(WOF_SCHEDULE_REFRESH_EVENT, onCustomEvent);
    window.removeEventListener("storage", onStorage);
  };
}

export function notifyPartsFlowRefresh() {
  try {
    localStorage.setItem(PARTS_FLOW_REFRESH_EVENT, String(Date.now()));
  } catch {
    // ignore storage errors
  }
  window.dispatchEvent(new Event(PARTS_FLOW_REFRESH_EVENT));
}

export function subscribePartsFlowRefresh(handler: () => void) {
  const onCustomEvent = () => handler();
  const onStorage = (event: StorageEvent) => {
    if (event.key === PARTS_FLOW_REFRESH_EVENT) {
      handler();
    }
  };

  window.addEventListener(PARTS_FLOW_REFRESH_EVENT, onCustomEvent);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(PARTS_FLOW_REFRESH_EVENT, onCustomEvent);
    window.removeEventListener("storage", onStorage);
  };
}

export function notifyWorklogCostAlert(count: number) {
  try {
    localStorage.setItem(WORKLOG_COST_ALERT_EVENT, String(count));
  } catch {
    // ignore storage errors
  }
  window.dispatchEvent(new Event(WORKLOG_COST_ALERT_EVENT));
}

export function subscribeWorklogCostAlert(handler: (count: number) => void) {
  const onCustomEvent = () => {
    const stored = localStorage.getItem(WORKLOG_COST_ALERT_EVENT);
    handler(Number(stored) || 0);
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === WORKLOG_COST_ALERT_EVENT) {
      handler(Number(event.newValue) || 0);
    }
  };

  window.addEventListener(WORKLOG_COST_ALERT_EVENT, onCustomEvent);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(WORKLOG_COST_ALERT_EVENT, onCustomEvent);
    window.removeEventListener("storage", onStorage);
  };
}

export function notifyPoDashboardRefresh() {
  try {
    localStorage.setItem(PO_DASHBOARD_REFRESH_EVENT, String(Date.now()));
  } catch {
    // ignore storage errors
  }
  window.dispatchEvent(new Event(PO_DASHBOARD_REFRESH_EVENT));
}

export function subscribePoDashboardRefresh(handler: () => void) {
  const onCustomEvent = () => handler();
  const onStorage = (event: StorageEvent) => {
    if (event.key === PO_DASHBOARD_REFRESH_EVENT) {
      handler();
    }
  };

  window.addEventListener(PO_DASHBOARD_REFRESH_EVENT, onCustomEvent);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(PO_DASHBOARD_REFRESH_EVENT, onCustomEvent);
    window.removeEventListener("storage", onStorage);
  };
}

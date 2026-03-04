const PAINT_BOARD_REFRESH_EVENT = "paint-board:refresh";
const WORKLOG_COST_ALERT_EVENT = "worklog:cost-alert";

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

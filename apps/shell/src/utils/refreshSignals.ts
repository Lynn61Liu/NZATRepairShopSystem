const PAINT_BOARD_REFRESH_EVENT = "paint-board:refresh";

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

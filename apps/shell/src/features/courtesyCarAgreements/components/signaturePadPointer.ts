type PointerLike = {
  clientX: number;
  clientY: number;
};

type CanvasRectLike = {
  left: number;
  top: number;
};

export function getCanvasPointFromPointer(event: PointerLike, rect: CanvasRectLike) {
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

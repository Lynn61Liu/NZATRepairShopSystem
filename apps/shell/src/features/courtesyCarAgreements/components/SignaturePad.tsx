import { useEffect, useRef } from "react";
import { PencilLine } from "lucide-react";
import { Button } from "@/components/ui";

type SignaturePadProps = {
  value: string;
  onChange: (value: string) => void;
};

export function SignaturePad({ value, onChange }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    ctx.scale(ratio, ratio);
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#1d4ed8";

    if (value) {
      const image = new Image();
      image.onload = () => {
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(image, 0, 0, width, height);
      };
      image.src = value;
    }
  }, [value]);

  const drawPoint = (x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (!lastPointRef.current) {
      lastPointRef.current = { x, y };
      return;
    }
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    lastPointRef.current = { x, y };
    onChange(canvas.toDataURL("image/png"));
  };

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-[22px] border-2 border-dashed border-slate-200 bg-white p-4 md:p-5">
        <canvas
          ref={canvasRef}
          className="h-56 w-full rounded-[16px] bg-white touch-none"
          onPointerDown={(event) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            drawingRef.current = true;
            canvas.setPointerCapture(event.pointerId);
            const rect = canvas.getBoundingClientRect();
            lastPointRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
          }}
          onPointerMove={(event) => {
            if (!drawingRef.current) return;
            drawPoint(event.nativeEvent.offsetX, event.nativeEvent.offsetY);
          }}
          onPointerUp={() => {
            drawingRef.current = false;
            lastPointRef.current = null;
          }}
          onPointerLeave={() => {
            drawingRef.current = false;
            lastPointRef.current = null;
          }}
        />
        {value ? null : (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="flex items-center gap-2 text-slate-400">
              <PencilLine className="h-5 w-5" />
              <span className="text-[18px] font-semibold tracking-[-0.02em]">请在此处签名 / Sign here</span>
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          onClick={() => {
            onChange("");
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext("2d");
            if (canvas && ctx) {
              ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
            }
          }}
          className="!h-10 rounded-[14px] border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Clear
        </Button>
        <div className="text-xs text-slate-500">Use your finger or mouse to sign.</div>
      </div>
    </div>
  );
}

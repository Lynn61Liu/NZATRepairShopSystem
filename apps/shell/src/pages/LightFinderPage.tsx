import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { requestJson } from "@/utils/api";

type LightFinderBinding = {
  id: number;
  jobId?: number | null;
  plate: string;
  vehicleModel?: string | null;
  vehicleColour?: string | null;
  status: string;
  batteryPercent?: number | null;
  isLightOn: boolean;
  lastSeenAt?: string | null;
};

const TAG_ONLINE_WINDOW_MS = 10 * 60 * 1000;

function normalizePlate(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function isTagOnline(lastSeenAt?: string | null) {
  if (!lastSeenAt) return false;
  const seenAt = new Date(lastSeenAt).getTime();
  if (Number.isNaN(seenAt)) return false;
  return Date.now() - seenAt <= TAG_ONLINE_WINDOW_MS;
}

function formatRelativeTime(value?: string | null) {
  if (!value) return "未收到信号";
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "时间未知";
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds} 秒前在线`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前在线`;
  const hours = Math.round(minutes / 60);
  return `${hours} 小时前在线`;
}

export function LightFinderPage() {
  const [plateInput, setPlateInput] = useState("");
  const [rows, setRows] = useState<LightFinderBinding[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);
  const [successId, setSuccessId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const successTimerRef = useRef<number | null>(null);

  const loadBindings = async (plateQuery: string) => {
    setLoading(true);
    setError(null);
    setHasLoaded(true);
    const res = await requestJson<LightFinderBinding[]>("/api/estation/light-bindings", { cache: "no-store" });
    setLoading(false);

    if (!res.ok || !res.data) {
      setRows([]);
      setError(res.error || "读取灯牌绑定失败");
      return;
    }

    const normalizedQuery = normalizePlate(plateQuery);
    const nextRows = res.data
      .filter((row) => row.status === "Bound")
      .filter((row) => {
        if (!normalizedQuery) return true;
        return normalizePlate(row.plate).includes(normalizedQuery);
      });

    setRows(nextRows);
  };

  useEffect(() => {
    return () => {
      if (successTimerRef.current) window.clearTimeout(successTimerRef.current);
    };
  }, []);

  const onlineCount = useMemo(() => rows.filter((row) => isTagOnline(row.lastSeenAt)).length, [rows]);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!normalizePlate(plateInput)) {
      setRows([]);
      setHasLoaded(false);
      setError("请输入车牌");
      return;
    }
    void loadBindings(plateInput);
  };

  const showAll = () => {
    setPlateInput("");
    void loadBindings("");
  };

  const lightOn = async (row: LightFinderBinding) => {
    if (!isTagOnline(row.lastSeenAt) || actionId !== null) return;

    setActionId(row.id);
    setSuccessId(null);
    setError(null);
    const res = await requestJson(`/api/estation/light-bindings/${row.id}/light-on`, {
      method: "POST",
      cache: "no-store",
    });
    setActionId(null);

    if (!res.ok) {
      setError(res.error || "点亮失败");
      return;
    }

    setSuccessId(row.id);
    if (successTimerRef.current) window.clearTimeout(successTimerRef.current);
    successTimerRef.current = window.setTimeout(() => setSuccessId(null), 1800);
  };

  return (
    <main className="min-h-dvh bg-[#f7f7f4] px-8 pb-8 pt-[max(40px,env(safe-area-inset-top))] text-[#202124] ">
      <div className="mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-[520px] flex-col gap-5 p-6">
        <header className="pt-1">
          <div className="text-sm font-semibold text-[#74746f]">NZ Auto Tech</div>
          <h1 className="mt-1 text-[34px] font-black leading-none text-[#171717]">找钥匙</h1>
        </header>

        <form onSubmit={handleSearch} className="flex flex-col gap-3">
          <Input
            value={plateInput}
            onChange={(event) => setPlateInput(normalizePlate(event.target.value))}
            placeholder="输入车牌"
            inputMode="search"
            autoCapitalize="characters"
            className="h-55 rounded-[8px] border-[#d5d1c8] bg-white text-[20px] font-black uppercase tracking-normal text-[#202124]"
          />
          <Button type="submit" variant="primary" disabled={loading} className="h-16 w-full justify-center px-5 text-[28px] font-black">
            搜索
          </Button>
        </form>

        <Button
          onClick={showAll}
          disabled={loading}
        variant="primary"
          className="h-16 w-full justify-center text-[20px] font-black"
        >
          显示全部
        </Button>

        <div className="text-sm text-[#74746f]">
          {hasLoaded ? `共 ${rows.length} 辆，${onlineCount} 个在线` : "输入车牌查找，或显示全部"}
        </div>

        {error ? (
          <div className="rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        <section className="flex flex-1 flex-col gap-3">
          {loading ? (
            <div className="flex flex-1 items-center justify-center rounded-[8px] border border-[#ded8cc] bg-white text-[#74746f]">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              读取最新数据...
            </div>
          ) : !hasLoaded ? (
            <div className="flex flex-1 items-center justify-center rounded-[8px] border border-[#ded8cc] bg-white px-4 text-center text-sm text-[#74746f]">
              输入车牌后点确认，或点显示全部
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-[8px] border border-[#ded8cc] bg-white px-4 text-center text-sm text-[#74746f]">
              没有找到已绑定的车辆
            </div>
          ) : (
            rows.map((row) => (
              <VehicleCard
                key={row.id}
                row={row}
                online={isTagOnline(row.lastSeenAt)}
                loading={actionId === row.id}
                success={successId === row.id}
                disabled={actionId !== null}
                onClick={() => void lightOn(row)}
              />
            ))
          )}
        </section>
      </div>
    </main>
  );
}

function VehicleCard({
  row,
  online,
  loading,
  success,
  disabled,
  onClick,
}: {
  row: LightFinderBinding;
  online: boolean;
  loading: boolean;
  success: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const canClick = online && !disabled;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!canClick}
      className={[
        "w-full rounded-[8px] border bg-white p-4 text-left shadow-sm transition",
        canClick ? "border-[#d6d0c4] active:scale-[0.99]" : "border-[#e4dfd6] opacity-65",
        success ? "ring-2 ring-emerald-400" : "",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="break-words text-[44px] font-black uppercase leading-[0.95] tracking-normal text-[#101010]">
            {row.plate || "-"}
          </div>
          <div className="mt-3 text-lg font-semibold text-[#3c3c39]">{row.vehicleModel || "车型未知"}</div>
          <div className="mt-1 text-base text-[#74746f]">{row.vehicleColour || "颜色未知"}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className={["rounded-full px-2.5 py-1 text-xs font-bold", online ? "bg-emerald-50 text-emerald-700" : "bg-[#eeeeea] text-[#74746f]"].join(" ")}>
            {online ? "在线" : "离线"}
          </div>
          {row.batteryPercent != null ? (
            <div className="mt-2 text-xs font-semibold text-[#74746f]">电量 {row.batteryPercent}%</div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#ece7dd] pt-3 text-sm">
        <span className="min-w-0 truncate text-[#74746f]">{formatRelativeTime(row.lastSeenAt)}</span>
        <span
          className={[
            "inline-flex h-11 shrink-0 items-center justify-center rounded-[8px] px-4 text-base font-black",
            online ? "bg-[#eb3925] text-white" : "bg-[#eeeeea] text-[#74746f]",
            loading ? "opacity-75" : "",
            success ? "bg-emerald-600 text-white" : "",
          ].join(" ")}
        >
          {loading ? "点亮中..." : success ? "已发送点亮" : online ? "点亮响铃" : "不可点亮"}
        </span>
      </div>
    </button>
  );
}

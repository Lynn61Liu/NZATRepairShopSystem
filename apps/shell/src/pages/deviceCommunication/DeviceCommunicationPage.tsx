import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, EmptyState, Tabs } from "@/components/ui";
import { requestJson } from "@/utils/api";
import { Activity, PackageOpen, Plus, RefreshCcw, Search, TriangleAlert } from "lucide-react";

type ViewKey = "stations" | "tags" | "bindings" | "logs";

type StationStatus = {
  stationId: string;
  alias?: string | null;
  status: "Online" | "Warning" | "Offline" | "NeverSeen" | string;
  isOnline: boolean;
  lastHeartbeatAt?: string | null;
  secondsSinceLastHeartbeat?: number | null;
  firmwareVersion?: string | null;
  serverAddress?: string | null;
  totalCount: number;
  sendCount: number;
  lastPayloadStatus: string;
};

type LightTagStatus = {
  tagId: string;
  stationId?: string | null;
  currentGroup?: number | null;
  currentColor?: string | null;
  isLightOn: boolean;
  batteryVoltage?: number | null;
  batteryPercent?: number | null;
  rfPowerSend?: number | null;
  rfPowerRecv?: number | null;
  lastResultType?: number | null;
  lastResultTypeLabel: string;
  lastSeenAt?: string | null;
  lastPayloadStatus: string;
};

type MqttLogRow = {
  id: number;
  topic: string;
  payload: string;
  messageType: string;
  stationId?: string | null;
  tagId?: string | null;
  receivedAt: string;
  processingStatus: string;
  errorMessage?: string | null;
};

type MqttHealth = {
  enabled: boolean;
  brokerHost: string;
  brokerPort: number;
  useTls: boolean;
  hasUsername: boolean;
  clientIdPrefix: string;
};

type LightBindingRow = {
  id: number;
  jobId?: number | null;
  plate: string;
  stationId: string;
  tagId: string;
  groupNo: number;
  status: string;
  batteryPercent?: number | null;
  currentColor?: string | null;
  isLightOn: boolean;
  lastSeenAt?: string | null;
  lastResultAt?: string | null;
  failureReason?: string | null;
};

const tabs = [
  { key: "stations", label: "Base Stations" },
  { key: "tags", label: "Light Tags" },
  { key: "bindings", label: "Bindings" },
  { key: "logs", label: "MQTT Logs" },
];

const bindingStatusOptions = [
  { value: "active", label: "Active bindings" },
  { value: "", label: "All statuses" },
  { value: "Bound", label: "Bound" },
  { value: "PendingBind", label: "PendingBind" },
  { value: "BindFailed", label: "BindFailed" },
  { value: "Unbound", label: "Unbound" },
];

const normalizeLightTagInput = (value: string) => value.trim().toUpperCase().replace(/\s+/g, "");

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-");
}

function statusTone(value: string) {
  if (value === "Online" || value === "Processed" || value === "Bound") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (value === "Warning" || value === "Received" || value === "PendingBind") return "border-amber-200 bg-amber-50 text-amber-700";
  if (value === "Offline" || value === "Failed" || value === "BindFailed" || value.startsWith("Invalid") || value === "StationMismatch") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return (
    <span className={["inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold", tone].join(" ")}>
      {children}
    </span>
  );
}

function CompactInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="h-9 min-w-0 rounded-[8px] border border-[var(--ds-border)] bg-white px-3 text-sm outline-none transition focus:border-[var(--ds-primary)]"
    />
  );
}

export function DeviceCommunicationPage() {
  const [activeView, setActiveView] = useState<ViewKey>("stations");
  const [stations, setStations] = useState<StationStatus[]>([]);
  const [lightTags, setLightTags] = useState<LightTagStatus[]>([]);
  const [bindings, setBindings] = useState<LightBindingRow[]>([]);
  const [logs, setLogs] = useState<MqttLogRow[]>([]);
  const [mqttHealth, setMqttHealth] = useState<MqttHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stationFilter, setStationFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [batteryFilter, setBatteryFilter] = useState("");
  const [logStatusFilter, setLogStatusFilter] = useState("");
  const [logTypeFilter, setLogTypeFilter] = useState("");
  const [bindingStatusFilter, setBindingStatusFilter] = useState("active");
  const [bindingActionId, setBindingActionId] = useState<number | null>(null);
  const [manualBindingOpen, setManualBindingOpen] = useState(false);
  const [manualObjectName, setManualObjectName] = useState("");
  const [manualTagId, setManualTagId] = useState("");
  const [manualBindingSaving, setManualBindingSaving] = useState(false);
  const [manualBindingError, setManualBindingError] = useState<string | null>(null);

  const stationSummary = useMemo(() => {
    return {
      online: stations.filter((row) => row.status === "Online").length,
      warning: stations.filter((row) => row.status === "Warning").length,
      offline: stations.filter((row) => row.status === "Offline").length,
    };
  }, [stations]);
  const visibleBindings = useMemo(() => {
    if (bindingStatusFilter === "active") {
      return bindings.filter((row) => row.status !== "Unbound");
    }

    if (!bindingStatusFilter) {
      return bindings;
    }

    return bindings.filter((row) => row.status === bindingStatusFilter);
  }, [bindings, bindingStatusFilter]);

  const loadAll = async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);

    const group = Number.parseInt(groupFilter, 10);
    const tagQuery = new URLSearchParams();
    if (stationFilter.trim()) tagQuery.set("stationId", stationFilter.trim());
    if (Number.isFinite(group)) tagQuery.set("group", String(group));
    if (batteryFilter === "low") tagQuery.set("battery", "low");
    const tagQueryString = tagQuery.toString();

    const logQuery = new URLSearchParams();
    if (stationFilter.trim()) logQuery.set("stationId", stationFilter.trim());
    if (logTypeFilter.trim()) logQuery.set("messageType", logTypeFilter.trim());
    if (logStatusFilter.trim()) logQuery.set("processingStatus", logStatusFilter.trim());
    logQuery.set("limit", "100");

    const [healthRes, stationRes, tagRes, bindingRes, logRes] = await Promise.all([
      requestJson<MqttHealth>("/api/estation/mqtt-health"),
      requestJson<StationStatus[]>("/api/estation/stations"),
      requestJson<LightTagStatus[]>(`/api/estation/light-tags${tagQueryString ? `?${tagQueryString}` : ""}`),
      requestJson<LightBindingRow[]>("/api/estation/light-bindings"),
      requestJson<MqttLogRow[]>(`/api/estation/mqtt-logs?${logQuery}`),
    ]);

    if (!healthRes.ok || !stationRes.ok || !tagRes.ok || !bindingRes.ok || !logRes.ok) {
      setError(healthRes.error || stationRes.error || tagRes.error || bindingRes.error || logRes.error || "Failed to load device communication data.");
    }

    setMqttHealth(healthRes.data);
    setStations(stationRes.data ?? []);
    setLightTags(tagRes.data ?? []);
    setBindings(bindingRes.data ?? []);
    setLogs(logRes.data ?? []);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadAll(true);
    }, 8000);

    return () => window.clearInterval(timer);
  }, [stationFilter, groupFilter, batteryFilter, logStatusFilter, logTypeFilter]);

  const sendBindingLightCommand = async (binding: LightBindingRow, action: "light-on" | "light-off") => {
    setBindingActionId(binding.id);
    setError(null);
    const res = await requestJson(`/api/estation/light-bindings/${binding.id}/${action}`, { method: "POST" });
    setBindingActionId(null);

    if (!res.ok) {
      setError(res.error || "Failed to send light command.");
      return;
    }

    await loadAll(true);
  };

  const closeManualBindingDialog = () => {
    if (manualBindingSaving) return;
    setManualBindingOpen(false);
    setManualBindingError(null);
    setManualObjectName("");
    setManualTagId("");
  };

  const submitManualBinding = async () => {
    const objectName = manualObjectName.trim();
    const tagId = normalizeLightTagInput(manualTagId);
    if (!objectName) {
      setManualBindingError("请输入物体名称。");
      return;
    }
    if (!tagId) {
      setManualBindingError("请输入灯条码。");
      return;
    }

    setManualBindingSaving(true);
    setManualBindingError(null);
    try {
      const res = await requestJson<LightBindingRow>("/api/estation/light-bindings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectName, tagId }),
      });

      if (!res.ok) {
        setManualBindingError(res.error || "绑定失败。");
        return;
      }

      setManualBindingOpen(false);
      setManualObjectName("");
      setManualTagId("");
      setBindingStatusFilter("active");
      await loadAll(true);
    } catch (err) {
      setManualBindingError(err instanceof Error ? err.message : "绑定失败。");
    } finally {
      setManualBindingSaving(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 text-[14px]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-sm font-semibold uppercase tracking-[0.08em] text-[rgba(0,0,0,0.42)]">Device Communication</div>
          <h1 className="text-2xl font-semibold text-[rgba(0,0,0,0.72)]">Broker / eStation Monitor</h1>
        </div>
        <Button
          onClick={() => void loadAll(true)}
          leftIcon={<RefreshCcw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
          disabled={refreshing || loading}
        >
          Refresh
        </Button>
      </div>

      {error ? <Alert variant="error" description={error} onClose={() => setError(null)} /> : null}
      {mqttHealth && !mqttHealth.enabled ? (
        <Alert
          variant="warning"
          title="MQTT listener is disabled"
          description="The API is running, but it is not subscribed to eStation heartbeat/result topics. Enable EStationMqtt__Enabled and restart the API."
        />
      ) : null}
      {mqttHealth && mqttHealth.enabled ? (
        <Alert
          variant="info"
          title="MQTT listener target"
          description={`${mqttHealth.useTls ? "mqtts" : "mqtt"}://${mqttHealth.brokerHost || "(empty)"}:${mqttHealth.brokerPort}`}
        />
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <PackageOpen className="h-5 w-5 text-[var(--ds-primary)]" />
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[rgba(0,0,0,0.42)]">Stations</div>
              <div className="text-xl font-semibold">{stations.length}</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone={statusTone("Online")}>Online {stationSummary.online}</Badge>
            <Badge tone={statusTone("Warning")}>Warning {stationSummary.warning}</Badge>
            <Badge tone={statusTone("Offline")}>Offline {stationSummary.offline}</Badge>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Activity className="h-5 w-5 text-[var(--ds-primary)]" />
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[rgba(0,0,0,0.42)]">Light Tags</div>
              <div className="text-xl font-semibold">{lightTags.length}</div>
            </div>
          </div>
          <div className="mt-3 text-sm text-[var(--ds-muted)]">Last seen devices from result messages</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <TriangleAlert className="h-5 w-5 text-[var(--ds-primary)]" />
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[rgba(0,0,0,0.42)]">Low Battery</div>
              <div className="text-xl font-semibold">{lightTags.filter((row) => (row.batteryPercent ?? 100) < 30).length}</div>
            </div>
          </div>
          <div className="mt-3 text-sm text-[var(--ds-muted)]">Tags below 30%</div>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs tabs={tabs} activeKey={activeView} onChange={(key) => setActiveView(key as ViewKey)} />
        <div className="flex flex-wrap gap-2">
          <CompactInput value={stationFilter} onChange={setStationFilter} placeholder="Station ID" />
          {activeView === "tags" ? (
            <>
              <CompactInput value={groupFilter} onChange={setGroupFilter} placeholder="Group" />
              <select
                value={batteryFilter}
                onChange={(event) => setBatteryFilter(event.target.value)}
                className="h-9 rounded-[8px] border border-[var(--ds-border)] bg-white px-3 text-sm"
              >
                <option value="">All batteries</option>
                <option value="low">Low battery</option>
              </select>
            </>
          ) : null}
          {activeView === "logs" ? (
            <>
              <CompactInput value={logTypeFilter} onChange={setLogTypeFilter} placeholder="Message type" />
              <CompactInput value={logStatusFilter} onChange={setLogStatusFilter} placeholder="Processing status" />
            </>
          ) : null}
          {activeView === "bindings" ? (
            <>
              <Button
                variant="primary"
                onClick={() => {
                  setManualBindingError(null);
                  setManualBindingOpen(true);
                }}
                leftIcon={<Plus className="h-4 w-4" />}
              >
                添加
              </Button>
              <select
                value={bindingStatusFilter}
                onChange={(event) => setBindingStatusFilter(event.target.value)}
                className="h-9 rounded-[8px] border border-[var(--ds-border)] bg-white px-3 text-sm"
              >
                {bindingStatusOptions.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          <Button onClick={() => void loadAll(true)} leftIcon={<Search className="h-4 w-4" />}>
            Apply
          </Button>
        </div>
      </div>

      <Card className="min-h-0 flex-1 overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-sm text-[var(--ds-muted)]">Loading...</div>
        ) : activeView === "stations" ? (
          <StationsTable rows={stations} onOpenLogs={(stationId) => {
            setStationFilter(stationId);
            setActiveView("logs");
          }} />
        ) : activeView === "tags" ? (
          <LightTagsTable rows={lightTags} onOpenLogs={(stationId) => {
            setStationFilter(stationId);
            setActiveView("logs");
          }} />
        ) : activeView === "bindings" ? (
          <BindingsTable rows={visibleBindings} onOpenLogs={(stationId) => {
            setStationFilter(stationId);
            setActiveView("logs");
          }} onLightCommand={sendBindingLightCommand} activeActionId={bindingActionId} />
        ) : (
          <LogsTable rows={logs} />
        )}
      </Card>

      <ManualBindingDialog
        open={manualBindingOpen}
        objectName={manualObjectName}
        tagId={manualTagId}
        isSaving={manualBindingSaving}
        error={manualBindingError}
        onObjectNameChange={setManualObjectName}
        onTagIdChange={(value) => setManualTagId(normalizeLightTagInput(value))}
        onCancel={closeManualBindingDialog}
        onConfirm={() => void submitManualBinding()}
      />
    </div>
  );
}

function ManualBindingDialog({
  open,
  objectName,
  tagId,
  isSaving,
  error,
  onObjectNameChange,
  onTagIdChange,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  objectName: string;
  tagId: string;
  isSaving: boolean;
  error: string | null;
  onObjectNameChange: (value: string) => void;
  onTagIdChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
      <div className="w-full max-w-lg rounded-[16px] bg-white p-5 shadow-xl">
        <div className="text-lg font-semibold text-[var(--ds-text)]">添加绑定</div>
        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <label htmlFor="manual-binding-object-name" className="block text-sm font-medium text-[rgba(0,0,0,0.68)]">
              物体名称
            </label>
            <input
              id="manual-binding-object-name"
              value={objectName}
              onChange={(event) => onObjectNameChange(event.target.value)}
              disabled={isSaving}
              className="h-10 w-full rounded-[8px] border border-[var(--ds-border)] bg-white px-3 text-sm outline-none transition focus:border-[var(--ds-primary)]"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="manual-binding-tag-id" className="block text-sm font-medium text-[rgba(0,0,0,0.68)]">
              Tag ID
            </label>
            <input
              id="manual-binding-tag-id"
              value={tagId}
              onChange={(event) => onTagIdChange(event.target.value)}
              placeholder="扫描或输入TagId"
              autoComplete="off"
              disabled={isSaving}
              className="h-10 w-full rounded-[8px] border border-[var(--ds-border)] bg-white px-3 font-mono text-sm outline-none transition focus:border-[var(--ds-primary)]"
            />
          </div>
          {error ? (
            <div className="rounded-[10px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onCancel} disabled={isSaving}>
            取消
          </Button>
          <Button variant="primary" onClick={onConfirm} disabled={isSaving}>
            {isSaving ? "绑定中..." : "确认"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function BindingsTable({
  rows,
  onOpenLogs,
  onLightCommand,
  activeActionId,
}: {
  rows: LightBindingRow[];
  onOpenLogs: (stationId: string) => void;
  onLightCommand: (row: LightBindingRow, action: "light-on" | "light-off") => void;
  activeActionId: number | null;
}) {
  if (rows.length === 0) return <EmptyState title="No light strip bindings" message="No Job-to-light-strip binding has been created yet." />;

  return (
    <div className="h-full overflow-auto">
      <table className="min-w-full divide-y divide-[var(--ds-border)] text-left text-sm">
        <thead className="sticky top-0 bg-white text-xs uppercase tracking-[0.06em] text-[rgba(0,0,0,0.45)]">
          <tr>
            <th className="px-4 py-3">Object / Plate</th>
            <th className="px-4 py-3">Job</th>
            <th className="px-4 py-3">Tag ID</th>
            <th className="px-4 py-3">Station</th>
            <th className="px-4 py-3">Group</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Battery</th>
            <th className="px-4 py-3">Light</th>
            <th className="px-4 py-3">Last Result</th>
            <th className="px-4 py-3">Failure</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--ds-border)]">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-[rgba(0,0,0,0.02)]">
              <td className="px-4 py-3 font-semibold">{row.plate}</td>
              <td className="px-4 py-3">{row.jobId ?? "-"}</td>
              <td className="px-4 py-3 font-mono text-xs">{row.tagId}</td>
              <td className="px-4 py-3 font-mono text-xs">{row.stationId}</td>
              <td className="px-4 py-3">{row.groupNo}</td>
              <td className="px-4 py-3"><Badge tone={statusTone(row.status)}>{row.status}</Badge></td>
              <td className="px-4 py-3">{row.batteryPercent != null ? `${row.batteryPercent}%` : "-"}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Badge tone={row.isLightOn ? statusTone("Online") : statusTone("Unknown")}>{row.currentColor || "Unknown"}</Badge>
                  <Button
                    onClick={() => onLightCommand(row, row.isLightOn ? "light-off" : "light-on")}
                    className="h-8 px-2 text-xs"
                    disabled={activeActionId === row.id || row.status !== "Bound"}
                  >
                    {activeActionId === row.id ? "发送中..." : row.isLightOn ? "停止" : "点亮"}
                  </Button>
                </div>
              </td>
              <td className="px-4 py-3">{formatDate(row.lastResultAt)}</td>
              <td className="max-w-[260px] px-4 py-3 text-xs text-red-700">{row.failureReason || "-"}</td>
              <td className="px-4 py-3 text-right">
                <Button onClick={() => onOpenLogs(row.stationId)} className="h-8 px-2 text-xs">Logs</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StationsTable({ rows, onOpenLogs }: { rows: StationStatus[]; onOpenLogs: (stationId: string) => void }) {
  if (rows.length === 0) return <EmptyState title="No base stations" message="No heartbeat has been received yet." />;

  return (
    <div className="h-full overflow-auto">
      <table className="min-w-full divide-y divide-[var(--ds-border)] text-left text-sm">
        <thead className="sticky top-0 bg-white text-xs uppercase tracking-[0.06em] text-[rgba(0,0,0,0.45)]">
          <tr>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Station ID</th>
            <th className="px-4 py-3">Alias</th>
            <th className="px-4 py-3">Firmware</th>
            <th className="px-4 py-3">Last Heartbeat</th>
            <th className="px-4 py-3">Counts</th>
            <th className="px-4 py-3">Server</th>
            <th className="px-4 py-3">Payload</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--ds-border)]">
          {rows.map((row) => (
            <tr key={row.stationId} className="hover:bg-[rgba(0,0,0,0.02)]">
              <td className="px-4 py-3"><Badge tone={statusTone(row.status)}>{row.status}</Badge></td>
              <td className="px-4 py-3 font-mono text-xs">{row.stationId}</td>
              <td className="px-4 py-3">{row.alias || "-"}</td>
              <td className="px-4 py-3">{row.firmwareVersion || "-"}</td>
              <td className="px-4 py-3">{formatDate(row.lastHeartbeatAt)} <span className="text-[var(--ds-muted)]">{row.secondsSinceLastHeartbeat != null ? `${row.secondsSinceLastHeartbeat}s` : ""}</span></td>
              <td className="px-4 py-3">{row.totalCount} / {row.sendCount}</td>
              <td className="px-4 py-3">{row.serverAddress || "-"}</td>
              <td className="px-4 py-3"><Badge tone={statusTone(row.lastPayloadStatus)}>{row.lastPayloadStatus}</Badge></td>
              <td className="px-4 py-3 text-right">
                <Button onClick={() => onOpenLogs(row.stationId)} className="h-8 px-2 text-xs">Logs</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LightTagsTable({ rows, onOpenLogs }: { rows: LightTagStatus[]; onOpenLogs: (stationId: string) => void }) {
  if (rows.length === 0) return <EmptyState title="No light tags" message="No result message has been received yet." />;

  return (
    <div className="h-full overflow-auto">
      <table className="min-w-full divide-y divide-[var(--ds-border)] text-left text-sm">
        <thead className="sticky top-0 bg-white text-xs uppercase tracking-[0.06em] text-[rgba(0,0,0,0.45)]">
          <tr>
            <th className="px-4 py-3">Tag ID</th>
            <th className="px-4 py-3">Station ID</th>
            <th className="px-4 py-3">Group</th>
            <th className="px-4 py-3">Color</th>
            <th className="px-4 py-3">Battery</th>
            <th className="px-4 py-3">Result</th>
            <th className="px-4 py-3">RF</th>
            <th className="px-4 py-3">Last Seen</th>
            <th className="px-4 py-3">Payload</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--ds-border)]">
          {rows.map((row) => (
            <tr key={row.tagId} className="hover:bg-[rgba(0,0,0,0.02)]">
              <td className="px-4 py-3 font-mono text-xs">{row.tagId}</td>
              <td className="px-4 py-3 font-mono text-xs">{row.stationId || "-"}</td>
              <td className="px-4 py-3">{row.currentGroup ?? "-"}</td>
              <td className="px-4 py-3"><Badge tone={row.currentColor === "Off" ? statusTone("Unknown") : statusTone("Online")}>{row.currentColor || "Unknown"}</Badge></td>
              <td className="px-4 py-3">{row.batteryVoltage != null ? `${row.batteryVoltage.toFixed(1)}V` : "-"} <span className={(row.batteryPercent ?? 100) < 30 ? "font-semibold text-amber-700" : "text-[var(--ds-muted)]"}>{row.batteryPercent != null ? `${row.batteryPercent}%` : ""}</span></td>
              <td className="px-4 py-3">{row.lastResultTypeLabel}</td>
              <td className="px-4 py-3">{row.rfPowerSend ?? "-"} / {row.rfPowerRecv ?? "-"}</td>
              <td className="px-4 py-3">{formatDate(row.lastSeenAt)}</td>
              <td className="px-4 py-3"><Badge tone={statusTone(row.lastPayloadStatus)}>{row.lastPayloadStatus}</Badge></td>
              <td className="px-4 py-3 text-right">
                {row.stationId ? <Button onClick={() => onOpenLogs(row.stationId!)} className="h-8 px-2 text-xs">Logs</Button> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LogsTable({ rows }: { rows: MqttLogRow[] }) {
  if (rows.length === 0) return <EmptyState title="No MQTT logs" message="No matching MQTT messages were found." />;

  return (
    <div className="h-full overflow-auto">
      <table className="min-w-full divide-y divide-[var(--ds-border)] text-left text-sm">
        <thead className="sticky top-0 bg-white text-xs uppercase tracking-[0.06em] text-[rgba(0,0,0,0.45)]">
          <tr>
            <th className="px-4 py-3">Received</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Station</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Topic</th>
            <th className="px-4 py-3">Payload</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--ds-border)]">
          {rows.map((row) => (
            <tr key={row.id} className="align-top hover:bg-[rgba(0,0,0,0.02)]">
              <td className="whitespace-nowrap px-4 py-3">{formatDate(row.receivedAt)}</td>
              <td className="px-4 py-3">{row.messageType}</td>
              <td className="px-4 py-3 font-mono text-xs">{row.stationId || "-"}</td>
              <td className="px-4 py-3"><Badge tone={statusTone(row.processingStatus)}>{row.processingStatus}</Badge>{row.errorMessage ? <div className="mt-1 max-w-[260px] text-xs text-red-700">{row.errorMessage}</div> : null}</td>
              <td className="px-4 py-3 font-mono text-xs">{row.topic}</td>
              <td className="max-w-[420px] px-4 py-3">
                <pre className="max-h-24 overflow-auto whitespace-pre-wrap rounded-[8px] bg-slate-50 p-2 font-mono text-[11px] text-slate-700">{row.payload}</pre>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button, SectionCard } from "@/components/ui";
import { fetchJobLogs, type JobLogItem } from "@/features/jobDetail/api/jobDetailApi";
import { JOB_DETAIL_TEXT } from "@/features/jobDetail/jobDetail.constants";
import { formatNzDateTime } from "@/utils/date";

type LogPanelProps = {
  jobId: string;
};

export function LogPanel({ jobId }: LogPanelProps) {
  const [items, setItems] = useState<JobLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchJobLogs(jobId);
      if (!response.ok || !response.data) {
        throw new Error(response.error || "Failed to load job log");
      }
      setItems(response.data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load job log");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [jobId]);

  return (
    <div className="py-6">
      <div className="mb-3 flex justify-end">
        <Button
          variant="ghost"
          leftIcon={<RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />}
          onClick={() => void load()}
          disabled={loading}
        >
          刷新
        </Button>
      </div>
      <SectionCard className="p-4">
        {loading && items.length === 0 ? (
          <div className="text-sm text-[var(--ds-muted)]">正在加载日志…</div>
        ) : error ? (
          <div className="text-sm text-red-600">{error}</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-[var(--ds-muted)]">{JOB_DETAIL_TEXT.empty.noLogs}</div>
        ) : (
          <div className="divide-y divide-slate-200">
            {items.map((item, index) => (
              <div key={`${item.occurredAt}-${item.category}-${index}`} className="grid gap-1 py-3 md:grid-cols-[150px_130px_1fr] md:gap-4">
                <div className="text-xs text-[var(--ds-muted)]">{formatNzDateTime(item.occurredAt)}</div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.category}</div>
                <div>
                  <div className="text-sm font-medium text-slate-900">{item.title}</div>
                  {item.detail ? <div className="mt-1 text-sm text-[var(--ds-muted)]">{item.detail}</div> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { JobDetailLayout, MainColumn, useJobDetailState } from "@/features/jobDetail";
import { RightSidebar } from "@/components/jobDetail/RightSidebar";
import { Alert, EmptyState } from "@/components/ui";
import type { JobDetailData, WofCheckItem, WofFailReason, WofRecord } from "@/types";

export function JobDetailPage() {
  const { id } = useParams();
  const { activeTab, setActiveTab, isSidebarOpen, setIsSidebarOpen, hasWofRecord, setHasWofRecord } =
    useJobDetailState({ initialTab: "WOF" });
  const isMountedRef = useRef(true);
  const [jobData, setJobData] = useState<JobDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [wofRecords, setWofRecords] = useState<WofRecord[]>([]);
  const [wofLoading, setWofLoading] = useState(false);
  const [wofCheckItems, setWofCheckItems] = useState<WofCheckItem[]>([]);
  const [wofFailReasons, setWofFailReasons] = useState<WofFailReason[]>([]);

  const mapWofResult = (record: any): WofRecord => ({
    id: String(record.id ?? ""),
    date: String(record.date ?? ""),
    source: "WOF Result",
    status: record.result ?? null,
    expiryDate: record.recheckExpiryDate ?? "",
    notes: record.note ?? "",
    failReason: record.failReason ?? (record.failReasonId ? String(record.failReasonId) : undefined),
  });

  const refreshWofServer = async (jobId: string) => {
    setWofLoading(true);
    try {
      const wofRes = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/wof-server`);
      const wofData = await wofRes.json().catch(() => null);
      if (!wofRes.ok) {
        throw new Error(wofData?.error || "加载 WOF 记录失败");
      }
      if (isMountedRef.current) {
        const hasWofServer = Boolean(wofData?.hasWofServer);
        setHasWofRecord(hasWofServer);
        setWofCheckItems(Array.isArray(wofData?.checkItems) ? wofData.checkItems : []);
        const results = Array.isArray(wofData?.results) ? wofData.results : [];
        setWofRecords(results.map(mapWofResult));
      }
    } catch {
      if (isMountedRef.current) {
        setWofRecords([]);
        setWofCheckItems([]);
      }
    } finally {
      if (isMountedRef.current) {
        setWofLoading(false);
      }
    }
  };

  const createWofRecord = async () => {
    if (!id || wofLoading) return;
    if (hasWofRecord || wofRecords.length > 0 || wofCheckItems.length > 0) return;
    const res = await fetch(`/api/jobs/${encodeURIComponent(id)}/wof-server`, {
      method: "POST",
    });
    const data = await res.json().catch(() => null);
    if (res.ok && id) {
      await refreshWofServer(id);
    }
  };

  const saveWofResult = async (payload: {
    result: "Pass" | "Fail";
    expiryDate?: string;
    failReasonId?: string;
    note?: string;
  }) => {
    if (!id) {
      return { success: false, message: "缺少工单 ID" };
    }

    const res = await fetch(`/api/jobs/${encodeURIComponent(id)}/wof-results`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        result: payload.result,
        recheckExpiryDate: payload.expiryDate || null,
        failReasonId: payload.failReasonId ? Number(payload.failReasonId) : null,
        note: payload.note || "",
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return { success: false, message: data?.error || "保存失败" };
    }

    await refreshWofServer(id);
    return { success: true, message: "保存成功" };
  };

  useEffect(() => {
    let cancelled = false;
    isMountedRef.current = true;

    const loadWofFailReasons = async () => {
      try {
        const res = await fetch("/api/wof-fail-reasons");
        const data = await res.json().catch(() => null);
        console.log("===================WOF Fail Reasons Data:", data);
        if (!res.ok) {
          throw new Error(data?.error || "加载 WOF fail reasons 失败");
        }
        if (!cancelled) {
          const list = Array.isArray(data) ? data : [];
          setWofFailReasons(list.filter((item) => item?.isActive !== false));
        }
      } catch {
        if (!cancelled) {
          setWofFailReasons([]);
        }
      }
    };

    const loadJob = async () => {
      if (!id) {
        setLoadError("缺少工单 ID");
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError(null);

      try {
        const res = await fetch(`/api/jobs/${encodeURIComponent(id)}`);
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(data?.error || "加载工单失败");
        }

        const job = data?.job ?? data;

        if (!cancelled) {
          setJobData(job ?? null);
          if (typeof data?.hasWofRecord === "boolean") {
            setHasWofRecord(data.hasWofRecord);
          }
        }

        await refreshWofServer(id);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "加载工单失败");
          setJobData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadJob();
    loadWofFailReasons();

    return () => {
      cancelled = true;
      isMountedRef.current = false;
    };
  }, [id, setHasWofRecord]);

  if (loading) {
    return <div className="py-10 text-center text-sm text-[var(--ds-muted)]">加载中...</div>;
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <Alert variant="error" description={loadError} onClose={() => setLoadError(null)} />
        <EmptyState message="无法加载工单详情" />
      </div>
    );
  }

  if (!jobData) {
    return <EmptyState message="暂无工单详情" />;
  }

  return (
    <div className="space-y-4">
      <JobDetailLayout
        main={
          <MainColumn
            jobData={jobData}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            hasWofRecord={hasWofRecord}
            wofRecords={wofRecords}
            wofCheckItems={wofCheckItems}
            failReasons={wofFailReasons}
            wofLoading={wofLoading}
            onAddWof={createWofRecord}
            onSaveWofResult={saveWofResult}
          />
        }
        sidebar={
          <RightSidebar
            vehicle={jobData.vehicle}
            customer={jobData.customer}
            isOpen={isSidebarOpen}
            onToggle={() => setIsSidebarOpen((v) => !v)}
          />
        }
      />
    </div>
  );
}

import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";
import { Button, Card, EmptyState } from "@/components/ui";
import { validateCourtesyCarAgreementPreview } from "@/features/courtesyCarAgreements/api";

type CourtesyCarAgreementMessageLocationState = {
  message?: string;
};

export function CourtesyCarAgreementMessagePage() {
  const { agreementId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state as CourtesyCarAgreementMessageLocationState | null) ?? null;
  const [message, setMessage] = useState(locationState?.message?.trim() ?? "");
  const [loading, setLoading] = useState(!locationState?.message);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!agreementId || locationState?.message) return;

    setLoading(true);
    setError(null);
    void (async () => {
      const res = await validateCourtesyCarAgreementPreview(agreementId);
      if (cancelled) return;
      if (!res.ok) {
        setError(res.error || "Failed to validate the agreement.");
        setLoading(false);
        return;
      }

      const validation = res.data?.validation ?? null;
      if (validation?.isValid) {
        navigate(`/courtesy-car-drafts/${agreementId}`, { replace: true });
        return;
      }

      setMessage(validation?.message?.trim() || "The agreement is not ready for preview.");
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [agreementId, locationState?.message, navigate]);

  const retryValidation = async () => {
    if (!agreementId) return;
    setLoading(true);
    setError(null);
    const res = await validateCourtesyCarAgreementPreview(agreementId);
    if (!res.ok) {
      setError(res.error || "Failed to validate the agreement.");
      setLoading(false);
      return;
    }

    const validation = res.data?.validation ?? null;
    if (validation?.isValid) {
      navigate(`/courtesy-car-drafts/${agreementId}`, { replace: true });
      return;
    }

    setMessage(validation?.message?.trim() || "The agreement is not ready for preview.");
    setLoading(false);
  };

  if (loading) {
    return <div className="py-16 text-center text-sm text-slate-500">Checking agreement readiness...</div>;
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Card className="overflow-hidden border border-amber-200 bg-amber-50 shadow-none">
          <div className="p-6 md:p-8">
            <div className="flex items-start gap-3">
              <div className="mt-1 rounded-full bg-amber-100 p-2 text-amber-700">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xl font-semibold text-slate-900">Preview blocked</div>
                <div className="mt-2 text-sm text-slate-600">{error}</div>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button onClick={() => navigate(`/courtesy-car-drafts/${agreementId}`)} className="!h-12 rounded-[16px] px-5 text-[15px] font-semibold">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to agreement
              </Button>
              <Button
                variant="primary"
                onClick={() => void retryValidation()}
                className="!h-12 rounded-[16px] px-5 text-[15px] font-semibold"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Check again
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {message ? (
        <Card className="overflow-hidden border border-amber-200 bg-amber-50 shadow-none">
          <div className="p-6 md:p-8">
            <div className="flex items-start gap-3">
              <div className="mt-1 rounded-full bg-amber-100 p-2 text-amber-700">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xl font-semibold text-slate-900">Preview blocked</div>
                <div className="mt-2 text-sm text-slate-600">{message}</div>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button onClick={() => navigate(`/courtesy-car-drafts/${agreementId}`)} className="!h-12 rounded-[16px] px-5 text-[15px] font-semibold">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to agreement
              </Button>
              <Button
                variant="primary"
                onClick={() => void retryValidation()}
                className="!h-12 rounded-[16px] px-5 text-[15px] font-semibold"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Re-check
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <EmptyState
          title="Preview blocked"
          description="The agreement is not ready for preview."
          actionLabel="Back to agreement"
          onAction={() => navigate(`/courtesy-car-drafts/${agreementId}`)}
        />
      )}
    </div>
  );
}

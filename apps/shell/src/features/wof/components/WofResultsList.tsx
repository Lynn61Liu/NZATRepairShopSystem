import type { WofCheckItem, WofFailReason, WofRecordUpdatePayload } from "@/types";
import { WofResultsCard } from "./WofResultsCard";
import { WofResultItem, type WofPrintContext } from "./WofResultItem";

type WofResultsListProps = {
  isLoading?: boolean;
  checkItems: WofCheckItem[];
  printContext?: WofPrintContext;
  onUpdate?: (id: string, payload: WofRecordUpdatePayload) => Promise<{ success: boolean; message?: string }>;
  onCreate?: (payload: WofRecordUpdatePayload) => Promise<{ success: boolean; message?: string }>;
  onCancelCreate?: () => void;
  showCreate?: boolean;
  defaultRego?: string;
  defaultMakeModel?: string;
  failReasons?: WofFailReason[];
};

export function WofResultsList({
  isLoading,
  checkItems,
  printContext,
  onUpdate,
  onCreate,
  onCancelCreate,
  showCreate,
  defaultRego,
  defaultMakeModel,
  failReasons,
}: WofResultsListProps) {
  if (isLoading) {
    return <div className="py-6 text-center text-sm text-[var(--ds-muted)]">加载中...</div>;
  }

  if (!checkItems.length && !showCreate) return null;

  return (
    <div className="space-y-3">
      {/* manual new results */}
      {showCreate ? (
        <WofResultItem
          record={{
            id: "draft",
            occurredAt: "",
            rego: defaultRego ?? "",
            makeModel: defaultMakeModel ?? "",
            recordState: undefined,
            isNewWof: null,
            odo: "",
            authCode: "",
            checkSheet: "",
            csNo: "",
            wofLabel: "",
            labelNo: "",
            failReasons: "",
            previousExpiryDate: "",
            organisationName: "",
            note: "",
            wofUiState: undefined,
            importedAt: "",
            source: "manual",
            sourceRow: "manual",
           updatedAt: "",
          }}
          isDraft
          printContext={printContext}
          onCreate={onCreate}
          onCancel={onCancelCreate}
          failReasons={failReasons}
        />
      ) : null}
       {/* list  results from DB */}
      {checkItems.length ? (
        <WofResultsCard
          wofResults={checkItems}
          printContext={printContext}
          onUpdate={onUpdate}
          failReasons={failReasons}
        />
      ) : null}
    </div>
  );
}

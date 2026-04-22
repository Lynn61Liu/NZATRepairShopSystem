import type { WofCheckItem, WofFailReason, WofRecord, WofRecordUpdatePayload } from "@/types";
import { WofResultItem, type WofPrintContext } from "./WofResultItem";

type WofResultsCardProps = {
  wofResults: Array<WofCheckItem | WofRecord>;
  printContext?: WofPrintContext;
  onUpdate?: (id: string, payload: WofRecordUpdatePayload) => Promise<{ success: boolean; message?: string }>;
  onDelete?: (id: string) => Promise<{ success: boolean; message?: string }>;
  failReasons?: WofFailReason[];
};

export function WofResultsCard({ wofResults, printContext, onUpdate, onDelete, failReasons }: WofResultsCardProps) {
  return (
    <div className="space-y-3">
      {wofResults.map((record) => (
        <WofResultItem
          key={record.id}
          record={record}
          printContext={printContext}
          onUpdate={onUpdate}
          onDelete={onDelete}
          failReasons={failReasons}
        />
      ))}
    </div>
  );
}

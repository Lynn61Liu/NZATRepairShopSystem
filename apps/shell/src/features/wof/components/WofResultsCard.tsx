import type { WofCheckItem, WofFailReason, WofRecordUpdatePayload } from "@/types";
import { WofResultItem, type WofPrintContext } from "./WofResultItem";

type WofResultsCardProps = {
  wofResults: WofCheckItem[];
  printContext?: WofPrintContext;
  onUpdate?: (id: string, payload: WofRecordUpdatePayload) => Promise<{ success: boolean; message?: string }>;
  failReasons?: WofFailReason[];
};

export function WofResultsCard({ wofResults, printContext, onUpdate, failReasons }: WofResultsCardProps) {
  return (
    <div className="space-y-3">
      {wofResults.map((record) => (
        <WofResultItem
          key={record.id}
          record={record}
          printContext={printContext}
          onUpdate={onUpdate}
          failReasons={failReasons}
        />
      ))}
    </div>
  );
}

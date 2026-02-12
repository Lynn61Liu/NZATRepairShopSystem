import type { WofCheckItem, WofFailReason, WofRecordUpdatePayload } from "@/types";
import { WofResultItem } from "./WofResultItem";

type WofResultsCardProps = {
  wofResults: WofCheckItem[];
  onUpdate?: (id: string, payload: WofRecordUpdatePayload) => Promise<{ success: boolean; message?: string }>;
  failReasons?: WofFailReason[];
};

export function WofResultsCard({ wofResults, onUpdate, failReasons }: WofResultsCardProps) {
  return (
    <div className="space-y-3">
      {wofResults.map((record) => (
        <WofResultItem key={record.id} record={record} onUpdate={onUpdate} failReasons={failReasons} />
      ))}
    </div>
  );
}

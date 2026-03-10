import { Check, Circle } from "lucide-react";
import type { WorkflowStep } from "../types";

type Props = {
  steps: WorkflowStep[];
  currentStep: number;
};

export function WorkflowSidebar({ steps, currentStep }: Props) {
  return (
    <div className="sticky top-6 rounded-[18px] border border-[var(--ds-border)] bg-white p-6 shadow-sm">
      <div className="mb-5 text-2xl font-semibold text-[var(--ds-text)]">Workflow Progress</div>
      <div className="space-y-0">
        {steps.map((step, index) => {
          const isDone = step.id < currentStep;
          const isCurrent = step.id === currentStep;
          const isUpcoming = step.id > currentStep;

          return (
            <div key={step.id} className="relative flex gap-4 pb-6 last:pb-0">
              {index < steps.length - 1 ? (
                <div
                  className={`absolute left-[21px] top-12 h-[calc(100%-12px)] w-px ${isDone ? "bg-[var(--ds-primary)]" : "bg-[var(--ds-border)]"}`}
                />
              ) : null}
              <div
                className={[
                  "relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
                  isDone ? "border-[var(--ds-primary)] bg-[var(--ds-primary)] text-white" : "",
                  isCurrent
                    ? "border-[var(--ds-primary)] bg-white text-[var(--ds-primary)] shadow-[0_0_0_5px_rgba(235,57,37,0.12)]"
                    : "",
                  isUpcoming ? "border-[var(--ds-border)] bg-[var(--ds-panel)] text-[var(--ds-muted)]" : "",
                ].join(" ")}
              >
                {isDone ? <Check className="h-5 w-5" /> : isCurrent ? step.id : <Circle className="h-4 w-4 fill-current stroke-none" />}
              </div>
              <div className="pt-1">
                <div
                  className={`text-sm font-semibold ${isUpcoming ? "text-[var(--ds-muted)]" : isCurrent ? "text-[var(--ds-primary)]" : "text-[var(--ds-text)]"}`}
                >
                  {step.title}
                </div>
                <div className="mt-1 text-sm text-[var(--ds-muted)]">{step.description}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

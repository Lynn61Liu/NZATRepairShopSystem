import { Save, Archive, Trash2, AlertCircle } from "lucide-react";
import { Button, TagPill } from "@/components/ui";
import { JOB_DETAIL_TEXT } from "@/features/jobDetail/jobDetail.constants";

interface JobHeaderProps {
  jobId: string;
  status: string;
  isUrgent: boolean;
  tags: string[];
}

export function JobHeader({ jobId, status, isUrgent, tags }: JobHeaderProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "In Shop":
        return "bg-[var(--ds-panel)] text-[var(--ds-primary)] border-[var(--ds-border)]";
      case "Completed":
        return "bg-[var(--ds-panel)] text-[var(--ds-text)] border-[var(--ds-border)]";
      case "Archived":
        return "bg-[var(--ds-panel)] text-[var(--ds-muted)] border-[var(--ds-border)]";
      default:
        return "bg-[var(--ds-panel)] text-[var(--ds-muted)] border-[var(--ds-border)]";
    }
  };

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      {/* <div className="flex flex-row gap-2"> */}
        <div className="flex w-full flex-wrap items-center gap-2 md:flex-nowrap">
       
       <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-[var(--ds-text)]">{JOB_DETAIL_TEXT.labels.jobDetail}</h1>
          <p className="text-sm text-[var(--ds-muted)] mt-1">{jobId}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <TagPill label={status} className={getStatusColor(status)} />
          {isUrgent ? (
            <TagPill
              label={JOB_DETAIL_TEXT.labels.urgent}
              variant="danger"
              leftIcon={<AlertCircle className="w-4 h-4" />}
            />
          ) : null}
          {tags.map((tag) => (
            <TagPill key={tag} label={tag} variant="primary" />
          ))}
        </div>

        <div className="flex items-center gap-3  ml-auto">
        {/* <Button variant="primary" leftIcon={<Save className="w-4 h-4" />}>
          {JOB_DETAIL_TEXT.buttons.save}
        </Button> */}
        <Button leftIcon={<Archive className="w-4 h-4" />}>
          {JOB_DETAIL_TEXT.buttons.archive}
        </Button>
        <Button
          leftIcon={<Trash2 className="w-4 h-4" />}
          className="border-red-300 text-red-700 hover:bg-red-50"
        >
          删除Job
        </Button>
        </div>
      </div>
    </div>
  );
}

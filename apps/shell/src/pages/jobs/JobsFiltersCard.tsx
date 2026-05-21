import { RotateCcw, Search } from "lucide-react";
import { Card, Input, Select, Button } from "@/components/ui";
import { MultiTagSelect, type TagOption } from "@/components/MultiTagSelect";
import type { JobsFilters, JobStatus } from "@/types/JobType";
import { PAINT_STAGE_OPTIONS } from "@/features/paint/paintBoard.utils";

type Props = {
  value: JobsFilters;
  onChange: (next: JobsFilters) => void;
  onReset: () => void;
  tagOptions: TagOption[];
};

export function JobsFiltersCard({ value, onChange, onReset, tagOptions }: Props) {
  return (
    <Card className="border-[rgba(0,0,0,0.08)] bg-white">
      <div className="border-b border-[rgba(0,0,0,0.06)] px-4 py-3">
        <h2 className="font-semibold text-[rgba(0,0,0,0.72)]">Filters</h2>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-12 gap-4 items-end">

          <div className="col-span-12 md:col-span-3 lg:col-span-3">
            <div className="mb-1 text-xs text-[rgba(0,0,0,0.55)]">Job Type</div>
            <Select
              value={value.jobType}
              onChange={(e) => onChange({ ...value, jobType: e.target.value as JobStatus | "" })}
            >
              <option value="">All</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
              <option value="Ready">Ready for Pickup</option>
              <option value="Archived">Archived</option>
              <option value="Cancelled">Cancelled</option>
            </Select>
          </div>

          <div className="col-span-12 md:col-span-3 lg:col-span-3">
            <div className="mb-1 text-xs text-[rgba(0,0,0,0.55)]">WOF Status</div>
            <Select
              value={value.wofStatus}
              onChange={(e) => onChange({ ...value, wofStatus: e.target.value as JobsFilters["wofStatus"] })}
            >
              <option value="">All</option>
              <option value="Todo">To Check</option>
              <option value="Checked">Checked</option>
              <option value="Recorded">Recorded</option>
            </Select>
          </div>

          <div className="col-span-12 md:col-span-3 lg:col-span-3">
            <div className="mb-1 text-xs text-[rgba(0,0,0,0.55)]">Paint Status</div>
            <Select
              value={value.paintStatus}
              onChange={(e) => onChange({ ...value, paintStatus: e.target.value as JobsFilters["paintStatus"] })}
            >
              <option value="">All</option>
              {PAINT_STAGE_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="col-span-12 md:col-span-3 lg:col-span-3">
            <div className="mb-1 text-xs text-[rgba(0,0,0,0.55)]">Time</div>
            <Select
              value={value.timeRange}
              onChange={(e) => onChange({ ...value, timeRange: e.target.value as JobsFilters["timeRange"] })}
            >
              <option value="">All</option>
              <option value="week">This Week</option>
              <option value="lastWeek">Last Week</option>
              <option value="month">This Month</option>
              <option value="custom">Custom</option>
            </Select>
          </div>

          {value.timeRange === "custom" && (
            <>
              <div className="col-span-12 md:col-span-3 lg:col-span-3">
                <div className="mb-1 text-xs text-[rgba(0,0,0,0.55)]">Start Date</div>
                <Input
                  type="date"
                  value={value.startDate}
                  onChange={(e) => onChange({ ...value, startDate: e.target.value })}
                />
              </div>
              <div className="col-span-12 md:col-span-3 lg:col-span-3">
                <div className="mb-1 text-xs text-[rgba(0,0,0,0.55)]">End Date</div>
                <Input
                  type="date"
                  value={value.endDate}
                  onChange={(e) => onChange({ ...value, endDate: e.target.value })}
                />
              </div>
            </>
          )}

          <div className="col-span-12 md:col-span-3 lg:col-span-3">
            <div className="mb-1 text-xs text-[rgba(0,0,0,0.55)]">Customer</div>
            <Input
              value={value.customer}
              onChange={(e) => onChange({ ...value, customer: e.target.value })}
            />
          </div>

          <div className="col-span-12 md:col-span-3 lg:col-span-3">
            <div className="mb-1 text-xs text-[rgba(0,0,0,0.55)]">Tag</div>
            <MultiTagSelect
              options={tagOptions}
              value={value.selectedTags}
              onChange={(tags) => onChange({ ...value, selectedTags: tags })}
              placeholder="Select tags"
              maxChips={2}
            />
          </div>

          <div className="col-span-12 md:col-span-6 lg:col-span-3">
            <div className="mb-1 text-xs text-[rgba(0,0,0,0.55)]">Search</div>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[rgba(0,0,0,0.40)]" />
              <Input
                className="pl-9"
                value={value.search}
                onChange={(e) => onChange({ ...value, search: e.target.value })}
              />
            </div>
          </div>

          <div className="col-span-12 lg:col-start-10 lg:col-end-13 flex justify-end gap-3">
            <Button onClick={onReset} leftIcon={<RotateCcw size={16} />}>
              Reset
            </Button>
          </div>

        </div>
      </div>
    </Card>
  );
}

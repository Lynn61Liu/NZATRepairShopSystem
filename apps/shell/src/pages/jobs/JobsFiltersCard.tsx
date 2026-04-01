import { RotateCcw, Search } from "lucide-react";
import { Card, Input, Select, Button } from "@/components/ui";
import { MultiTagSelect, type TagOption } from "@/components/MultiTagSelect";
import type { JobsFilters, JobStatus } from "@/types/JobType";



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
        <h2 className="font-semibold text-[rgba(0,0,0,0.72)]">筛选条件</h2>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-12 gap-4 items-end">

          <div className="col-span-12 md:col-span-3 lg:col-span-3">
            <div className="mb-1 text-xs text-[rgba(0,0,0,0.55)]">Job Type</div>
            <Select
              value={value.jobType}
              onChange={(e) => onChange({ ...value, jobType: e.target.value as JobStatus | "" })}
            >
              <option value="">全部</option>
              <option value="In Progress">进行中</option>
              <option value="Completed">已完成</option>
              <option value="Ready">可交车</option>
              <option value="Archived">归档</option>
              <option value="Cancelled">取消</option>
            </Select>
          </div>

          <div className="col-span-12 md:col-span-3 lg:col-span-3">
            <div className="mb-1 text-xs text-[rgba(0,0,0,0.55)]">WOF 状态</div>
            <Select
              value={value.wofStatus}
              onChange={(e) => onChange({ ...value, wofStatus: e.target.value as JobsFilters["wofStatus"] })}
            >
              <option value="">全部</option>
              <option value="Todo">待查</option>
              <option value="Checked">检查完成</option>
              <option value="Recorded">已录入</option>
            </Select>
          </div>

          <div className="col-span-12 md:col-span-3 lg:col-span-3">
            <div className="mb-1 text-xs text-[rgba(0,0,0,0.55)]">时间</div>
            <Select
              value={value.timeRange}
              onChange={(e) => onChange({ ...value, timeRange: e.target.value as JobsFilters["timeRange"] })}
            >
              <option value="">全部</option>
              <option value="week">本周</option>
              <option value="lastWeek">上周</option>
              <option value="month">本月</option>
              <option value="custom">自定义</option>
            </Select>
          </div>

          {value.timeRange === "custom" && (
            <>
              <div className="col-span-12 md:col-span-3 lg:col-span-3">
                <div className="mb-1 text-xs text-[rgba(0,0,0,0.55)]">开始日期</div>
                <Input
                  type="date"
                  value={value.startDate}
                  onChange={(e) => onChange({ ...value, startDate: e.target.value })}
                />
              </div>
              <div className="col-span-12 md:col-span-3 lg:col-span-3">
                <div className="mb-1 text-xs text-[rgba(0,0,0,0.55)]">结束日期</div>
                <Input
                  type="date"
                  value={value.endDate}
                  onChange={(e) => onChange({ ...value, endDate: e.target.value })}
                />
              </div>
            </>
          )}

          <div className="col-span-12 md:col-span-3 lg:col-span-3">
            <div className="mb-1 text-xs text-[rgba(0,0,0,0.55)]">客户</div>
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
            <div className="mb-1 text-xs text-[rgba(0,0,0,0.55)]">搜索</div>
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

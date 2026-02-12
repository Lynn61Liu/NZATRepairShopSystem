import { useState } from "react";
import { ChevronDown, RotateCcw, Search } from "lucide-react";
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
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Card>
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[rgba(0,0,0,0.02)] transition"
        onClick={() => setIsOpen(!isOpen)}
      >
        <h2 className="font-semibold text-[rgba(0,0,0,0.72)]">筛选条件</h2>
        <ChevronDown
          size={20}
          className={`text-[rgba(0,0,0,0.55)] transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </div>

      {isOpen && (
        <>
          <div className="border-t border-[rgba(0,0,0,0.06)]" />
          <div className="p-4">
            <div className="grid grid-cols-12 gap-4 items-end">

              {/* Job Type */}
              <div className="col-span-12 md:col-span-3 lg:col-span-3">
                <div className="text-xs text-[rgba(0,0,0,0.55)] mb-1">Job Type</div>
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

              {/* Time Range */}
              <div className="col-span-12 md:col-span-3 lg:col-span-3">
                <div className="text-xs text-[rgba(0,0,0,0.55)] mb-1">时间</div>
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

              {/* Custom dates */}
              {value.timeRange === "custom" && (
                <>
                  <div className="col-span-12 md:col-span-3 lg:col-span-3">
                    <div className="text-xs text-[rgba(0,0,0,0.55)] mb-1">开始日期</div>
                    <Input
                      type="date"
                      value={value.startDate}
                      onChange={(e) => onChange({ ...value, startDate: e.target.value })}
                    />
                  </div>
                  <div className="col-span-12 md:col-span-3 lg:col-span-3">
                    <div className="text-xs text-[rgba(0,0,0,0.55)] mb-1">结束日期</div>
                    <Input
                      type="date"
                      value={value.endDate}
                      onChange={(e) => onChange({ ...value, endDate: e.target.value })}
                    />
                  </div>
                </>
              )}

              {/* Customer */}
              <div className="col-span-12 md:col-span-3 lg:col-span-3">
                <div className="text-xs text-[rgba(0,0,0,0.55)] mb-1">客户</div>
                <Input
                  value={value.customer}
                  onChange={(e) => onChange({ ...value, customer: e.target.value })}
                />
              </div>

              {/* Tags */}
              <div className="col-span-12 md:col-span-3 lg:col-span-3">
                <div className="text-xs text-[rgba(0,0,0,0.55)] mb-1">Tag</div>
                <MultiTagSelect
                  options={tagOptions}
                  value={value.selectedTags}
                  onChange={(tags) => onChange({ ...value, selectedTags: tags })}
                  placeholder="Select tags"
                  maxChips={2}
                />
              </div>

              {/* Search */}
              <div className="col-span-12 md:col-span-6 lg:col-span-3">
                <div className="text-xs text-[rgba(0,0,0,0.55)] mb-1">搜索</div>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[rgba(0,0,0,0.40)]" />
                  <Input
                    className="pl-9"
                    value={value.search}
                    onChange={(e) => onChange({ ...value, search: e.target.value })}
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="col-span-12 lg:col-start-10 lg:col-end-13 flex justify-end gap-3">
                <Button onClick={onReset} leftIcon={<RotateCcw size={16} />}>
                  Reset
                </Button>
                
              </div>

            </div>
          </div>
        </>
      )}
    </Card>
  );
}

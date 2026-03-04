import type { ReactNode } from "react";

type PaginationInfo = {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  start: number;
  end: number;
};

type Props = {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  showPageNumbers?: boolean;
  showRange?: boolean;
  getInfoText?: (info: PaginationInfo) => ReactNode;
  variant?: "default" | "compact";
  className?: string;
};

const DEFAULT_CONTAINER =
  "flex items-center justify-between px-4 py-3 text-xs text-[rgba(0,0,0,0.50)]";
const DEFAULT_BUTTON =
  "h-8 px-3 rounded-[8px] border border-[rgba(0,0,0,0.10)] bg-white hover:bg-[rgba(0,0,0,0.03)] disabled:opacity-50";
const DEFAULT_PAGE =
  "h-8 w-8 rounded-[8px] border border-[rgba(0,0,0,0.10)] bg-white hover:bg-[rgba(0,0,0,0.03)]";
const DEFAULT_PAGE_ACTIVE = "!bg-[var(--ds-primary)] !text-white !border-[var(--ds-primary)]";

const COMPACT_CONTAINER = "flex items-center justify-between text-xs text-slate-500";
const COMPACT_BUTTON =
  "rounded-lg border border-slate-200 px-3 py-1 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";
const COMPACT_PAGE =
  "h-7 w-7 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50";
const COMPACT_PAGE_ACTIVE = "!bg-[var(--ds-primary)] !text-white !border-[var(--ds-primary)]";

export function Pagination({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  onPageChange,
  showPageNumbers = true,
  showRange = true,
  getInfoText,
  variant = "default",
  className,
}: Props) {
  const start = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);
  const info: PaginationInfo = { currentPage, totalPages, pageSize, totalItems, start, end };

  const containerClass = variant === "compact" ? COMPACT_CONTAINER : DEFAULT_CONTAINER;
  const buttonClass = variant === "compact" ? COMPACT_BUTTON : DEFAULT_BUTTON;
  const pageClass = variant === "compact" ? COMPACT_PAGE : DEFAULT_PAGE;
  const activeClass = variant === "compact" ? COMPACT_PAGE_ACTIVE : DEFAULT_PAGE_ACTIVE;

  const infoContent = getInfoText
    ? getInfoText(info)
    : showRange
      ? `显示 ${start}-${end} 项，共 ${totalItems} 项`
      : null;

  return (
    <div className={`${containerClass} ${className ?? ""}`.trim()}>
      <div>{infoContent}</div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className={buttonClass}
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
        >
          上一页
        </button>

        {showPageNumbers
          ? Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                type="button"
                key={page}
                className={`${pageClass} ${currentPage === page ? activeClass : ""}`.trim()}
                onClick={() => onPageChange(page)}
              >
                {page}
              </button>
            ))
          : null}

        <button
          type="button"
          className={buttonClass}
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
        >
          下一页
        </button>
      </div>
    </div>
  );
}

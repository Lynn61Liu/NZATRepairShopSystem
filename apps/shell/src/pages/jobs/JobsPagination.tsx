type Props = {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
};

export function JobsPagination({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  onPageChange,
}: Props) {
  const start = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="flex items-center justify-between px-4 py-3 text-xs text-[rgba(0,0,0,0.50)]">
      <div>
        显示 {start}-{end} 项，共 {totalItems} 项
      </div>

      <div className="flex items-center gap-2">
        <button
          className="h-8 px-3 rounded-[8px] border border-[rgba(0,0,0,0.10)] bg-white hover:bg-[rgba(0,0,0,0.03)] disabled:opacity-50"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
        >
          上一页
        </button>

        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
          <button
            key={page}
            className={`h-8 w-8 rounded-[8px] ${
              currentPage === page
                ? "bg-[rgba(15,23,42,0.85)] text-white"
                : "border border-[rgba(0,0,0,0.10)] bg-white hover:bg-[rgba(0,0,0,0.03)]"
            }`}
            onClick={() => onPageChange(page)}
          >
            {page}
          </button>
        ))}

        <button
          className="h-8 px-3 rounded-[8px] border border-[rgba(0,0,0,0.10)] bg-white hover:bg-[rgba(0,0,0,0.03)] disabled:opacity-50"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
        >
          下一页
        </button>
      </div>
    </div>
  );
}

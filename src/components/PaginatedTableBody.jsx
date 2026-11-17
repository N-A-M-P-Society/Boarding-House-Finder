import { useEffect, useState } from "react";

const PAGE_SIZE = 10;

export default function PaginatedTableBody({
  rows,
  columns,
  resetKey,
  emptyMessage,
  renderRow,
}) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const firstIndex = (currentPage - 1) * PAGE_SIZE;
  const visibleRows = rows.slice(firstIndex, firstIndex + PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  return (
    <tbody className="divide-y divide-[var(--border)]">
      {visibleRows.length
        ? visibleRows.map((row, index) => renderRow(row, firstIndex + index))
        : <tr><td colSpan={columns} className="px-4 py-8 text-center text-sm text-[var(--muted-foreground)]">{emptyMessage}</td></tr>}
      {rows.length > PAGE_SIZE && (
        <tr>
          <td colSpan={columns} className="px-4 py-3">
            <div className="flex flex-col gap-2 text-xs text-[var(--muted-foreground)] sm:flex-row sm:items-center sm:justify-between">
              <span>Showing {firstIndex + 1}–{Math.min(firstIndex + PAGE_SIZE, rows.length)} of {rows.length}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 font-semibold text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <span>Page {currentPage} of {pageCount}</span>
                <button
                  type="button"
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage === pageCount}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 font-semibold text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </tbody>
  );
}

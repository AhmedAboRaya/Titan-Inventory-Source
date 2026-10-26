import React, { useState, useMemo, useCallback } from 'react';
import { useText, useApp } from './ui';

export interface PaginationProps {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (newPage: number) => void;
  onPageSizeChange?: (newSize: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

function ChevronLeft({ double = false }: { double?: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {double ? (
        <>
          <path d="M13 18l-6-6 6-6" />
          <path d="M19 18l-6-6 6-6" />
        </>
      ) : (
        <path d="M15 18l-6-6 6-6" />
      )}
    </svg>
  );
}

function ChevronRight({ double = false }: { double?: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {double ? (
        <>
          <path d="M11 6l6 6-6 6" />
          <path d="M5 6l6 6-6 6" />
        </>
      ) : (
        <path d="M9 6l6 6-6 6" />
      )}
    </svg>
  );
}

export function Pagination({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 15, 25, 50, 100],
  className = ''
}: PaginationProps) {
  const t = useText();
  const { lang } = useApp();
  const isRtl = lang === 'ar';

  if (total <= 0) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const startRecord = (currentPage - 1) * pageSize + 1;
  const endRecord = Math.min(currentPage * pageSize, total);

  // Calculate pages to show with ellipsis
  const pageNumbers: (number | '...')[] = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (currentPage <= 4) {
      return [1, 2, 3, 4, 5, '...', totalPages];
    }
    if (currentPage >= totalPages - 3) {
      return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
  }, [currentPage, totalPages]);

  return (
    <nav className={`titan-pagination-bar ${className}`} aria-label={t('التنقل بين الصفحات', 'Pagination')}>
      {/* 1. Summary Information */}
      <div className="pagination-summary">
        {isRtl ? (
          <span>
            عرض <b>{startRecord}</b>–<b>{endRecord}</b> من أصل <b>{total}</b> سجل
          </span>
        ) : (
          <span>
            Showing <b>{startRecord}</b>–<b>{endRecord}</b> of <b>{total}</b> records
          </span>
        )}
      </div>

      {/* 2. Navigation Buttons */}
      <div className="pagination-nav">
        {/* First Page */}
        <button
          type="button"
          className="page-nav-btn first-page-btn"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(1)}
          title={t('الصفحة الأولى', 'First page')}
          aria-label={t('الصفحة الأولى', 'First page')}
        >
          {isRtl ? <ChevronRight double /> : <ChevronLeft double />}
          <span className="page-btn-text">{t('الأولى', 'First')}</span>
        </button>

        {/* Previous Page */}
        <button
          type="button"
          className="page-nav-btn prev-page-btn"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          title={t('الصفحة السابقة', 'Previous page')}
          aria-label={t('الصفحة السابقة', 'Previous page')}
        >
          {isRtl ? <ChevronRight /> : <ChevronLeft />}
          <span className="page-btn-text">{t('السابق', 'Prev')}</span>
        </button>

        {/* Number Pills */}
        <div className="page-pills-group">
          {pageNumbers.map((p, idx) => {
            if (p === '...') {
              return (
                <span key={`dots-${idx}`} className="page-pill-dots">
                  …
                </span>
              );
            }
            const isActive = p === currentPage;
            return (
              <button
                key={p}
                type="button"
                className={`page-pill-btn ${isActive ? 'active' : ''}`}
                onClick={() => onPageChange(p)}
                aria-current={isActive ? 'page' : undefined}
                title={`${t('صفحة', 'Page')} ${p}`}
              >
                {p}
              </button>
            );
          })}
        </div>

        {/* Next Page */}
        <button
          type="button"
          className="page-nav-btn next-page-btn"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          title={t('الصفحة التالية', 'Next page')}
          aria-label={t('الصفحة التالية', 'Next page')}
        >
          <span className="page-btn-text">{t('التالي', 'Next')}</span>
          {isRtl ? <ChevronLeft /> : <ChevronRight />}
        </button>

        {/* Last Page */}
        <button
          type="button"
          className="page-nav-btn last-page-btn"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(totalPages)}
          title={t('الصفحة الأخيرة', 'Last page')}
          aria-label={t('الصفحة الأخيرة', 'Last page')}
        >
          <span className="page-btn-text">{t('الأخيرة', 'Last')}</span>
          {isRtl ? <ChevronLeft double /> : <ChevronRight double />}
        </button>
      </div>

      {/* 3. Page Size Selector */}
      {onPageSizeChange && (
        <div className="pagination-page-size">
          <label>
            <select
              value={pageSize}
              onChange={(e) => {
                const newSize = Number(e.target.value);
                onPageSizeChange(newSize);
                onPageChange(1);
              }}
              aria-label={t('عدد السجلات لكل صفحة', 'Records per page')}
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt} {t('سجل', 'items')}
                </option>
              ))}
            </select>
            <span className="page-size-label">{t('لكل صفحة', 'per page')}</span>
          </label>
        </div>
      )}
    </nav>
  );
}

/**
 * Reusable hook to handle client-side pagination over any array of items.
 */
export function usePagination<T>(items: T[], initialPageSize = 15) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const paginatedItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  const resetPage = useCallback(() => setPage(1), []);

  return {
    page: safePage,
    pageSize,
    setPage,
    setPageSize,
    resetPage,
    total,
    totalPages,
    paginatedItems
  };
}

export const PAGE_SIZE_OPTIONS = [50, 100, 150, 200] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 50;

export interface PageWindow<T> {
  items: T[];
  page: number;
  pageSize: PageSize;
  totalItems: number;
  totalPages: number;
  start: number;
  end: number;
}

export function isPageSize(value: unknown): value is PageSize {
  return PAGE_SIZE_OPTIONS.includes(value as PageSize);
}

export function normalizePageSize(value: number): PageSize {
  return isPageSize(value) ? value : DEFAULT_PAGE_SIZE;
}

export function getTotalPages(totalItems: number, pageSize: number): number {
  const normalizedPageSize = normalizePageSize(pageSize);
  if (totalItems <= 0) return 1;
  return Math.ceil(totalItems / normalizedPageSize);
}

export function clampPage(page: number, totalItems: number, pageSize: number): number {
  if (!Number.isFinite(page)) return 1;
  return Math.min(getTotalPages(totalItems, pageSize), Math.max(1, Math.floor(page)));
}

export function pageWindow<T>(items: T[], page: number, pageSize: number): PageWindow<T> {
  const normalizedPageSize = normalizePageSize(pageSize);
  const totalPages = getTotalPages(items.length, normalizedPageSize);
  const currentPage = clampPage(page, items.length, normalizedPageSize);
  const start = items.length ? (currentPage - 1) * normalizedPageSize : 0;
  const end = Math.min(items.length, start + normalizedPageSize);
  return {
    items: items.slice(start, end),
    page: currentPage,
    pageSize: normalizedPageSize,
    totalItems: items.length,
    totalPages,
    start,
    end,
  };
}

export function pageAfterPageSizeChange(
  page: number,
  pageSize: number,
  nextPageSize: number,
  totalItems: number,
): number {
  const normalizedPageSize = normalizePageSize(pageSize);
  const normalizedNextPageSize = normalizePageSize(nextPageSize);
  const currentPage = clampPage(page, totalItems, normalizedPageSize);
  const firstItemIndex = totalItems ? (currentPage - 1) * normalizedPageSize : 0;
  const nextPage = Math.floor(firstItemIndex / normalizedNextPageSize) + 1;
  return clampPage(nextPage, totalItems, normalizedNextPageSize);
}

import type { AdminPageInfo } from "@/shared/api/admin";

/**
 * Pages an already-loaded list on the server. Used when a page receives its full list
 * and only needs to show a slice (the page number comes from a URL parameter).
 */
export function paginateList<T>(
  items: T[],
  requested: string | undefined,
  pageSize = 20
): { items: T[]; page: AdminPageInfo } {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const wanted = Math.floor(Number(requested)) || 1;
  const page = Math.min(Math.max(1, wanted), pageCount);
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page: { page, pageSize, total, pageCount } };
}

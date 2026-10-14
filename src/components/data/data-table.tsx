import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Paged, SearchParams } from "@/server/list";
import { withParams } from "./url";
import { PAGE_SIZE_OPTIONS } from "@/lib/config";

export type Column<T> = {
  key: string;
  header: string;
  /** Column key accepted by the server's sort whitelist. */
  sortKey?: string;
  className?: string;
  cell: (row: T) => React.ReactNode;
};

/**
 * Server-rendered data table. Sorting and pagination are URL-driven links, so lists are
 * shareable, work without client JS, and the server enforces sort whitelists and scope.
 */
export function DataTable<T extends { id: string }>({
  columns,
  data,
  basePath,
  searchParams,
  empty,
  rowHref,
  caption,
}: {
  columns: Column<T>[];
  data: Paged<T>;
  basePath: string;
  searchParams: SearchParams;
  empty: React.ReactNode;
  rowHref?: (row: T) => string;
  caption: string;
}) {
  const sort = (Array.isArray(searchParams.sort) ? searchParams.sort[0] : searchParams.sort) ?? "";
  const dir = (Array.isArray(searchParams.dir) ? searchParams.dir[0] : searchParams.dir) ?? "";

  if (data.total === 0) return <>{empty}</>;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-sm">
        <table className="w-full caption-bottom text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-gradient-to-r from-primary/[0.06] to-muted/40">
            <tr className="border-b">
              {columns.map((c) => {
                const active = c.sortKey && sort === c.sortKey;
                const nextDir = active && dir === "asc" ? "desc" : "asc";
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
                    className={cn("h-11 whitespace-nowrap px-3 text-left align-middle text-xs font-semibold tracking-wide text-muted-foreground uppercase", c.className)}
                  >
                    {c.sortKey ? (
                      <Link
                        href={withParams(basePath, searchParams, { sort: c.sortKey, dir: nextDir, page: undefined })}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        scroll={false}
                      >
                        {c.header}
                        {active ? dir === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" /> : <ArrowUpDown className="size-3.5 opacity-40" />}
                      </Link>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.id} className="border-b border-border/60 transition-colors last:border-0 hover:bg-primary/[0.04]">
                {columns.map((c, i) => (
                  <td key={c.key} className={cn("px-3 py-3 align-middle whitespace-nowrap", c.className)}>
                    {i === 0 && rowHref ? (
                      <Link href={rowHref(row)} className="font-semibold text-primary hover:underline">
                        {c.cell(row)}
                      </Link>
                    ) : (
                      c.cell(row)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination data={data} basePath={basePath} searchParams={searchParams} />
    </div>
  );
}

export function Pagination({ data, basePath, searchParams }: { data: Paged<unknown>; basePath: string; searchParams: SearchParams }) {
  const from = (data.page - 1) * data.pageSize + 1;
  const to = Math.min(data.total, data.page * data.pageSize);
  const linkCls = "inline-flex h-8 items-center gap-1 rounded-md border bg-background px-2.5 text-sm hover:bg-accent";
  const disabledCls = "pointer-events-none opacity-50";
  return (
    <nav aria-label="Pagination" className="flex flex-col items-center justify-between gap-2 text-sm text-muted-foreground sm:flex-row">
      <div>
        Showing <span className="font-medium text-foreground">{from}</span>–<span className="font-medium text-foreground">{to}</span> of{" "}
        <span className="font-medium text-foreground">{data.total}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="hidden sm:inline">Rows:</span>
        {PAGE_SIZE_OPTIONS.map((s) => (
          <Link
            key={s}
            href={withParams(basePath, searchParams, { pageSize: s, page: undefined })}
            className={cn("rounded-md px-2 py-0.5", s === data.pageSize ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-accent hover:text-foreground")}
            aria-current={s === data.pageSize ? "true" : undefined}
            scroll={false}
          >
            {s}
          </Link>
        ))}
        <span className="mx-1 hidden sm:inline">·</span>
        <Link
          href={withParams(basePath, searchParams, { page: data.page - 1 })}
          className={cn(linkCls, data.page <= 1 && disabledCls)}
          aria-disabled={data.page <= 1}
          aria-label="Previous page"
          scroll={false}
        >
          <ChevronLeft className="size-4" />
        </Link>
        <span>
          Page {data.page} of {data.pageCount}
        </span>
        <Link
          href={withParams(basePath, searchParams, { page: data.page + 1 })}
          className={cn(linkCls, data.page >= data.pageCount && disabledCls)}
          aria-disabled={data.page >= data.pageCount}
          aria-label="Next page"
          scroll={false}
        >
          <ChevronRight className="size-4" />
        </Link>
      </div>
    </nav>
  );
}

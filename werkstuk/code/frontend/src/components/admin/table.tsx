import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cx, mutedClass, textButtonClass } from "../../lib/styles";
import { EmptyState } from "./ui";

export type AdminColumn<T> = {
  header: string;
  sort?: (row: T) => string | number;
  className?: string;
  cell: (row: T) => ReactNode;
};

const PAGE_SIZE = 25;

export function AdminTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  loading,
}: {
  columns: AdminColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty: string;
  loading?: boolean;
}) {
  const [sortIndex, setSortIndex] = useState<number | null>(null);
  const [asc, setAsc] = useState(true);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (sortIndex == null) {
      return rows;
    }
    const column = columns[sortIndex];
    if (!column?.sort) {
      return rows;
    }
    const copy = [...rows];
    copy.sort((left, right) => {
      const a = column.sort!(left);
      const b = column.sort!(right);
      if (a < b) {
        return asc ? -1 : 1;
      }
      if (a > b) {
        return asc ? 1 : -1;
      }
      return 0;
    });
    return copy;
  }, [rows, columns, sortIndex, asc]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const slice = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  if (loading) {
    return <p className={mutedClass}>Loading…</p>;
  }
  if (rows.length === 0) {
    return <EmptyState>{empty}</EmptyState>;
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-line">
              {columns.map((column, index) => (
                <th
                  key={`${column.header}-${index}`}
                  scope="col"
                  aria-sort={
                    column.sort && sortIndex === index
                      ? asc
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                  className={cx(
                    "py-2 pr-3 text-xs font-semibold tracking-wide text-muted",
                    column.className,
                  )}
                >
                  {column.header ? (
                    column.sort ? (
                    <button
                      type="button"
                      aria-label={`Sort by ${column.header}`}
                      className="inline-flex cursor-pointer items-center gap-1 hover:text-navy"
                      onClick={() => {
                        if (sortIndex === index) {
                          setAsc((value) => !value);
                        } else {
                          setSortIndex(index);
                          setAsc(true);
                        }
                        setPage(0);
                      }}
                    >
                      {column.header}
                      {sortIndex === index ? (
                        asc ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : (
                          <ArrowDown className="h-3 w-3" />
                        )
                      ) : null}
                    </button>
                    ) : (
                      column.header
                    )
                  ) : (
                    <span className="sr-only">Actions</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((row) => (
              <tr key={rowKey(row)} className="border-b border-line">
                {columns.map((column, index) => (
                  <td
                    key={`${column.header}-${index}`}
                    className={cx("py-2.5 pr-3 align-middle text-ink", column.className)}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pageCount > 1 ? (
        <div className={`mt-3 flex items-center justify-between ${mutedClass}`}>
          <span>
            {safePage * PAGE_SIZE + 1}–{Math.min(sorted.length, (safePage + 1) * PAGE_SIZE)} of{" "}
            {sorted.length}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className={textButtonClass}
              disabled={safePage === 0}
              onClick={() => setPage((value) => Math.max(0, value - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className={textButtonClass}
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

import type { ReactNode } from "react";

export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: "left" | "right";
};

type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  emptyMessage?: string;
};

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  emptyMessage = "Nenhum registro encontrado.",
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return (
      <div className="ina-card">
        <div className="ina-card__body" style={{ textAlign: "center", color: "var(--color-text-muted)" }}>
          {emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <div className="ina-table-wrap">
      <table className="ina-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={{ textAlign: col.align ?? "left" }}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((col) => (
                <td key={col.key} style={{ textAlign: col.align ?? "left" }}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import type { ReactNode } from "react";

type StatCardProps = {
  label: string;
  value: string;
  delta?: string;
  accent?: string;
};

export function StatCard({ label, value, delta, accent }: StatCardProps) {
  return (
    <div className="ina-stat" style={accent ? { ["--stat-accent" as string]: accent } : undefined}>
      <div className="ina-stat__label">{label}</div>
      <div className="ina-stat__value">{value}</div>
      {delta && <div className="ina-stat__delta">{delta}</div>}
    </div>
  );
}

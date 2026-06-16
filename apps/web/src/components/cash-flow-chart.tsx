"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const DATA = [
  { month: "Mar", entradas: 142000, saidas: 98000 },
  { month: "Abr", entradas: 158000, saidas: 112000 },
  { month: "Mai", entradas: 171000, saidas: 105000 },
  { month: "Jun", entradas: 165000, saidas: 118000 },
  { month: "Jul", entradas: 189000, saidas: 124000 },
  { month: "Ago", entradas: 176000, saidas: 131000 },
  { month: "Set", entradas: 198000, saidas: 128000 },
  { month: "Out", entradas: 205000, saidas: 135000 },
  { month: "Nov", entradas: 212000, saidas: 142000 },
  { month: "Dez", entradas: 224000, saidas: 148000 },
  { month: "Jan", entradas: 218000, saidas: 139000 },
  { month: "Fev", entradas: 231000, saidas: 145000 },
];

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
}

export function CashFlowChart() {
  return (
    <div style={{ width: "100%", height: 320 }}>
      <ResponsiveContainer>
        <AreaChart data={DATA} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="entradas" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0d9f6e" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#0d9f6e" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="saidas" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8e4da" />
          <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#5c6b7a" />
          <YAxis tickFormatter={(v) => `${v / 1000}k`} tick={{ fontSize: 12 }} stroke="#5c6b7a" />
          <Tooltip formatter={(v: number) => formatBRL(v)} />
          <Legend />
          <Area type="monotone" dataKey="entradas" name="Entradas" stroke="#0d9f6e" fill="url(#entradas)" strokeWidth={2} />
          <Area type="monotone" dataKey="saidas" name="Saídas" stroke="#2563eb" fill="url(#saidas)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

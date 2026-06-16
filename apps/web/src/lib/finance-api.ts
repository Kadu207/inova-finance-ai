"use client";

import { apiClient } from "@/lib/api-client";

export type ApiPayable = {
  id: string;
  tenantId: string;
  branchId: string;
  supplierName: string;
  amount: string;
  dueDate: string;
  status: "open" | "paid" | "cancelled";
  idempotencyKey?: string | null;
  createdAt: string;
};

export type ApiReceivable = {
  id: string;
  tenantId: string;
  branchId: string;
  customerName: string;
  amount: string;
  dueDate: string;
  status: "open" | "received" | "cancelled";
  idempotencyKey?: string | null;
  createdAt: string;
};

export type CashFlow = { inflow: number; outflow: number; net: number };

export type AgendaItem = {
  type: "payable" | "receivable";
  id: string;
  title: string;
  dueDate: string;
};

export function formatBRL(value: number | string): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

export function formatDateBR(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function payableStatusUi(status: ApiPayable["status"], dueDate: string): "open" | "paid" | "overdue" {
  if (status === "paid") return "paid";
  if (status === "cancelled") return "open";
  const due = new Date(dueDate.slice(0, 10));
  return due < new Date(new Date().toDateString()) ? "overdue" : "open";
}

export function receivableStatusUi(status: ApiReceivable["status"], dueDate: string): "open" | "received" | "overdue" {
  if (status === "received") return "received";
  if (status === "cancelled") return "open";
  const due = new Date(dueDate.slice(0, 10));
  return due < new Date(new Date().toDateString()) ? "overdue" : "open";
}

export async function fetchPayables(token: string) {
  const res = await apiClient.get<{ data: ApiPayable[] }>("/api/finance/payables", { token });
  return res.data;
}

export async function createPayable(
  token: string,
  body: { supplierName: string; amount: string; dueDate: string; branchId: string },
) {
  const res = await apiClient.post<{ data: ApiPayable }>("/api/finance/payables", body, {
    token,
    correlationId: crypto.randomUUID(),
  });
  return res.data;
}

export async function fetchReceivables(token: string) {
  const res = await apiClient.get<{ data: ApiReceivable[] }>("/api/finance/receivables", { token });
  return res.data;
}

export async function createReceivable(
  token: string,
  body: { customerName: string; amount: string; dueDate: string; branchId: string },
) {
  const res = await apiClient.post<{ data: ApiReceivable }>("/api/finance/receivables", body, {
    token,
    correlationId: crypto.randomUUID(),
  });
  return res.data;
}

export async function fetchCashFlow(token: string) {
  const res = await apiClient.get<{ data: CashFlow }>("/api/finance/cash-flow", { token });
  return res.data;
}

export async function fetchAgenda(token: string) {
  const res = await apiClient.get<{ data: AgendaItem[] }>("/api/finance/agenda", { token });
  return res.data;
}

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
  status: "open" | "paid" | "cancelled";
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

export function receivableStatusUi(status: ApiReceivable["status"], dueDate: string): "open" | "paid" | "overdue" {
  if (status === "paid") return "paid";
  if (status === "cancelled") return "open";
  const due = new Date(dueDate.slice(0, 10));
  return due < new Date(new Date().toDateString()) ? "overdue" : "open";
}

export async function fetchPayables() {
  const res = await apiClient.get<{ data: ApiPayable[] }>("/api/finance/payables");
  return res.data;
}

export async function createPayable(
  body: { supplierName: string; amount: string; dueDate: string; branchId: string },
) {
  const res = await apiClient.post<{ data: ApiPayable }>("/api/finance/payables", body, {
    correlationId: crypto.randomUUID(),
  });
  return res.data;
}

export async function fetchReceivables() {
  const res = await apiClient.get<{ data: ApiReceivable[] }>("/api/finance/receivables");
  return res.data;
}

export async function createReceivable(
  body: { customerName: string; amount: string; dueDate: string; branchId: string },
) {
  const res = await apiClient.post<{ data: ApiReceivable }>("/api/finance/receivables", body, {
    correlationId: crypto.randomUUID(),
  });
  return res.data;
}

export async function fetchCashFlow() {
  const res = await apiClient.get<{ data: CashFlow }>("/api/finance/cash-flow");
  return res.data;
}

export async function fetchAgenda() {
  const res = await apiClient.get<{ data: AgendaItem[] }>("/api/finance/agenda");
  return res.data;
}

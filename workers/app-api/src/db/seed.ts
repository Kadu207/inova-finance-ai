import type { Payable, PrismaClient, Receivable } from "@inova/db";
import { hashPassword } from "../auth";

export const DEMO_TENANT_ID = "demo-tenant";
export const DEMO_BRANCH_ID = "branch_main";
export const DEMO_ADMIN_EMAIL = "admin@inova.local";
export const DEMO_ADMIN_PASSWORD = "changeme";

export function serializePayable(row: Payable) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    branchId: row.branchId,
    supplierName: row.supplierName,
    amount: row.amount.toString(),
    dueDate: row.dueDate.toISOString().slice(0, 10),
    status: row.status,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt.toISOString(),
  };
}

export function serializeReceivable(row: Receivable) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    branchId: row.branchId,
    customerName: row.customerName,
    amount: row.amount.toString(),
    dueDate: row.dueDate.toISOString().slice(0, 10),
    status: row.status,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function seedDemoData(db: PrismaClient | null): Promise<void> {
  if (!db) return;

  await db.tenant.upsert({
    where: { slug: "demo-tenant" },
    create: { id: DEMO_TENANT_ID, name: "Demo Tenant", slug: "demo-tenant" },
    update: {},
  });

  await db.branch.upsert({
    where: { tenantId_code: { tenantId: DEMO_TENANT_ID, code: "main" } },
    create: {
      id: DEMO_BRANCH_ID,
      tenantId: DEMO_TENANT_ID,
      name: "Matriz",
      code: "main",
    },
    update: {},
  });

  const passwordHash = await hashPassword(DEMO_ADMIN_PASSWORD);
  const user = await db.user.upsert({
    where: { email: DEMO_ADMIN_EMAIL },
    create: {
      id: "user_demo_admin",
      email: DEMO_ADMIN_EMAIL,
      passwordHash,
      mfaEnabled: false,
    },
    update: { passwordHash },
  });

  await db.userTenant.upsert({
    where: { userId_tenantId: { userId: user.id, tenantId: DEMO_TENANT_ID } },
    create: {
      userId: user.id,
      tenantId: DEMO_TENANT_ID,
      role: "admin",
      branchIds: [DEMO_BRANCH_ID],
    },
    update: { role: "admin", branchIds: [DEMO_BRANCH_ID] },
  });

  console.log(JSON.stringify({ level: "info", message: "Demo data seeded in PostgreSQL" }));
}

import type { PrismaClient } from "@inova/db";
import { DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD, DEMO_BRANCH_ID, DEMO_TENANT_ID } from "./seed";
import { hashPassword, verifyPassword } from "../auth";

export type DbUserRecord = {
  userId: string;
  email: string;
  passwordHash: string;
  role: string;
  mfaSecret?: string | null;
  mfaEnabled: boolean;
  branchIds: string[];
  tenantId: string;
};

async function resolveTenantId(db: PrismaClient, tenantHeader: string): Promise<string | null> {
  const tenant = await db.tenant.findFirst({
    where: { OR: [{ id: tenantHeader }, { slug: tenantHeader }] },
    select: { id: true },
  });
  return tenant?.id ?? null;
}

export async function findUserForLogin(
  db: PrismaClient | null,
  email: string,
  tenantHeader: string,
): Promise<DbUserRecord | null> {
  if (!db) return null;

  const tenantId = await resolveTenantId(db, tenantHeader);
  if (!tenantId) return null;

  const user = await db.user.findUnique({
    where: { email },
    include: { tenants: { where: { tenantId } } },
  });
  if (!user || user.tenants.length === 0) return null;

  const membership = user.tenants[0]!;
  return {
    userId: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    role: membership.role,
    mfaSecret: user.mfaSecret,
    mfaEnabled: user.mfaEnabled,
    branchIds: membership.branchIds,
    tenantId,
  };
}

export async function enableMfaForUser(
  db: PrismaClient | null,
  email: string,
  secret: string,
): Promise<boolean> {
  if (!db) return false;

  const user = await db.user.findUnique({ where: { email } });
  if (!user) return false;

  await db.user.update({
    where: { id: user.id },
    data: { mfaSecret: secret, mfaEnabled: true },
  });
  return true;
}

export async function ensureDemoUserInDb(db: PrismaClient | null): Promise<void> {
  if (!db) return;

  await db.tenant.upsert({
    where: { slug: "demo-tenant" },
    create: { id: DEMO_TENANT_ID, name: "Demo Tenant", slug: "demo-tenant" },
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
}

export async function verifyDbCredentials(
  db: PrismaClient | null,
  email: string,
  password: string,
  tenantHeader: string,
): Promise<DbUserRecord | null> {
  const record = await findUserForLogin(db, email, tenantHeader);
  if (!record) return null;
  if (!(await verifyPassword(password, record.passwordHash))) return null;
  return record;
}

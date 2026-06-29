/**
 * Guarda de boot: verifica se a role conectada consegue IGNORAR a Row-Level Security
 * (superuser ou BYPASSRLS). Se conseguir, a RLS não protege nada — em produção isso é
 * FATAL (lança, derrubando a requisição/boot); fora de produção apenas avisa.
 *
 * A POLÍTICA (lançar/avisar) é separada da CONSULTA ao banco (a `probe`) de propósito,
 * para permitir teste unitário sem Postgres.
 */
export type RoleInfo = { role: string; canBypass: boolean };
export type RoleProbe = () => Promise<RoleInfo>;

export async function assertRlsEnforceable(probe: RoleProbe, environment: string | undefined): Promise<RoleInfo> {
  const info = await probe();
  if (info.canBypass) {
    const message =
      `RLS inativa: a app conectou como "${info.role}", uma role com superuser/BYPASSRLS que ` +
      `IGNORA Row-Level Security. Conecte como inova_app (sem BYPASSRLS) — ver packages/db/prisma/rls.sql.`;
    if (environment === "production") {
      throw new Error(message);
    }
    console.warn(JSON.stringify({ level: "warn", event: "rls.bypass_role", role: info.role, message }));
  }
  return info;
}

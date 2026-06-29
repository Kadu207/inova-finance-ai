import { describe, it, expect, vi } from "vitest";
import { assertRlsEnforceable } from "./rls-guard";

describe("RLS boot guard — role com BYPASSRLS", () => {
  it("LANÇA em produção quando a role ignora a RLS (superuser/BYPASSRLS)", async () => {
    const probe = async () => ({ role: "postgres", canBypass: true });
    await expect(assertRlsEnforceable(probe, "production")).rejects.toThrow(/RLS inativa/);
  });

  it("fora de produção apenas avisa (não lança)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const probe = async () => ({ role: "inova", canBypass: true });
    await expect(assertRlsEnforceable(probe, "development")).resolves.toEqual({ role: "inova", canBypass: true });
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("role sem bypass (inova_app) passa sem lançar nem avisar", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const probe = async () => ({ role: "inova_app", canBypass: false });
    await expect(assertRlsEnforceable(probe, "production")).resolves.toEqual({ role: "inova_app", canBypass: false });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

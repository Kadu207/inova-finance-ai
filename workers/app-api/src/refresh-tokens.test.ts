import { describe, it, expect } from "vitest";
import { MemoryKV } from "./local-env";
import { issueRefreshToken, consumeRefreshToken, revokeRefreshToken } from "./refresh-tokens";

const user = { userId: "u1", email: "u@a.test", tenantId: "t1", role: "finance", branchIds: ["b1"] };

function kv(): KVNamespace {
  return new MemoryKV() as unknown as KVNamespace;
}

describe("refresh-tokens (KV)", () => {
  it("emite e consome; segundo consumo retorna null (uso único)", async () => {
    const store = kv();
    const raw = await issueRefreshToken(store, user);
    const rec = await consumeRefreshToken(store, raw);
    expect(rec?.userId).toBe("u1");
    expect(await consumeRefreshToken(store, raw)).toBeNull();
  });

  it("token expirado retorna null", async () => {
    const store = kv();
    const raw = await issueRefreshToken(store, user, -1); // nasce expirado
    expect(await consumeRefreshToken(store, raw)).toBeNull();
  });

  it("revoke impede o consumo", async () => {
    const store = kv();
    const raw = await issueRefreshToken(store, user);
    await revokeRefreshToken(store, raw);
    expect(await consumeRefreshToken(store, raw)).toBeNull();
  });
});

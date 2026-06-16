import { describe, it, expect } from "vitest";
import { validateEvent } from "@inova/events";

describe("messaging event validation", () => {
  it("requires idempotency key", () => {
    expect(() =>
      validateEvent({
        eventType: "PayableCreated",
        tenantId: "t1",
        correlationId: "c1",
        timestamp: new Date().toISOString(),
        payload: { payableId: "p1", amount: "10", dueDate: "2026-01-01" },
      }),
    ).toThrow();
  });
});

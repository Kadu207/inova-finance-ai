import { describe, it, expect } from "vitest";
import { createEvent, validateEvent } from "./index";

describe("event contracts", () => {
  it("validates PayableCreated", () => {
    const event = createEvent(
      "PayableCreated",
      { tenantId: "t1", correlationId: "c1", idempotencyKey: "k1" },
      { payableId: "p1", amount: "100.00", dueDate: "2026-07-01" },
    );
    expect(validateEvent(event).eventType).toBe("PayableCreated");
  });

  it("rejects missing tenantId", () => {
    expect(() =>
      validateEvent({
        eventType: "PayableCreated",
        correlationId: "c1",
        idempotencyKey: "k1",
        timestamp: new Date().toISOString(),
        payload: {},
      }),
    ).toThrow();
  });
});

import { describe, it, expect } from "vitest";
import { EMBEDDED_AGENTS } from "./index";

describe("embedded runtime", () => {
  it("defines agents 41-55", () => {
    expect(Object.keys(EMBEDDED_AGENTS)).toHaveLength(15);
    expect(EMBEDDED_AGENTS[41]).toBe("orchestrator");
    expect(EMBEDDED_AGENTS[55]).toBe("incident-responder");
  });
});

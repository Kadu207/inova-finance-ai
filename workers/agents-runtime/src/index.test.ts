import { describe, it, expect } from "vitest";
import { BUSINESS_AGENTS } from "./index";

describe("agents runtime", () => {
  it("defines 12 business agents", () => {
    expect(BUSINESS_AGENTS).toHaveLength(12);
  });
});

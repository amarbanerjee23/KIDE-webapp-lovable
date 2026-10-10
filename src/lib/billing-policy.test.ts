import { describe, expect, it } from "vitest";
import { PAID_BILLING_ENABLED } from "./billing-policy";

describe("v1.0.0 commercial release boundary", () => {
  it("keeps all paid billing disabled until separately qualified", () => {
    expect(PAID_BILLING_ENABLED).toBe(false);
  });
});

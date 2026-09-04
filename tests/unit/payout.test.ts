import { describe, expect, it } from "vitest";
import { calculatePayout } from "@/server/services/payout";

describe("calculatePayout", () => {
  it.each([
    [0n, 250, 0n],
    [999n, 250, 0n],
    [1_000n, 250, 250n],
    [1_999n, 250, 250n],
    [2_000n, 250, 500n],
    [125_678n, 375, 46_875n],
  ])("calculates payout for %s views at %s cents", (views, payout, expected) => {
    expect(calculatePayout(views, payout)).toBe(expected);
  });
});

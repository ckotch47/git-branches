import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapWithConcurrency } from "../../src/shared/utils";

describe("mapWithConcurrency", () => {
  it("preserves order", async () => {
    const result = await mapWithConcurrency([3, 1, 2], 2, async (n) => n * 10);
    assert.deepEqual(result, [30, 10, 20]);
  });

  it("never exceeds the limit", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (n) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return n;
    });
    assert.ok(maxInFlight <= 2, `max in flight was ${maxInFlight}`);
  });

  it("handles empty input", async () => {
    assert.deepEqual(await mapWithConcurrency([], 4, async (n: number) => n), []);
  });
});

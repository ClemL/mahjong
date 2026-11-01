// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCountdown } from "../useCountdown";

describe("useCountdown", () => {
  afterEach(() => vi.useRealTimers());

  it("starts again from a fresh view even when its deadline reads the same as the last one's", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ ms, fresh }) => useCountdown(ms, true, fresh), {
      initialProps: { ms: 10_000, fresh: 1 },
    });
    act(() => vi.advanceTimersByTime(11_000));
    expect(result.current).toBe(0);
    // A second hurry-up, answered "10000 left" just like the first.
    rerender({ ms: 10_000, fresh: 2 });
    expect(result.current).toBe(10_000);
    act(() => vi.advanceTimersByTime(4_000));
    expect(result.current).toBeGreaterThan(5_000);
    // The same view drawn again is not a fresh deadline.
    rerender({ ms: 10_000, fresh: 2 });
    expect(result.current).toBeLessThan(7_000);
  });
});

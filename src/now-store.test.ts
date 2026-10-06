import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { startNowTimer, useNow } from "./now-store";

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("shared clock timer", () => {
  it("refreshes immediately and aligns ticks to wall-clock seconds", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1250);
    const stop = startNowTimer();

    expect(useNow.getState().now).toBe(1250);
    vi.advanceTimersByTime(749);
    expect(useNow.getState().now).toBe(1250);
    vi.advanceTimersByTime(1);
    expect(useNow.getState().now).toBe(2000);
    vi.advanceTimersByTime(1000);
    expect(useNow.getState().now).toBe(3000);

    stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cleans up and restarts with one timer under Strict Mode", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1250);
    const stop = startNowTimer();
    stop();
    const stopAgain = startNowTimer();

    expect(vi.getTimerCount()).toBe(1);
    stopAgain();
    vi.advanceTimersByTime(5000);
    expect(useNow.getState().now).toBe(1250);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reads actual time after a clock jump instead of counting ticks", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1250);
    const stop = startNowTimer();

    vi.setSystemTime(10250);
    vi.advanceTimersByTime(750);
    expect(useNow.getState().now).toBe(11000);

    stop();
  });
});

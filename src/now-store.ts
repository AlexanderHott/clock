import { create } from "zustand";

interface NowState {
  now: number;
}

export const useNow = create<NowState>(() => ({ now: Date.now() }));

// App owns the timer lifetime; all time displays share this store.
export function startNowTimer() {
  let timeoutId: ReturnType<typeof setTimeout>;

  const tick = () => {
    const now = Date.now();
    useNow.setState({ now });
    timeoutId = setTimeout(tick, 1000 - (now % 1000));
  };

  tick();

  return () => clearTimeout(timeoutId);
}

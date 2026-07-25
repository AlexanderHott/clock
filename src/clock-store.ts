import { create } from "zustand";

export interface Clock {
  id: string;
  timeZone: string;
}

export interface ClockStore {
  clocks: Clock[];
  clockById: Record<string, Clock>;

  addClock(this: void, clock: Clock): void;
  // removeClock(clock: Clock): void
}

const CLOCKS_EMPTY = [
  {
    id: crypto.randomUUID(),
    timeZone: "America/Los_Angeles",
  },
  {
    id: crypto.randomUUID(),
    timeZone: "America/New_York",
  },
] satisfies Clock[];
const CLOCK_BY_ID_EMPTY = {} satisfies Record<string, Clock>;

export const useClockStore = create<ClockStore>()((set) => ({
  clocks: CLOCKS_EMPTY,
  clockById: CLOCK_BY_ID_EMPTY,

  addClock: (clock: Clock) => {
    set((old) => ({
      ...old,
      clockById: { ...old.clockById, [clock.id]: clock },
      clocks: [...old.clocks, clock],
    }));
  },
}));

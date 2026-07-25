import { create } from "zustand";
import { toTimeZoneId, type TimeZoneId } from "./time-zones";

export interface Clock {
  id: string;
  timeZone: TimeZoneId;
}

export interface ClockStore {
  clocks: Clock[];

  addClock(this: void, timeZone: TimeZoneId): void;
  removeClock(this: void, clockId: string): void;
}

const CLOCKS_EMPTY = [
  {
    id: crypto.randomUUID(),
    timeZone: toTimeZoneId("America/Los_Angeles"),
  },
  {
    id: crypto.randomUUID(),
    timeZone: toTimeZoneId("America/New_York"),
  },
] satisfies Clock[];

export const useClockStore = create<ClockStore>()((set) => ({
  clocks: CLOCKS_EMPTY,

  addClock: (timeZone: TimeZoneId) => {
    set((old) => ({
      ...old,
      clocks: [...old.clocks, { id: crypto.randomUUID(), timeZone }],
    }));
  },
  removeClock: (clockId: string) => {
    set((old) => ({
      ...old,
      clocks: old.clocks.filter((clock) => clock.id !== clockId),
    }));
  },
}));

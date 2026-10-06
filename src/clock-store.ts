import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
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

export const useClockStore = create<ClockStore>()(
  persist(
    (set) => ({
      clocks: CLOCKS_EMPTY,

      addClock: (timeZone: TimeZoneId) => {
        set((old) => ({
          clocks: [...old.clocks, { id: crypto.randomUUID(), timeZone }],
        }));
      },
      removeClock: (clockId: string) => {
        set((old) => ({
          clocks: old.clocks.filter((clock) => clock.id !== clockId),
        }));
      },
    }),
    {
      name: "clock-list",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ clocks: state.clocks }),
    },
  ),
);

import { describe, expect, it } from "vite-plus/test";
import {
  availability,
  availabilityWindows,
  clampStart,
  clockTime,
  commonAvailability,
  fitsWindow,
  MINUTE,
  referenceDay,
  type PlannerZone,
} from "./planner-time";

function zone(timeZone: string, workStart = 540, workEnd = 1080): PlannerZone {
  return { id: timeZone, name: timeZone, timeZone, workStart, workEnd };
}

function windows(date: string, home: string, zones: PlannerZone[]) {
  const day = referenceDay(date, home);
  const rows = zones.map((zone) => availability(day.start, day.minutes, zone));
  return { day, rows, common: commonAvailability(rows) };
}

describe("timezone meeting planner", () => {
  it("finds the real shared working hours and checks the entire meeting", () => {
    const { common } = windows("2026-10-06", "America/Los_Angeles", [
      zone("America/Los_Angeles"),
      zone("America/New_York"),
    ]);
    expect(availabilityWindows(common)).toEqual([{ start: 540, end: 900 }]);
    expect(fitsWindow(common, 840, 60)).toBe(true);
    expect(fitsWindow(common, 855, 60)).toBe(false);
    expect(fitsWindow(common, 900, 15)).toBe(false);
  });

  it("uses 23 and 25 elapsed hours on daylight-saving dates", () => {
    expect(referenceDay("2026-03-08", "America/New_York").minutes).toBe(1380);
    expect(referenceDay("2026-11-01", "America/New_York").minutes).toBe(1500);
    const { common } = windows("2026-03-08", "America/New_York", [zone("America/New_York")]);
    expect(availabilityWindows(common)).toEqual([{ start: 480, end: 1020 }]);
  });

  it("keeps both occurrences of a repeated hour distinct", () => {
    const { day, common } = windows("2026-11-01", "America/New_York", [
      zone("America/New_York", 60, 120),
    ]);
    expect(availabilityWindows(common)).toEqual([{ start: 60, end: 180 }]);
    expect(clockTime(day.start + 60 * MINUTE, "America/New_York")).toBe("01:00");
    expect(clockTime(day.start + 120 * MINUTE, "America/New_York")).toBe("01:00");
  });

  it("recalculates overlap when countries change clocks on different dates", () => {
    const zones = [zone("America/New_York"), zone("Europe/Berlin")];
    expect(availabilityWindows(windows("2026-10-20", "Europe/Berlin", zones).common)).toEqual([
      { start: 900, end: 1080 },
    ]);
    expect(availabilityWindows(windows("2026-10-27", "Europe/Berlin", zones).common)).toEqual([
      { start: 840, end: 1080 },
    ]);
  });

  it("handles half-hour and quarter-hour offsets without rounding to hours", () => {
    const india = windows("2026-10-06", "UTC", [zone("Asia/Kolkata")]);
    const nepal = windows("2026-10-06", "UTC", [zone("Asia/Kathmandu")]);
    expect(availabilityWindows(india.common)).toEqual([{ start: 210, end: 750 }]);
    expect(availabilityWindows(nepal.common)).toEqual([{ start: 195, end: 735 }]);
  });

  it("handles half-hour daylight-saving shifts", () => {
    expect(referenceDay("2026-10-04", "Australia/Lord_Howe").minutes).toBe(1410);
    expect(referenceDay("2026-04-05", "Australia/Lord_Howe").minutes).toBe(1470);
  });

  it("supports working hours across midnight and 24-hour availability", () => {
    const overnight = windows("2026-10-06", "UTC", [zone("UTC", 1320, 360)]);
    expect(availabilityWindows(overnight.common)).toEqual([
      { start: 0, end: 360 },
      { start: 1320, end: 1440 },
    ]);
    expect(availabilityWindows(windows("2026-10-06", "UTC", [zone("UTC", 0, 0)]).common)).toEqual([
      { start: 0, end: 1440 },
    ]);
  });

  it("does not claim common availability with no zones or no overlap", () => {
    expect(commonAvailability([])).toEqual([]);
    expect(fitsWindow([], 0, 60)).toBe(false);
    expect(
      availabilityWindows(
        windows("2026-10-06", "UTC", [zone("America/Los_Angeles", 540, 1020), zone("Asia/Tokyo")])
          .common,
      ),
    ).toEqual([]);
  });

  it("preserves adjacent dates across the international date line", () => {
    const { day } = windows("2026-10-06", "Pacific/Kiritimati", [zone("Pacific/Honolulu")]);
    expect(new Date(day.start).toISOString()).toBe("2026-10-05T10:00:00.000Z");
    expect(clockTime(day.start, "Pacific/Honolulu")).toBe("00:00");
  });

  it("snaps starts and keeps the full duration inside the displayed day", () => {
    expect(clampStart(728, 60, 1440)).toBe(735);
    expect(clampStart(-30, 60, 1440)).toBe(0);
    expect(clampStart(1440, 60, 1380)).toBe(1320);
    expect(fitsWindow([true], 0, 30)).toBe(false);
  });
});

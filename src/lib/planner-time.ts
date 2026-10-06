import { Temporal } from "@js-temporal/polyfill";

export const STEP = 15;
export const MINUTE = 60_000;

export interface PlannerZone {
  id: string;
  timeZone: string;
  name: string;
  workStart: number;
  workEnd: number;
}

export interface TimeWindow {
  start: number;
  end: number;
}

export function zonedTime(epoch: number, timeZone: string) {
  return Temporal.Instant.fromEpochMilliseconds(epoch).toZonedDateTimeISO(timeZone);
}

export function referenceDay(date: string, timeZone: string) {
  const start = Temporal.PlainDate.from(date).toZonedDateTime(timeZone);
  const end = start.add({ days: 1 });
  return {
    start: start.epochMilliseconds,
    minutes: (end.epochMilliseconds - start.epochMilliseconds) / MINUTE,
  };
}

export function clockTime(epoch: number, timeZone: string) {
  const local = zonedTime(epoch, timeZone);
  return `${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}`;
}

export function isWorking(epoch: number, zone: PlannerZone) {
  const local = zonedTime(epoch, zone.timeZone);
  const minute = local.hour * 60 + local.minute;
  if (zone.workStart === zone.workEnd) return true;
  return zone.workStart < zone.workEnd
    ? minute >= zone.workStart && minute < zone.workEnd
    : minute >= zone.workStart || minute < zone.workEnd;
}

// Every slot represents [start, end). Re-evaluate each instant in the IANA zone:
// adding a fixed UTC offset would be wrong on daylight-saving transition days.
export function availability(dayStart: number, minutes: number, zone: PlannerZone) {
  return Array.from({ length: minutes / STEP }, (_, i) =>
    isWorking(dayStart + i * STEP * MINUTE, zone),
  );
}

export function commonAvailability(rows: boolean[][]): boolean[] {
  if (!rows.length) return [];
  return rows[0].map((_, i) => rows.every((row) => row[i]));
}

export function availabilityWindows(slots: boolean[]): TimeWindow[] {
  const windows: TimeWindow[] = [];
  for (let i = 0; i < slots.length; i++) {
    if (!slots[i]) continue;
    const start = i * STEP;
    while (slots[i + 1]) i++;
    windows.push({ start, end: (i + 1) * STEP });
  }
  return windows;
}

export function fitsWindow(slots: boolean[], start: number, duration: number) {
  const from = start / STEP;
  const to = (start + duration) / STEP;
  return from >= 0 && to <= slots.length && to > from && slots.slice(from, to).every(Boolean);
}

export function clampStart(start: number, duration: number, dayMinutes: number) {
  return Math.max(0, Math.min(dayMinutes - duration, Math.round(start / STEP) * STEP));
}

export function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return [hours ? `${hours}h` : "", remainder ? `${remainder}m` : ""].filter(Boolean).join(" ");
}

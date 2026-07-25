declare const timeZoneIdBrand: unique symbol;

export type TimeZoneId = string & { readonly [timeZoneIdBrand]: true };

export interface TimeZoneOption {
  id: TimeZoneId;
  region: string;
  location: string;
}

interface ClockFormatters {
  date: Intl.DateTimeFormat;
  time: Intl.DateTimeFormat;
  timeZoneName: Intl.DateTimeFormat;
}

const supportedTimeZoneIds = Intl.supportedValuesOf("timeZone");
const supportedTimeZoneIdSet = new Set(supportedTimeZoneIds);

export function toTimeZoneId(value: string): TimeZoneId {
  if (!supportedTimeZoneIdSet.has(value)) {
    throw new RangeError(`Unsupported time zone: ${value}`);
  }

  return value as TimeZoneId;
}

function createTimeZoneOption(id: TimeZoneId): TimeZoneOption {
  const [region, ...locationParts] = id.split("/");

  return {
    id,
    region: region || id,
    location: (locationParts.length > 0 ? locationParts : [id]).join(" / ").replaceAll("_", " "),
  };
}

export const TIME_ZONES = supportedTimeZoneIds.map((id) => createTimeZoneOption(toTimeZoneId(id)));

const timeZonesById = new Map(TIME_ZONES.map((timeZone) => [timeZone.id, timeZone]));
const formattersByTimeZone = new Map<string, ClockFormatters>();

export function getTimeZoneOption(id: TimeZoneId): TimeZoneOption {
  const timeZone = timeZonesById.get(id);
  if (!timeZone) throw new RangeError(`Unsupported time zone: ${id}`);
  return timeZone;
}

export function getClockFormatters(timeZone: TimeZoneId): ClockFormatters {
  const existingFormatters = formattersByTimeZone.get(timeZone);
  if (existingFormatters) return existingFormatters;

  const formatters = {
    date: new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      timeZone,
    }),
    time: new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false,
      timeZone,
    }),
    timeZoneName: new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "short",
    }),
  } satisfies ClockFormatters;

  formattersByTimeZone.set(timeZone, formatters);
  return formatters;
}

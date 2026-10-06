import {
  memo,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { Temporal } from "@js-temporal/polyfill";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  CopyIcon,
  SlidersHorizontalIcon,
} from "@phosphor-icons/react";
import { useClockStore } from "../../clock-store";
import { getTimeZoneOption } from "../../time-zones";
import { Button } from "../ui/button";
import { TimeDial } from "./time-dial";
import {
  availability,
  availabilityWindows,
  clampStart,
  clockTime,
  commonAvailability,
  durationLabel,
  fitsWindow,
  MINUTE,
  referenceDay,
  STEP,
  zonedTime,
  type PlannerZone,
} from "../../lib/planner-time";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

export interface TimezonePlannerProps {
  zones: { id: string; timeZone: string; name: string }[];
}

const HOUR_OPTIONS = Array.from({ length: 96 }, (_, i) => ({
  value: i * STEP,
  label: `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * STEP).padStart(2, "0")}`,
}));

function PlannerSelect({
  value,
  items,
  name,
  label,
  onValueChange,
}: {
  value: string | number;
  items: { value: string | number; label: string }[];
  name: string;
  label: string;
  onValueChange: (value: string) => void;
}) {
  const options = items.map((item) => ({ ...item, value: String(item.value) }));
  return (
    <Select
      name={name}
      items={options}
      value={String(value)}
      onValueChange={(next) => {
        if (next !== null) onValueChange(next);
      }}
    >
      <SelectTrigger aria-label={label} className="w-full min-w-0 text-foreground sm:max-w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function TimezonePlanner({ zones }: TimezonePlannerProps) {
  const titleId = useId();
  const timelineRef = useRef<HTMLDivElement>(null);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [homeId, setHomeId] = useState(zones[0]?.id ?? "");
  const active = useMemo(
    () => zones.filter((zone) => !excluded.includes(zone.id)),
    [zones, excluded],
  );
  const home = active.find((zone) => zone.id === homeId) ?? active[0];
  const homeZone = home?.timeZone ?? "UTC";
  const [date, setDate] = useState(() =>
    Temporal.Now.zonedDateTimeISO(homeZone).toPlainDate().toString(),
  );
  const [hours, setHours] = useState<Record<string, { workStart: number; workEnd: number }>>({});
  const [editHours, setEditHours] = useState(false);
  const [selection, setSelection] = useState({ start: 12 * 60, duration: 60 });
  const [copyState, setCopyState] = useState("");
  const day = useMemo(() => referenceDay(date, homeZone), [date, homeZone]);
  const duration = selection.duration;
  const start = clampStart(selection.start, duration, day.minutes);
  const epoch = day.start + start * MINUTE;
  const endEpoch = epoch + duration * MINUTE;
  const plannerZones: PlannerZone[] = useMemo(
    () =>
      active.map((zone) => ({
        ...zone,
        ...(hours[zone.id] ?? { workStart: 540, workEnd: 1080 }),
      })),
    [active, hours],
  );
  const rows = useMemo(
    () => plannerZones.map((zone) => availability(day.start, day.minutes, zone)),
    [plannerZones, day],
  );
  const common = useMemo(() => commonAvailability(rows), [rows]);
  const windows = useMemo(() => availabilityWindows(common), [common]);
  const tracks = useMemo(() => rows.map(availabilityWindows), [rows]);
  const fittingWindows = windows.filter((window) => window.end - window.start >= duration);
  const availableCount = rows.filter((row) => fitsWindow(row, start, duration)).length;
  const allAvailable = active.length > 0 && availableCount === active.length;
  const homeKey = home?.id;

  const revealMeetingOnResize = useEffectEvent(() => {
    const viewport = timelineRef.current;
    const meeting = viewport?.querySelector<HTMLElement>("[data-meeting-window]");
    const label = viewport?.querySelector<HTMLElement>("[data-timeline-label]");
    if (!viewport || !meeting || !label) return;
    const meetingBox = meeting.getBoundingClientRect();
    const labelWidth = label.getBoundingClientRect().width + 16;
    const left = meetingBox.left - viewport.getBoundingClientRect().left + viewport.scrollLeft;
    // Keep the selection in view when a narrow screen exposes only part of the day.
    viewport.scrollLeft =
      left - labelWidth - (viewport.clientWidth - labelWidth - meetingBox.width) / 2;
  });

  useEffect(() => {
    const viewport = timelineRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => revealMeetingOnResize());
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [homeKey]);

  function changeHome(id: string) {
    const nextHome = zones.find((zone) => zone.id === id);
    if (!nextHome) return;
    const nextDate = zonedTime(epoch, nextHome.timeZone).toPlainDate().toString();
    const nextDay = referenceDay(nextDate, nextHome.timeZone);
    setHomeId(id);
    setDate(nextDate);
    setSelection({
      start: clampStart((epoch - nextDay.start) / MINUTE, duration, nextDay.minutes),
      duration,
    });
    setCopyState("");
  }

  function changeStart(value: number) {
    setSelection({ start: clampStart(value, duration, day.minutes), duration });
    setCopyState("");
  }

  function changeStartTime(value: string) {
    if (!value) return;
    const time = Temporal.PlainTime.from(value);
    const next = zonedTime(epoch, homeZone).with({
      hour: time.hour,
      minute: time.minute,
      second: 0,
      millisecond: 0,
      microsecond: 0,
      nanosecond: 0,
    });
    changeStart((next.epochMilliseconds - day.start) / MINUTE);
  }

  function changeDate(value: string) {
    if (!value) return;
    try {
      const parsed = Temporal.PlainDate.from(value);
      if (parsed.year < 1900 || parsed.year > 2100) return;
      setDate(value);
      setCopyState("");
    } catch {
      /* Native date inputs can emit incomplete values while typing. */
    }
  }

  function moveDate(days: number) {
    changeDate(Temporal.PlainDate.from(date).add({ days }).toString());
  }

  async function copyMeeting() {
    const text = [
      `Meeting · ${durationLabel(duration)}`,
      ...plannerZones.map((zone) => {
        const local = zonedTime(epoch, zone.timeZone);
        const end = zonedTime(endEpoch, zone.timeZone);
        const endDate = end.toPlainDate().equals(local.toPlainDate())
          ? ""
          : `${end.toPlainDate().toString()} `;
        const offsets =
          local.offset === end.offset
            ? `UTC${local.offset}`
            : `UTC${local.offset} → UTC${end.offset}`;
        return `${zone.name}: ${local.toPlainDate().toString()} ${clockTime(epoch, zone.timeZone)} – ${endDate}${clockTime(endEpoch, zone.timeZone)} (${offsets}; ${zone.timeZone})`;
      }),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("Meeting times copied");
    } catch {
      setCopyState("Clipboard unavailable. Select and copy the times below.");
    }
  }

  return (
    <section className="mt-8 font-mono tabular-nums" aria-labelledby={titleId} data-meeting-planner>
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle>
              <h2 id={titleId}>Meeting planner</h2>
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Compare working hours across your timezones.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => setEditHours(!editHours)}
            aria-pressed={editHours}
            className="shrink-0"
          >
            <SlidersHorizontalIcon aria-hidden="true" /> Working hours
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {zones.length === 0 ? (
            <div className="py-4 text-sm text-muted-foreground">
              Add a timezone with the + button above to start planning.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Timezones to include">
                {zones.map((zone) => (
                  <label
                    key={zone.id}
                    className="flex min-h-8 cursor-pointer items-center gap-2 text-sm wrap-anywhere hover:text-muted-foreground"
                  >
                    <input
                      type="checkbox"
                      className="size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      name={`include-${zone.id}`}
                      checked={!excluded.includes(zone.id)}
                      onChange={(event) => {
                        if (event.target.checked && !home) setHomeId(zone.id);
                        if (!event.target.checked && home?.id === zone.id) {
                          const nextHome = active.find((candidate) => candidate.id !== zone.id);
                          if (nextHome) changeHome(nextHome.id);
                          else setHomeId("");
                        }
                        setExcluded(
                          event.target.checked
                            ? excluded.filter((id) => id !== zone.id)
                            : [...excluded, zone.id],
                        );
                      }}
                    />
                    {zone.name}
                  </label>
                ))}
              </div>

              {!home ? (
                <div className="py-4 text-sm text-muted-foreground">
                  Select at least one timezone to find available times.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 items-end gap-4 sm:flex sm:flex-wrap">
                    <div className="col-span-2 flex items-center justify-between gap-1 sm:mr-auto sm:justify-start">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Previous day"
                        onClick={() => moveDate(-1)}
                      >
                        <ArrowLeftIcon aria-hidden="true" />
                      </Button>
                      <Input
                        className="w-[150px] dark:scheme-dark"
                        type="date"
                        name="meeting-date"
                        autoComplete="off"
                        aria-label="Meeting date"
                        value={date}
                        min="1900-01-01"
                        max="2100-12-31"
                        onChange={(event) => changeDate(event.target.value)}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Next day"
                        onClick={() => moveDate(1)}
                      >
                        <ArrowRightIcon aria-hidden="true" />
                      </Button>
                    </div>
                    <label className="flex min-w-0 flex-col gap-2 text-xs text-muted-foreground">
                      Start
                      <Input
                        className="w-full text-foreground sm:w-32 dark:scheme-dark"
                        type="time"
                        name="meeting-start"
                        autoComplete="off"
                        aria-label="Meeting start time"
                        step={STEP * 60}
                        value={clockTime(epoch, homeZone)}
                        onChange={(event) => changeStartTime(event.target.value)}
                      />
                    </label>
                    <label className="flex min-w-0 flex-col gap-2 text-xs text-muted-foreground">
                      Duration
                      <PlannerSelect
                        name="meeting-duration"
                        label="Meeting duration"
                        value={duration}
                        items={Array.from({ length: 16 }, (_, i) => {
                          const value = (i + 1) * STEP;
                          return { value, label: durationLabel(value) };
                        })}
                        onValueChange={(value) => {
                          const next = Number(value);
                          setSelection({
                            start: clampStart(start, next, day.minutes),
                            duration: next,
                          });
                        }}
                      />
                    </label>
                    <label className="col-span-2 flex min-w-0 flex-col gap-2 text-xs text-muted-foreground sm:col-span-1">
                      Timezone
                      <PlannerSelect
                        name="reference-timezone"
                        label="Reference timezone"
                        value={home.id}
                        items={active.map((zone) => ({ value: zone.id, label: zone.name }))}
                        onValueChange={changeHome}
                      />
                    </label>
                  </div>

                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="text-sm font-medium">Working hours</h3>
                      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-2">
                          <i
                            className="size-2.5 border border-foreground/10 bg-foreground/10"
                            aria-hidden="true"
                          />
                          Individual
                        </span>
                        <span className="flex items-center gap-2">
                          <i
                            className="size-2.5 border border-foreground/20 bg-foreground/20"
                            aria-hidden="true"
                          />
                          Shared
                        </span>
                        <span className="flex items-center gap-2">
                          <i className="size-2.5 border bg-muted/30" aria-hidden="true" />
                          Off hours
                        </span>
                      </div>
                    </div>
                    <div
                      className="-mx-1 overflow-x-auto overscroll-x-contain p-1 pb-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      ref={timelineRef}
                      tabIndex={0}
                      role="region"
                      aria-label="Working hours timeline"
                    >
                      <div
                        className="min-w-[760px]"
                        style={
                          {
                            "--hour-columns": `repeat(${Math.floor(day.minutes / 60)}, minmax(0, 1fr))${day.minutes % 60 ? ` minmax(0, ${(day.minutes % 60) / 60}fr)` : ""}`,
                          } as CSSProperties
                        }
                      >
                        <div className="grid grid-cols-[108px_minmax(0,1fr)] gap-4 pb-2 text-xs text-muted-foreground sm:grid-cols-[145px_minmax(0,1fr)]">
                          <span className="sticky left-0 z-10 truncate bg-card sm:static">
                            {home.name}
                          </span>
                          <div className="grid grid-cols-(--hour-columns) [&>span]:pl-1">
                            {Array.from({ length: Math.ceil(day.minutes / 60) }, (_, i) => (
                              <span
                                key={i}
                                title={zonedTime(day.start + i * 60 * MINUTE, homeZone).toString()}
                              >
                                {clockTime(day.start + i * 60 * MINUTE, homeZone).slice(0, 2)}
                              </span>
                            ))}
                          </div>
                        </div>
                        {plannerZones.map((zone, i) => (
                          <TimelineRow
                            key={zone.id}
                            zone={zone}
                            slots={rows[i]}
                            common={common}
                            dayStart={day.start}
                            dayMinutes={day.minutes}
                            start={start}
                            duration={duration}
                            onChange={setSelection}
                          />
                        ))}
                      </div>
                    </div>
                    <p className="text-pretty text-xs leading-relaxed text-muted-foreground">
                      Select a time or drag the outlined meeting. Use its edges to change duration.{" "}
                      {day.minutes !== 1440 &&
                        `${day.minutes / 60}-hour day in ${home.name} due to a clock change. `}
                    </p>
                  </div>

                  <footer className="flex flex-wrap items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div>
                        <strong className="text-sm font-medium">
                          {fittingWindows.length ? "Shared working hours" : "No shared window"}
                        </strong>
                        <p className="mt-1 max-w-[65ch] text-xs leading-relaxed text-muted-foreground">
                          {fittingWindows.length
                            ? `${durationLabel(windows.reduce((sum, window) => sum + window.end - window.start, 0))} available in ${home.name}. Select a window to schedule your meeting.`
                            : `No ${durationLabel(duration)} meeting fits everyone’s hours. Try a shorter duration or adjust working hours.`}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {fittingWindows.map((window) => (
                        <Button
                          variant="outline"
                          key={window.start}
                          title={`Schedule ${durationLabel(duration)} at the start of this window`}
                          aria-label={`Schedule ${durationLabel(duration)} at ${clockTime(day.start + window.start * MINUTE, homeZone)} in ${home.name}`}
                          onClick={() => changeStart(window.start)}
                        >
                          {clockTime(day.start + window.start * MINUTE, homeZone)}–
                          {clockTime(day.start + window.end * MINUTE, homeZone)}
                        </Button>
                      ))}
                    </div>
                  </footer>

                  <div className="grid items-start gap-6 border-t pt-6 lg:grid-cols-[minmax(0,1fr)_230px]">
                    <div className="min-w-0 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="text-sm font-medium">Meeting times</h3>
                        <span
                          className={`inline-flex items-center gap-2 text-xs ${allAvailable ? "text-muted-foreground" : "text-destructive"}`}
                          aria-live="polite"
                        >
                          {allAvailable ? <CheckIcon size={16} aria-hidden="true" /> : null}
                          {allAvailable
                            ? "Within everyone’s hours"
                            : `${availableCount} of ${active.length} within working hours`}
                        </span>
                      </div>
                      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))] gap-4">
                        {plannerZones.map((zone, index) => {
                          const local = zonedTime(epoch, zone.timeZone);
                          const end = zonedTime(endEpoch, zone.timeZone);
                          const dateDelta = Temporal.PlainDate.from(date).until(
                            local.toPlainDate(),
                          ).days;
                          const endDelta = local.toPlainDate().until(end.toPlainDate()).days;
                          const available = fitsWindow(rows[index], start, duration);
                          return (
                            <li key={zone.id}>
                              <Card className="h-full">
                                <CardHeader>
                                  <CardTitle>
                                    <button
                                      className="inline-flex max-w-full flex-wrap items-center gap-2 text-left wrap-anywhere hover:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                                      aria-pressed={home.id === zone.id}
                                      onClick={() => changeHome(zone.id)}
                                      title="Use as reference timezone"
                                    >
                                      {zone.name}
                                      {home.id === zone.id && (
                                        <span className="text-xs font-normal text-muted-foreground">
                                          Reference
                                        </span>
                                      )}
                                    </button>
                                  </CardTitle>
                                  <p className="text-muted-foreground">
                                    UTC{local.offset}
                                    {local.offset !== end.offset && ` → ${end.offset}`}
                                  </p>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                  <div>
                                    <div className="text-muted-foreground">
                                      {local
                                        .toPlainDate()
                                        .toLocaleString("en", { month: "short", day: "numeric" })}
                                      {dateDelta !== 0
                                        ? ` · ${dateDelta > 0 ? "+" : ""}${dateDelta}d`
                                        : ""}
                                    </div>
                                    <div className="flex flex-wrap items-baseline gap-x-2 font-mono">
                                      <span className="text-3xl">
                                        {clockTime(epoch, zone.timeZone)}
                                      </span>
                                      <span className="text-base text-muted-foreground">
                                        – {clockTime(endEpoch, zone.timeZone)}
                                        {endDelta !== 0 && (
                                          <sup className="ml-1 text-xs">+{endDelta}d</sup>
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                  <p
                                    className={
                                      available ? "text-muted-foreground" : "text-destructive"
                                    }
                                  >
                                    {available ? "Working hours" : "Outside working hours"}
                                  </p>
                                  {editHours && (
                                    <div className="flex w-full flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                      <span>Local hours</span>
                                      {(["workStart", "workEnd"] as const).map((key) => (
                                        <label key={key}>
                                          <span className="sr-only">
                                            {zone.name} working{" "}
                                            {key === "workStart" ? "start" : "end"}
                                          </span>
                                          <PlannerSelect
                                            name={`${zone.id}-${key}`}
                                            label={`${zone.name} working ${key === "workStart" ? "start" : "end"}`}
                                            value={zone[key]}
                                            items={HOUR_OPTIONS}
                                            onValueChange={(value) =>
                                              setHours({
                                                ...hours,
                                                [zone.id]: {
                                                  workStart: zone.workStart,
                                                  workEnd: zone.workEnd,
                                                  [key]: Number(value),
                                                },
                                              })
                                            }
                                          />
                                        </label>
                                      ))}
                                      {zone.workStart >= zone.workEnd && (
                                        <small>
                                          {zone.workStart === zone.workEnd
                                            ? "24 hours"
                                            : "Overnight"}
                                        </small>
                                      )}
                                    </div>
                                  )}
                                </CardContent>
                              </Card>
                            </li>
                          );
                        })}
                      </ul>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="text-xs leading-relaxed text-muted-foreground">
                          Working hours repeat daily.
                        </span>
                        <Button variant="ghost" size="sm" onClick={copyMeeting}>
                          <CopyIcon aria-hidden="true" /> Copy times
                        </Button>
                      </div>
                      {copyState && (
                        <p className="text-xs leading-relaxed text-muted-foreground" role="status">
                          {copyState}
                        </p>
                      )}
                    </div>
                    <TimeDial
                      value={start}
                      duration={duration}
                      dayStart={day.start}
                      dayMinutes={day.minutes}
                      timeZone={homeZone}
                      name={home.name}
                      windows={windows}
                      tracks={tracks}
                      onChange={changeStart}
                    />
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

interface TimelineRowProps {
  zone: PlannerZone;
  slots: boolean[];
  common: boolean[];
  dayStart: number;
  dayMinutes: number;
  start: number;
  duration: number;
  onChange: (selection: { start: number; duration: number }) => void;
}

function TimelineRow({
  zone,
  slots,
  common,
  dayStart,
  dayMinutes,
  start,
  duration,
  onChange,
}: TimelineRowProps) {
  const drag = useRef<{
    x: number;
    start: number;
    duration: number;
    mode: string;
    width: number;
  } | null>(null);
  const available = fitsWindow(slots, start, duration);

  function beginDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const mode =
      (event.target as HTMLElement).closest<HTMLElement>("[data-drag]")?.dataset.drag ?? "jump";
    const nextStart =
      mode === "jump"
        ? clampStart(((event.clientX - rect.left) / rect.width) * dayMinutes, duration, dayMinutes)
        : start;
    if (mode === "jump") onChange({ start: nextStart, duration });
    drag.current = { x: event.clientX, start: nextStart, duration, mode, width: rect.width };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function updateDrag(event: PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state) return;
    const delta =
      Math.round((((event.clientX - state.x) / state.width) * dayMinutes) / STEP) * STEP;
    resize(state.mode, delta, state.start, state.duration);
  }

  function resize(mode: string, delta: number, initialStart = start, initialDuration = duration) {
    if (mode === "end") {
      onChange({
        start: initialStart,
        duration: Math.max(STEP, Math.min(240, dayMinutes - initialStart, initialDuration + delta)),
      });
    } else if (mode === "start") {
      const end = initialStart + initialDuration;
      const nextStart = Math.max(0, end - 240, Math.min(end - STEP, initialStart + delta));
      onChange({ start: nextStart, duration: end - nextStart });
    } else {
      onChange({
        start: clampStart(initialStart + delta, initialDuration, dayMinutes),
        duration: initialDuration,
      });
    }
  }

  return (
    <div className="mb-3 grid grid-cols-[108px_minmax(0,1fr)] items-center gap-4 sm:grid-cols-[145px_minmax(0,1fr)]">
      <span
        data-timeline-label
        className="sticky left-0 z-10 truncate bg-card py-4 text-sm sm:static"
        title={zone.name}
      >
        {zone.name}
      </span>
      <div
        className="relative h-12 touch-none cursor-crosshair select-none"
        onPointerDown={beginDrag}
        onPointerMove={updateDrag}
        onPointerUp={(event) => {
          drag.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
      >
        <div className="flex h-full overflow-hidden bg-muted/30" aria-hidden="true">
          {slots.map((slot, index) => (
            <span
              key={index}
              className={`flex-1 ${common[index] ? "bg-foreground/20" : slot ? "bg-foreground/10" : ""}`}
            />
          ))}
        </div>
        <div
          className="pointer-events-none absolute inset-0 grid grid-cols-(--hour-columns) [&>span]:border-l [&>span]:border-foreground/10 [&>span]:pt-4 [&>span]:pl-1 [&>span]:text-xs [&>span]:text-muted-foreground"
          aria-hidden="true"
        >
          {Array.from({ length: Math.ceil(dayMinutes / 60) }, (_, i) => (
            <span key={i}>
              {clockTime(dayStart + i * 60 * MINUTE, zone.timeZone).replace(":00", "")}
            </span>
          ))}
        </div>
        <div
          data-meeting-window
          className={`pointer-events-none absolute -top-1 -bottom-1 border-2 ${available ? "border-foreground bg-foreground/5 text-foreground" : "border-destructive bg-destructive/5 text-destructive"}`}
          style={{
            left: `${(start / dayMinutes) * 100}%`,
            width: `${(duration / dayMinutes) * 100}%`,
          }}
        >
          <div
            className="pointer-events-auto absolute inset-0 cursor-grab active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            data-drag="move"
            role="slider"
            tabIndex={0}
            aria-label={`Meeting start on ${zone.name} timeline`}
            aria-valuemin={0}
            aria-valuemax={dayMinutes - duration}
            aria-valuenow={start}
            aria-valuetext={clockTime(dayStart + start * MINUTE, zone.timeZone)}
            onKeyDown={(event) => {
              if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) {
                event.preventDefault();
                onChange({
                  start:
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? dayMinutes - duration
                        : clampStart(
                            start + (event.key === "ArrowRight" ? STEP : -STEP),
                            duration,
                            dayMinutes,
                          ),
                  duration,
                });
              }
            }}
          />
          {(["start", "end"] as const).map((edge) => (
            <button
              key={edge}
              type="button"
              className={`pointer-events-auto absolute inset-y-0 z-10 w-3 cursor-ew-resize focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring after:absolute after:inset-y-4 after:left-1 after:w-0.5 after:bg-current ${edge === "start" ? "-left-1.5" : "-right-1.5"}`}
              data-drag={edge}
              aria-label={`Resize meeting ${edge} on ${zone.name} timeline`}
              title="Drag or use arrow keys to resize by 15 minutes"
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                  event.preventDefault();
                  resize(edge, event.key === "ArrowRight" ? STEP : -STEP);
                }
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// The live clock ticks every second; the planner only subscribes to zone changes.
export const MeetingPlanner = memo(function MeetingPlanner() {
  const clocks = useClockStore((state) => state.clocks);
  const zones = useMemo(
    () => [
      ...new Map(
        clocks.map((clock) => [
          clock.timeZone,
          {
            id: clock.timeZone,
            timeZone: clock.timeZone,
            name: getTimeZoneOption(clock.timeZone).location,
          },
        ]),
      ).values(),
    ],
    [clocks],
  );
  return <TimezonePlanner zones={zones} />;
});

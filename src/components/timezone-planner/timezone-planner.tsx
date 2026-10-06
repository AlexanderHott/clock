import {
  memo,
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
  GlobeIcon,
  SlidersHorizontalIcon,
  SparkleIcon,
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
import "./timezone-planner.css";

export interface TimezonePlannerProps {
  zones: { id: string; timeZone: string; name: string }[];
}

const HOUR_OPTIONS = Array.from({ length: 96 }, (_, i) => ({
  value: i * STEP,
  label: `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * STEP).padStart(2, "0")}`,
}));

export function TimezonePlanner({ zones }: TimezonePlannerProps) {
  const titleId = useId();
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
    <section className="timezone-planner" aria-labelledby={titleId}>
      <header className="tp-header">
        <div>
          <p className="tp-eyebrow">
            <GlobeIcon size={14} /> ACROSS TIMEZONES
          </p>
          <h2 id={titleId}>
            Find common time<span className="tp-title-dot">.</span>
          </h2>
          <p className="tp-subtitle">Different places. A little time together.</p>
        </div>
        <Button
          variant="outline"
          onClick={() => setEditHours(!editHours)}
          aria-pressed={editHours}
          className="tp-button"
        >
          <SlidersHorizontalIcon /> Working hours
        </Button>
      </header>

      {zones.length === 0 ? (
        <div className="tp-empty">Add a timezone with the + button above to start planning.</div>
      ) : (
        <>
          <div className="tp-zone-toggles" aria-label="Timezones to include">
            {zones.map((zone) => (
              <label key={zone.id} className="tp-zone-toggle">
                <input
                  type="checkbox"
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
            <span className="tp-subtle">Using your clocks above</span>
          </div>

          {!home ? (
            <div className="tp-empty">Select at least one timezone to find available times.</div>
          ) : (
            <>
              <div className="tp-toolbar">
                <div className="tp-date-control">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Previous day"
                    onClick={() => moveDate(-1)}
                  >
                    <ArrowLeftIcon />
                  </Button>
                  <input
                    type="date"
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
                    <ArrowRightIcon />
                  </Button>
                </div>
                <label className="tp-control">
                  Reference
                  <select
                    aria-label="Reference timezone"
                    value={home.id}
                    onChange={(event) => changeHome(event.target.value)}
                  >
                    {active.map((zone) => (
                      <option key={zone.id} value={zone.id}>
                        {zone.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="tp-control">
                  Duration
                  <select
                    aria-label="Meeting duration"
                    value={duration}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      setSelection({ start: clampStart(start, next, day.minutes), duration: next });
                    }}
                  >
                    {Array.from({ length: 16 }, (_, i) => (i + 1) * STEP).map((value) => (
                      <option key={value} value={value}>
                        {durationLabel(value)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="tp-main">
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
                <div className="tp-summary">
                  <div className="tp-selection-heading">
                    <span className="tp-eyebrow">YOUR MEETING WINDOW</span>
                    <span
                      className={`tp-status ${allAvailable ? "is-good" : ""}`}
                      aria-live="polite"
                    >
                      {allAvailable ? <CheckIcon size={13} /> : <span className="tp-status-dot" />}
                      {availableCount}/{active.length} available
                    </span>
                  </div>
                  <ul className="tp-city-list">
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
                          <div className="tp-city-info">
                            <span className={`tp-city-dot ${available ? "is-good" : ""}`} />
                            <div>
                              <button
                                className="tp-city-name"
                                aria-pressed={home.id === zone.id}
                                onClick={() => changeHome(zone.id)}
                                title="Use as reference timezone"
                              >
                                {zone.name}
                                {home.id === zone.id && <span className="tp-home-tag">REF</span>}
                              </button>
                              <p>
                                UTC{local.offset}
                                {local.offset !== end.offset && ` → ${end.offset}`} ·{" "}
                                {available ? "Within working hours" : "Outside working hours"}
                              </p>
                            </div>
                          </div>
                          <div className="tp-local-time">
                            <div>
                              {clockTime(epoch, zone.timeZone)} <span>–</span>{" "}
                              {clockTime(endEpoch, zone.timeZone)}
                              {endDelta !== 0 && <sup>+{endDelta}d</sup>}
                            </div>
                            <small>
                              {local
                                .toPlainDate()
                                .toLocaleString("en", { month: "short", day: "numeric" })}
                              {dateDelta !== 0 ? ` · ${dateDelta > 0 ? "+" : ""}${dateDelta}d` : ""}
                            </small>
                          </div>
                          {editHours && (
                            <div className="tp-hours-editor">
                              <span>Local hours</span>
                              {(["workStart", "workEnd"] as const).map((key) => (
                                <label key={key}>
                                  <span className="sr-only">
                                    {zone.name} working {key === "workStart" ? "start" : "end"}
                                  </span>
                                  <select
                                    value={zone[key]}
                                    onChange={(event) =>
                                      setHours({
                                        ...hours,
                                        [zone.id]: {
                                          workStart: zone.workStart,
                                          workEnd: zone.workEnd,
                                          [key]: Number(event.target.value),
                                        },
                                      })
                                    }
                                  >
                                    {HOUR_OPTIONS.map((option) => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              ))}
                              {zone.workStart >= zone.workEnd && (
                                <small>
                                  {zone.workStart === zone.workEnd ? "24 hours" : "Overnight"}
                                </small>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  <div className="tp-summary-footer">
                    <span className="tp-subtle">Local working hours · every day</span>
                    <Button variant="ghost" size="sm" onClick={copyMeeting}>
                      <CopyIcon /> Copy times
                    </Button>
                  </div>
                  {copyState && (
                    <p className="tp-subtle" role="status">
                      {copyState}
                    </p>
                  )}
                </div>
              </div>

              <div className="tp-timeline-section">
                <div className="tp-timeline-heading">
                  <span className="tp-eyebrow">THE DAY AT A GLANCE</span>
                  <div className="tp-legend">
                    <span>
                      <i className="is-work" />
                      Working
                    </span>
                    <span>
                      <i className="is-common" />
                      Everyone
                    </span>
                    <span>
                      <i />
                      Off hours
                    </span>
                  </div>
                </div>
                <div className="tp-timeline-scroll">
                  <div
                    className="tp-timeline"
                    style={
                      {
                        "--tp-columns": `repeat(${Math.floor(day.minutes / 60)}, minmax(0, 1fr))${day.minutes % 60 ? ` minmax(0, ${(day.minutes % 60) / 60}fr)` : ""}`,
                      } as CSSProperties
                    }
                  >
                    <div className="tp-ruler">
                      <span>{home.name}</span>
                      <div>
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
                <p className="tp-timeline-hint">
                  Click an hour, drag the window, or resize its edges.{" "}
                  {day.minutes !== 1440 &&
                    `${day.minutes / 60}-hour day in ${home.name} due to a clock change. `}
                  All times use the selected date’s timezone rules.
                </p>
              </div>

              <footer className="tp-overlap-footer">
                <div className="tp-overlap-label">
                  <SparkleIcon size={18} />
                  <div>
                    <strong>{fittingWindows.length ? "Common ground" : "No shared window"}</strong>
                    <p>
                      {fittingWindows.length
                        ? `${durationLabel(windows.reduce((sum, window) => sum + window.end - window.start, 0))} of shared working hours · ${home.name}`
                        : `No ${durationLabel(duration)} meeting fits everyone’s hours. Try a shorter duration or adjust working hours.`}
                    </p>
                  </div>
                </div>
                <div className="tp-suggestions">
                  {fittingWindows.map((window) => (
                    <button
                      key={window.start}
                      className="tp-suggestion"
                      title={`Schedule ${durationLabel(duration)} at the start of this window`}
                      onClick={() => changeStart(window.start)}
                    >
                      {clockTime(day.start + window.start * MINUTE, homeZone)}–
                      {clockTime(day.start + window.end * MINUTE, homeZone)}{" "}
                      <ArrowRightIcon size={13} />
                    </button>
                  ))}
                </div>
              </footer>
            </>
          )}
        </>
      )}
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
    <div className="tp-timeline-row">
      <span className="tp-row-name" title={zone.name}>
        {zone.name}
      </span>
      <div
        className="tp-row-track"
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
        <div className="tp-slot-colors" aria-hidden="true">
          {slots.map((slot, index) => (
            <span key={index} className={common[index] ? "is-common" : slot ? "is-work" : ""} />
          ))}
        </div>
        <div className="tp-hour-labels" aria-hidden="true">
          {Array.from({ length: Math.ceil(dayMinutes / 60) }, (_, i) => (
            <span key={i}>
              {clockTime(dayStart + i * 60 * MINUTE, zone.timeZone).replace(":00", "")}
            </span>
          ))}
        </div>
        <div
          className={`tp-meeting-window ${available ? "is-good" : ""}`}
          style={{
            left: `${(start / dayMinutes) * 100}%`,
            width: `${(duration / dayMinutes) * 100}%`,
          }}
        >
          <div
            className="tp-window-move"
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
              className={`tp-resize tp-resize-${edge}`}
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

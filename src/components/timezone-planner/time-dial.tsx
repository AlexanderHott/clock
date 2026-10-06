import { useId, type KeyboardEvent, type PointerEvent } from "react";
import { clockTime, durationLabel, STEP, MINUTE, type TimeWindow } from "../../lib/planner-time";

interface TimeDialProps {
  value: number;
  duration: number;
  dayStart: number;
  dayMinutes: number;
  timeZone: string;
  name: string;
  windows: TimeWindow[];
  tracks: TimeWindow[][];
  onChange: (value: number) => void;
}

function point(minute: number, total: number, radius: number) {
  const angle = (minute / total) * Math.PI * 2 + Math.PI / 2;
  return { x: 160 + Math.cos(angle) * radius, y: 160 + Math.sin(angle) * radius };
}

function arc(start: number, end: number, total: number, radius: number) {
  const a = point(start, total, radius);
  const b = point(Math.min(end, start + total - 0.01), total, radius);
  return `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${end - start > total / 2 ? 1 : 0} 1 ${b.x} ${b.y}`;
}

export function TimeDial({
  value,
  duration,
  dayStart,
  dayMinutes,
  timeZone,
  name,
  windows,
  tracks,
  onChange,
}: TimeDialProps) {
  const hintId = useId();
  const end = point(value + duration, dayMinutes, 119);
  const handle = point(value, dayMinutes, 119);
  const time = clockTime(dayStart + value * MINUTE, timeZone);

  function selectPoint(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left - rect.width / 2;
    const y = event.clientY - rect.top - rect.height / 2;
    if (Math.hypot(x, y) < rect.width * 0.22) return;
    const angle = (Math.atan2(y, x) - Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
    onChange(Math.round(((angle / (Math.PI * 2)) * dayMinutes) / STEP) * STEP);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const changes: Record<string, number> = {
      ArrowRight: STEP,
      ArrowUp: STEP,
      ArrowLeft: -STEP,
      ArrowDown: -STEP,
      PageUp: 60,
      PageDown: -60,
    };
    if (event.key === "Home" || event.key === "End" || event.key in changes) {
      event.preventDefault();
      onChange(
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? dayMinutes - duration
            : value + changes[event.key],
      );
    }
  }

  return (
    <div className="w-full max-w-60 justify-self-center lg:max-w-[230px]">
      <div
        className="relative touch-none cursor-grab rounded-full select-none active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        role="slider"
        tabIndex={0}
        aria-label={`Meeting start in ${name}`}
        aria-valuemin={0}
        aria-valuemax={dayMinutes - duration}
        aria-valuenow={value}
        aria-valuetext={`${time}, ${name}, ${durationLabel(duration)} meeting`}
        aria-describedby={hintId}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          selectPoint(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) selectPoint(event);
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
      >
        <svg className="block w-full" viewBox="0 0 320 320" aria-hidden="true">
          <circle cx="160" cy="160" r="156" className="fill-card stroke-border" />
          {Array.from({ length: dayMinutes / STEP }, (_, i) => {
            const a = point(i * STEP, dayMinutes, i % 4 === 0 ? 143 : 148);
            const b = point(i * STEP, dayMinutes, 151);
            return (
              <line
                key={i}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                className={
                  i % 4 === 0 ? "stroke-muted-foreground stroke-1" : "stroke-border stroke-1"
                }
              />
            );
          })}
          {[0, 1, 2, 3].map((i) => {
            const p = point((i * dayMinutes) / 4, dayMinutes, 134);
            return (
              <text
                key={i}
                x={p.x}
                y={p.y}
                className="fill-muted-foreground text-[10px]"
                dominantBaseline="central"
                textAnchor="middle"
              >
                {clockTime(dayStart + ((i * dayMinutes) / 4) * MINUTE, timeZone)}
              </text>
            );
          })}
          <circle cx="160" cy="160" r="119" className="fill-none stroke-muted stroke-[8]" />
          {windows.map((window) => (
            <path
              key={window.start}
              d={arc(window.start, window.end, dayMinutes, 119)}
              className="fill-none stroke-foreground/20 stroke-[8]"
            />
          ))}
          {tracks.slice(0, 5).map((windows, index) => (
            <g key={index}>
              <circle
                cx="160"
                cy="160"
                r={102 - index * 7}
                className="fill-none stroke-border stroke-1 [stroke-dasharray:2_4]"
              />
              {windows.map((window) => (
                <path
                  key={window.start}
                  d={arc(window.start, window.end, dayMinutes, 102 - index * 7)}
                  className="fill-none stroke-muted-foreground stroke-2"
                />
              ))}
            </g>
          ))}
          <path
            d={arc(value, value + duration, dayMinutes, 119)}
            className="fill-none stroke-foreground stroke-[8] [stroke-linecap:round]"
          />
          <line
            x1={point(value, dayMinutes, 66).x}
            y1={point(value, dayMinutes, 66).y}
            x2={handle.x}
            y2={handle.y}
            className="stroke-foreground stroke-1"
          />
          <circle cx={end.x} cy={end.y} r="4" className="fill-foreground" />
          <circle
            cx={handle.x}
            cy={handle.y}
            r="10"
            className="fill-foreground stroke-card stroke-[3]"
          />
          <circle cx={handle.x} cy={handle.y} r="3" className="fill-card" />
        </svg>
        <div
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
          aria-hidden="true"
        >
          <span className="text-xs text-muted-foreground">Start time</span>
          <strong className="text-3xl font-normal">{time}</strong>
          <span className="max-w-28 truncate text-xs">{name}</span>
          <small className="mt-1 text-xs text-muted-foreground">{durationLabel(duration)}</small>
        </div>
      </div>
      <p id={hintId} className="mt-3 text-center text-xs text-muted-foreground">
        Drag the dial or use arrow keys.
      </p>
    </div>
  );
}

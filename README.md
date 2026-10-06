# Clock

The clocks now include a meeting planner. Add cities with **Add timezone**, choose which to include, and drag the dial or the shared timeline window. Resize either edge to change the duration, or click a suggested overlap. **Working hours** edits each city's local availability; equal start/end means all day, and an end before the start means an overnight shift.

The reusable `TimezonePlanner` in `src/components/timezone-planner/timezone-planner.tsx` accepts `zones: { id, timeZone, name }[]`. `MeetingPlanner` connects it to the existing persisted clocks and deduplicates their IANA timezones. Planning preferences are kept for the current session.

### Interaction research

- [Arc's time dial](https://uiarc.dev/components/time-dial) uses a 24-hour rotary slider, quarter-hour snapping, a central reference-city readout, and local-time city markers against a working-hours band. Its public documentation describes fixed UTC offsets, keyboard stepping, and spring/flick motion; the source requires a Pro plan.
- [devl's timezone planner](https://www.devl.dev/c/calendars/timezone) aligns local hourly rows against one reference timezone, shares a draggable/resizable window between rows, and classifies the selected interval's suitability. Its “Find best” action can still return a compromise with someone asleep.

This is an original implementation based on those public interactions. The dial's inner rings show each city's work windows on the **same reference-day axis** (up to five rings; all selected cities still participate in overlap calculations). The outer green band shows shared availability. Dial, rows, duration, and readouts share one selection. Suggestions require the **entire duration** to fit everyone's working hours; no overlap is reported explicitly. No spring/inertia dependency is used.

`@js-temporal/polyfill` resolves each 15-minute slot in its IANA timezone for the selected date. The axis spans local midnight to the next local midnight, including 23-, 25-, and half-hour DST transition days. Meetings are constrained to that reference day; switching reference cities preserves the instant unless it must be clamped to keep the full meeting within the new day. Availability repeats daily and does not consult calendars, holidays, or weekends.

Keyboard: focus the dial and use arrows for 15 minutes, Page Up/Down for an hour, and Home/End for the day bounds. Timeline windows and resize handles also support arrow keys.

Validation: `pnpm build`, `pnpm lint`, and `pnpm exec vp test`. Tests cover full-duration overlap, DST transitions, fractional offsets, overnight hours, date-line conversion, and empty selections. If the pinned pnpm binary is unavailable on your platform, existing installations can run `./node_modules/.bin/tsc -b`, `./node_modules/.bin/vp build`, `./node_modules/.bin/vp lint`, and `./node_modules/.bin/vp test` directly.

## React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is enabled on this template. See [this documentation](https://react.dev/learn/react-compiler) for more information.

Note: This will impact Vite dev & build performances.

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

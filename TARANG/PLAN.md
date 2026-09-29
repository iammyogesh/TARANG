# TARANG Frontend Implementation Plan

## Goal
Build a complete, launch-ready frontend-only React SPA for TARANG: an AI-powered computer vision pipeline that analyzes underwater side-scan sonar imagery to detect, filter, and geotag man-made marine debris for ocean cleanup operations.

The product is an operator console, not a generic analytics template. Its primary user is a marine survey analyst / cleanup operations lead who needs to understand mission health, review sonar detections, validate or reject debris candidates, verify geotags, and export cleanup-ready evidence.

## Product scope

### Primary user workflow
1. Open Mission Control and see active mission context, pipeline health, review backlog, and progress.
2. Open the Review queue and focus on low-confidence or high-impact detections.
3. Inspect a side-scan sonar frame with detection overlays and model confidence.
4. Confirm, reject, or flag a detection, optionally add a note and category.
5. Verify the detection position on the nautical map and inspect nearby detections.
6. Export a geotagged evidence package for cleanup operations.

### Pages / routes
- `/` — Mission Control overview.
- `/review` — Review queue and sonar inspection workspace.
- `/missions` — Mission list with progress, vessel, area, and status.
- `/detections` — All detections with filters, confidence, category, and review state.
- `/map` — Geospatial view of confirmed detections and cleanup clusters.
- `/model` — Model and pipeline health, recent runs, threshold controls.
- `/reports` — Export history and evidence packs.
- `/settings` — Workspace, notification, appearance, and data preferences.

All routes are client-side views backed by realistic typed mock data. Navigation, filters, review actions, theme switching, and export affordances are real interactions. Data access is isolated so the future Python inference service and backend can replace the seed layer without redesigning the UI.

## Key features

### Mission Control
- Current mission header with vessel, area, and live status.
- KPI row: scans processed, debris confirmed, review queue, area surveyed.
- Mission progress and route summary.
- Review queue preview with priority and confidence.
- Model health snapshot.
- Recent activity timeline.

### Sonar review
- Queue filters for status, confidence, category, and mission.
- Side-scan sonar visualization with grid, noise texture, animated scanline, and detection overlays.
- Detection detail with confidence, class, dimensions, location, and timestamp.
- Confirm / reject / flag interactions with immediate state feedback.
- Notes and category controls.
- Selected item sync across queue, detail panel, and map.

### Geospatial operations
- Deterministic nautical grid map with contour lines, mission track, detection pins, and cluster emphasis.
- Selected detection coordinate readout and status.
- No external map credentials required for this frontend stage.

### Operational modules
- Missions, detections, model health, reports/export, and settings views.
- Search, filter, sort, and status affordances where useful.
- Model threshold visualization and recent pipeline runs.
- Export history with a ready-to-download state.
- Appearance, confidence threshold, and notification controls.

## Design direction: “Signal Tide”

- Editorial-technical marine operations console inspired by nautical charts, expedition logbooks, and instrumentation.
- Dark foundation: ink navy `#0b1723`, slate `#122433`, signal cyan `#67d7e4`, seafoam `#8fe0bf`, coral `#f18473`, warm sand `#e7ece5`.
- Light foundation: warm mist `#f4f5ef`, cream `#fbfbf7`, ink `#14212b`, deep ocean `#164a61`, cyan `#15879c`, coral `#d85d54`.
- Fixed compact left rail on desktop; bottom utility nav on small screens.
- Wide responsive 12-column canvas with hairline dividers, restrained radius, and strong typography.
- Serif editorial headings (Fraunces) paired with DM Sans UI/body and DM Mono for coordinates, timestamps, and confidence values.
- Avoid neon cyberpunk, generic gradients, glassmorphism, and over-rounded SaaS-card styling.
- TARANG symbol: two-wave mark with an offset debris diamond, used in the rail, header, and favicon.

### Motion and interaction
- 180–420ms transitions with a gentle cubic-bezier curve.
- Route content fade/slide transitions.
- KPI count-in on first view.
- Hover states raise controls subtly and tint borders.
- Sonar scanline and selection pulse communicate live analysis.
- Respect `prefers-reduced-motion` and disable looping motion/transforms when requested.

## Implementation approach

### Project structure
- `client/src/App.tsx`: route and theme provider wiring.
- `client/src/pages/Home.tsx`: shell, route-level layouts, and page composition.
- `client/src/data/tarang.ts`: typed seeded data and future API seam.
- `client/src/components/tarang/`: logo, shell, mission cards, sonar viewer, map, tables, controls.
- `client/src/index.css`: design tokens, typography, theme overrides, global motion.
- `client/public/manus-routes.json`: current route manifest.
- `app.config.ts`: project logo metadata.
- `public/` / favicon assets as needed.

Use the initialized React/Vite/Tailwind/framer-motion/lucide/recharts dependencies. Keep the current static-only configuration: no server, database, authentication, or external map integration yet.

## Deployment and serving

Use static SPA delivery with `pnpm build:static` to `dist/public`. Publish routing will use static SPA fallback for browser-managed routes and long-lived caching for hashed assets; HTML should remain revalidated by the platform. A future API can be introduced behind `/api/*` without changing the current client architecture.

## Verification

- Run `pnpm check` and fix actionable TypeScript diagnostics.
- Run `pnpm build:static` and confirm the production output succeeds.
- Start `pnpm dev:static` on the configured port.
- Request `/manus-routes.json` and confirm HTTP 200 JSON matching the current route set.
- Inspect source paths for route navigation, theme switching, queue actions, map synchronization, and export state.
- Run one independent read-only connection review after implementation because this project entered Plan Mode.

## Assumptions / risks

- Mock sonar imagery is generated with deterministic CSS/SVG texture; no external imagery assets are needed for the operator dashboard.
- Python model and backend integration are intentionally deferred; the UI exposes realistic integration seams but does not invent API contracts beyond typed domain objects.
- The current user requested the frontend now, so authentication, persistence, real uploads, and production map tiles are out of scope for this pass.


## Live telemetry and Python inference addendum (29 Sep 2026)

- Keep the frontend static and browser-rendered; connect dynamic data to externally hosted Python services through build-time `VITE_TARANG_*` variables.
- Add a typed inference client for multipart scan upload and a standard JSON response with normalized bounding boxes, confidence, geotags, depth, model version, and processing latency.
- Add a telemetry adapter that supports WebSocket, Server-Sent Events, and JSON polling, with an explicit simulated state when no telemetry URL is configured.
- Add live telemetry cards, signal history, bathymetry/depth profile, current tow depth, altitude, heading, speed, temperature, ping rate, and connection health to the Review Queue workspace.
- Do not claim model inference succeeded when the Python endpoint is unavailable; show a typed error state and the backend contract link instead.
- Validation: `pnpm check`, `pnpm build:static`, route manifest response, and source-level contract inspection.

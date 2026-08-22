# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **App/domain tags** — manual tagging of apps and websites as work (работа), neutral (нейтральное), or distracting (отвлечение). Three-dots dropdown menu on each app row and browser domain in Timeline. Tag badges displayed inline. Tags persist in DB (`app_tags` table, migration 004). New IPC channels: `tags:getAll`, `tags:set`, `tags:delete`. Preload exposes `window.api.tags`
- **AFK time display in Timeline** — shows total away-from-keyboard time per day below the app list. New IPC channel `activities:getAfkTime`. Preload exposes `window.api.activities.getAfkTime`
- **Tag distribution chart in Statistics** — pie chart showing time breakdown by tag (work/neutral/distracting/untagged) for the selected range. New IPC channel `stats:getTagStats`. Preload exposes `window.api.stats.getTagStats`

### Fixed
- **Accessibility permission spam** — `active-win` spawns a native binary using macOS Accessibility API every second in the poll loop. Without permission, macOS showed the system dialog on every call. Fix: check `systemPreferences.isTrustedAccessibilityClient()` before starting the poll loop; show the system prompt ONCE at startup; wait with check-only polling until the user grants permission; guard each `poll()` call
- **Race condition: real events created during AFK** — `poll()` checked `isAfk` at the top, but `await activeWin()` is async. During that await, AFK could start and close the current event. When `poll()` resumed, it created a new real event **during** AFK, causing overlapping time periods (e.g. 27h/day). Fix: re-check `isAfk` after `await activeWin()` returns. Migration `005` cleans up historical overlapping data (deletes phantom events, trims partial overlaps)
- Initial project setup: Electron + React + TypeScript + SQLite
- Project documentation: PRD, SDD, AGENTS.md, copilot-instructions
- Git repository initialized
- **Phase 1: Tracking engine core**
  - `DatabaseManager` — SQLite with WAL mode, auto-migrations, prepared statements
  - `TrackingEngine` — polls `active-win` every 1s, records activity events to DB
  - `AFKDetector` — detects idle (180s threshold), sleep, lock-screen via `powerMonitor`
  - IPC handlers — full contract: tracking, activities, categories, settings, CSV export
  - Preload bridge — typed `window.api` with `onActivityChanged` real-time callback
  - Renderer UI — Day Summary view with live activity indicator, app list with bar charts
  - DB migration `001_initial.sql` — events, categories, category_rules, settings tables
  - `formatDuration` utility for human-readable time display
- **Phase 2: Working prototype — Stats, Settings, Tray**
  - **Timezone fix** — `localDayBounds()` helper, all DB queries now use local day boundaries
  - **Stats implementations** — `getDailyStats()` (N-day trend with per-category breakdown), `getTopApps()` (period top apps)
  - **StatsView** — Recharts stacked bar chart (daily active time by category), pie chart (top apps), summary cards
  - **SettingsView** — autostart toggle (`app.setLoginItemSettings`), idle threshold slider, CSV export button
  - **Tray icon** — 22×22 template PNG clock face, `setTemplateImage(true)` for macOS dark/light adaptation
  - **Window behavior** — close button hides to tray (not quit), `isQuitting` flag for real exit
  - **Autostart** — `app.setLoginItemSettings({ openAtLogin })` toggled from Settings, applied at startup
- **Phase 3: Detailed tracking & app identity**
  - **App name** — `app.setName('CarpeDiem')` + `electron-builder.yml` productName/appId
  - **Self-tracking filter** — tracker skips its own window (`SELF_APP_NAMES` check), keeps last real activity as current
  - **URL extraction** — `active-win` `url` field now stored in events (browser tab URLs on macOS)
  - **Title parser** — `title-parser.ts`: per-app parsing (VS Code project, Figma file, browser domain extraction)
  - **Detailed DaySummary** — `getDaySummaryDetailed()`: per-app + per-window-title breakdown with `DetailedDaySummary` type
  - **Expandable timeline rows** — AppRow expands to show individual windows/tabs with per-title durations
  - **Current activity header** — shows `windowTitle` alongside app name (truncated)
  - **Drag region** — CSS drag region on header, `no-drag` on interactive elements
  - **Preload fix** — `.mjs` extension (ESM `type: module`), ErrorBoundary + `hasApi()` guard
  - `formatLocalDate()` and `formatShort()` helpers in renderer
  - `d3-scale`, `d3-shape`, `d3-array` added for Recharts compatibility with Vite
- **Phase 4: Daily Log view & UI polish**
  - **LogView** — new sidebar tab with chronological event log + visual timeline bar
  - **Visual timeline** — horizontal 00:00→24:00 bar, each event = colored block proportional to duration, hover for details
  - **Event list** — chronological list with start/end times, app name, window title, duration; AFK events dimmed
  - **Color per app** — deterministic hash → curated palette for visual distinction
  - **formatTime()** / **formatTimeSec()** helpers for HH:MM display
  - **Contrast fix** — `tt-muted` #565f89 → #9aa5ce (WCAG 2.4:1 → ~5:1), bar fill opacity /20 → /35
  - **Sidebar padding** — `pt-12` for macOS traffic lights, drag-region on sidebar
  - **Removed** — redundant "Currently tracking" card (header already shows current activity)
- **Phase 5: Auto-categorization engine**
  - **Categorization** — `categorizeEvent()` matches app name/window title/URL/bundle against rules (first match wins)
  - **Rule matcher** — `matchRule()` supports `equals`, `contains`, `startsWith`, `regex` (case-insensitive, safe regex try/catch)
  - **Auto-categorize on insert** — `insertEvent()` now calls `categorizeEvent()` if no explicit category
  - **Rule CRUD** — `getCategoryRules()`, `upsertRule()`, `deleteRule()`, `getRuleById()` DB methods
  - **IPC channels** — `RULES_GET_ALL`, `RULES_UPSERT`, `RULES_DELETE` with full preload bridge
  - **Default rules migration** — `002_default_rules.sql`: Development (Code, Xcode, Terminal, Cursor, Figma), Communication (Slack, Discord, Mail, Telegram, Zoom, Teams), Browsing (Chrome, Safari, Firefox, Arc, Edge + URL rules), Entertainment (Spotify, YouTube, Netflix, Twitch), System (Finder, System Settings, Docker)
- **Phase 6: Productivity score (US8)**
  - **`ProductivityStat` type** — `{ date, score (0-100), totalActive, productiveTime, distractingTime, neutralTime }`
  - **`getProductivityStats()`** — DB method: time-weighted average of category productivity (-2..+2 → 0-100), per-day breakdown by productive/distracting/neutral
  - **IPC** — `STATS_GET_PRODUCTIVITY` channel + handler + preload binding
  - **StatsView UI** — productivity score section: today's score gauge (color-coded), N-day average with productive/distracting breakdown, line chart trend with 50-point reference line
- **Phase 7: Activity heatmap (US11)**
  - **`HeatmapCell` type** — `{ dayOfWeek, hour, seconds }` (7×24 = 168 cells)
  - **`getHeatmap()`** — DB method: fetches events for period, aggregates by local day-of-week × hour using `Date.getDay()` / `getHours()`, returns full 7×24 grid
  - **IPC** — replaced TODO with real `getHeatmap()` call, return type `HeatmapCell[]`
  - **StatsView** — `HeatmapSection` component: 7×24 grid with intensity color (transparent → blue), hover tooltip (day hour → duration), legend
- **Phase 8: Privacy — private tab filtering & exclusion list (US13, US15)**
  - **Private tab detection** — `isPrivateTab()` checks window title for Chrome "Incognito", Safari/Firefox "Private Browsing", Arc "Little Arc"; when detected, tracker closes current event and doesn't record (like self-tracking)
  - **Current activity** — shows "Private browsing" indicator when in private mode (no URL stored)
  - **Exclusion list** — `excludedApps` setting (JSON array in settings table); TrackingEngine loads on start and skips excluded apps entirely
  - **Settings reload** — `tracker.loadExcludedApps()` called when setting is updated via IPC
  - **SettingsView** — exclusion list UI: add app name input, chip list with remove buttons
- **Phase 9: JSON export & Categories management UI (US14)**
  - **JSON export** — `EXPORT_JSON` IPC channel + handler: serializes events with metadata (exportedAt, dateRange, eventCount), saves to Downloads as `.json`
  - **Preload** — `export.json()` method exposed
  - **SettingsView Data section** — separate CSV and JSON export buttons
  - **Categories management section** — lists all categories with color dot, rule count, productivity badge (green +/red -/gray 0)
  - **Rules display** — shows all auto-categorization rules (field · matchType · "value" → category with color)
- **Phase 10: Menu bar quick summary (US5)**
  - **Dynamic tray menu** — `updateTrayMenu()` rebuilds context menu with: today's total active time, current activity (app + window title), top 3 apps with durations
  - **Tray tooltip** — shows "CarpeDiem — 5h 32m today" on hover
  - **Auto-refresh** — menu rebuilt on activity change (via `tracker.on('activity-changed')`) and every 30 seconds (duration grows without activity switch)
  - **Pause/Resume state** — disabled/enabled dynamically based on tracking state
- **Phase 11: Runtime stability fixes**
  - **Safe logger** — `safe-log.ts` module wraps `console.log/warn/error` in try/catch, preventing EIO crash when terminal stdout pipe is broken (VS Code killing terminal, terminal closing)
  - **Global uncaughtException handler** — catches EIO/ERR_STREAM_DESTROYED silently, logs other exceptions without crashing
  - **Dual-window guard** — `createWindow()` now checks `mainWindow?.isDestroyed()` before creating, preventing duplicate windows on `activate` event or double-invocation
  - **Window reference cleanup** — `mainWindow` set to `null` on `closed` event for proper lifecycle management
- **Phase 12: Production packaging fixes**
  - **Migrations bundling** — `extraResources` in `electron-builder.yml` copies SQL migration files to `Resources/migrations/` in packaged .app (was missing — app crashed on startup with "Migrations directory not found")
  - **Tray icon path** — `createTray()` now resolves icon path via `app.isPackaged` for both dev (`__dirname`) and production (`process.resourcesPath`) environments
  - **Single-instance lock** — `app.requestSingleInstanceLock()` prevents launching a second app instance; second launch focuses existing window instead
- **Phase 13: UI contrast & color consistency**
  - **Native dark mode** — added `color-scheme: dark` to globals.css so native controls (range slider, checkboxes, scrollbars) render in dark appearance instead of light
  - **Recharts axis labels** — fixed contrast ratio from 2.3:1 to 6.1:1 by changing stroke color from `#565f89` to `#9aa5ce` (tt-muted) on daily bar chart
  - **Recharts grid lines** — made CartesianGrid more visible: `#2a2e44` → `#334155`
  - **Recharts reference line** — productivity trend 50-point reference line: `#565f89` → `#737aa2` for better visibility
  - **"Today" badge** — normalized opacity across Timeline and Log views (was /20 in one, /30 in other → both /25), added font-medium for readability
- **Phase 14: AFK tracking improvements**
  - **Threshold 180→60s** — AFK detector now triggers after 1 minute of no keyboard/mouse activity (was 3 minutes)
  - **AFK category** — migration `003_afk_category.sql` adds "AFK" category; AFK events now have `categoryId` linked to it (were `null` before, invisible in stats)
  - **Dynamic threshold** — idle threshold loaded from DB settings at startup; `setIdleThreshold()` method on AFKDetector; IPC settings handler updates threshold live when slider changes
  - **`getCategoryByName()`** — new public DB method to look up category by name (used by TrackingEngine for AFK category)
- **Phase 15: Timeline — app icons, website grouping**
  - **App icons** — `app-icons.ts` module: resolves .app path via `mdfind` (Spotlight) by bundleId, falls back to `/Applications/`, uses `app.getFileIcon()` → 32×32 JPEG base64; cached in Map. `useAppIcon` hook fetches via IPC, `AppIcon` component shows icon or fallback (first letter in colored circle)
  - **`appBundleId` in summary** — `DetailedDaySummary` now includes `appBundleId`; SQL query updated; needed for icon resolution
  - **`APPS_GET_ICON` IPC** — new `apps:getIcon` channel + preload `apps.getIcon()` method
  - **Browser domain grouping** — for browser apps (Chrome, Safari, Firefox, Arc, Edge, etc.), Timeline groups by domain (figma.com, jira.com) instead of window titles; `BrowserDetail` component with drill-down to individual tabs
  - **Same tabs merged** — SQL already groups by `app_name, window_title, url`; domain grouping further merges tabs from same site

### Fixed
- **Icon visibility (JPEG→PNG)** — macOS app icons have transparent backgrounds; JPEG format doesn't support alpha channel, making icons invisible (black on dark theme `#16161e`). Changed `toJPEG()` → `toPNG()` in `app-icons.ts`
- **App icons all identical in packaged mode** — `app.getFileIcon()` returns the same generic icon for all apps in unsigned packaged Electron. Rewrote `app-icons.ts` to read `.icns` directly from app bundles: resolves app path via `mdfind`, parses `Info.plist` via `plutil -convert json`, converts `.icns` → PNG 32×32 via `sips` (preserves alpha channel). Uses full paths (`/usr/bin/*`) since packaged app may have empty PATH. Falls back to `getFileIcon()` for apps without `.icns` (system processes)
- **Domain text centering** — `<button>` elements have `text-align: center` by default (UA stylesheet); `BrowserDetail` domain spans with `flex-1` inherited this, causing domain names to appear visually centered. Added `text-left` to AppRow and BrowserDetail buttons
- **Text selection** — added `user-select: text` globally so any text in the app can be selected and copied (drag-region areas keep `user-select: none` for window dragging)

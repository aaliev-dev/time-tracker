# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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

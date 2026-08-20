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

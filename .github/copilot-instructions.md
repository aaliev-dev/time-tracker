# Copilot Instructions — Time Tracker

## Project
Electron + React + TypeScript + SQLite macOS time tracker.
Privacy-first: all data local, no network requests.

## Stack
- **Electron** (main process): `active-win`, `better-sqlite3`, `powerMonitor`
- **React + Vite** (renderer): components in `src/renderer/src/`
- **TailwindCSS** for styling, **Recharts** for charts
- **TypeScript strict** everywhere

## Architecture
- Main process handles: tracking, AFK detection, DB, tray
- Preload bridges via `contextBridge` → `window.api`
- Renderer calls main through `ipcRenderer.invoke()` only
- IPC channels: `domain:action` (e.g., `activities:getDay`)
- Full IPC contract: see `SDD.md`

## Code conventions
- `kebab-case.ts` for modules, `PascalCase.tsx` for components
- `camelCase` vars, `PascalCase` types
- Shared types in `src/main/types.ts`
- DB migrations in `src/main/migrations/NNN_name.sql`

## Git
- All changes via PR (branch → commit → push → `gh pr create` → `gh pr merge --squash --delete-branch`)
- Commit format: `type(scope): description`
- Update `CHANGELOG.md` in `[Unreleased]` section

## DMG build & test (mandatory!)
- After every PR that changes main/preload/renderer code — rebuild DMG and test in packaged mode
- Dev mode (`npm run dev`) does NOT cover production paths (`process.resourcesPath`), asar, native modules
- Pattern: `npm run package:mac` → kill old process → `cp -R release/mac-arm64/CarpeDiem.app /Applications/` → `xattr -cr` → launch & verify
- Full details in `AGENTS.md` → "DMG-сборка и тестирование"

## Do NOT
- Do NOT add `any` type without justification
- Do NOT enable `nodeIntegration` or disable `contextIsolation`
- Do NOT make network requests
- Do NOT access SQLite from renderer (use IPC)

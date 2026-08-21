# AGENTS.md — Time Tracker

> Инструкции для AI-агентов, работающих с этим репозиторием.

## Контекст проекта

**Time Tracker** — автоматический трекер активности для macOS.
Стек: Electron + React + TypeScript + SQLite + Vite + TailwindCSS.
Данные — локальные (privacy-first). Подробности: `SDD.md`, `PRD.md`.

## Архитектура (коротко)

- **Main process** (`src/main/`) — трекинг, AFK, DB, tray, IPC handlers
- **Preload** (`src/preload/`) — contextBridge, exposes `window.api`
- **Renderer** (`src/renderer/`) — React + Vite, UI с Recharts/Tailwind
- **IPC** — renderer вызывает main через `ipcRenderer.invoke()`, main отвечает через `ipcMain.handle()`

## Конвенции кода

### Naming
- Файлы: `kebab-case.ts` для модулей, `PascalCase.tsx` для компонентов
- Переменные/функции: `camelCase`
- Типы/интерфейсы: `PascalCase`
- Константы: `UPPER_SNAKE_CASE`
- IPC каналы: `domain:action` (напр. `activities:getDay`)

### TypeScript
- **strict: true** — обязательно
- Везде типизированные интерфейсы для IPC payloads
- Никакого `any` без веской причины и комментария
- Shared типы — в `src/main/types.ts`, импортируются и в main, и в renderer

### React
- Функциональные компоненты, hooks
- Название хаков — `use*` (напр. `useActivities`, `useCurrentActivity`)
- TailwindCSS для стилей, без CSS modules / styled-components
- Recharts для всех графиков

### Database
- Сырые события не удаляются (primitive)
- Все записи идемпотентны: повторная запись с тем же ts_start → UPDATE
- Миграции — в `src/main/migrations/`, версионные (`001_initial.sql`, `002_categories.sql`, ...)

## Git workflow

**ВСЕ изменения в коде — через Pull Request. Никаких прямых пушей в main.**

Паттерн:
```
git checkout -b feat/description
# ... коммиты ...
git push -u origin feat/description
gh pr create --fill
gh pr merge --squash --delete-branch
```

### Ветвление
- `main` — стабильная ветка, только через PR
- `feat/*` — новые фичи
- `fix/*` — багфиксы
- `chore/*` — конфигурация, зависимости, документация
- `refactor/*` — рефакторинг без изменения поведения

### Коммиты
Формат: `type(scope): description`
- `feat(tracking): add active window polling`
- `fix(db): handle null window title`
- `chore: update dependencies`
- `docs: add PRD section on browser tracking`

### CHANGELOG
При каждом PR, который меняет поведение, добавлять запись в `CHANGELOG.md`
в секцию `[Unreleased]`.

### DMG-сборка и тестирование (обязательно!)

**После каждого PR, который меняет код main/preload/renderer — собирать DMG и тестировать в packaged-режиме.**

Dev-режим (`npm run dev`) не покрывает production-специфику:
пути к ресурсам (`process.resourcesPath`), asar, code signing, native modules.
Многие баги (migrations not found, tray icon path, extraResources) видны только в `.app`.

Паттерн:
```bash
npm run package:mac                          # сборка DMG
pkill -f "CarpeDiem" 2>/dev/null             # убить старый процесс
rm -rf /Applications/CarpeDiem.app           # удалить старую версию
cp -R release/mac-arm64/CarpeDiem.app /Applications/
xattr -cr /Applications/CarpeDiem.app        # снять quarantine (unsigned app)
# Запуск и проверка:
/Applications/CarpeDiem.app/Contents/MacOS/CarpeDiem 2>&1
# Проверить: окно открылось, трекинг работает, tray есть, БД инициализирована
```

Если DMG уже собран и только менялся код — можно пересобрать без чистого install:
```bash
npm run package:mac
# далее reinstall как выше
```

## Что делать / чего не делать

### ✅ Делай
- Перед изменением IPC канала — проверь SDD.md (может быть контракт)
- Добавляй TypeScript интерфейсы для всех IPC payloads
- При новой таблице БД — добавь миграцию + обнови SDD.md
- Тестируй что TrackingEngine не пишет события когда paused
- Проверяй что private окна не трекаются
- Отмечай изменения в CHANGELOG.md
- **После каждого PR с кодовыми изменениями — собирай DMG и тестируй в packaged-режиме** (см. секцию "DMG-сборка и тестирование")

### ❌ Не делай
- Не добавляй network requests — приложение локальное
- Не используй `any` без крайней необходимости
- Не добавляй `nodeIntegration: true`
- Не отключай `contextIsolation`
- Не храни данные в localStorage renderer-а (используй DB через IPC)
- Не пиши напрямую в SQLite из renderer (только через IPC → main)
- Не пушь в main напрямую (только через PR)

## Запуск

```bash
npm install          # зависимости
npm run dev          # electron-vite dev (hot reload)
npm run build        # сборка для production
npm run package      # .dmg пакет
```

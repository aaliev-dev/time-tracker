# SDD — Software Design Document

> Time Tracker: Electron + React + TypeScript + SQLite

---

## Архитектура

```
┌──────────────────────────────────────────────────────────┐
│                    Electron Main Process                   │
│                                                            │
│  ┌──────────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │  TrackingEngine  │  │  AFKDetector │  │  Database   │  │
│  │                  │  │              │  │  (SQLite)   │  │
│  │  active-win npm  │  │  powerMonitor│  │             │  │
│  │  poll every 1s   │  │  idle/active  │  │  events     │  │
│  │  → app, title    │  │  suspend/res │  │  categories │  │
│  └────────┬─────────┘  └──────┬───────┘  └──────┬──────┘  │
│           │                     │                 │        │
│           └──────────┬──────────┘                 │        │
│                      ▼                            │        │
│              ┌─────────────┐                      │        │
│              │  IPC Handler │──────────────────────┘        │
│              │  (ipcMain)   │                               │
│              └──────┬──────┘                               │
│                     │ contextBridge                          │
├─────────────────────┼──────────────────────────────────────┤
│              ┌──────▼──────┐                                │
│              │  Preload    │  (contextIsolation: on)         │
│              │  window.api  │                                │
│              └──────┬──────┘                                │
├─────────────────────┼──────────────────────────────────────┤
│                     │                                      │
│                ┌────▼─────────────┐                        │
│                │  React Renderer  │  (Vite dev server)      │
│                │                  │                         │
│                │  TimelineView    │                         │
│                │  StatsView       │                         │
│                │  MenuBarWidget   │                         │
│                │  (Recharts)      │                         │
│                └──────────────────┘                         │
└──────────────────────────────────────────────────────────┘
```

### Main Process (Node.js / Electron)

| Модуль | Файл | Ответственность |
|--------|------|----------------|
| `TrackingEngine` | `src/main/tracking-engine.ts` | Polling active-win каждые 1 сек, запись событий в БД |
| `AFKDetector` | `src/main/afk-detector.ts` | powerMonitor idle/active/suspend/resume → AFK события |
| `Database` | `src/main/database.ts` | SQLite инициализация, миграции, CRUD запросы |
| `IPCHandlers` | `src/main/ipc-handlers.ts` | Обработка запросов от renderer через ipcMain.handle() |
| `Tray` | `src/main/tray.ts` | Menu bar иконка + popover |
| `index.ts` | `src/main/index.ts` | App lifecycle, window creation |

### Renderer (React + Vite)

| Модуль | Файл | Ответственность |
|--------|------|----------------|
| `App.tsx` | `src/renderer/src/App.tsx` | Роутинг между Timeline / Stats / Settings |
| `TimelineView` | `src/renderer/src/pages/Timeline.tsx` | Визуальная шкала дня |
| `DaySummary` | `src/renderer/src/pages/DaySummary.tsx` | Список приложений за день |
| `StatsView` | `src/renderer/src/pages/Stats.tsx` | Графики динамики (Recharts) |
| `SettingsView` | `src/renderer/src/pages/Settings.tsx` | Пороги, категории, exclusions |
| `useActivities` | `src/renderer/src/hooks/useActivities.ts` | Хук для запроса данных через IPC |

### Preload (bridge)

| Модуль | Файл | Ответственность |
|--------|------|----------------|
| `preload.ts` | `src/preload/index.ts` | contextBridge: exposes `window.api` с типизированными методами |

---

## IPC Protocol

Все запросы — через `ipcMain.handle()` (invoke/handle pattern).

| Канал | Direction | Payload | Response |
|-------|-----------|---------|----------|
| `activities:getDay` | renderer→main | `{ date: YYYY-MM-DD }` | `ActivityEvent[]` |
| `activities:getRange` | renderer→main | `{ from: Date, to: Date }` | `ActivityEvent[]` |
| `activities:getSummary` | renderer→main | `{ date: YYYY-MM-DD }` | `{ appName, duration, category }[]` |
| `stats:getDaily` | renderer→main | `{ days: number }` | `{ date, totalActive, byCategory }[]` |
| `stats:getTopApps` | renderer→main | `{ from, to, limit }` | `{ appName, totalTime }[]` |
| `stats:getHeatmap` | renderer→main | `{ from, to }` | `{ dayOfWeek, hour, duration }[]` |
| `categories:getAll` | renderer→main | `—` | `Category[]` |
| `categories:upsert` | renderer→main | `Category` | `Category` |
| `categories:delete` | renderer→main | `{ id }` | `void` |
| `settings:get` | renderer→main | `key` | `any` |
| `settings:set` | renderer→main | `{ key, value }` | `void` |
| `tracking:getCurrent` | renderer→main | `—` | `CurrentActivity` |
| `tracking:pause` | renderer→main | `—` | `void` |
| `tracking:resume` | renderer→main | `—` | `void` |
| `export:csv` | renderer→main | `{ from, to }` | `string` (file path saved) |

---

## Data Model (SQLite)

```sql
-- Основная таблица событий
CREATE TABLE events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts_start    TEXT NOT NULL,           -- ISO 8601 datetime
    ts_end      TEXT NOT NULL,           -- ISO 8601 datetime
    duration    INTEGER NOT NULL,        -- секунды
    app_name    TEXT NOT NULL,           -- "Visual Studio Code"
    app_bundle  TEXT,                    -- "com.microsoft.VSCode"
    window_title TEXT,                  -- "main.ts — TimeTracker"
    url         TEXT,                    -- для браузеров
    category_id INTEGER,                -- FK → categories.id (nullable)
    is_afk      INTEGER DEFAULT 0,       -- 0/1
    is_private  INTEGER DEFAULT 0,      -- private/incognito вкладка
    created_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- Индексы для быстрых запросов
CREATE INDEX idx_events_ts_start ON events(ts_start);
CREATE INDEX idx_events_ts_end ON events(ts_end);
CREATE INDEX idx_events_app_name ON events(app_name);
CREATE INDEX idx_events_category ON events(category_id);

-- Категории
CREATE TABLE categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,    -- "Development"
    color       TEXT NOT NULL,           -- hex "#4A90D9"
    productivity INTEGER DEFAULT 0,     -- -2..+2
    sort_order  INTEGER DEFAULT 0
);

-- Правила авто-категоризации
CREATE TABLE category_rules (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    field       TEXT NOT NULL,           -- 'app_name' | 'window_title' | 'url' | 'app_bundle'
    match_type  TEXT NOT NULL,           -- 'equals' | 'contains' | 'startsWith' | 'regex'
    value       TEXT NOT NULL,           -- "VSCode"
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

-- Настройки (key-value)
CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT
);
```

### Aggregation strategy

- Сырые события не агрегируются — хранятся 1 запись на период активности.
- Длительность периода: от смены app/title до следующей смены (или AFK).
- Т.е. если ты 30 мин в VSCode, не меняя вкладку — 1 запись с duration=1800.
- Графики считаются на лету из events через SQL GROUP BY.

---

## Tracking Engine — дизайн

```
┌─ Loop (каждые 1 сек) ──────────────────────────────────────┐
│                                                              │
│  1. active-win.getActiveWindow()                            │
│     → { title, owner: { name, bundleId, path } }            │
│                                                              │
│  2. if (paused) return;                                     │
│                                                              │
│  3. if (currentActivity == null) → создаём новое событие   │
│                                                              │
│  4. if (app/title изменился) →                               │
│     a. closeCurrent: ts_end = now, duration = now - ts_start│
│     b. save to DB                                            │
│     c. создаём новое событие                                 │
│                                                              │
│  5. if (AFK) → closeCurrent + создаём AFK событие           │
│                                                              │
│  6. emit('activity-changed', currentActivity)  → renderer   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Polling interval

- **1 секунда** — достаточно для точности (Timing тоже пушит ~1/сек).
- Не каждые 100мс — лишняя нагрузка на battery.
- Duration считается при закрытии события, не при каждом тике → минимум writes.

### Мержинг коротких событий

Если 2 consecutive событий с одним app+title и duration < 5 сек (микро-переключения) → мержить в одно. Реализуется в post-processing запросе.

---

## Dependencies

### Main process (dependencies)

| Package | Зачем |
|---------|-------|
| `electron` | Основной фреймворк |
| `active-win` | Получение active app + window title на macOS |
| `better-sqlite3` | Синхронный SQLite драйвер (быстрее sqlite3) |
| `electron-store` | Для настроек (если не используем settings table) |

### Renderer (devDependencies)

| Package | Зачем |
|---------|-------|
| `react`, `react-dom` | UI фреймворк |
| `recharts` | Графики |
| `vite` | Dev server + bundling renderer |
| `typescript` | Типизация |
| `tailwindcss` | Стили (быстрый UI без CSS-in-JS) |
| `date-fns` | Работа с датами |
| `lucide-react` | Иконки |

### Build

| Package | Зачем |
|---------|-------|
| `electron-vite` | Vite plugin для Electron (main + renderer в одном конфиге) |
| `electron-builder` | Сборка .dmg / .app |
| `concurrently` | Параллельный запуск vite dev + electron |

---

## File Structure

```
time-tracker/
├── .github/
│   └── copilot-instructions.md     # Copilot instructions
├── docs/
│   ├── PRD.md
│   └── SDD.md                      # ← этот файл
├── src/
│   ├── main/
│   │   ├── index.ts                # Electron app entry
│   │   ├── tracking-engine.ts      # Active window polling
│   │   ├── afk-detector.ts         # Idle/sleep detection
│   │   ├── database.ts             # SQLite init + queries
│   │   ├── ipc-handlers.ts         # ipcMain.handle channels
│   │   ├── tray.ts                 # Menu bar tray
│   │   └── types.ts                # Shared types
│   ├── preload/
│   │   └── index.ts                # contextBridge → window.api
│   └── renderer/
│       ├── index.html
│       └── src/
│           ├── main.tsx             # React entry
│           ├── App.tsx              # Router/layout
│           ├── pages/
│           │   ├── Timeline.tsx
│           │   ├── Stats.tsx
│           │   └── Settings.tsx
│           ├── components/
│           │   ├── ActivityBar.tsx
│           │   ├── CategoryPicker.tsx
│           │   └── MenuBarPopover.tsx
│           ├── hooks/
│           │   └── useActivities.ts
│           ├── lib/
│           │   └── ipc.ts           # window.api wrapper
│           └── styles/
│               └── globals.css
├── resources/
│   └── icons/                       # Tray icon, app icon
├── AGENTS.md
├── .gitignore
├── README.md
├── CHANGELOG.md
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── electron.vite.config.ts
└── electron-builder.yml
```

---

## Security Model

- **contextIsolation: true** — renderer не имеет прямого доступа к Node.js
- **nodeIntegration: false** — никаких require() в renderer
- **sandbox: true** — renderer в sandbox
- Весь доступ к ОС — только через preload + ipcMain.handle
- `window.api` — минимальный typed API, без exposure arbitrary functions

---

## Privacy

- Данные хранятся в `~/Library/Application Support/TimeTracker/timetracker.db`
- Никаких network requests (кроме обновлений приложения)
- Private/incognito вкладки не трекаются (browser extension responsible)
- Exclusion list: пользовательские apps которые не трекать
- Кнопка "Удалить все данные" в Settings

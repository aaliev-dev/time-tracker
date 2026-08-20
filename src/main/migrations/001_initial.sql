-- 001_initial.sql — начальная схема БД Time Tracker

-- Основная таблица событий
CREATE TABLE IF NOT EXISTS events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ts_start     TEXT NOT NULL,           -- ISO 8601 datetime
    ts_end       TEXT NOT NULL,           -- ISO 8601 datetime
    duration     INTEGER NOT NULL,        -- секунды
    app_name     TEXT NOT NULL,           -- "Visual Studio Code"
    app_bundle   TEXT,                    -- "com.microsoft.VSCode"
    window_title TEXT NOT NULL DEFAULT '',-- "main.ts — TimeTracker"
    url          TEXT,                    -- для браузеров (nullable)
    category_id  INTEGER,                -- FK → categories.id (nullable)
    is_afk       INTEGER NOT NULL DEFAULT 0,  -- 0/1
    is_private   INTEGER NOT NULL DEFAULT 0,  -- 0/1
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- Индексы для быстрых запросов
CREATE INDEX IF NOT EXISTS idx_events_ts_start ON events(ts_start);
CREATE INDEX IF NOT EXISTS idx_events_ts_end   ON events(ts_end);
CREATE INDEX IF NOT EXISTS idx_events_app_name ON events(app_name);
CREATE INDEX IF NOT EXISTS idx_events_category ON events(category_id);

-- Категории
CREATE TABLE IF NOT EXISTS categories (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL UNIQUE,    -- "Development"
    color        TEXT NOT NULL,           -- hex "#4A90D9"
    productivity INTEGER NOT NULL DEFAULT 0,  -- -2..+2
    sort_order   INTEGER NOT NULL DEFAULT 0
);

-- Правила авто-категоризации
CREATE TABLE IF NOT EXISTS category_rules (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    field       TEXT NOT NULL,           -- 'app_name' | 'window_title' | 'url' | 'app_bundle'
    match_type  TEXT NOT NULL,           -- 'equals' | 'contains' | 'startsWith' | 'regex'
    value       TEXT NOT NULL,           -- "VSCode"
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

-- Настройки (key-value)
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
);

-- Дефолтные категории
INSERT OR IGNORE INTO categories (name, color, productivity, sort_order) VALUES
    ('Development',    '#9ece6a', 2, 1),
    ('Communication',  '#7aa2f7', 1, 2),
    ('Browsing',       '#bb9af7', 0, 3),
    ('Entertainment',  '#f7768e', -1, 4),
    ('System',         '#565f89', 0, 5),
    ('Other',          '#e0af68', 0, 6);

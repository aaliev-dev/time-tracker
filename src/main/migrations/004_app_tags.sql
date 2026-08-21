-- 004_app_tags.sql — ручная маркировка приложений и сайтов
--
-- Пользователь может вручную отметить любое приложение или домен
-- как: 'work' (работа), 'neutral' (нейтральное), 'distracting' (отвлечение).
-- Это проще и интуитивнее, чем система категорий с rules.

CREATE TABLE IF NOT EXISTS app_tags (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    target_type TEXT NOT NULL,           -- 'app' | 'domain'
    target_key  TEXT NOT NULL,           -- app name (e.g. "Visual Studio Code") or domain (e.g. "github.com")
    tag         TEXT NOT NULL,            -- 'work' | 'neutral' | 'distracting'
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(target_type, target_key)
);

CREATE INDEX IF NOT EXISTS idx_app_tags_lookup ON app_tags(target_type, target_key);

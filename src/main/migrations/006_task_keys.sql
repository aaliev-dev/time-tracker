-- 006_task_keys.sql — извлечение Jira-ключей задач из window_title и url
--
-- Пользователь работает с задачами (Jira-тикеты вида ADG-12144, AGDNS-4264 и т.п.).
-- Эти ключи появляются в заголовках окон (Figma, браузер) и URL (Jira, Figma).
-- Колонка task_key добавляется для группировки времени по задачам.
--
-- extractTaskKey() — JS-функция, зарегистрированная в DatabaseManager
-- конструкторе ДО запуска миграций (this.db.function('extractTaskKey', ...)).

-- ALTER TABLE ADD COLUMN не поддерживает IF NOT EXISTS в SQLite,
-- но миграция выполняется ровно один раз (schema_migrations tracking),
-- поэтому прямая ALTER безопасна.
ALTER TABLE events ADD COLUMN task_key TEXT;

CREATE INDEX IF NOT EXISTS idx_events_task_key
  ON events(task_key) WHERE task_key IS NOT NULL;

-- Бэкфилл: window_title → task_key
UPDATE events SET task_key = extractTaskKey(window_title)
  WHERE task_key IS NULL AND extractTaskKey(window_title) IS NOT NULL;

-- Бэкфилл: url → task_key (если window_title не дал ключа)
UPDATE events SET task_key = extractTaskKey(url)
  WHERE task_key IS NULL AND extractTaskKey(url) IS NOT NULL;

-- Очистка ложных срабатываний (технические коды, не Jira-ключи)
UPDATE events SET task_key = NULL
  WHERE task_key IN ('UTF-8', 'UTF-16', 'ASCII-0', 'HTTP-1', 'HTTPS-1');

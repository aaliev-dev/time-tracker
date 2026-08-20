-- 002_default_rules.sql — дефолтные правила авто-категоризации
--
-- Каждое правило матчит поле (app_name, window_title, url, app_bundle)
-- по паттерну (equals, contains, startsWith, regex) и присваивает category_id.
-- Правила применяются в БД при insertEvent через DatabaseManager.categorizeEvent().

-- Development
INSERT OR IGNORE INTO category_rules (category_id, field, match_type, value)
SELECT id, 'app_name', 'contains', 'Code' FROM categories WHERE name = 'Development';
INSERT OR IGNORE INTO category_rules (category_id, field, match_type, value)
SELECT id, 'app_bundle', 'startsWith', 'com.microsoft.VSCode' FROM categories WHERE name = 'Development';
INSERT OR IGNORE INTO category_rules (category_id, field, match_type, value)
SELECT id, 'app_name', 'contains', 'Xcode' FROM categories WHERE name = 'Development';
INSERT OR IGNORE INTO category_rules (category_id, field, match_type, value)
SELECT id, 'app_name', 'contains', 'Terminal' FROM categories WHERE name = 'Development';
INSERT OR IGNORE INTO category_rules (category_id, field, match_type, value)
SELECT id, 'app_name', 'contains', 'iTerm' FROM categories WHERE name = 'Development';
INSERT OR IGNORE INTO category_rules (category_id, field, match_type, value)
SELECT id, 'app_name', 'contains', 'Cursor' FROM categories WHERE name = 'Development';
INSERT OR IGNORE INTO category_rules (category_id, field, match_type, value)
SELECT id, 'app_name', 'contains', 'Figma' FROM categories WHERE name = 'Development';

-- Communication
INSERT OR IGNORE INTO category_rules (category_id, field, match_type, value)
SELECT id, 'app_name', 'contains', 'Slack' FROM categories WHERE name = 'Communication';
INSERT OR IGNORE INTO category_rules (category_id, field, match_type, value)
SELECT id, 'app_name', 'contains', 'Discord' FROM categories WHERE name = 'Communication';
INSERT OR IGNORE INTO category_rules (category_id, field, match_type, value)
SELECT id, 'app_name', 'contains', 'Mail' FROM categories WHERE name = 'Communication';
INSERT OR IGNORE INTO category_rules (category_id, field, match_type, value)
SELECT id, 'app_name', 'contains', 'Messages' FROM categories WHERE name = 'Communication';
INSERT OR IGNORE INTO category_rules (category_id, field, match_type, value)
SELECT id, 'app_name', 'contains', 'Telegram' FROM categories WHERE name = 'Communication';
INSERT OR IGNORE INTO category_rules (category_id, field, match_type, value)
SELECT id, 'app_name', 'contains', 'Zoom' FROM categories WHERE name = 'Communication';
INSERT OR IGNORE INTO category_rules (category_id, field, match_type, value)
SELECT id, 'app_name', 'contains', 'Teams' FROM categories WHERE name = 'Communication';

-- Browsing
INSERT OR IGNORE INTO category_rules (category_id, field, match_type, value)
SELECT id, 'app_name', 'contains', 'Chrome' FROM categories WHERE name = 'Browsing';
INSERT OR IGNORE INTO category_rules (category_id, field, match_type, value)
SELECT id, 'app_name', 'contains', 'Safari' FROM categories WHERE name = 'Browsing';
INSERT OR IGNORE INTO category_rules (category_id, field, match_type, value)
SELECT id, 'app_name', 'contains', 'Firefox' FROM categories WHERE name = 'Browsing';
INSERT OR IGNORE INTO category_rules (category_id, field, match_type, value)
SELECT id, 'app_name', 'equals', 'Arc' FROM categories WHERE name = 'Browsing';
INSERT OR IGNORE INTO category_rules (category_id, field, match_type, value)
SELECT id, 'app_name', 'contains', 'Edge' FROM categories WHERE name = 'Browsing';

-- Entertainment
INSERT OR IGNORE INTO category_rules (category_id, field, match_type, value)
SELECT id, 'app_name', 'contains', 'Spotify' FROM categories WHERE name = 'Entertainment';
INSERT OR IGNORE INTO category_rules (category_id, field, match_type, value)
SELECT id, 'app_name', 'contains', 'YouTube' FROM categories WHERE name = 'Entertainment';
INSERT OR IGNORE INTO category_rules (category_id, field, match_type, value)
SELECT id, 'app_name', 'contains', 'Netflix' FROM categories WHERE name = 'Entertainment';
INSERT OR IGNORE INTO category_rules (category_id, field, match_type, value)
SELECT id, 'app_name', 'contains', 'Twitch' FROM categories WHERE name = 'Entertainment';
INSERT OR IGNORE INTO category_rules (category_id, field, match_type, value)
SELECT id, 'url', 'contains', 'youtube.com' FROM categories WHERE name = 'Entertainment';
INSERT OR IGNORE INTO category_rules (category_id, field, match_type, value)
SELECT id, 'url', 'contains', 'netflix.com' FROM categories WHERE name = 'Entertainment';
INSERT OR IGNORE INTO category_rules (category_id, field, match_type, value)
SELECT id, 'url', 'contains', 'twitch.tv' FROM categories WHERE name = 'Entertainment';

-- System
INSERT OR IGNORE INTO category_rules (category_id, field, match_type, value)
SELECT id, 'app_name', 'equals', 'Finder' FROM categories WHERE name = 'System';
INSERT OR IGNORE INTO category_rules (category_id, field, match_type, value)
SELECT id, 'app_name', 'equals', 'System Settings' FROM categories WHERE name = 'System';
INSERT OR IGNORE INTO category_rules (category_id, field, match_type, value)
SELECT id, 'app_name', 'equals', 'Activity Monitor' FROM categories WHERE name = 'System';
INSERT OR IGNORE INTO category_rules (category_id, field, match_type, value)
SELECT id, 'app_name', 'contains', 'Docker' FROM categories WHERE name = 'System';

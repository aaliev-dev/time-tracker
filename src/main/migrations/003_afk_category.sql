-- 003_afk_category.sql — категория для AFK-периодов
--
-- AFK-события (is_afk=1) теперь привязываются к отдельной категории,
-- чтобы они отображались в статистике и графиках наравне с другими.

INSERT OR IGNORE INTO categories (name, color, productivity, sort_order)
VALUES ('AFK', '#414868', 0, 0);

-- Привязываем существующие AFK-события к новой категории
UPDATE events
SET category_id = (SELECT id FROM categories WHERE name = 'AFK')
WHERE is_afk = 1 AND category_id IS NULL;

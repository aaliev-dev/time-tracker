# Time Tracker — Исследование конкурентов

## Конкурентный ландшафт

| Продукт | Платформа | Модель данных | Приватность | Цена |_open source_|
|---------|-----------|---------------|-------------|------|--------------|
| **Timing** | macOS (native) | Локально + optional cloud sync | ✅ Данные не покидают Mac | $10–168/год | ❌ |
| **RescueTime** | Win/Mac/Linux/Android | Облако | ❌ Данные на серверах | Freemium | ❌ |
| **ManicTime** | Win/Mac/Linux | Локально / on-premise / cloud | ✅ Опционально | Free + paid | ❌ |
| **ActivityWatch** | Win/Mac/Linux/Android | Локально (SQLite) | ✅ Local-first | Бесплатно | ✅ MPL-2.0 |
| **Apple Screen Time** | Apple ecosystem | On-device | ✅ | Бесплатно | ❌ |

---

## Детальный разбор ключевых продуктов

### 1. Timing (главный ориентир для macOS-native)

**Плюсы:**
- **Document-based tracking** — отслеживает не просто "приложение", а конкретный документ/URL/вкладку. Знает, что в Safari 10 мин на банк и 50 мин на соцсети.
- **Автоматический трекинг** — никаких start/stop таймеров. Молча записывает активность.
- **AI-суммаризация** — группирует активности, определяет "чем занимался".
- **Rule-based категоризация** — ⌥-drag создаёт правило: "вся активность с GitHub → Проект X".
- **Idle detection** — определяет когда Mac не используется.
- **Menu bar widget** — показывает потраченное время прямо в строке меню.
- **Timeline view** — визуальная шкала дня.
- **Экспорт** — PDF, XLSX, CSV, HTML.
- **Интеграции** — Calendar, звонки (Zoom/Teams/Meet), Screen Time с iPhone.

**Минусы:**
- Платный (~$10/мес или $168/год за полную версию).
- Закрытый исходный код.

### 2. ActivityWatch (главный ориентир для архитектуры)

**Архитектура "watchers":**
- `aw-watcher-window` — активное окно + title + URL (для браузеров на Chromium и Safari)
- `aw-watcher-afk` — мониторинг мыши/клавиатуры, AFK после 3 мин бездействия
- `aw-watcher-web` — browser extension (Chrome/Edge/Firefox): title вкладки, URL, audible, incognito
- `aw-watcher-vscode` / `aw-watcher-vim` / JetBrains — отслеживание редактируемых файлов
- `aw-watcher-input` — счётчик нажатий клавиш и перемещений мыши

**Плюсы:**
- Open-source, полностью бесплатный.
- Local-first (SQLite, данные не покидают устройство).
- Расширяемая архитектура watchers.
- Browser extensions для active tab tracking.

**Минусы:**
- UI — веб-интернат (localhost:5600), не native macOS.
- Разрозненные компоненты (каждый watcher — отдельный процесс).
- Менее полированный UX.

### 3. RescueTime

**Плюсы:**
- Distraction blocking (блокировка сайтов).
- Goals & alerts — цели и уведомления.
- Productivity scoring.
- Командные функции.

**Минусы:**
- Данные в облаке (privacy concern).
- Меньше деталей о конкретных документах/вкладках.

### 4. ManicTime

**Плюсы:**
- Скриншоты (опционально, для proof of work).
- On-premise deployment (работает offline/air-gapped).
- REST API + прямой доступ к БД.
- AI через MCP (можешь спрашивать "что я делал вчера?").

**Минусы:**
- UI менее современный.
- На macOS работает хуже, чем на Windows.

---

## Что мы берём от каждого

| Фича | Источник вдохновения | Приоритет |
|------|----------------------|-----------|
| Авто-трекинг приложений + window title | Timing, ActivityWatch | P0 (MVP) |
| Browser tab tracking (URL + title) | ActivityWatch (browser extension) | P1 |
| AFK / idle detection | ActivityWatch | P0 |
| Timeline view (визуальный день) | Timing, ManicTime | P0 |
| Категории + продуктивность | Timing, RescueTime | P1 |
| Menu bar app | Timing | P0 |
| Local-first / приватность | ActivityWatch, Timing | P0 |
| Динамика / тренды | RescueTime | P1 |
| Native macOS UI | Timing | P0 |
| Экспорт данных (CSV/JSON) | Timing, ManicTime | P2 |

## Ключевое отличие от Apple Screen Time
Apple Screen Time показывает только агрегаты по категориям. Мы показываем
**детальный timeline** — какая вкладка, какой документ, сколько минут.

---

## Технические подходы для macOS

### Отслеживание активного приложения

| API | Что даёт | Требует permissions |
|-----|---------|-------------------|
| `NSWorkspace.frontmostApplication` | bundle ID, app name, process ID | Нет |
| `NSWorkspace` notifications | `didActivateApplication`, `didDeactivateApplication` | Нет |
| `CGWindowListCopyWindowInfo` | title окна, bounds, owning PID | Нет (но title может быть пустым для sandboxed apps) |
| **Accessibility API (`AXUIElement`)** | window title, document URL, вложенные элементы | ✅ Accessibility permission |
| Carbon `GetFrontProcess` | PID frontmost app | Нет (legacy) |

**Вывод:** для базового трекинга (app name + window title) нужен связка:
`NSWorkspace.frontmostApplication` + `CGWindowList` для window title.
Accessibility API — для глубокого document tracking (как делает Timing).

### Отслеживание активной вкладки браузера

1. **Browser extension** (Chrome/Firefox/Safari) → шлёт active tab info в main app via native messaging или localhost HTTP. ActivityWatch использует этот подход.
2. **Accessibility API** — можно вытащить URL из title окна (часто содержит заголовок страницы, но не URL). Timing использует Accessibility для Chrome/Safari/Firefox.
3. **AppleScript** — Safari и Chrome поддерживают AppleScript для получения active tab URL.

### AFK detection (вышел от компа)

- `CGEventTap` или `IOHIDManager` — мониторинг событий клавиатуры/мыши.
- `NSWorkspace.didWakeNotification` / `willSleepNotification` — sleep/wake.
- Порог: 3–5 минут бездействия → AFK.

### Хранение данных

- **SQLite** (как ActivityWatch) — локальная БД, быстрые запросы для статистики.
- Или **Core Data** / **Swift Data** — еслиnative macOS app.
- Структура: events table (timestamp, app, title, url, duration).

---

## Выбор технологического стека

Для **vibecoding** (быстрого прототипирования с AI) оптимально:

### Рекомендуется: Swift + SwiftUI

**Почему:**
- Прямой доступ ко всем macOS API (NSWorkspace, Accessibility, CGEventTap, CGWindowList).
- Native menu bar app (.Content barber accessory).
- SwiftUI = быстрая разработка UI (timeline, charts, статистика).
- SwiftCharts — встроенные графики для статистики.
- SwiftData / Core Data — локальное хранение.
- Хорошая генерация AI кода (Copilot отлично пишет Swift/SwiftUI).

**Альтернативы и почему не они:**
- **Tauri (Rust)** — cross-platform, но доступ к macOS accessibility APIs сложнее из Rust.
- **Electron** — тяжёлый, плохой UX для menu bar app, "не нативный".
- **Python** — не подходит для native macOS menu bar app.

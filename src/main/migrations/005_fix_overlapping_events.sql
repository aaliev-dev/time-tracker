-- 005_fix_overlapping_events.sql
-- Fix: race condition in poll() created real (non-AFK) events during AFK,
-- resulting in overlapping time periods (e.g. 27h/day instead of 24h).
--
-- Root cause: poll() checks isAfk at the top, but await activeWin() is async.
-- During that await, AFK could start → closeCurrentEvent(). Then poll() resumes,
-- passes the already-checked isAfk guard, and creates a new real event during AFK.
-- Fix in code: re-check isAfk after await activeWin() in tracking-engine.ts.
-- This migration cleans up historical overlapping data.

-- Step 1: Delete non-AFK events that start within an AFK period.
-- These were incorrectly created during AFK due to the race condition.
DELETE FROM events
WHERE is_afk = 0
  AND EXISTS (
    SELECT 1 FROM events AS afk
    WHERE afk.is_afk = 1
      AND events.ts_start >= afk.ts_start
      AND events.ts_start <= afk.ts_end
  );

-- Step 2: For non-AFK events that start before AFK but end during/after AFK,
-- trim their end to the AFK start time (fixes partial overlaps).
UPDATE events
SET ts_end = (
      SELECT MIN(afk.ts_start) FROM events AS afk
      WHERE afk.is_afk = 1
        AND afk.ts_start > events.ts_start
        AND afk.ts_start < events.ts_end
    ),
    duration = CAST((
      julianday((
        SELECT MIN(afk.ts_start) FROM events AS afk
        WHERE afk.is_afk = 1
          AND afk.ts_start > events.ts_start
          AND afk.ts_start < events.ts_end
      )) - julianday(events.ts_start)
    ) * 86400 AS INTEGER)
WHERE is_afk = 0
  AND EXISTS (
    SELECT 1 FROM events AS afk
    WHERE afk.is_afk = 1
      AND afk.ts_start > events.ts_start
      AND afk.ts_start < events.ts_end
  );

ALTER TABLE `sessions` ADD `kind` text DEFAULT 'series' NOT NULL;--> statement-breakpoint
-- Backfill (maintainer ruling 2026-09-03). Every row lands on 'series' from
-- the DEFAULT above; only rows that are unambiguously round-count-only are
-- moved:
--
--   has any series row              -> 'series'  (series win over extra_rounds;
--                                                 a row with BOTH keeps its
--                                                 series AND its extra_rounds —
--                                                 nothing is deleted)
--   no series row, extra_rounds > 0 -> 'rounds'
--   neither                         -> 'series'  (an empty session has not been
--                                                 shot yet; 'series' hides
--                                                 nothing, 'rounds' would hide
--                                                 the series UI)
--
-- "Any series row" is deliberately wider than "any scored series": a session
-- whose only series is a provserie still holds series data that the rounds
-- shape would hide.
--
-- `updated_at` is bumped so sync's last-writer-wins accepts the change and the
-- outbox trigger (migration 0004) enqueues exactly these rows — the untouched
-- majority causes no sync traffic at all.
UPDATE `sessions`
SET `kind` = 'rounds',
    `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE `deleted_at` IS NULL
  AND coalesce(`extra_rounds`, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM `series`
    WHERE `series`.`session_id` = `sessions`.`id`
      AND `series`.`deleted_at` IS NULL
  );

-- Session-level ten / inner-ten counters (#138).
--
-- A ShotLog import writes a total-override series: one total, no per-shot
-- `shots` rows. Every ten/inner-ten statistic in shared/src/scoring counts
-- shot flags, so ShotLog's "Number of X" and "(X)" had nowhere to go and were
-- written into the session note as prose — readable, but not data.
--
-- Nullable on purpose. NULL means "count the shots", which is right for every
-- session that has them; a stored copy there would be a second truth that
-- drifts the moment a shot is edited.

ALTER TABLE `sessions` ADD `ten_count` integer;--> statement-breakpoint
ALTER TABLE `sessions` ADD `inner_ten_count` integer;
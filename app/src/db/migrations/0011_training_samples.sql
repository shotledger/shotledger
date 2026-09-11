-- Opt-in labelled samples for a future learned hole detector
-- (#138, "Phase 2 — learned hole detector").
--
-- Local only, by construction: `training_samples` is absent from
-- SYNC_TABLE_NAMES in shared/src/sync/protocol.ts, which is an allow-list, so
-- nothing here is ever pushed. Target photos are personal data under hard
-- rule 7 and have nowhere off-device to go.
--
-- The table stores labels, not pixels: `photo_uri` points at the file the
-- series already references. Rows are written only while the shooter has the
-- Settings opt-in on, and can be deleted on their own without touching the
-- logbook — which is what makes revoking consent mean something.
--
-- Numbered 0011, not 0010: #166 took 0010 for series_entry_mode first, and
-- this was regenerated with drizzle-kit rather than renumbered by hand so the
-- snapshot chain stays valid.

CREATE TABLE `training_samples` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`series_id` text NOT NULL,
	`target_face_id` text NOT NULL,
	`geometry_source` text NOT NULL,
	`photo_uri` text,
	`marks_json` text NOT NULL,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE no action
);

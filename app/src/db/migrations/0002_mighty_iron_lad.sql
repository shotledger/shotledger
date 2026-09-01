ALTER TABLE `series` ADD `is_total_override` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `series` ADD `total_override_tenths` integer;--> statement-breakpoint
ALTER TABLE `series` ADD `total_override_shot_count` integer;--> statement-breakpoint
ALTER TABLE `series` ADD `note` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `external_source` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `external_ref` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `external_synced_at` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `webshooter_competition_id` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `official_placement` integer;--> statement-breakpoint
ALTER TABLE `sessions` ADD `official_standardmedalj` text;
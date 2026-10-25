CREATE TABLE `ammo_lots` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`label` text NOT NULL,
	`caliber` text,
	`quantity` integer,
	`purchased_on` text,
	`is_handload` integer DEFAULT 0 NOT NULL,
	`brand` text,
	`product` text,
	`lot_number` text,
	`bullet_make` text,
	`bullet_model` text,
	`bullet_weight_gr` real,
	`velocity_mps` real,
	`powder` text,
	`powder_charge_gr` real,
	`primer` text,
	`brass` text,
	`col_mm` real,
	`crimp_mm` real,
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `falt_stations` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`session_id` text NOT NULL,
	`position` integer NOT NULL,
	`hits` integer DEFAULT 0 NOT NULL,
	`figures_hit` integer DEFAULT 0 NOT NULL,
	`figure_count` integer,
	`points` integer,
	`points_max` integer,
	`is_scratched` integer DEFAULT 0 NOT NULL,
	`is_shoot_off` integer DEFAULT 0 NOT NULL,
	`photo_uri` text,
	`note` text,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `firearm_calibers` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`firearm_id` text NOT NULL,
	`caliber` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`firearm_id`) REFERENCES `firearms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `firearm_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`firearm_id` text NOT NULL,
	`group_id` text NOT NULL,
	`is_default_for_group` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`firearm_id`) REFERENCES `firearms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `firearms` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`make` text NOT NULL,
	`model` text NOT NULL,
	`caliber` text,
	`weapon_type` text,
	`is_own` integer DEFAULT true NOT NULL,
	`serial_number` text,
	`vapen_id` text,
	`load_system` text,
	`notes` text,
	`round_count` integer DEFAULT 0 NOT NULL,
	`maintenance_interval_rounds` integer,
	`maintenance_interval_months` integer,
	`archived_at` text
);
--> statement-breakpoint
CREATE TABLE `licenses` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`firearm_id` text NOT NULL,
	`license_number` text,
	`purpose` text,
	`decided_on` text,
	`valid_until` text,
	`conditions` text,
	`authority` text,
	FOREIGN KEY (`firearm_id`) REFERENCES `firearms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `maintenance_events` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`firearm_id` text NOT NULL,
	`performed_at` text NOT NULL,
	`kind` text NOT NULL,
	`round_count_at` integer NOT NULL,
	`notes` text,
	`is_adjustment` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`firearm_id`) REFERENCES `firearms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `photo_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`photo_id` text NOT NULL,
	`local_uri` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `series` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`session_id` text NOT NULL,
	`position` integer NOT NULL,
	`is_sighter` integer DEFAULT 0 NOT NULL,
	`is_final` integer DEFAULT 0 NOT NULL,
	`photo_uri` text,
	`photo_geometry` text,
	`is_total_override` integer DEFAULT 0 NOT NULL,
	`total_override_tenths` integer,
	`total_override_shot_count` integer,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `session_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`session_id` text NOT NULL,
	`tag_id` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `session_tags_session_tag_idx` ON `session_tags` (`session_id`,`tag_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`kind` text DEFAULT 'series' NOT NULL,
	`series_entry_mode` text DEFAULT 'ask' NOT NULL,
	`discipline_id` text NOT NULL,
	`program_id` text,
	`competition_level` text,
	`is_championship` integer DEFAULT 0 NOT NULL,
	`competition_name` text,
	`weapon_group` text,
	`shooter_class` text,
	`event_id` text,
	`firearm_id` text,
	`ammo_lot_id` text,
	`started_at` text NOT NULL,
	`location` text,
	`notes` text,
	`decimal_scoring` integer DEFAULT 0 NOT NULL,
	`series_length` integer,
	`falt_result_mode` text,
	`extra_rounds` integer,
	`external_source` text,
	`external_ref` text,
	`official_placement` integer,
	`official_standardmedalj` text,
	FOREIGN KEY (`firearm_id`) REFERENCES `firearms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ammo_lot_id`) REFERENCES `ammo_lots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shot_marks` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`shot_id` text NOT NULL,
	`x_mm` real NOT NULL,
	`y_mm` real NOT NULL,
	`caliber_mm` real NOT NULL,
	FOREIGN KEY (`shot_id`) REFERENCES `shots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `shots` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`series_id` text NOT NULL,
	`position` integer NOT NULL,
	`value_tenths` integer NOT NULL,
	`is_inner_ten` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sight_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`firearm_id` text NOT NULL,
	`label` text NOT NULL,
	`elevation_clicks` integer,
	`windage_clicks` integer,
	`is_active` integer DEFAULT 0 NOT NULL,
	`notes` text,
	FOREIGN KEY (`firearm_id`) REFERENCES `firearms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sync_control` (
	`id` integer PRIMARY KEY NOT NULL,
	`applying` integer DEFAULT 0 NOT NULL,
	`last_rev` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_outbox` (
	`table_name` text NOT NULL,
	`row_id` text NOT NULL,
	`rev` integer NOT NULL,
	`client_change_id` text,
	PRIMARY KEY(`table_name`, `row_id`)
);
--> statement-breakpoint
CREATE TABLE `sync_refusal_marks` (
	`table_name` text NOT NULL,
	`row_id` text NOT NULL,
	`kind` text NOT NULL,
	`arrival` integer NOT NULL,
	`blocker_table` text,
	`blocker_row_id` text,
	`own` integer NOT NULL,
	PRIMARY KEY(`table_name`, `row_id`)
);
--> statement-breakpoint
CREATE TABLE `sync_state` (
	`table_name` text PRIMARY KEY NOT NULL,
	`cursor` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tags_name_idx` ON `tags` (`name`);--> statement-breakpoint
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
--> statement-breakpoint
--
-- Carried by hand, and NOT regenerable: drizzle-kit derives this file from
-- schema.ts, which models neither triggers nor seed rows. This repo has ONE
-- baseline and regenerates it in place on every schema change (hard rule 8,
-- maintainer 2026-09-22), so every regeneration silently drops everything
-- below this line unless it is carried across by hand — the outbox then
-- records nothing and sync goes quiet without an error. `migrations.test.ts`
-- fails if it does, and a new synced table needs its trigger pair added here.
--
INSERT INTO `sync_control` (`id`, `applying`, `last_rev`) VALUES (0, 0, 0);
--> statement-breakpoint
--
-- Outbox capture triggers (docs/specs/sync-app-spec.md §2). A trigger body
-- runs inside the caller's transaction, so ADR 0003's "local write + outbox
-- enqueue in ONE transaction" holds mechanically instead of resting on ~30
-- query modules each remembering to enqueue. The WHEN guard is what stops a
-- row applied from the server being pushed straight back.
--
CREATE TRIGGER `sync_outbox_firearms_insert` AFTER INSERT ON `firearms`
WHEN (SELECT `applying` FROM `sync_control` WHERE `id` = 0) = 0
BEGIN
  UPDATE `sync_control` SET `last_rev` = `last_rev` + 1 WHERE `id` = 0;
  INSERT INTO `sync_outbox` (`table_name`, `row_id`, `rev`, `client_change_id`)
    VALUES ('firearms', new.`id`, (SELECT `last_rev` FROM `sync_control` WHERE `id` = 0), NULL)
    ON CONFLICT(`table_name`, `row_id`) DO UPDATE
      SET `rev` = excluded.`rev`, `client_change_id` = NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_outbox_firearms_update` AFTER UPDATE ON `firearms`
WHEN (SELECT `applying` FROM `sync_control` WHERE `id` = 0) = 0
BEGIN
  UPDATE `sync_control` SET `last_rev` = `last_rev` + 1 WHERE `id` = 0;
  INSERT INTO `sync_outbox` (`table_name`, `row_id`, `rev`, `client_change_id`)
    VALUES ('firearms', new.`id`, (SELECT `last_rev` FROM `sync_control` WHERE `id` = 0), NULL)
    ON CONFLICT(`table_name`, `row_id`) DO UPDATE
      SET `rev` = excluded.`rev`, `client_change_id` = NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_outbox_licenses_insert` AFTER INSERT ON `licenses`
WHEN (SELECT `applying` FROM `sync_control` WHERE `id` = 0) = 0
BEGIN
  UPDATE `sync_control` SET `last_rev` = `last_rev` + 1 WHERE `id` = 0;
  INSERT INTO `sync_outbox` (`table_name`, `row_id`, `rev`, `client_change_id`)
    VALUES ('licenses', new.`id`, (SELECT `last_rev` FROM `sync_control` WHERE `id` = 0), NULL)
    ON CONFLICT(`table_name`, `row_id`) DO UPDATE
      SET `rev` = excluded.`rev`, `client_change_id` = NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_outbox_licenses_update` AFTER UPDATE ON `licenses`
WHEN (SELECT `applying` FROM `sync_control` WHERE `id` = 0) = 0
BEGIN
  UPDATE `sync_control` SET `last_rev` = `last_rev` + 1 WHERE `id` = 0;
  INSERT INTO `sync_outbox` (`table_name`, `row_id`, `rev`, `client_change_id`)
    VALUES ('licenses', new.`id`, (SELECT `last_rev` FROM `sync_control` WHERE `id` = 0), NULL)
    ON CONFLICT(`table_name`, `row_id`) DO UPDATE
      SET `rev` = excluded.`rev`, `client_change_id` = NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_outbox_firearm_groups_insert` AFTER INSERT ON `firearm_groups`
WHEN (SELECT `applying` FROM `sync_control` WHERE `id` = 0) = 0
BEGIN
  UPDATE `sync_control` SET `last_rev` = `last_rev` + 1 WHERE `id` = 0;
  INSERT INTO `sync_outbox` (`table_name`, `row_id`, `rev`, `client_change_id`)
    VALUES ('firearm_groups', new.`id`, (SELECT `last_rev` FROM `sync_control` WHERE `id` = 0), NULL)
    ON CONFLICT(`table_name`, `row_id`) DO UPDATE
      SET `rev` = excluded.`rev`, `client_change_id` = NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_outbox_firearm_groups_update` AFTER UPDATE ON `firearm_groups`
WHEN (SELECT `applying` FROM `sync_control` WHERE `id` = 0) = 0
BEGIN
  UPDATE `sync_control` SET `last_rev` = `last_rev` + 1 WHERE `id` = 0;
  INSERT INTO `sync_outbox` (`table_name`, `row_id`, `rev`, `client_change_id`)
    VALUES ('firearm_groups', new.`id`, (SELECT `last_rev` FROM `sync_control` WHERE `id` = 0), NULL)
    ON CONFLICT(`table_name`, `row_id`) DO UPDATE
      SET `rev` = excluded.`rev`, `client_change_id` = NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_outbox_ammo_lots_insert` AFTER INSERT ON `ammo_lots`
WHEN (SELECT `applying` FROM `sync_control` WHERE `id` = 0) = 0
BEGIN
  UPDATE `sync_control` SET `last_rev` = `last_rev` + 1 WHERE `id` = 0;
  INSERT INTO `sync_outbox` (`table_name`, `row_id`, `rev`, `client_change_id`)
    VALUES ('ammo_lots', new.`id`, (SELECT `last_rev` FROM `sync_control` WHERE `id` = 0), NULL)
    ON CONFLICT(`table_name`, `row_id`) DO UPDATE
      SET `rev` = excluded.`rev`, `client_change_id` = NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_outbox_ammo_lots_update` AFTER UPDATE ON `ammo_lots`
WHEN (SELECT `applying` FROM `sync_control` WHERE `id` = 0) = 0
BEGIN
  UPDATE `sync_control` SET `last_rev` = `last_rev` + 1 WHERE `id` = 0;
  INSERT INTO `sync_outbox` (`table_name`, `row_id`, `rev`, `client_change_id`)
    VALUES ('ammo_lots', new.`id`, (SELECT `last_rev` FROM `sync_control` WHERE `id` = 0), NULL)
    ON CONFLICT(`table_name`, `row_id`) DO UPDATE
      SET `rev` = excluded.`rev`, `client_change_id` = NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_outbox_sessions_insert` AFTER INSERT ON `sessions`
WHEN (SELECT `applying` FROM `sync_control` WHERE `id` = 0) = 0
BEGIN
  UPDATE `sync_control` SET `last_rev` = `last_rev` + 1 WHERE `id` = 0;
  INSERT INTO `sync_outbox` (`table_name`, `row_id`, `rev`, `client_change_id`)
    VALUES ('sessions', new.`id`, (SELECT `last_rev` FROM `sync_control` WHERE `id` = 0), NULL)
    ON CONFLICT(`table_name`, `row_id`) DO UPDATE
      SET `rev` = excluded.`rev`, `client_change_id` = NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_outbox_sessions_update` AFTER UPDATE ON `sessions`
WHEN (SELECT `applying` FROM `sync_control` WHERE `id` = 0) = 0
BEGIN
  UPDATE `sync_control` SET `last_rev` = `last_rev` + 1 WHERE `id` = 0;
  INSERT INTO `sync_outbox` (`table_name`, `row_id`, `rev`, `client_change_id`)
    VALUES ('sessions', new.`id`, (SELECT `last_rev` FROM `sync_control` WHERE `id` = 0), NULL)
    ON CONFLICT(`table_name`, `row_id`) DO UPDATE
      SET `rev` = excluded.`rev`, `client_change_id` = NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_outbox_series_insert` AFTER INSERT ON `series`
WHEN (SELECT `applying` FROM `sync_control` WHERE `id` = 0) = 0
BEGIN
  UPDATE `sync_control` SET `last_rev` = `last_rev` + 1 WHERE `id` = 0;
  INSERT INTO `sync_outbox` (`table_name`, `row_id`, `rev`, `client_change_id`)
    VALUES ('series', new.`id`, (SELECT `last_rev` FROM `sync_control` WHERE `id` = 0), NULL)
    ON CONFLICT(`table_name`, `row_id`) DO UPDATE
      SET `rev` = excluded.`rev`, `client_change_id` = NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_outbox_series_update` AFTER UPDATE ON `series`
WHEN (SELECT `applying` FROM `sync_control` WHERE `id` = 0) = 0
BEGIN
  UPDATE `sync_control` SET `last_rev` = `last_rev` + 1 WHERE `id` = 0;
  INSERT INTO `sync_outbox` (`table_name`, `row_id`, `rev`, `client_change_id`)
    VALUES ('series', new.`id`, (SELECT `last_rev` FROM `sync_control` WHERE `id` = 0), NULL)
    ON CONFLICT(`table_name`, `row_id`) DO UPDATE
      SET `rev` = excluded.`rev`, `client_change_id` = NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_outbox_shots_insert` AFTER INSERT ON `shots`
WHEN (SELECT `applying` FROM `sync_control` WHERE `id` = 0) = 0
BEGIN
  UPDATE `sync_control` SET `last_rev` = `last_rev` + 1 WHERE `id` = 0;
  INSERT INTO `sync_outbox` (`table_name`, `row_id`, `rev`, `client_change_id`)
    VALUES ('shots', new.`id`, (SELECT `last_rev` FROM `sync_control` WHERE `id` = 0), NULL)
    ON CONFLICT(`table_name`, `row_id`) DO UPDATE
      SET `rev` = excluded.`rev`, `client_change_id` = NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_outbox_shots_update` AFTER UPDATE ON `shots`
WHEN (SELECT `applying` FROM `sync_control` WHERE `id` = 0) = 0
BEGIN
  UPDATE `sync_control` SET `last_rev` = `last_rev` + 1 WHERE `id` = 0;
  INSERT INTO `sync_outbox` (`table_name`, `row_id`, `rev`, `client_change_id`)
    VALUES ('shots', new.`id`, (SELECT `last_rev` FROM `sync_control` WHERE `id` = 0), NULL)
    ON CONFLICT(`table_name`, `row_id`) DO UPDATE
      SET `rev` = excluded.`rev`, `client_change_id` = NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_outbox_maintenance_events_insert` AFTER INSERT ON `maintenance_events`
WHEN (SELECT `applying` FROM `sync_control` WHERE `id` = 0) = 0
BEGIN
  UPDATE `sync_control` SET `last_rev` = `last_rev` + 1 WHERE `id` = 0;
  INSERT INTO `sync_outbox` (`table_name`, `row_id`, `rev`, `client_change_id`)
    VALUES ('maintenance_events', new.`id`, (SELECT `last_rev` FROM `sync_control` WHERE `id` = 0), NULL)
    ON CONFLICT(`table_name`, `row_id`) DO UPDATE
      SET `rev` = excluded.`rev`, `client_change_id` = NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_outbox_maintenance_events_update` AFTER UPDATE ON `maintenance_events`
WHEN (SELECT `applying` FROM `sync_control` WHERE `id` = 0) = 0
BEGIN
  UPDATE `sync_control` SET `last_rev` = `last_rev` + 1 WHERE `id` = 0;
  INSERT INTO `sync_outbox` (`table_name`, `row_id`, `rev`, `client_change_id`)
    VALUES ('maintenance_events', new.`id`, (SELECT `last_rev` FROM `sync_control` WHERE `id` = 0), NULL)
    ON CONFLICT(`table_name`, `row_id`) DO UPDATE
      SET `rev` = excluded.`rev`, `client_change_id` = NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_outbox_tags_insert` AFTER INSERT ON `tags`
WHEN (SELECT `applying` FROM `sync_control` WHERE `id` = 0) = 0
BEGIN
  UPDATE `sync_control` SET `last_rev` = `last_rev` + 1 WHERE `id` = 0;
  INSERT INTO `sync_outbox` (`table_name`, `row_id`, `rev`, `client_change_id`)
    VALUES ('tags', new.`id`, (SELECT `last_rev` FROM `sync_control` WHERE `id` = 0), NULL)
    ON CONFLICT(`table_name`, `row_id`) DO UPDATE
      SET `rev` = excluded.`rev`, `client_change_id` = NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_outbox_tags_update` AFTER UPDATE ON `tags`
WHEN (SELECT `applying` FROM `sync_control` WHERE `id` = 0) = 0
BEGIN
  UPDATE `sync_control` SET `last_rev` = `last_rev` + 1 WHERE `id` = 0;
  INSERT INTO `sync_outbox` (`table_name`, `row_id`, `rev`, `client_change_id`)
    VALUES ('tags', new.`id`, (SELECT `last_rev` FROM `sync_control` WHERE `id` = 0), NULL)
    ON CONFLICT(`table_name`, `row_id`) DO UPDATE
      SET `rev` = excluded.`rev`, `client_change_id` = NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_outbox_sight_settings_insert` AFTER INSERT ON `sight_settings`
WHEN (SELECT `applying` FROM `sync_control` WHERE `id` = 0) = 0
BEGIN
  UPDATE `sync_control` SET `last_rev` = `last_rev` + 1 WHERE `id` = 0;
  INSERT INTO `sync_outbox` (`table_name`, `row_id`, `rev`, `client_change_id`)
    VALUES ('sight_settings', new.`id`, (SELECT `last_rev` FROM `sync_control` WHERE `id` = 0), NULL)
    ON CONFLICT(`table_name`, `row_id`) DO UPDATE
      SET `rev` = excluded.`rev`, `client_change_id` = NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_outbox_sight_settings_update` AFTER UPDATE ON `sight_settings`
WHEN (SELECT `applying` FROM `sync_control` WHERE `id` = 0) = 0
BEGIN
  UPDATE `sync_control` SET `last_rev` = `last_rev` + 1 WHERE `id` = 0;
  INSERT INTO `sync_outbox` (`table_name`, `row_id`, `rev`, `client_change_id`)
    VALUES ('sight_settings', new.`id`, (SELECT `last_rev` FROM `sync_control` WHERE `id` = 0), NULL)
    ON CONFLICT(`table_name`, `row_id`) DO UPDATE
      SET `rev` = excluded.`rev`, `client_change_id` = NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_outbox_falt_stations_insert` AFTER INSERT ON `falt_stations`
WHEN (SELECT `applying` FROM `sync_control` WHERE `id` = 0) = 0
BEGIN
  UPDATE `sync_control` SET `last_rev` = `last_rev` + 1 WHERE `id` = 0;
  INSERT INTO `sync_outbox` (`table_name`, `row_id`, `rev`, `client_change_id`)
    VALUES ('falt_stations', new.`id`, (SELECT `last_rev` FROM `sync_control` WHERE `id` = 0), NULL)
    ON CONFLICT(`table_name`, `row_id`) DO UPDATE
      SET `rev` = excluded.`rev`, `client_change_id` = NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_outbox_falt_stations_update` AFTER UPDATE ON `falt_stations`
WHEN (SELECT `applying` FROM `sync_control` WHERE `id` = 0) = 0
BEGIN
  UPDATE `sync_control` SET `last_rev` = `last_rev` + 1 WHERE `id` = 0;
  INSERT INTO `sync_outbox` (`table_name`, `row_id`, `rev`, `client_change_id`)
    VALUES ('falt_stations', new.`id`, (SELECT `last_rev` FROM `sync_control` WHERE `id` = 0), NULL)
    ON CONFLICT(`table_name`, `row_id`) DO UPDATE
      SET `rev` = excluded.`rev`, `client_change_id` = NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_outbox_firearm_calibers_insert` AFTER INSERT ON `firearm_calibers`
WHEN (SELECT `applying` FROM `sync_control` WHERE `id` = 0) = 0
BEGIN
  UPDATE `sync_control` SET `last_rev` = `last_rev` + 1 WHERE `id` = 0;
  INSERT INTO `sync_outbox` (`table_name`, `row_id`, `rev`, `client_change_id`)
    VALUES ('firearm_calibers', new.`id`, (SELECT `last_rev` FROM `sync_control` WHERE `id` = 0), NULL)
    ON CONFLICT(`table_name`, `row_id`) DO UPDATE
      SET `rev` = excluded.`rev`, `client_change_id` = NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_outbox_firearm_calibers_update` AFTER UPDATE ON `firearm_calibers`
WHEN (SELECT `applying` FROM `sync_control` WHERE `id` = 0) = 0
BEGIN
  UPDATE `sync_control` SET `last_rev` = `last_rev` + 1 WHERE `id` = 0;
  INSERT INTO `sync_outbox` (`table_name`, `row_id`, `rev`, `client_change_id`)
    VALUES ('firearm_calibers', new.`id`, (SELECT `last_rev` FROM `sync_control` WHERE `id` = 0), NULL)
    ON CONFLICT(`table_name`, `row_id`) DO UPDATE
      SET `rev` = excluded.`rev`, `client_change_id` = NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_outbox_session_tags_insert` AFTER INSERT ON `session_tags`
WHEN (SELECT `applying` FROM `sync_control` WHERE `id` = 0) = 0
BEGIN
  UPDATE `sync_control` SET `last_rev` = `last_rev` + 1 WHERE `id` = 0;
  INSERT INTO `sync_outbox` (`table_name`, `row_id`, `rev`, `client_change_id`)
    VALUES ('session_tags', new.`id`, (SELECT `last_rev` FROM `sync_control` WHERE `id` = 0), NULL)
    ON CONFLICT(`table_name`, `row_id`) DO UPDATE
      SET `rev` = excluded.`rev`, `client_change_id` = NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_outbox_session_tags_update` AFTER UPDATE ON `session_tags`
WHEN (SELECT `applying` FROM `sync_control` WHERE `id` = 0) = 0
BEGIN
  UPDATE `sync_control` SET `last_rev` = `last_rev` + 1 WHERE `id` = 0;
  INSERT INTO `sync_outbox` (`table_name`, `row_id`, `rev`, `client_change_id`)
    VALUES ('session_tags', new.`id`, (SELECT `last_rev` FROM `sync_control` WHERE `id` = 0), NULL)
    ON CONFLICT(`table_name`, `row_id`) DO UPDATE
      SET `rev` = excluded.`rev`, `client_change_id` = NULL;
END;
--> statement-breakpoint
-- Only the account settings sync (SYNCED_SETTING_KEYS in
-- shared/src/sync/protocol.ts, ADR 0019); every other key is device-local.
CREATE TRIGGER `sync_outbox_settings_insert` AFTER INSERT ON `settings`
WHEN (SELECT `applying` FROM `sync_control` WHERE `id` = 0) = 0
  AND new.`id` IN ('birthYear', 'skillClass', 'competesInWomensClasses', 'complianceProfile', 'complianceProfileVariant', 'showLicenseActivity', 'showPhotos', 'showTimer', 'showSightSettings', 'showAmmoLots', 'showMaintenance')
BEGIN
  UPDATE `sync_control` SET `last_rev` = `last_rev` + 1 WHERE `id` = 0;
  INSERT INTO `sync_outbox` (`table_name`, `row_id`, `rev`, `client_change_id`)
    VALUES ('settings', new.`id`, (SELECT `last_rev` FROM `sync_control` WHERE `id` = 0), NULL)
    ON CONFLICT(`table_name`, `row_id`) DO UPDATE
      SET `rev` = excluded.`rev`, `client_change_id` = NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_outbox_settings_update` AFTER UPDATE ON `settings`
WHEN (SELECT `applying` FROM `sync_control` WHERE `id` = 0) = 0
  AND new.`id` IN ('birthYear', 'skillClass', 'competesInWomensClasses', 'complianceProfile', 'complianceProfileVariant', 'showLicenseActivity', 'showPhotos', 'showTimer', 'showSightSettings', 'showAmmoLots', 'showMaintenance')
BEGIN
  UPDATE `sync_control` SET `last_rev` = `last_rev` + 1 WHERE `id` = 0;
  INSERT INTO `sync_outbox` (`table_name`, `row_id`, `rev`, `client_change_id`)
    VALUES ('settings', new.`id`, (SELECT `last_rev` FROM `sync_control` WHERE `id` = 0), NULL)
    ON CONFLICT(`table_name`, `row_id`) DO UPDATE
      SET `rev` = excluded.`rev`, `client_change_id` = NULL;
END;

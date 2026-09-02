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
CREATE TABLE `sync_state` (
	`table_name` text PRIMARY KEY NOT NULL,
	`cursor` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
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

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

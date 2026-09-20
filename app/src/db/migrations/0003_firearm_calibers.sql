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

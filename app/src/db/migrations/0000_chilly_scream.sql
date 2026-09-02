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
	`powder` text,
	`powder_charge_gr` real,
	`primer` text,
	`brass` text,
	`col_mm` real,
	`crimp_mm` real,
	`notes` text
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
	`serial_number` text,
	`vapen_id` text,
	`load_system` text,
	`notes` text,
	`round_count` integer DEFAULT 0 NOT NULL,
	`maintenance_interval_rounds` integer,
	`rounds_since_maintenance` integer DEFAULT 0 NOT NULL
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
	`round_count_at` integer,
	`notes` text,
	FOREIGN KEY (`firearm_id`) REFERENCES `firearms`(`id`) ON UPDATE no action ON DELETE no action
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
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `session_tags` (
	`session_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`session_id`, `tag_id`),
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`discipline_id` text NOT NULL,
	`program_id` text,
	`competition_level` text,
	`is_championship` integer DEFAULT 0 NOT NULL,
	`competition_name` text,
	`weapon_group` text,
	`shooter_class` text,
	`firearm_id` text,
	`ammo_lot_id` text,
	`started_at` text NOT NULL,
	`location` text,
	`notes` text,
	`decimal_scoring` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`firearm_id`) REFERENCES `firearms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ammo_lot_id`) REFERENCES `ammo_lots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
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
	`is_inner_ten_decimal` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE no action
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
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);
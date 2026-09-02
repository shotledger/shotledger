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

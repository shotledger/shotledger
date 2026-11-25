CREATE TABLE `sync_pending_rows` (
	`table_name` text NOT NULL,
	`row_id` text NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`table_name`, `row_id`)
);

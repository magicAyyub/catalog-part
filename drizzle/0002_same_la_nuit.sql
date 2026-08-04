CREATE TABLE `etf_lookup_index` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vehicle_id` integer NOT NULL,
	`category_id` integer NOT NULL,
	`vehicle_json` text NOT NULL,
	`products_json` text NOT NULL,
	`updated_at` integer NOT NULL
);

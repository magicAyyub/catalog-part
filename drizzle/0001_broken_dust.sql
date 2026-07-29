CREATE TABLE `api_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` integer NOT NULL
);

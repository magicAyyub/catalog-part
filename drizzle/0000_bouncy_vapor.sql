CREATE TABLE `article_criteria` (
	`article_id` integer NOT NULL,
	`name` text NOT NULL,
	`value` text NOT NULL,
	`type` text,
	PRIMARY KEY(`article_id`, `name`, `value`),
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`article_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `article_criteria_name_value_idx` ON `article_criteria` (`name`,`value`);--> statement-breakpoint
CREATE TABLE `articles` (
	`article_id` integer PRIMARY KEY NOT NULL,
	`article_no` text NOT NULL,
	`supplier_id` integer NOT NULL,
	`product_id` integer,
	`product_name` text,
	`ean_number` text,
	`media_type` text,
	`media_file_name` text,
	`image_url` text,
	`details_fetched_at` integer,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`supplier_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `articles_supplier_idx` ON `articles` (`supplier_id`);--> statement-breakpoint
CREATE INDEX `articles_article_no_idx` ON `articles` (`article_no`);--> statement-breakpoint
CREATE TABLE `catalog_sync` (
	`vehicle_id` integer NOT NULL,
	`category_id` integer NOT NULL,
	`article_count` integer DEFAULT 0 NOT NULL,
	`synced_at` integer NOT NULL,
	PRIMARY KEY(`vehicle_id`, `category_id`),
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`vehicle_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `fitments` (
	`vehicle_id` integer NOT NULL,
	`article_id` integer NOT NULL,
	`category_id` integer NOT NULL,
	PRIMARY KEY(`vehicle_id`, `article_id`, `category_id`),
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`vehicle_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`article_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `fitments_vehicle_category_idx` ON `fitments` (`vehicle_id`,`category_id`);--> statement-breakpoint
CREATE INDEX `fitments_article_idx` ON `fitments` (`article_id`);--> statement-breakpoint
CREATE TABLE `manufacturers` (
	`manufacturer_id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `models` (
	`model_id` integer PRIMARY KEY NOT NULL,
	`manufacturer_id` integer NOT NULL,
	`name` text NOT NULL,
	`year_from` text,
	`year_to` text,
	FOREIGN KEY (`manufacturer_id`) REFERENCES `manufacturers`(`manufacturer_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `models_manufacturer_idx` ON `models` (`manufacturer_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `suppliers` (
	`supplier_id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`display_name` text,
	`franchise` text,
	`role` text DEFAULT 'user' NOT NULL,
	`disabled_at` integer,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`last_login_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE TABLE `vehicle_selections` (
	`user_id` text PRIMARY KEY NOT NULL,
	`vehicle_id` integer NOT NULL,
	`selected_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`vehicle_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `vehicles` (
	`vehicle_id` integer PRIMARY KEY NOT NULL,
	`model_id` integer,
	`manufacturer_name` text NOT NULL,
	`model_name` text NOT NULL,
	`type_engine_name` text NOT NULL,
	`engine_codes` text,
	`engine_id` integer,
	`power_kw` real,
	`power_ps` real,
	`fuel_type` text,
	`body_type` text,
	`number_of_cylinders` integer,
	`capacity_lt` real,
	`capacity_tech` real,
	`construction_interval_start` text,
	`construction_interval_end` text
);
--> statement-breakpoint
CREATE INDEX `vehicles_model_idx` ON `vehicles` (`model_id`);--> statement-breakpoint
CREATE INDEX `vehicles_engine_codes_idx` ON `vehicles` (`engine_codes`);
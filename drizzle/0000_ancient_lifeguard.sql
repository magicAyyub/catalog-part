CREATE TABLE `article_compatible_cars` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`article_id` integer NOT NULL,
	`vehicle_id` integer NOT NULL,
	`model_id` integer,
	`manufacturer_name` text NOT NULL,
	`model_name` text NOT NULL,
	`type_engine_name` text NOT NULL,
	`construction_interval_start` text,
	`construction_interval_end` text
);
--> statement-breakpoint
CREATE TABLE `article_criteria_facets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vehicle_id` integer NOT NULL,
	`category_id` integer NOT NULL,
	`criteria_name` text NOT NULL,
	`type` text,
	`distinct_values_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `article_specifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`article_id` integer NOT NULL,
	`criteria_name` text NOT NULL,
	`criteria_value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `articles` (
	`article_id` integer NOT NULL,
	`vehicle_id` integer NOT NULL,
	`category_id` integer NOT NULL,
	`article_no` text NOT NULL,
	`article_product_name` text NOT NULL,
	`product_id` integer,
	`supplier_id` integer NOT NULL,
	`article_media_type` text,
	`article_media_file_name` text,
	`s3image` text,
	PRIMARY KEY(`article_id`, `vehicle_id`, `category_id`),
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`vehicle_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`category_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`supplier_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`category_id` integer PRIMARY KEY NOT NULL,
	`label_fr` text NOT NULL,
	`label_en` text
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`supplier_id` integer PRIMARY KEY NOT NULL,
	`supplier_name` text NOT NULL,
	`supplier_match_code` text,
	`supplier_logo_name` text,
	`s3image` text
);
--> statement-breakpoint
CREATE TABLE `vehicles` (
	`vehicle_id` integer PRIMARY KEY NOT NULL,
	`manufacturer_id` integer NOT NULL,
	`manufacturer_name` text NOT NULL,
	`model_id` integer NOT NULL,
	`model_name` text NOT NULL,
	`type_engine_name` text NOT NULL,
	`power_kw` real,
	`power_ps` real,
	`fuel_type` text,
	`body_type` text,
	`construction_interval_start` text,
	`construction_interval_end` text,
	`synced_at` integer
);

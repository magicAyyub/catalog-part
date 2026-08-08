CREATE TABLE `equivalence_cluster` (
	`article_id` integer PRIMARY KEY NOT NULL,
	`cluster_id` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `equivalence_cluster_idx` ON `equivalence_cluster` (`cluster_id`);--> statement-breakpoint
CREATE TABLE `equivalence_edge` (
	`article_id_a` integer NOT NULL,
	`article_id_b` integer NOT NULL,
	`kind` text NOT NULL,
	`evidence` text,
	PRIMARY KEY(`article_id_a`, `article_id_b`, `kind`)
);
--> statement-breakpoint
CREATE INDEX `equivalence_edge_a_idx` ON `equivalence_edge` (`article_id_a`);--> statement-breakpoint
CREATE TABLE `index_job` (
	`vehicle_id` integer NOT NULL,
	`category_id` integer NOT NULL,
	`status` text NOT NULL,
	`articles_found` integer DEFAULT 0 NOT NULL,
	`articles_kept` integer DEFAULT 0 NOT NULL,
	`criteria_rows` integer DEFAULT 0 NOT NULL,
	`api_calls` integer DEFAULT 0 NOT NULL,
	`duration_ms` integer,
	`error` text,
	`indexed_at` integer NOT NULL,
	PRIMARY KEY(`vehicle_id`, `category_id`)
);
--> statement-breakpoint
CREATE INDEX `index_job_status_idx` ON `index_job` (`status`);--> statement-breakpoint
CREATE TABLE `supplier_offer` (
	`brand_key` text NOT NULL,
	`article_no_key` text NOT NULL,
	`source` text NOT NULL,
	`price_net` real,
	`price_gross` real,
	`discount_pct` real,
	`stock_label` text,
	`in_stock` integer,
	`fetched_at` integer NOT NULL,
	PRIMARY KEY(`brand_key`, `article_no_key`, `source`)
);
--> statement-breakpoint
CREATE INDEX `supplier_offer_fetched_idx` ON `supplier_offer` (`fetched_at`);--> statement-breakpoint
CREATE TABLE `td_article` (
	`article_id` integer PRIMARY KEY NOT NULL,
	`article_no` text NOT NULL,
	`article_no_key` text NOT NULL,
	`supplier_id` integer NOT NULL,
	`brand_key` text NOT NULL,
	`product_id` integer,
	`product_name` text,
	`image_url` text,
	`details_fetched_at` integer,
	FOREIGN KEY (`supplier_id`) REFERENCES `td_supplier`(`supplier_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `td_article_key_idx` ON `td_article` (`brand_key`,`article_no_key`);--> statement-breakpoint
CREATE INDEX `td_article_supplier_idx` ON `td_article` (`supplier_id`);--> statement-breakpoint
CREATE TABLE `td_criteria` (
	`article_id` integer NOT NULL,
	`criteria_name` text NOT NULL,
	`criteria_value` text NOT NULL,
	PRIMARY KEY(`article_id`, `criteria_name`, `criteria_value`),
	FOREIGN KEY (`article_id`) REFERENCES `td_article`(`article_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `td_criteria_article_idx` ON `td_criteria` (`article_id`);--> statement-breakpoint
CREATE INDEX `td_criteria_value_idx` ON `td_criteria` (`criteria_name`,`criteria_value`);--> statement-breakpoint
CREATE TABLE `td_fitment` (
	`vehicle_id` integer NOT NULL,
	`article_id` integer NOT NULL,
	`category_id` integer NOT NULL,
	`product_id` integer,
	PRIMARY KEY(`vehicle_id`, `article_id`, `category_id`),
	FOREIGN KEY (`vehicle_id`) REFERENCES `td_vehicle`(`vehicle_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`article_id`) REFERENCES `td_article`(`article_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `td_fitment_vehicle_cat_idx` ON `td_fitment` (`vehicle_id`,`category_id`);--> statement-breakpoint
CREATE INDEX `td_fitment_article_idx` ON `td_fitment` (`article_id`);--> statement-breakpoint
CREATE TABLE `td_oem` (
	`article_id` integer NOT NULL,
	`oem_brand` text NOT NULL,
	`oem_no` text NOT NULL,
	`oem_no_key` text NOT NULL,
	PRIMARY KEY(`article_id`, `oem_brand`, `oem_no_key`),
	FOREIGN KEY (`article_id`) REFERENCES `td_article`(`article_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `td_oem_key_idx` ON `td_oem` (`oem_no_key`);--> statement-breakpoint
CREATE TABLE `td_supplier` (
	`supplier_id` integer PRIMARY KEY NOT NULL,
	`supplier_name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `td_vehicle` (
	`vehicle_id` integer PRIMARY KEY NOT NULL,
	`manufacturer_id` integer,
	`manufacturer_name` text NOT NULL,
	`model_id` integer,
	`model_name` text NOT NULL,
	`type_engine_name` text NOT NULL,
	`power_kw` real,
	`power_ps` real,
	`fuel_type` text,
	`body_type` text,
	`engine_codes` text,
	`ctor_start` text,
	`ctor_end` text
);
--> statement-breakpoint
CREATE INDEX `td_vehicle_model_idx` ON `td_vehicle` (`model_id`);--> statement-breakpoint
CREATE INDEX `td_vehicle_interval_idx` ON `td_vehicle` (`ctor_start`,`ctor_end`);--> statement-breakpoint
CREATE TABLE `td_wva` (
	`article_id` integer NOT NULL,
	`wva` text NOT NULL,
	PRIMARY KEY(`article_id`, `wva`),
	FOREIGN KEY (`article_id`) REFERENCES `td_article`(`article_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `td_wva_idx` ON `td_wva` (`wva`);
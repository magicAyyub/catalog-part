CREATE TABLE `article_oem_numbers` (
	`article_id` integer NOT NULL,
	`oem_brand` text NOT NULL,
	`oem_display_no` text NOT NULL,
	`cleaned_no` text NOT NULL,
	PRIMARY KEY(`article_id`, `oem_display_no`),
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`article_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `article_oem_numbers_cleaned_idx` ON `article_oem_numbers` (`cleaned_no`);
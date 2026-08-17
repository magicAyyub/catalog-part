-- Le véhicule 101412 est un carId de portail, pas un K-Type : le bug d'origine
-- du projet, resté en base. Ses articles viennent de l'ancien scraping
-- fournisseur, sont absents de td_article, et portent les seuls prix stockés.
-- On retire la fiche, ses articles, puis les specs devenues orphelines.
DELETE FROM `article_specifications`
WHERE `article_id` IN (SELECT `article_id` FROM `articles` WHERE `vehicle_id` = 101412)
  AND `article_id` NOT IN (SELECT `article_id` FROM `articles` WHERE `vehicle_id` <> 101412);
--> statement-breakpoint
DELETE FROM `articles` WHERE `vehicle_id` = 101412;--> statement-breakpoint
DELETE FROM `vehicles` WHERE `vehicle_id` = 101412;--> statement-breakpoint
-- Colonnes des scrapers de prix supprimés. Aucune source de prix n'existe.
ALTER TABLE `articles` DROP COLUMN `price_net`;--> statement-breakpoint
ALTER TABLE `articles` DROP COLUMN `price_base`;--> statement-breakpoint
ALTER TABLE `articles` DROP COLUMN `discount_label`;--> statement-breakpoint
ALTER TABLE `articles` DROP COLUMN `in_stock`;--> statement-breakpoint
ALTER TABLE `articles` DROP COLUMN `stock_label`;

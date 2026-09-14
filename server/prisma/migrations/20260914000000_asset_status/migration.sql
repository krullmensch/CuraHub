-- VID-03: background video processing state
ALTER TABLE `Asset` ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'ready';

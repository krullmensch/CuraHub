-- ONBOARDING: null = the dashboard tour has not been finished or skipped yet (every existing account sees it once).
ALTER TABLE `User` ADD COLUMN `onboarding_completed_at` DATETIME(3) NULL;

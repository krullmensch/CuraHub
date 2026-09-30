-- SETUP: instance settings written by the first-run wizard.
CREATE TABLE `SystemSetting` (
    `key` VARCHAR(64) NOT NULL,
    `value` TEXT NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Databases that already have users (every installation before this migration) count as set up,
-- so the wizard only ever appears on a fresh install.
INSERT INTO `SystemSetting` (`key`, `value`, `updatedAt`)
SELECT 'setup_completed_at', DATE_FORMAT(UTC_TIMESTAMP(3), '%Y-%m-%dT%H:%i:%s.%fZ'), NOW(3)
FROM DUAL
WHERE EXISTS (SELECT 1 FROM `User`);

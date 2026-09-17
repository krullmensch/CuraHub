-- FRAME-02: per-instance picture frame profile ("none" = unframed).
-- Existing instances keep the Halbe Classic Alu 8 look they were planned with.
ALTER TABLE `ArtworkInstance` ADD COLUMN `frameStyle` VARCHAR(191) NOT NULL DEFAULT 'alu-silver';

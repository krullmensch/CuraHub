-- CreateTable
CREATE TABLE `ArExport` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `versionId` INTEGER NOT NULL,
    `status` VARCHAR(16) NOT NULL,
    `glb_file` VARCHAR(191) NULL,
    `usdz_file` VARCHAR(191) NULL,
    `glb_size` INTEGER NULL,
    `usdz_size` INTEGER NULL,
    `skipped` INTEGER NOT NULL DEFAULT 0,
    `error` TEXT NULL,
    `started_at` DATETIME(3) NULL,
    `finished_at` DATETIME(3) NULL,

    UNIQUE INDEX `ArExport_versionId_key`(`versionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ArExport` ADD CONSTRAINT `ArExport_versionId_fkey` FOREIGN KEY (`versionId`) REFERENCES `ExhibitionVersion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

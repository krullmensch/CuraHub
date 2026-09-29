-- CreateTable
CREATE TABLE `ScaleFigure` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `versionId` INTEGER NOT NULL,
    `position_x` DOUBLE NOT NULL DEFAULT 0,
    `position_z` DOUBLE NOT NULL DEFAULT 0,
    `rotation_y` DOUBLE NOT NULL DEFAULT 0,
    `isPublic` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ScaleFigure` ADD CONSTRAINT `ScaleFigure_versionId_fkey` FOREIGN KEY (`versionId`) REFERENCES `ExhibitionVersion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE `User` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(191) NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'user',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Project` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `ownerId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Project_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Folder` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `color` VARCHAR(191) NOT NULL DEFAULT '#6b7280',
    `projectId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Folder_projectId_idx`(`projectId`),
    UNIQUE INDEX `Folder_projectId_name_key`(`projectId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Exhibition` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `room_id` INTEGER NOT NULL,
    `projectId` INTEGER NOT NULL,
    `start_date` DATETIME(3) NULL,
    `end_date` DATETIME(3) NULL,
    `poster_path` VARCHAR(191) NULL,

    UNIQUE INDEX `Exhibition_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExhibitionCollaborator` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `exhibitionId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `invitedById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ExhibitionCollaborator_exhibitionId_userId_key`(`exhibitionId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExhibitionVersion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `exhibition_id` INTEGER NOT NULL,
    `parent_version_id` INTEGER NULL,
    `branch_name` VARCHAR(191) NOT NULL DEFAULT 'main',
    `created_by_user_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `comment` VARCHAR(191) NULL,
    `is_published` BOOLEAN NOT NULL DEFAULT false,
    `is_featured` BOOLEAN NOT NULL DEFAULT false,
    `published_at` DATETIME(3) NULL,
    `data` JSON NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Artwork` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(191) NOT NULL,
    `artist` VARCHAR(191) NULL,
    `year` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `width` DOUBLE NULL,
    `height` DOUBLE NULL,
    `assetId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Artwork_assetId_key`(`assetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Asset` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `filename` VARCHAR(191) NOT NULL,
    `path` VARCHAR(191) NOT NULL,
    `mimetype` VARCHAR(191) NOT NULL,
    `size` INTEGER NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'image',
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `dpi` INTEGER NULL,
    `duration` DOUBLE NULL,
    `thumbnailPath` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `fileHash` VARCHAR(191) NULL,
    `projectId` INTEGER NULL,
    `folderId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Asset_folderId_idx`(`folderId`),
    INDEX `Asset_fileHash_projectId_idx`(`fileHash`, `projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ArtworkInstance` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `artworkId` INTEGER NOT NULL,
    `versionId` INTEGER NOT NULL,
    `wallId` INTEGER NULL,
    `position_x` DOUBLE NOT NULL,
    `position_y` DOUBLE NOT NULL,
    `position_z` DOUBLE NOT NULL,
    `rotation_x` DOUBLE NOT NULL DEFAULT 0,
    `rotation_y` DOUBLE NOT NULL DEFAULT 0,
    `rotation_z` DOUBLE NOT NULL DEFAULT 0,
    `scale_x` DOUBLE NOT NULL DEFAULT 1.0,
    `scale_y` DOUBLE NOT NULL DEFAULT 1.0,
    `scale_z` DOUBLE NOT NULL DEFAULT 1.0,
    `medium` VARCHAR(191) NOT NULL DEFAULT 'frame',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ModularWall` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `versionId` INTEGER NOT NULL,
    `label` VARCHAR(191) NULL,
    `position_x` DOUBLE NOT NULL DEFAULT 0,
    `position_y` DOUBLE NOT NULL DEFAULT 0,
    `position_z` DOUBLE NOT NULL DEFAULT 0,
    `rotation_x` DOUBLE NOT NULL DEFAULT 0,
    `rotation_y` DOUBLE NOT NULL DEFAULT 0,
    `rotation_z` DOUBLE NOT NULL DEFAULT 0,
    `width` DOUBLE NOT NULL DEFAULT 2.0,
    `height` DOUBLE NOT NULL DEFAULT 2.5,
    `thickness` DOUBLE NOT NULL DEFAULT 0.12,
    `color` VARCHAR(191) NOT NULL DEFAULT '#ffffff',
    `isLocked` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Folder` ADD CONSTRAINT `Folder_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Exhibition` ADD CONSTRAINT `Exhibition_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExhibitionCollaborator` ADD CONSTRAINT `ExhibitionCollaborator_exhibitionId_fkey` FOREIGN KEY (`exhibitionId`) REFERENCES `Exhibition`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExhibitionCollaborator` ADD CONSTRAINT `ExhibitionCollaborator_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExhibitionCollaborator` ADD CONSTRAINT `ExhibitionCollaborator_invitedById_fkey` FOREIGN KEY (`invitedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExhibitionVersion` ADD CONSTRAINT `ExhibitionVersion_exhibition_id_fkey` FOREIGN KEY (`exhibition_id`) REFERENCES `Exhibition`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExhibitionVersion` ADD CONSTRAINT `ExhibitionVersion_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Artwork` ADD CONSTRAINT `Artwork_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `Asset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Asset` ADD CONSTRAINT `Asset_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Asset` ADD CONSTRAINT `Asset_folderId_fkey` FOREIGN KEY (`folderId`) REFERENCES `Folder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ArtworkInstance` ADD CONSTRAINT `ArtworkInstance_artworkId_fkey` FOREIGN KEY (`artworkId`) REFERENCES `Artwork`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ArtworkInstance` ADD CONSTRAINT `ArtworkInstance_versionId_fkey` FOREIGN KEY (`versionId`) REFERENCES `ExhibitionVersion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ArtworkInstance` ADD CONSTRAINT `ArtworkInstance_wallId_fkey` FOREIGN KEY (`wallId`) REFERENCES `ModularWall`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ModularWall` ADD CONSTRAINT `ModularWall_versionId_fkey` FOREIGN KEY (`versionId`) REFERENCES `ExhibitionVersion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


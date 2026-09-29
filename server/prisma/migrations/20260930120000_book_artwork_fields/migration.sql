-- BOOKS: thickness override (cm, NULL = automatic) and the public-viewer switch for PDF books.
ALTER TABLE `Artwork`
    ADD COLUMN `depth` DOUBLE NULL,
    ADD COLUMN `publicReadable` BOOLEAN NOT NULL DEFAULT false;

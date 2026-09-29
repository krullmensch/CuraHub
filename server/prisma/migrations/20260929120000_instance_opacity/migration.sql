-- Beamer projections can be faded: opacity of the projected image, 0–1 (1 = opaque).
ALTER TABLE `ArtworkInstance` ADD COLUMN `opacity` DOUBLE NOT NULL DEFAULT 1;

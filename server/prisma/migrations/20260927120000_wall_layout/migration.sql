-- WALL-EDITOR: hanging height (picture centre above the floor, metres) and ruler guides per
-- wall face, stored with each exhibition version.
ALTER TABLE `ExhibitionVersion`
    ADD COLUMN `hanging_height` DOUBLE NOT NULL DEFAULT 1.45,
    ADD COLUMN `wall_guides` JSON NULL;

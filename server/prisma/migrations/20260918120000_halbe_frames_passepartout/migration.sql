-- FRAME-03: frames follow the HALBE range ("<profile>-<finish>"), and pictures can get a
-- passepartout. The first catalogue's styles map onto their closest HALBE counterpart.
ALTER TABLE `ArtworkInstance` ALTER COLUMN `frameStyle` SET DEFAULT 'alu8-silber-matt';

UPDATE `ArtworkInstance` SET `frameStyle` = CASE `frameStyle`
    WHEN 'alu-silver' THEN 'alu8-silber-matt'
    WHEN 'alu-black' THEN 'alu8-schwarz-matt'
    WHEN 'oak-natural' THEN 'holz16-eiche-natur'
    WHEN 'walnut' THEN 'holz16-nussbaum-natur'
    WHEN 'ash-black' THEN 'holz16-eiche-schwarz'
    WHEN 'lacquer-white' THEN 'holz16-eiche-weiss'
    WHEN 'lacquer-black' THEN 'holz16-eiche-schwarz'
    WHEN 'lacquer-bordeaux' THEN 'holz16-erle-braun'
    ELSE `frameStyle`
END;

ALTER TABLE `ArtworkInstance`
    ADD COLUMN `passepartoutWidth` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `passepartoutPlacement` VARCHAR(191) NOT NULL DEFAULT 'center';

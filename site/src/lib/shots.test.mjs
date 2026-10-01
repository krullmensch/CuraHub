import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ALL_SHOTS } from './shots.mjs';

const file = (name) => new URL(`../assets/screenshots/${name}.png`, import.meta.url);

test('every screenshot the site shows has been captured', () => {
    const missing = ALL_SHOTS.filter((entry) => !existsSync(file(entry.name))).map((entry) => entry.name);
    assert.deepEqual(missing, []);
});

test('screenshots are PNGs at least 1600 px wide', () => {
    for (const entry of ALL_SHOTS) {
        if (!existsSync(file(entry.name))) continue;
        const header = readFileSync(file(entry.name)).subarray(0, 24);
        assert.equal(header.subarray(1, 4).toString('latin1'), 'PNG', entry.name);
        assert.ok(header.readUInt32BE(16) >= 1600, `${entry.name} is ${header.readUInt32BE(16)} px wide`);
    }
});

test('every alt text is a German sentence', () => {
    for (const entry of ALL_SHOTS) assert.match(entry.alt, /^[A-ZÄÖÜ].{20,}\.$/, entry.name);
});

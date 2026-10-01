import assert from 'node:assert/strict';
import { test } from 'node:test';
import { joinBase } from './paths.mjs';

test('prefixes the base path', () => {
    assert.equal(joinBase('/CuraHub/', '/wiki/'), '/CuraHub/wiki/');
    assert.equal(joinBase('/CuraHub', '/wiki/'), '/CuraHub/wiki/');
    assert.equal(joinBase('/CuraHub/', 'wiki/'), '/CuraHub/wiki/');
});

test('root path keeps one trailing slash', () => {
    assert.equal(joinBase('/CuraHub/', '/'), '/CuraHub/');
    assert.equal(joinBase('/CuraHub', ''), '/CuraHub/');
});

test('keeps anchors and queries', () => {
    assert.equal(joinBase('/CuraHub/', '/#funktionen'), '/CuraHub/#funktionen');
    assert.equal(joinBase('/CuraHub/', '/setup/#update'), '/CuraHub/setup/#update');
});

test('works without a base (custom domain)', () => {
    assert.equal(joinBase('/', '/wiki/'), '/wiki/');
    assert.equal(joinBase('/', '/'), '/');
    assert.equal(joinBase('', '/setup/'), '/setup/');
});

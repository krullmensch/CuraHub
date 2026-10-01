import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { remarkRepoLinks, repoPathOf } from './remarkRepoLinks.mjs';

const root = mkdtempSync(path.join(tmpdir(), 'repo-'));
mkdirSync(path.join(root, 'deploy/apache'), { recursive: true });
writeFileSync(path.join(root, 'deploy/apache/curahub.conf'), '');

test('an existing file path is a repo path', () => {
    assert.equal(repoPathOf('deploy/apache/curahub.conf', root), 'deploy/apache/curahub.conf');
});

test('everything else is not', () => {
    assert.equal(repoPathOf('deploy/apache', root), null); // directory
    assert.equal(repoPathOf('deploy/apache/missing.conf', root), null);
    assert.equal(repoPathOf('/run/curahub-secrets/db_password', root), null); // absolute
    assert.equal(repoPathOf('../' + path.basename(root) + '/deploy/apache/curahub.conf', root), null); // leaves the repo
    assert.equal(repoPathOf('docker compose logs app | grep Setup-Code', root), null); // a command
    assert.equal(repoPathOf('curahub', root), null); // no slash
});

test('the plugin wraps matching inline code in a link and leaves the rest', () => {
    const tree = {
        type: 'root',
        children: [
            {
                type: 'paragraph',
                children: [
                    { type: 'inlineCode', value: 'deploy/apache/curahub.conf' },
                    { type: 'inlineCode', value: 'apachectl configtest' },
                ],
            },
            { type: 'link', url: 'https://example.org', children: [{ type: 'inlineCode', value: 'deploy/apache/curahub.conf' }] },
        ],
    };
    remarkRepoLinks({ repoRoot: root })(tree);
    const [first, second] = tree.children[0].children;
    assert.equal(first.type, 'link');
    assert.equal(first.url, 'https://github.com/krullmensch/CuraHub/blob/main/deploy/apache/curahub.conf');
    assert.deepEqual(first.children, [{ type: 'inlineCode', value: 'deploy/apache/curahub.conf' }]);
    assert.equal(second.type, 'inlineCode');
    assert.equal(tree.children[1].children[0].type, 'inlineCode'); // already inside a link
});

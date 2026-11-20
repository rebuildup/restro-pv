import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');

test('migration payload is present', () => {
  for (const path of [
    'legacy/pv-2dc99e1.aep',
    'legacy/pv-worktree-20261120.aep',
    'docs/SPEC.md',
    'docs/migration/PROVENANCE.md',
    'verification/beats/manifest.json',
    'assets/audio/drums-and-somps-background-music-458414.mp3',
  ]) {
    assert.ok(existsSync(join(ROOT, path)), 'missing ' + path);
  }
});

test('aep snapshots are committed as regular blobs', () => {
  const attrs = readFileSync(join(ROOT, '.gitattributes'), 'utf8');
  assert.doesNotMatch(attrs, /filter=lfs/);
});

test('transient ae files are ignored', () => {
  const ignore = readFileSync(join(ROOT, '.gitignore'), 'utf8');
  assert.match(ignore, /^Auto-Save\/$/m);
  assert.match(ignore, /^\*\.avi$/m);
});

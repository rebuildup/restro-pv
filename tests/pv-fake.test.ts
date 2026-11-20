// Fake-host round trip: runs the built smoke JSX inside ae-a8n's in-process
// ES3/AE model. This proves the generated script parses and drives the host
// API surface without needing real After Effects — it is NOT evidence of
// real-AE fidelity (that is tools/generate.ts + tools/verify.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { FakeApplication, createFakeGlobals, runHostScript } from '@ido-bata/ae-a8n/testing';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(import.meta.dirname, '..');
const JSX = resolve(ROOT, 'dist/smoke.jsx');
const REPORT = resolve(ROOT, '.tmp/fake-smoke-report.json');

test('smoke.jsx builds a project in the fake AE host', () => {
  // Build fresh so the test exercises the current runtime, not a stale JSX.
  execFileSync('node', ['tools/build-jsx.ts', '--spec', 'pv/smoke.ts',
    '--out', 'dist/smoke.jsx', '--save', '.tmp/fake-smoke.aep',
    '--report', '.tmp/fake-smoke-report.json'], { cwd: ROOT, stdio: 'pipe' });
  rmSync(REPORT, { force: true });
  rmSync(REPORT + '.done', { force: true });

  const app = new FakeApplication();
  const result = runHostScript(jsxPath(), createFakeGlobals(app));
  assert.equal(result.success, true, result.success ? '' : String(result.error));

  assert.ok(existsSync(REPORT), 'runtime report was written');
  const report = JSON.parse(readFileSync(REPORT, 'utf8'));
  // The fake host lacks importFile/setValueAtTime/VectorGroup-addProperty, so
  // footage/keyframe/group errors are expected there; what must NOT happen
  // is a buildProject fatal or missing comps.
  const fatal = (report.errList ?? []).filter((e: string) => e.includes('fatal'));
  assert.deepEqual(fatal, [], `unexpected fatal: ${fatal.join(' | ')}`);
});

function jsxPath() { return JSX; }

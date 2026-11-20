// Builds dist/pv.jsx — a single self-contained ExtendScript file that
// materializes the whole PV project inside After Effects.
// Usage: node tools/build-jsx.ts [outPath]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSpec } from '../pv/main.ts';
import { AE_RUNTIME } from '../pv/runtime/aeRuntime.ts';
import { specLiteral } from '../pv/emit/spec-literal.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = process.argv[2] ?? resolve(repoRoot, 'dist/pv.jsx');

const spec = buildSpec();
const jsx = [
  '// GENERATED FILE — do not edit. Source: pv/ (TypeScript).',
  '// Build: node tools/build-jsx.ts',
  '(function () {',
  '  "use strict";',
  `  var __REPO_ROOT_BAKED = ${JSON.stringify(repoRoot.replace(/\\/g, '/'))};`,
  AE_RUNTIME,
  '  try { __REPO_ROOT = __REPO_ROOT_BAKED; } catch (e) {}',
  specLiteral(spec),
  '  buildProject(SPEC);',
  '})();',
  '',
].join('\n');

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, jsx);
console.log(`wrote ${outPath} (${(jsx.length / 1024).toFixed(1)} KiB, ${spec.comps.length} comps)`);

// Builds dist/pv.jsx — a single self-contained ExtendScript file that
// materializes the whole PV project inside After Effects, optionally saves
// the AEP, and writes a machine-readable build report.
//
//   node tools/build-jsx.ts [--out dist/pv.jsx] [--save dist/pv.aep]
//                           [--report .tmp/build-report.json]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSpec } from '../pv/main.ts';
import { AE_RUNTIME } from '../pv/runtime/aeRuntime.ts';
import { specLiteral } from '../pv/emit/spec-literal.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv: string[]) {
  const opt: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[i + 1];
  }
  return {
    out: opt.out ? resolve(opt.out) : resolve(repoRoot, 'dist/pv.jsx'),
    save: opt.save ? resolve(opt.save) : '',
    report: opt.report ? resolve(opt.report) : resolve(repoRoot, '.tmp/pv-build-report.json'),
    spec: opt.spec ?? '',
  };
}

const { out, save, report, spec: specArg } = parseArgs(process.argv.slice(2));
const spec = specArg
  ? (await import(resolve(repoRoot, specArg))).buildSpec()
  : buildSpec();

const jsx = [
  '// GENERATED FILE — do not edit. Source: pv/ (TypeScript).',
  '// Build: node tools/build-jsx.ts',
  '(function () {',
  '  var __REPO_ROOT_BAKED = ' + JSON.stringify(repoRoot.replace(/\\/g, '/')) + ';',
  '  var __SAVE_PATH_BAKED = ' + JSON.stringify(save.replace(/\\/g, '/')) + ';',
  '  var __REPORT_PATH_BAKED = ' + JSON.stringify(report.replace(/\\/g, '/')) + ';',
  AE_RUNTIME,
  '  __REPO_ROOT = __REPO_ROOT_BAKED;',
  '  __SAVE_PATH = __SAVE_PATH_BAKED;',
  '  __REPORT_PATH = __REPORT_PATH_BAKED;',
  specLiteral(spec),
  '  var __hasItems = false;',
  '  for (var __i = 1; __i <= app.project.numItems; __i++) {',
  '    var __it = app.project.item(__i);',
  '    if (__it && !(__it instanceof FolderItem)) { __hasItems = true; break; }',
  '  }',
  '  if (__hasItems) {',
  '    __err("refusing to build: current project is not empty");',
  '  } else {',
  '    try {',
  '      buildProject(SPEC);',
  '    } catch (fatal) {',
  '      __err("buildProject fatal: " + fatal);',
  '    }',
  '  }',
  '  __finish();',
  '})();',
  '',
].join('\n');

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, jsx);
console.log(`wrote ${out} (${(jsx.length / 1024 / 1024).toFixed(1)} MiB, ${spec.comps.length} comps)`);

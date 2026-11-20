#!/usr/bin/env node
// Static gate for the generated JSX pipeline (Issue #6).
//
//   node tools/check-jsx.ts [jsx ...]
//
// Three independent checks, all offline (no After Effects needed):
//
//   1. types-for-adobe — the embedded AE runtime is extracted to a .js
//      file and typechecked against real ExtendScript/AE typings. This
//      catches wrong API names, bad argument shapes and host-global
//      typos that the ambient jsx-toolchain d.ts (mostly `any`) cannot.
//   2. jsx-toolchain lint — ES3-compat AST lint on the generated JSX
//      (no ES5+ syntax may reach ExtendScript).
//   3. catch-concat scan — acorn parses the runtime and flags any `+`
//      expression that concatenates a catch-clause parameter. ExtendScript
//      throws "Object of type Error ..." for that pattern; __estr() is the
//      required conversion.
//
// Exit code is non-zero when any check reports an error.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';

import { AE_RUNTIME } from '../pv/runtime/aeRuntime.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TSC = join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
const TOOLCHAIN = join(ROOT, 'node_modules', '@ido-bata', 'ae-devtools-cli',
  'jsx-toolchain', 'src', 'cli.mjs');
const AETYPES = 'types-for-adobe/AfterEffects/24.6';

const jsxInputs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const targets = jsxInputs.length ? jsxInputs : ['dist/pv.jsx', 'dist/smoke.jsx'];

type Diag = { check: string; severity: string; message: string; line?: number };
const diags: Diag[] = [];

// ---- 1. types-for-adobe on the extracted runtime --------------------------
const checkDir = join(ROOT, '.tmp', 'jsx-check');
mkdirSync(checkDir, { recursive: true });
const runtimeJs = join(checkDir, 'ae-runtime-check.js');
writeFileSync(runtimeJs,
  `/// <reference types="${AETYPES}" />\n` + AE_RUNTIME);

const tsc = spawnSync(process.execPath, [
  TSC, '--noEmit', '--module', 'none', '--noLib',
  '--strict', 'false', '--noImplicitAny', 'false',
  '--skipLibCheck', '--allowJs', '--checkJs',
  '--target', 'es5', runtimeJs,
], { cwd: ROOT, encoding: 'utf8' });
for (const line of (tsc.stdout + '\n' + tsc.stderr).split('\n')) {
  const m = line.match(/ae-runtime-check\.js\((\d+),(\d+)\): error (TS\d+): (.*)/);
  if (m) diags.push({ check: 'types-for-adobe', severity: 'error', line: Number(m[1]), message: `${m[3]}: ${m[4]}` });
}

// ---- 2. jsx-toolchain lint (ES3) + check (ambient AE names) ---------------
for (const rel of targets) {
  const file = resolve(ROOT, rel);
  if (!existsSync(file)) {
    diags.push({ check: 'jsx-toolchain', severity: 'error', message: `${rel}: missing (run build:jsx first)` });
    continue;
  }
  for (const cmd of ['lint', 'check']) {
    const r = spawnSync(process.execPath, [TOOLCHAIN, cmd, file],
      { cwd: ROOT, encoding: 'utf8' });
    let json: any = null;
    try { json = JSON.parse(r.stdout); } catch { /* fall through */ }
    const list = json?.diagnostics ?? [];
    for (const d of list) {
      diags.push({
        check: `jsx-toolchain ${cmd}`,
        severity: d.severity === 'error' ? 'error' : 'warning',
        line: d.line ?? undefined,
        message: `${rel}: ${d.message ?? JSON.stringify(d)}`,
      });
    }
    if (!json) {
      diags.push({ check: `jsx-toolchain ${cmd}`, severity: 'error',
        message: `${rel}: toolchain produced no JSON (${(r.stderr || '').slice(0, 200)})` });
    }
  }
}

// ---- 3. catch-param concatenation scan (acorn) -----------------------------
type AnyNode = acorn.Node & Record<string, any>;
function walk(node: AnyNode, visit: (n: AnyNode) => void) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue;
    const v = node[key];
    if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') walk(c, visit); }
    else if (v && typeof v.type === 'string') walk(v, visit);
  }
}
const ast = acorn.parse(AE_RUNTIME, { ecmaVersion: 5, sourceType: 'script', locations: true }) as unknown as AnyNode;
walk(ast, (n) => {
  if (n.type !== 'CatchClause') return;
  const param = n.param;
  if (!param || param.type !== 'Identifier') return;
  const name = param.name;
  walk(n.body, (inner) => {
    if (inner.type !== 'BinaryExpression') return;
    for (const side of [inner.left, inner.right]) {
      if (side && side.type === 'Identifier' && side.name === name) {
        diags.push({
          check: 'catch-concat', severity: 'error',
          line: (side.loc?.start.line ?? 0) || undefined,
          message: `runtime concatenates catch parameter '${name}' with + — use __estr() ` +
            `(ExtendScript: "Object of type Error found where a Number, Array, or Property is needed")`,
        });
      }
    }
  });
});

// ---- report ----------------------------------------------------------------
const errors = diags.filter((d) => d.severity === 'error');
const warnings = diags.filter((d) => d.severity !== 'error');
console.log(`jsx-check: ${errors.length} error(s), ${warnings.length} warning(s)`);
for (const d of diags.slice(0, 60)) {
  console.log(`  [${d.check}]${d.line ? ` L${d.line}` : ''} ${d.message}`);
}
if (diags.length > 60) console.log(`  ... ${diags.length - 60} more`);
process.exit(errors.length ? 1 : 0);

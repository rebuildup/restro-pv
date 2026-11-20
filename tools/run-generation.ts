// Launches a dedicated After Effects instance running the built PV JSX.
// Usage: node tools/run-generation.ts [jsx-path]
import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAe } from './lib/host.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const jsx = resolve(process.argv[2] ?? resolve(ROOT, 'dist/pv.jsx'));
if (!existsSync(jsx)) { console.error('jsx not found: ' + jsx); process.exit(1); }

const ae = await resolveAe();
const child = spawn(ae.executable, ['-r', jsx], { detached: true, stdio: 'ignore' });
child.unref();
console.log('launched AfterFX.exe -r ' + jsx + ' (pid ' + child.pid + ')');
console.log('poll for .tmp/pv-report.json.done');

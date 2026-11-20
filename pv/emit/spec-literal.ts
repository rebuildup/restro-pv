// Serializes a ProjectSpec into an ExtendScript object literal.
// ES3 has no JSON; we emit `var SPEC = {...}` and let the AE runtime consume it.
import type { ProjectSpec } from '../model/types.ts';

function num(n: number): string {
  if (!isFinite(n)) throw new Error('non-finite number');
  let s = String(n);
  if (s.indexOf('e') >= 0 || s.indexOf('E') >= 0) s = n.toFixed(10).replace(/0+$/, '').replace(/\.$/, '');
  return s === '-0' ? '0' : s;
}
function str(s: string): string {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
}
function val(v: unknown): string {
  if (v === undefined) return 'null';
  if (v === null) return 'null';
  if (typeof v === 'number') return num(v);
  if (typeof v === 'string') return str(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return '[' + v.map(val).join(',') + ']';
  if (typeof v === 'object') {
    const parts: string[] = [];
    for (const k of Object.keys(v as object)) {
      parts.push(str(k) + ':' + val((v as Record<string, unknown>)[k]));
    }
    return '{' + parts.join(',') + '}';
  }
  throw new Error('cannot serialize ' + typeof v);
}

export function specLiteral(spec: ProjectSpec): string {
  return 'var SPEC = ' + val(spec) + ';';
}

// Serializes a ProjectSpec into an ExtendScript object literal.
// ES3 has no JSON; we emit `var SPEC = {...}` and let the AE runtime consume it.
import type { ProjectSpec } from "../spec/types.ts";

function num(n: number): string {
  if (!Number.isFinite(n)) throw new Error("non-finite number");
  let s = String(n);
  if (s.indexOf("e") >= 0 || s.indexOf("E") >= 0)
    s = n.toFixed(10).replace(/0+$/, "").replace(/\.$/, "");
  return s === "-0" ? "0" : s;
}
function hex4(n: number): string {
  return ("0000" + n.toString(16)).slice(-4);
}
function str(s: string): string {
  // Emit ASCII-only output: ExtendScript mis-parses raw non-ASCII bytes in
  // files that lack a BOM, so every non-ASCII char becomes \uXXXX.
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const cp = ch.codePointAt(0)!;
    if (ch === "\\") out += "\\\\";
    else if (ch === '"') out += '\\"';
    else if (ch === "\n") out += "\\n";
    else if (cp >= 0x20 && cp <= 0x7e) out += ch;
    else if (cp > 0xffff) {
      const u = cp - 0x10000;
      out += "\\u" + hex4(0xd800 + (u >> 10)) + "\\u" + hex4(0xdc00 + (u & 0x3ff));
    } else out += "\\u" + hex4(cp);
  }
  return out + '"';
}
function val(v: unknown): string {
  if (v === undefined) return "null";
  if (v === null) return "null";
  if (typeof v === "number") return num(v);
  if (typeof v === "string") return str(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) return "[" + v.map(val).join(",") + "]";
  if (typeof v === "object") {
    const parts: string[] = [];
    for (const k of Object.keys(v as object)) {
      parts.push(str(k) + ":" + val((v as Record<string, unknown>)[k]));
    }
    return "{" + parts.join(",") + "}";
  }
  throw new Error("cannot serialize " + typeof v);
}

export function specLiteral(spec: ProjectSpec): string {
  return "var SPEC = " + val(spec) + ";";
}

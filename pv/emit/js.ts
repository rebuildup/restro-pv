// ExtendScript code emitter. All output is ES3-safe: no JSON, no let/const,
// no template literals, no Array.prototype extras beyond ES3.
// The emitted code is plain strings concatenated into the final JSX file.

export class Js {
  private parts: string[] = [];
  indent = 0;

  line(s = ""): this {
    this.parts.push(s + "\n");
    return this;
  }
  raw(s: string): this {
    this.parts.push(s + "\n");
    return this;
  }
  pad(): string {
    return new Array(this.indent + 1).join("  ");
  }
  ind(): this {
    this.indent++;
    return this;
  }
  outd(): this {
    this.indent--;
    return this;
  }
  emit(s: string): this {
    this.parts.push(this.pad() + s + "\n");
    return this;
  }
  block(open: string): this {
    this.emit(open + " {");
    this.ind();
    return this;
  }
  endBlock(): this {
    this.outd();
    this.emit("}");
    return this;
  }
  toString(): string {
    return this.parts.join("");
  }
}

export function jsStr(s: string): string {
  return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n") + '"';
}

export function jsNum(n: number): string {
  if (!Number.isFinite(n)) throw new Error("non-finite number in emitter");
  // ExtendScript parses plain decimal fine; avoid exponent notation
  let s = String(n);
  if (s.indexOf("e") >= 0 || s.indexOf("E") >= 0)
    s = n.toFixed(10).replace(/0+$/, "").replace(/\.$/, "");
  return s === "-0" ? "0" : s;
}

export function jsVal(v: unknown): string {
  if (typeof v === "number") return jsNum(v);
  if (typeof v === "string") return jsStr(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return "[" + v.map(jsVal).join(",") + "]";
  throw new Error("unsupported value type in emitter: " + typeof v);
}

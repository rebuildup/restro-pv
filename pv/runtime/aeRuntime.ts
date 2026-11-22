// ES3 ExtendScript runtime executed inside After Effects.
// buildProject(SPEC) materializes the whole project from the spec literal,
// which mirrors the aep-comp-dump schema. Property trees are applied
// generically: groups recurse by matchName, leaves set value/keys.
// No JSON, no ES5+ builtins, no external files except imported footage.

export const AE_RUNTIME = String.raw`
var __REPO_ROOT = "";
var __SAVE_PATH = "";
var __REPORT_PATH = "";
var __PROGRESS_PATH = "";
var __WARNINGS_PATH = "";
var __T0 = new Date().getTime();
try { __REPO_ROOT = $.getenv("RESTRO_PV_ROOT") || ""; } catch (e) {}

// Structured progress: one "epochMs<TAB>elapsedMs<TAB>message" line appended
// per step so tools/generate.ts can show live timing. ExtendScript Date has
// no toISOString (ES5), so epoch ms is the portable timestamp.
function __prog(msg) {
  if (!__PROGRESS_PATH) return;
  try {
    var f = new File(__PROGRESS_PATH);
    f.encoding = "UTF-8";
    f.open("a");
    f.write(new Date().getTime() + "\t" + (new Date().getTime() - __T0) + "\t" + msg + "\n");
    f.close();
  } catch (x) {}
}

var __WARN = [];
var __ERR = [];
// comp/layer context for diagnostics; set by the build loop per layer.
var __CTX = "";
// ExtendScript throws "Object of type Error" when an Error is concatenated
// with +, so error objects must go through this before string building.
function __estr(e) {
  // NEVER String()/concatenate a raw catch value: ExtendScript throws
  // "Object of type Error found where a Number, Array, or Property is
  // needed" for Error-typed operands, which would kill the error path
  // itself. Read known string fields with typeof guards instead.
  var s = "";
  try { var d = e.description; if (typeof d === "string" && d) s = d; } catch (x) {}
  if (!s) { try { var m = e.message; if (typeof m === "string" && m) s = m; } catch (x) {} }
  if (!s) { try { if (typeof e === "string") s = e; } catch (x) {} }
  if (!s) { try { var n = e.name; if (typeof n === "string" && n) s = n; } catch (x) {} }
  if (!s) s = "[unprintable thrown value]";
  // ExtendScript Error carries .line/.source/.fileName -- keep them so a
  // bare "undefined is not an object" can be traced back to the JSX line.
  var extra = "";
  try { if (e.line !== undefined) extra += " @line " + e.line; } catch (x) {}
  try { if (e.fileName) extra += " (" + e.fileName + ")"; } catch (x) {}
  return s + extra;
}
function __ctxMsg(msg) { return (__CTX ? __CTX + " | " : "") + String(msg); }
function __warn(msg) { msg = __ctxMsg(msg); __WARN.push(msg); try { if ($.writeln) $.writeln("PV-WARN " + msg); } catch (x) {} }
function __err(msg) { msg = __ctxMsg(msg); __ERR.push(msg); try { if ($.writeln) $.writeln("PV-ERR " + msg); } catch (x) {} }

function __isArr(v) { return Object.prototype.toString.call(v) === "[object Array]"; }
function __isObj(v) { return v !== null && typeof v === "object" && !__isArr(v); }
function __num(n) { return (typeof n === "number" && isFinite(n)) ? n : 0; }

function __scalar(v) {
  if (__isArr(v)) {
    var out = [];
    for (var i = 0; i < v.length; i++) out.push(__scalar(v[i]));
    return out;
  }
  if (__isObj(v)) {
    if (v.x !== undefined) return [__num(v.x), __num(v.y), __num(v.z !== undefined ? v.z : 0)];
  }
  return v;
}

// ---- value constructors ----------------------------------------------------
function __isShapeVal(v) {
  return __isObj(v) && v.vertices !== undefined && v.inTangents !== undefined && v.outTangents !== undefined;
}
function __isTextDocVal(v) {
  if (!__isObj(v) || v.text === undefined) return false;
  return v.font !== undefined || v.fontFamily !== undefined;
}
function __toShape(v) {
  var sh = new Shape();
  var vs = [], ti = [], to = [];
  for (var i = 0; i < v.vertices.length; i++) {
    var vv = v.vertices[i];
    vs.push([__num(vv[0]), __num(vv[1])]);
    var a = v.inTangents[i] || [0, 0], b = v.outTangents[i] || [0, 0];
    ti.push([__num(a[0]), __num(a[1])]);
    to.push([__num(b[0]), __num(b[1])]);
  }
  // JSDoc casts keep types-for-adobe happy: ExtendScript accepts plain
  // number[][] at runtime; the .d.ts only models the tuple shape.
  sh.vertices = /** @type {any} */ (vs);
  sh.inTangents = /** @type {any} */ (ti);
  sh.outTangents = /** @type {any} */ (to);
  sh.closed = !!v.closed;
  return sh;
}
function __toTextDoc(p, v) {
  var d = null;
  try { d = p.value; } catch (pv) { return null; }
  // p.value returns an Error object (not null) on properties whose value
  // cannot be read; passing that Error to setValue is a hard host error.
  if (!d) return null;
  try { if (d instanceof Error) return null; } catch (ie) {}
  // dumped TextDocument exposes fontSize/boxTextPos/boxTextSize; the writable
  // TextDocument attributes use those same names (fontSize, boxTextPos,
  // boxTextSize). 'size'/'boxPosition'/'boxSize' are NOT valid attributes --
  // assigning them silently did nothing, which is why every generated text
  // layer ended up with AE's default font size.
  var map = {
    text: "text", font: "font", fontSize: "fontSize", size: "fontSize",
    fillColor: "fillColor", strokeColor: "strokeColor", strokeWidth: "strokeWidth",
    tracking: "tracking", leading: "leading", baselineShift: "baselineShift",
    horizontalScale: "horizontalScale", verticalScale: "verticalScale",
    applyFill: "applyFill", applyStroke: "applyStroke",
    boxTextPos: "boxTextPos", boxPosition: "boxTextPos",
    boxTextSize: "boxTextSize", boxSize: "boxTextSize",
    fauxBold: "fauxBold", fauxItalic: "fauxItalic",
    tsume: "tsume",
    firstLineIndent: "firstLineIndent", startIndent: "startIndent",
    endIndent: "endIndent", spaceAfter: "spaceAfter", spaceBefore: "spaceBefore",
    autoLeading: "autoLeading", baselineDirection: "baselineDirection",
    direction: "direction", noBreak: "noBreak"
  };
  var JUST = { 0: "LEFT", 1: "RIGHT", 2: "CENTER", 3: "FULL" };
  for (var k in v) {
    if (!v.hasOwnProperty(k)) continue;
    if (k === "justification") {
      try {
        var jv = v[k];
        if (typeof jv === "number" && JUST[jv] !== undefined) {
          d.justification = eval("ParagraphJustification." + JUST[jv] + "_JUSTIFY");
        } else if (typeof jv === "string") {
          d.justification = eval("ParagraphJustification." + jv);
        } else {
          d.justification = jv;
        }
      } catch (je) { __warn("textdoc justification " + jv + ": " + __estr(je)); }
      continue;
    }
    var dk = map[k];
    if (!dk) continue;
    try {
      if (k === "font") d.font = String(v[k]);
      else if (dk === "fillColor" || dk === "strokeColor" || dk === "boxTextPos" || dk === "boxTextSize") {
        if (v[k] !== null) d[dk] = __scalar(v[k]);
      } else if (typeof v[k] === "boolean") d[dk] = !!v[k];
      else if (typeof v[k] === "number") d[dk] = v[k];
      else if (typeof v[k] === "string") d[dk] = v[k];
    } catch (ae) { __warn("textdoc field " + k + ": " + __estr(ae)); }
  }
  // Setting leading explicitly can flip autoLeading off; re-assert the
  // dumped state last so the generated doc matches the source.
  if (v.autoLeading === true) { try { d.autoLeading = true; } catch (al) {} }
  return d;
}

// ---- keyframes -------------------------------------------------------------
function __applyKeys(prop, keys) {
  if (!prop || !keys || keys.length === 0) return;
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var val = k.v;
    if (__isShapeVal(val)) val = __toShape(val);
    else if (__isObj(val)) val = __scalar(val);
    try {
      prop.setValueAtTime(__num(k.t), val);
    } catch (ke) {
      __err("setValueAtTime failed on " + prop.name + " @" + k.t + ": " + __estr(ke));
      continue;
    }
    var idx = i + 1;
    try {
      if (k.inEase || k.outEase) {
        var ie = null, oe = null;
        // Dumped ease entries are {speed,influence} objects (older data may
        // be [speed,influence] pairs). KeyframeEase wants (speed, influence)
        // and influence must stay within AE's 0.1-100 range.
        var easeArr = function (list) {
          var a = [];
          for (var ei = 0; ei < list.length; ei++) {
            var e = list[ei], sp, inf;
            if (__isArr(e)) { sp = __num(e[0]); inf = __num(e[1]); }
            else { sp = __num(e.speed); inf = __num(e.influence); }
            if (!(inf >= 0.1 && inf <= 100)) inf = 33.333;
            a.push(new KeyframeEase(sp, inf));
          }
          return a;
        };
        if (k.inEase && k.inEase.length) ie = easeArr(k.inEase);
        if (k.outEase && k.outEase.length) oe = easeArr(k.outEase);
        // setTemporalEaseAtKey requires arrays on both sides.
        if (!ie) ie = oe;
        if (!oe) oe = ie;
        prop.setTemporalEaseAtKey(idx, ie, oe);
      }
      if (k.spIn || k.spOut) {
        // Spatial tangents must match the key value's dimension; the dump can
        // carry 2-element tangents for 3-element (separated) values.
        var dims = __isArr(val) ? val.length : 1;
        var tan = function (t) {
          var a = [];
          for (var ti = 0; ti < dims; ti++) a.push(t && t[ti] !== undefined ? __num(t[ti]) : 0);
          return a;
        };
        var zero = [];
        for (var zi = 0; zi < dims; zi++) zero.push(0);
        var si = k.spIn ? tan(k.spIn) : zero;
        var so = k.spOut ? tan(k.spOut) : zero;
        prop.setSpatialTangentsAtKey(idx, si, so);
      }
      // Interpolation type is applied LAST: setTemporalEaseAtKey on a
      // linear/hold key makes AE flip the key back to bezier.
      if (k.inT !== undefined || k.outT !== undefined) {
        var it = k.inT !== undefined ? __num(k.inT) : __num(k.outT);
        var ot = k.outT !== undefined ? __num(k.outT) : __num(k.inT);
        prop.setInterpolationTypeAtKey(idx, it, ot);
      }
    } catch (ee) { __warn("key meta failed on " + prop.name + " #" + idx + ": " + __estr(ee)); }
  }
}

// ---- generic property tree -------------------------------------------------
// Containers whose children must be ADDED (parades, vector contents, text
// animators). Everything else has pre-existing children set by matchName.
function __isAddContainer(match) {
  return match === "ADBE Mask Parade" || match === "ADBE Effect Parade" ||
    match === "ADBE Root Vectors Group" || match === "ADBE Vectors Group" ||
    match === "ADBE Text Animators" || match === "ADBE Time Remapping";
}
function __childProp(parent, child) {
  var p = null;
  try { p = parent.property(child.matchName); } catch (e) {}
  if (!p && child.name) { try { p = parent.property(child.name); } catch (e2) {} }
  return p;
}
// Vector content groups (shape-layer Contents) carry functional names:
// FoldLayers dividers are identified by FD-0/FD-1/FD-H:* group names inside
// "ADBE Root Vectors Group", and dumped shape groups keep their authored
// names. addProperty() gives a default name, so rename right after creation.
// Other property types reject name writes -- restrict to vector groups.
function __maybeRenameGroup(cp, ch) {
  if (!cp || !ch || ch.matchName !== "ADBE Vector Group" || !ch.name) return;
  try { cp.name = ch.name; }
  catch (ne) { __warn("vector group rename failed '" + ch.name + "': " + __estr(ne)); }
}
function __applyNode(p, node, path) {
  if (!p) { __err("missing property " + path); return; }
  // Group detection keys off "properties", not the redundant numProperties
  // count: authored specs (brandcheck guides, markers) omit the count and
  // were silently treated as leaves, producing empty shape contents.
  if (node.properties && node.properties.length) {
    var addMode = __isAddContainer(node.matchName);
    // Group-level attrs FIRST: a disabled (enabled=false) group hides its
    // children in AE, so they must be skipped entirely -- writing them is a
    // hard "hidden property" error and they cannot exist in the output.
    // maskMode lives on the mask atom and must precede child writes too.
    if (node.maskMode !== undefined) {
      try { p.maskMode = node.maskMode; }
      catch (me) { __warn("maskMode failed on " + path + ": " + __estr(me)); }
    }
    // Apply enabled/active BEFORE children: some groups (e.g. stroke
    // Dashes/Taper/Wave) are created disabled by AE and hide their children
    // until explicitly enabled; a disabled group makes every child write a
    // hard "hidden property" error, so its subtree is skipped entirely.
    // Only the disabled state needs an explicit write: groups are enabled by
    // default, and 'enabled'/'active' are read-only on most parade groups
    // (mask atoms, vector groups) -- true-writes only produce warnings.
    if (node.enabled === false) {
      try { p.enabled = false; } catch (ee2) { __warn("enabled failed on " + path); }
    }
    // 'active' is a derived read-only attribute (effective visibility); AE
    // rejects writes to it and already reports the correct value once
    // 'enabled' states match, so it is never written.
    if (node.enabled === false) {
      __warn("skipping children of disabled group " + path);
      return;
    }
    for (var i = 0; i < node.properties.length; i++) {
      var ch = node.properties[i];
      var cp = null;
      if (addMode) {
        try { cp = p.addProperty(ch.matchName); }
        catch (ae) { __err("addProperty " + ch.matchName + " under " + path + ": " + __estr(ae)); continue; }
        __maybeRenameGroup(cp, ch);
      } else {
        cp = __childProp(p, ch);
      }
      __applyNode(cp, ch, path + "/" + (ch.matchName || ch.name));
    }
    return;
  }
  // leaf: enabled/active first -- a disabled leaf is hidden and rejects
  // setValue/setValueAtTime/expression writes.
  if (node.enabled === false) {
    try { p.enabled = false; } catch (lee) { __warn("enabled failed on " + path); }
  }
  if (node.enabled === false) {
    __warn("skipping disabled leaf " + path);
    return;
  }
  if (node.keys && node.keys.length) {
    __applyKeys(p, node.keys);
  } else if (node.value !== undefined && node.value !== null) {
    var v = node.value;
    var sv = null, hasSv = false, textMiss = false;
    if (__isShapeVal(v)) { sv = __toShape(v); hasSv = true; }
    else if (p.matchName === "ADBE Text Document" || __isTextDocVal(v)) {
      var d = __toTextDoc(p, v);
      if (d) { sv = d; hasSv = true; }
      else if (p.matchName === "ADBE Text Document") textMiss = true;
    } else { sv = __scalar(v); hasSv = true; }
    if (textMiss) {
      __err("setValue failed " + path + " (ADBE Text Document): TextDocument unavailable");
    } else if (hasSv) {
      try {
        p.setValue(sv);
      } catch (ve) {
        var ves = __estr(ve);
        // AE auto-creates a keyframe when a property is enabled (e.g. time
        // remapping); setValue then refuses. The dump says the source had
        // no keys, so drop the auto keys and retry once.
        if (/keyframes/.test(ves) && p.numKeys > 0) {
          try {
            while (p.numKeys > 0) p.removeKey(1);
            p.setValue(sv);
          } catch (ve2) {
            __setValErr(path, p, __estr(ve2));
          }
        } else {
          __setValErr(path, p, ves);
        }
      }
    }
  }
  if (node.expression) {
    try { p.expression = node.expression; }
    catch (exe) { __err("expression failed on " + path + ": " + __estr(exe)); }
  }
}
function __applyGroup(root, node, path) {
  if (!node) return;
  if (!node.properties || !node.properties.length) return;
  var addMode = __isAddContainer(node.matchName);
  for (var i = 0; i < node.properties.length; i++) {
    var ch = node.properties[i];
    var cp = null;
    if (addMode) {
      try { cp = root.addProperty(ch.matchName); }
      catch (ae) { __err("addProperty " + ch.matchName + " under " + path + ": " + __estr(ae)); continue; }
      __maybeRenameGroup(cp, ch);
    } else {
      cp = __childProp(root, ch);
    }
    __applyNode(cp, ch, path + "/" + (ch.matchName || ch.name));
  }
}

// ---- layer creation --------------------------------------------------------
// TrackMatteType raw enum values (types-for-adobe): the dump stores these
// directly. 0-4 aliases kept for hand-authored specs.
var __TRACK_MATTE = {
  5012: "NO_TRACK_MATTE", 5013: "ALPHA", 5014: "ALPHA_INVERTED", 5015: "LUMA", 5016: "LUMA_INVERTED",
  0: "NO_TRACK_MATTE", 1: "ALPHA", 2: "ALPHA_INVERTED", 3: "LUMA", 4: "LUMA_INVERTED"
};
function __findComp(name) {
  var items = app.project.items;
  for (var i = 1; i <= items.length; i++) {
    var it = items[i];
    if (it instanceof CompItem && it.name === name) return it;
  }
  return null;
}
function __findFootage(name) {
  var items = app.project.items;
  for (var i = 1; i <= items.length; i++) {
    var it = items[i];
    if (it instanceof FootageItem && it.name === name) return it;
  }
  return null;
}
// Solids have no project.items.addSolid; create them through a scratch comp
// and keep the orphaned footage item (solids survive comp deletion).
var __solidHost = null;
function __solidItem(color, name, w, h) {
  if (!__solidHost) {
    __solidHost = app.project.items.addComp("__pv_solids__", 4, 4, 1, 1, 1);
  }
  var L = __solidHost.layers.addSolid(color, name, __num(w), __num(h), 1, 3600);
  return L.source;
}
function __importFootage(spec, footageByName) {
  if (spec.kind === "solid") {
    var si = null;
    try { si = __solidItem(spec.color || [1, 1, 1], spec.name, spec.width || 100, spec.height || 100); }
    catch (se) { __err("addSolid failed " + spec.name + ": " + __estr(se)); return null; }
    footageByName[spec.name] = si;
    if (spec.label !== undefined) { try { si.label = __num(spec.label); } catch (le) {} }
    return si;
  }
  var rel = spec.file;
  var f = null;
  try { f = new File(__REPO_ROOT + "/" + rel); } catch (e) {}
  var __missingRepo = !f || !f.exists;
  if (__missingRepo && __REPO_ROOT) {
    try { f = new File(__REPO_ROOT + "/" + rel.split("/").join("\\")); } catch (e) {}
  }
  if (!f || !f.exists) { try { f = new File(rel); } catch (e) {} }
  if (!f || !f.exists) { __err("missing footage file: " + rel); return null; }
  // ImportOptions is absent in minimal ES3 hosts (ae-a8n fake); fall back to
  // the plain importFile(File) form there.
  var item = null;
  try { item = app.project.importFile(new ImportOptions(f)); }
  catch (ie) {
    // The File overload is only for hosts without ImportOptions; the cast
    // keeps types-for-adobe from flagging the deliberate fallback.
    try { item = app.project.importFile(/** @type {any} */ (f)); }
    catch (ie2) { __err("importFile failed " + rel + ": " + __estr(ie2)); return null; }
  }
  if (item) {
    footageByName[spec.name || item.name] = item;
    if (spec.label !== undefined) { try { item.label = __num(spec.label); } catch (le) {} }
  }
  return item;
}
function __createLayer(comp, ls, footageByName, compItems) {
  var name = ls.name || ("layer" + ls.index);
  var L = null;
  if (ls.kind === "shape") { L = comp.layers.addShape(); }
  else if (ls.kind === "text") { L = comp.layers.addText(""); }
  else if (ls.kind === "null") { L = comp.layers.addNull(); }
  else if (ls.kind === "comp" || ls.kind === "footage") {
    var src = null;
    if (ls.kind === "comp") {
      if (ls.sourceCompIndex !== undefined && ls.sourceCompIndex !== null) {
        var ci = __num(ls.sourceCompIndex);
        if (ci >= 0 && ci < compItems.length && compItems[ci]) src = compItems[ci];
      }
      if (!src) src = __findComp(ls.source);
    } else {
      src = footageByName[ls.source] || __findFootage(ls.source);
    }
    if (!src) { __err("unresolved " + ls.kind + " source '" + ls.source + "' for layer " + name); return null; }
    L = comp.layers.add(src);
  } else {
    __err("unknown layer kind '" + ls.kind + "' for " + name);
    return null;
  }
  try { L.name = name; } catch (ne) {}
  return L;
}
// AE's layers.add* throws "undefined is not an object" while it is still
// conforming/indexing a freshly opened material project — a state-based
// window, not a fixed duration. Gate layer creation on a real DOM write
// probe against the target comp instead of trusting elapsed sleeps.
function __awaitCompReady(comp, cname, deadline) {
  var attempt = 0;
  while (new Date().getTime() < deadline) {
    attempt++;
    // Missing API is deterministic (e.g. fake hosts), not a busy window —
    // fail fast instead of probing until the deadline.
    var addNullFn = null;
    try { addNullFn = comp.layers.addNull; } catch (x) {}
    if (typeof addNullFn !== "function") {
      __err("comp " + cname + " has no layers.addNull; cannot probe readiness");
      return false;
    }
    var probe = null;
    try {
      probe = comp.layers.addNull();
      if (probe) {
        try { probe.remove(); } catch (x) {}
        if (attempt > 1) __prog("comp " + cname + " ready after " + attempt + " probes");
        return true;
      }
    } catch (pe) {
      __prog("comp " + cname + " ready probe " + attempt + " failed: " + __estr(pe));
    }
    try { if ($.sleep) $.sleep(5000); } catch (sx) {}
  }
  __err("comp " + cname + " did not become writable in time");
  return false;
}

// Read-only state snapshot attached to a create-layer failure so the report
// distinguishes API misuse, dead references and host-state problems without
// needing a rerun. Never mutates the project.
function __createDiag(comp, ls) {
  var parts = [];
  try { parts.push("kind=" + ls.kind); } catch (x) {}
  try { parts.push("src=" + (ls.source === undefined ? "-" : ls.source)); } catch (x) {}
  try { parts.push("sci=" + ls.sourceCompIndex); } catch (x) {}
  try { parts.push("layers=" + comp.layers.length); } catch (x) { parts.push("layers=?"); }
  try {
    var m = "add";
    if (ls.kind === "shape") m = "addShape";
    else if (ls.kind === "text") m = "addText";
    else if (ls.kind === "null") m = "addNull";
    parts.push("fn." + m + "=" + typeof comp.layers[m]);
  } catch (x) { parts.push("fn=?"); }
  try { parts.push("items=" + app.project.numItems); } catch (x) {}
  try { parts.push("compOk=" + (comp instanceof CompItem)); } catch (x) {}
  return parts.join(" ");
}
function __setProp(p, v) {
  if (v === undefined || v === null) return;
  if (__isShapeVal(v)) { p.setValue(__toShape(v)); return; }
  p.setValue(__scalar(v));
}
// AE rejects writes to properties that are hidden for the layer's current
// configuration (text path options on point text, variable-font spacing,
// inapplicable effect params, ...). The dump records their dormant stored
// values, but they cannot be applied -- and they were equally unsettable in
// the source AEP -- so these are warnings, not build errors. Anything else
// stays an error so real failures are never silently downgraded.
function __setValErr(path, p, ves) {
  var msg = "setValue failed " + path + " (" + (p && p.matchName) + "): " + ves;
  if (/hidden/.test(ves)) __warn(msg + " [hidden property]");
  else __err(msg);
}
function __applyLayer(L, ls, compLayers) {
  try {
    // enabled=false is applied after all property writes as a defensive
    // ordering measure; shy/guide layers remain editable throughout.
    if (ls.shy) L.shy = true;
    if (ls.label !== undefined) { try { L.label = __num(ls.label); } catch (le) {} }
    if (ls.guideLayer) L.guideLayer = true;
    // Order matters: startTime/stretct position the layer bar first; setting
    // inPoint/outPoint afterwards trims the visible range without dragging
    // the whole layer (verified: inPoint-first ordering shifted generated
    // layers by exactly -startTime).
    if (ls.startTime !== undefined) L.startTime = __num(ls.startTime);
    if (ls.stretch !== undefined) L.stretch = __num(ls.stretch);
    if (ls.inPoint !== undefined) L.inPoint = __num(ls.inPoint);
    if (ls.outPoint !== undefined) L.outPoint = __num(ls.outPoint);
    if (ls.audioEnabled === false) L.audioEnabled = false;
    if (ls.threeDLayer) { try { L.threeDLayer = true; } catch (e) {} }
    if (ls.motionBlur) { try { L.motionBlur = true; } catch (e) {} }
    if (ls.collapseTransformations) { try { L.collapseTransformations = true; } catch (e) {} }
    if (ls.adjustmentLayer) { try { L.adjustmentLayer = true; } catch (e) {} }
    if (ls.timeRemapEnabled) {
      try {
        if (L.canSetTimeRemapEnabled) L.timeRemapEnabled = true;
        else __warn("timeRemapEnabled requested but layer cannot time-remap: " + ls.name);
      } catch (te) { __warn("timeRemapEnabled failed on " + ls.name + ": " + __estr(te)); }
    }
    if (ls.trackMatteType !== undefined && ls.trackMatteType !== null) {
      try {
        var tn = __TRACK_MATTE[ls.trackMatteType];
        if (tn) L.trackMatteType = eval("TrackMatteType." + tn);
      } catch (te) { __warn("trackMatteType " + ls.trackMatteType + " on " + ls.name + ": " + __estr(te)); }
    }
    if (ls.parentIndex) {
      var pi = __num(ls.parentIndex);
      if (pi >= 1 && pi <= compLayers.length) {
        try { L.parent = compLayers[pi - 1]; }
        catch (pe) { __err("parent failed on " + ls.name + " -> index " + pi + ": " + __estr(pe)); }
      } else { __err("parentIndex out of range on " + ls.name + ": " + ls.parentIndex); }
    }
    if (ls.transform && ls.transform.separatedPosition) {
      // Enable X/Y/Z separated position before children are applied, or the
      // scalar followers stay hidden and reject setValue.
      try {
        var tp = L.property("ADBE Transform Group").property("ADBE Position");
        if (tp) tp.dimensionsSeparated = true;
      } catch (spe) { __warn("dimensionsSeparated failed on " + ls.name + ": " + __estr(spe)); }
    }
    if (ls.transform) __applyGroup(L.property("ADBE Transform Group"), ls.transform, "transform");
    if (ls.masks) __applyGroup(L.property("ADBE Mask Parade"), ls.masks, "masks");
    if (ls.effects) __applyGroup(L.property("ADBE Effect Parade"), ls.effects, "effects");
    if (ls.shapes) __applyGroup(L.property("ADBE Root Vectors Group"), ls.shapes, "shapes");
    if (ls.text) __applyGroup(L.property("ADBE Text Properties"), ls.text, "text");
    if (ls.timeRemap) {
      try {
        var trp = L.property("ADBE Time Remapping");
        if (ls.timeRemap.properties && ls.timeRemap.properties.length) __applyGroup(trp, ls.timeRemap, "timeRemap");
        else __applyNode(trp, ls.timeRemap, "timeRemap");
      } catch (tre) { __warn("timeRemap apply failed on " + ls.name + ": " + __estr(tre)); }
    }
    if (ls.markers) { /* markers are informational; not yet materialized */ }
    if (ls.enabled === false) L.enabled = false;
  } catch (e) { __err("layer setup failed on " + ls.name + ": " + __estr(e)); }
}

// Relink footage whose recorded path no longer exists (assets moved into
// this repo). Searches assets/{rec,footage,images,audio} by basename.
function __relinkFootage() {
  var dirs = ["assets/rec", "assets/footage", "assets/images", "assets/audio"];
  var fixed = 0;
  var missing = [];
  for (var i = 1; i <= app.project.numItems; i++) {
    var it = null;
    try { it = app.project.item(i); } catch (e) { continue; }
    if (!it || it instanceof CompItem || it instanceof FolderItem) continue;
    var f = null;
    try {
      var src = it.mainSource;
      if (src && src.file) f = src.file;
    } catch (e2) {}
    if (!f) continue;               // solids / placeholders have no file
    if (f.exists) continue;
    var base = f.fsName || f.name;
    base = base.substring(base.lastIndexOf("\\") + 1);
    base = base.substring(base.lastIndexOf("/") + 1);
    var done = false;
    for (var d = 0; d < dirs.length && !done; d++) {
      var cand = new File(__REPO_ROOT + "/" + dirs[d] + "/" + base);
      if (cand.exists) {
        try { it.replace(cand); fixed++; done = true; }
        catch (re) { __warn("relink replace failed " + it.name + ": " + __estr(re)); }
      }
    }
    if (!done) missing.push(it.name);
  }
  __prog("footage relink: fixed=" + fixed + " missing=" + missing.length);
  for (var m = 0; m < missing.length && m < 20; m++) __warn("offline footage: " + missing[m]);
}
// ---- project ---------------------------------------------------------------
function buildProject(spec) {
  // The -r script can start while AE is still finishing plugin/media
  // initialization; layers.add*() throws "undefined is not an object" during
  // that window (observed flaky on ~85MB material projects). Settle first.
  try { if ($.sleep) $.sleep(20000); } catch (sx) {}
  __prog("build start: " + (spec.comps ? spec.comps.length : 0) + " comps, " +
    (spec.footage ? spec.footage.length : 0) + " footage");
  if (spec.materialAep) {
    var mf = new File(__REPO_ROOT + "/" + spec.materialAep);
    if (!mf.exists) { __err("material AEP missing: " + spec.materialAep); }
    else {
      __prog("opening material AEP: " + spec.materialAep);
      var opened = false;
      try { app.open(mf); opened = true; }
      catch (oe) { __err("app.open failed: " + __estr(oe)); }
      __prog("material AEP opened=" + opened);
      if (opened) {
        __relinkFootage();
        // Let AE finish async indexing/conforming of the material project
        // before we start mutating it (layers.add throws while busy). The
        // busy window on an ~85MB project can exceed 15s on a cold start.
        try { if ($.sleep) $.sleep(15000); } catch (sx) {}
      }
    }
  }
  var footageByName = {};
  if (spec.footage) {
    for (var fi = 0; fi < spec.footage.length; fi++) {
      __importFootage(spec.footage[fi], footageByName);
    }
  }
  __prog("footage imported");
  // Name-collision guard: material AEPs must contain only material. A stray
  // comp sharing a generated comp's name makes __findComp/comp(name)
  // resolution ambiguous and silently renders the wrong comp (observed:
  // a leftover "brand-check" inside brand-materials.aep shadowed the
  // generated one). Fail loudly instead.
  for (var gci = 0; gci < spec.comps.length; gci++) {
    var gname = spec.comps[gci].name;
    var goy = __findComp(gname);
    if (goy) { __err("comp name collision: material project already has comp '" + gname + "'"); }
  }
  // Project-panel folders: materialize the declared tree, then assign
  // items. Spec comps/footage carry folder paths resolved to FolderItems;
  // itemFolders covers material-AEP items by name (ambiguous names are
  // skipped with a warning — never guessed).
  var __folderByPath = {};
  if (spec.folders && spec.folders.length) {
    for (var fdi = 0; fdi < spec.folders.length; fdi++) {
      var fs = spec.folders[fdi];
      var fpath = String(fs.path || "");
      var fparts = fpath.split("/");
      var fparent = null;
      var fprefix = "";
      var fok = true;
      for (var fpi = 0; fpi < fparts.length; fpi++) {
        var fpname = fparts[fpi];
        var fkey = fprefix ? fprefix + "/" + fpname : fpname;
        var fexist = __folderByPath[fkey];
        if (!fexist) {
          try {
            fexist = fparent
              ? fparent.items.addFolder(fpname)
              : app.project.items.addFolder(fpname);
            __folderByPath[fkey] = fexist;
          } catch (fe) {
            __err("addFolder failed " + fkey + ": " + __estr(fe));
            fok = false;
            break;
          }
        }
        fparent = fexist;
        fprefix = fkey;
      }
      if (fok && fparent) __prog("folder " + fpath);
    }
  }
  function __assignFolder(item, fpath) {
    if (!item || !fpath) return;
    var fo = __folderByPath[String(fpath)];
    if (!fo) { __warn("folder not materialized for '" + fpath + "'"); return; }
    try { item.parentFolder = fo; }
    catch (fe) { __warn("parentFolder failed for " + item.name + ": " + __estr(fe)); }
  }
  // create every comp first so precomp layers can reference any of them
  var compItems = [];
  for (var i = 0; i < spec.comps.length; i++) {
    var cs = spec.comps[i];
    var c = null;
    try {
      c = app.project.items.addComp(cs.name, __num(cs.width), __num(cs.height),
        __num(cs.pixelAspect || 1), __num(cs.duration), __num(cs.frameRate));
      if (cs.bgColor) {
        try { c.bgColor = __scalar(cs.bgColor); } catch (bge) {}
      }
      if (cs.label !== undefined) { try { c.label = __num(cs.label); } catch (le) {} }
      // hideShyLayers is required for shy layers (e.g. FoldLayers-folded
      // groups) to actually disappear from the comp view and renders.
      if (cs.hideShyLayers) { try { c.hideShyLayers = true; } catch (hs) {} }
      compItems.push(c);
    } catch (ce) { __err("addComp failed " + cs.name + ": " + __estr(ce)); compItems.push(null); }
  }
  __prog("comps created");
  for (var fci = 0; fci < spec.comps.length; fci++) {
    if (compItems[fci] && spec.comps[fci].folder) __assignFolder(compItems[fci], spec.comps[fci].folder);
  }
  if (spec.footage) {
    for (var ffi = 0; ffi < spec.footage.length; ffi++) {
      var fst = spec.footage[ffi];
      var fit = footageByName[fst.name];
      if (fit && fst.folder) __assignFolder(fit, fst.folder);
    }
  }
  for (i = 0; i < spec.comps.length; i++) {
    var compSpec = spec.comps[i];
    var comp = compItems[i];
    if (!comp) continue;
    var layers = compSpec.layers || [];
    // AE's conform busy-window fluctuates: a comp can accept writes, then go
    // busy again mid-batch. Gate the whole batch on a write probe, and on a
    // per-layer failure re-probe until writable (bounded by a shared budget)
    // before retrying once. Deterministic failures (unresolved sources)
    // return null without throwing and are never retried.
    var createDeadline = new Date().getTime() + 600000;
    if (!__awaitCompReady(comp, compSpec.name, createDeadline)) continue;
    var created = [];
    for (var k = 0; k < layers.length; k++) created.push(null);
    var compT0 = new Date().getTime();
    __prog("comp start " + compSpec.name + " (" + layers.length + " layers)");
    // layers.add* inserts at the TOP of the stack, so iterate the spec
    // (AE order, [0] = top) in reverse to reproduce the original stacking.
    for (var ri = layers.length - 1; ri >= 0; ri--) {
      var ls = layers[ri];
      var L = null;
      __CTX = compSpec.name + " / " + (ls.name || ("layer" + ls.index));
      try {
        L = __createLayer(comp, ls, footageByName, compItems);
      }
      catch (ce2) {
        __prog("create layer failed " + ls.name + ": " + __estr(ce2) +
          " [diag " + __createDiag(comp, ls) + "]; awaiting writable comp");
        if (__awaitCompReady(comp, compSpec.name, createDeadline)) {
          try { L = __createLayer(comp, ls, footageByName, compItems); }
          catch (ce3) {
            __err("create layer failed after retry " + ls.name + ": " + __estr(ce3) +
              " [diag " + __createDiag(comp, ls) + "]");
          }
        }
      }
      created[ri] = L;
    }
    var made = 0;
    for (var ci2 = 0; ci2 < created.length; ci2++) if (created[ci2]) made++;
    __prog("comp " + compSpec.name + " created " + made + "/" + layers.length + " layers");
    for (var li = 0; li < layers.length; li++) {
      if (created[li]) {
        __CTX = compSpec.name + " / " + (layers[li].name || ("layer" + layers[li].index));
        __applyLayer(created[li], layers[li], created);
      }
      if ((li + 1) % 50 === 0) {
        __prog("comp " + compSpec.name + " layer " + (li + 1) + "/" + layers.length);
      }
    }
    __CTX = "";
    __prog("comp " + compSpec.name + " aeLayers=" + comp.numLayers);
    __prog("comp done " + compSpec.name + " (" + layers.length + " layers, " +
      (new Date().getTime() - compT0) + "ms)");
    try { if ($.writeln) $.writeln("PV comp done: " + compSpec.name + " (" + layers.length + " layers)"); } catch (x) {}
  }
  // Expression audit: AE reports per-property evaluation errors through
  // Property.expressionError. Scan every property of every layer we built;
  // any non-empty error is a hard failure — a generated project with broken
  // expressions must not count as successful (issue #14).
  var exprErrCount = 0;
  function __scanExprNode(p, path) {
    var expr = "";
    try { expr = p.expression; } catch (e) {}
    if (expr) {
      var ee = "";
      try { ee = p.expressionError; } catch (e2) {}
      if (ee) {
        exprErrCount++;
        __err("expressionError " + path + ": " + __estr(ee));
      }
    }
    var n = 0;
    try { n = p.numProperties; } catch (e3) {}
    for (var pi = 1; pi <= n; pi++) {
      var cp = null;
      try { cp = p.property(pi); } catch (e4) { continue; }
      if (cp) __scanExprNode(cp, path + "/" + pi);
    }
  }
  function __scanExprLayer(L, cname, lname) {
    var roots = ["ADBE Transform Group", "ADBE Mask Parade", "ADBE Effect Parade",
      "ADBE Root Vectors Group", "ADBE Text Properties", "ADBE Time Remapping"];
    for (var ri = 0; ri < roots.length; ri++) {
      var root = null;
      try { root = L.property(roots[ri]); } catch (e) {}
      if (root) __scanExprNode(root, cname + "/" + lname + "/" + roots[ri]);
    }
  }
  for (var sci = 0; sci < compItems.length; sci++) {
    var scomp = compItems[sci];
    if (!scomp) continue;
    for (var sli = 1; sli <= scomp.numLayers; sli++) {
      var slayer = null;
      try { slayer = scomp.layer(sli); } catch (e) {}
      if (slayer) __scanExprLayer(slayer, scomp.name, slayer.name);
    }
  }
  __prog("expression audit done, errors=" + exprErrCount);
  for (var dci = 0; dci < compItems.length; dci++) {
    if (compItems[dci]) __prog("post-audit " + compItems[dci].name + " aeLayers=" + compItems[dci].numLayers);
  }
  // Label every project item (covers material-AEP comps/footage, which have
  // no spec entry of their own) from the authored name -> color map.
  if (spec.itemLabels) {
    for (var li2 = 1; li2 <= app.project.numItems; li2++) {
      var itm = null;
      try { itm = app.project.item(li2); } catch (e) {}
      if (!itm) continue;
      var lv = spec.itemLabels[itm.name];
      if (lv !== undefined) { try { itm.label = __num(lv); } catch (le) {} }
    }
  }
  if (compItems[0]) __prog("post-labels " + compItems[0].name + " aeLayers=" + compItems[0].numLayers);
  // Duck-typed item classification shared by the prune closure and the
  // folder sweep below (instanceof is unreliable in this delivery context).
  function __isCompItem(it) {
    try { return it.numLayers !== undefined; } catch (e) { return false; }
  }
  function __isFolderItem(it) {
    try { return it.numItems !== undefined && it.numLayers === undefined; } catch (e) { return false; }
  }
  // Prune material-AEP items outside the authored keep lists so the saved
  // project contains only what the generated comp actually references.
  // Iterate backwards: remove() shifts later indices.
  if (spec.pruneMaterial) {
    // Dependency closure BY OBJECT IDENTITY, not name: the material AEP can
    // hold items whose names collide with spec-created items (or with each
    // other), and name-keyed keep lists cannot tell the duplicates apart.
    // keepObj holds the actual AVItem references that must survive; item
    // detection uses duck-typing (numLayers/numItems) because instanceof
    // against the host classes is unreliable in this delivery context.
    var keepObj = [];
    function __keepIdx(it) {
      for (var q = 0; q < keepObj.length; q++) if (keepObj[q] === it) return q;
      return -1;
    }
    function __keepItem(it) {
      if (it && __keepIdx(it) < 0) keepObj.push(it);
    }
    function __keepLayerSource(lay) {
      var s = null;
      try { s = /** @type {any} */ (lay).source; } catch (e) {}
      __keepItem(s);
    }
    // Seeds: every comp/footage this spec created, the solid-host scratch
    // comp (removed by dedicated cleanup), and every layer source inside
    // the generated comps — material comps, footage, and null backers.
    var seedI;
    for (seedI = 0; seedI < compItems.length; seedI++) __keepItem(compItems[seedI]);
    __keepItem(__solidHost);
    for (seedI = 0; seedI < spec.footage.length; seedI++) {
      __keepItem(footageByName[spec.footage[seedI].name]);
    }
    for (seedI = 0; seedI < compItems.length; seedI++) {
      var sc = compItems[seedI];
      if (!sc) continue;
      for (var sl0 = 1; sl0 <= sc.numLayers; sl0++) {
        var slay0 = null;
        try { slay0 = sc.layer(sl0); } catch (e) {}
        if (slay0) __keepLayerSource(slay0);
      }
    }
    // Closure: kept comps pull in their own layer sources until stable.
    // Null layers are backed by auto-named "Null N" footage items —
    // dropping them deletes the null layer itself (observed: removing
    // "Null 26"/"Null 27" killed the brand anchors).
    var grew = true, guard = 0;
    while (grew && guard < 25) {
      grew = false; guard++;
      for (var ki0 = 0; ki0 < keepObj.length; ki0++) {
        var kcomp = keepObj[ki0];
        if (!__isCompItem(kcomp)) continue;
        for (var ki = 1; ki <= kcomp.numLayers; ki++) {
          var kl = null;
          try { kl = kcomp.layer(ki); } catch (e) { continue; }
          if (!kl) continue;
          var before = keepObj.length;
          __keepLayerSource(kl);
          if (keepObj.length !== before) grew = true;
        }
      }
    }
    __prog("prune keep-set: " + keepObj.length + " items by reference");
    // Expression + usedIn retention: name-keyed lists alone cannot see
    // references inside expression text (comp("x"), footage("x")) or
    // AVItem.usedIn consumers outside the layer-source walk. Anything
    // still referenced after this pass is kept — unknown references are
    // preserved, never guessed away.
    function __scanExprProps(prop, depth) {
      if (!prop || depth > 12) return;
      try {
        var ex = prop.expression;
        if (ex) __exprText.push(String(ex));
      } catch (exx) {}
      try {
        if (prop.numProperties > 0 && prop instanceof PropertyGroup) {
          for (var ei = 1; ei <= prop.numProperties; ei++) {
            var ep = null;
            try { ep = prop.property(ei); } catch (eep) {}
            if (ep) __scanExprProps(ep, depth + 1);
          }
        }
      } catch (epg) {}
    }
    var __exprText = [];
    for (var sci = 0; sci < keepObj.length; sci++) {
      var sitC = keepObj[sci];
      if (!__isCompItem(sitC)) continue;
      for (var sli = 1; sli <= sitC.numLayers; sli++) {
        var slay = null;
        try { slay = sitC.layer(sli); } catch (e) {}
        if (!slay) continue;
        __scanExprProps(slay, 0);
        try {
          var effs = slay.property("ADBE Effect Parade");
          if (effs) __scanExprProps(effs, 0);
        } catch (ee) {}
      }
    }
    var exprBlob = __exprText.join("\n");
    function __exprKeep(name) {
      if (!name) return false;
      var esc = name.replace(/[.*+?^{}$()|[\]\\]/g, "\\$&");
      return new RegExp("(comp|footage)\\(\\s*[\"']" + esc + "[\"']").test(exprBlob);
    }
    var pruned = 0;
    for (var pi3 = app.project.numItems; pi3 >= 1; pi3--) {
      var it3 = null;
      try { it3 = app.project.item(pi3); } catch (e) {}
      if (!it3 || __isFolderItem(it3)) continue;
      var drop = false;
      var exprHit = false;
      try { exprHit = __exprKeep(it3.name); } catch (xk) { exprHit = true; }
      var usedHit = false;
      try { var uin = /** @type {any} */ (it3).usedIn; if (uin && uin.length) usedHit = true; } catch (xu) {}
      if (exprHit) { __prog("prune keep: expression/usedIn references '" + it3.name + "'"); }
      // Identity keep wins; expression/usedIn hits keep conservatively by
      // name because they cannot be resolved to a unique object statically.
      if (__keepIdx(it3) < 0 && !exprHit && !usedHit) drop = true;
      if (drop) {
        var nl0 = -1, iname = "?";
        try { if (compItems[0]) nl0 = compItems[0].numLayers; } catch (x) {}
        try { iname = it3.name; } catch (x) {}
        try { it3.remove(); pruned++; } catch (re) {}
        try {
          if (compItems[0] && nl0 >= 0 && compItems[0].numLayers !== nl0) {
            __prog("prune side-effect: removing " + iname + " changed " + compItems[0].name +
              " layers " + nl0 + "->" + compItems[0].numLayers);
          }
        } catch (x) {}
      }
    }
    __prog("material prune: removed=" + pruned);
  }
  // Drop the scratch comp used to mint solid footage items before folder
  // assignment/sweep — if it sits inside a material folder it would keep
  // that folder artificially non-empty.
  if (__solidHost) {
    try { __solidHost.remove(); } catch (se) { __warn("solid host comp cleanup: " + __estr(se)); }
    __solidHost = null;
  }
  // Material-item folder assignment runs AFTER pruning: the material AEP can
  // contain duplicate names that only become unique once the dependency
  // closure has removed the unreferenced copies. Assigning earlier would hit
  // the ambiguity guard and leave items in their source folders.
  if (spec.itemFolders) {
    for (var ifn in spec.itemFolders) {
      if (!spec.itemFolders.hasOwnProperty(ifn)) continue;
      var ifpath = spec.itemFolders[ifn];
      var ifmatches = 0, ifitem = null;
      for (var iii = 1; iii <= app.project.numItems; iii++) {
        var iit = null;
        try { iit = app.project.item(iii); } catch (e) {}
        if (iit && !(iit instanceof FolderItem) && iit.name === ifn) { ifmatches++; ifitem = iit; }
      }
      if (ifmatches === 1) __assignFolder(ifitem, ifpath);
      else if (ifmatches > 1) __warn("itemFolders '" + ifn + "' ambiguous (" + ifmatches + " items), skipped");
      else __warn("itemFolders '" + ifn + "' not found");
    }
  }
  // Empty folders are never meaningful output — remove them after item
  // moves so husks emptied by re-filing are swept too. FolderItem state can
  // lag parentFolder moves within a session, so __sweepEmptyFolders also
  // runs once more after the AEP save in __finish (see below).
  var removedFolders = __sweepEmptyFolders();
  if (removedFolders) __prog("empty folders removed=" + removedFolders);
  if (compItems[0]) __prog("post-prune " + compItems[0].name + " aeLayers=" + compItems[0].numLayers);
  if (compItems[0]) __prog("post-solidhost " + compItems[0].name + " aeLayers=" + compItems[0].numLayers);
  for (var pci = 0; pci < compItems.length; pci++) {
    if (compItems[pci]) __prog("pre-save " + compItems[pci].name + " aeLayers=" + compItems[pci].numLayers);
  }
}

function __jsonStr(s) {
  return '"' + String(s)
    .replace(/\\/g, "\\\\").replace(/"/g, "\\\"")
    .replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t") + '"';
}
function __writeReport() {
  if (!__REPORT_PATH) return;
  var f = new File(__REPORT_PATH);
  f.encoding = "UTF-8";
  f.open("w");
  var wl = [], el = [];
  var i, n;
  n = __WARN.length < 200 ? __WARN.length : 200;
  for (i = 0; i < n; i++) wl.push(__jsonStr(__WARN[i]));
  n = __ERR.length < 200 ? __ERR.length : 200;
  for (i = 0; i < n; i++) el.push(__jsonStr(__ERR[i]));
  f.write('{"warnings":' + __WARN.length + ',"errors":' + __ERR.length +
    ',"warnList":[' + wl.join(",") + '],"errList":[' + el.join(",") + ']}');
  f.close();
  // Uncapped machine-readable log for offline classification. The report's
  // warnList/errList stay capped at 200 for quick inspection; this file is
  // the complete record (one JSON object per line: {"k":"w"|"e","m":"..."}).
  if (__WARNINGS_PATH) {
    var wf = new File(__WARNINGS_PATH);
    wf.encoding = "UTF-8";
    wf.open("w");
    var wl2 = "";
    for (i = 0; i < __WARN.length; i++) wl2 += '{"k":"w","m":' + __jsonStr(__WARN[i]) + '}\n';
    for (i = 0; i < __ERR.length; i++) wl2 += '{"k":"e","m":' + __jsonStr(__ERR[i]) + '}\n';
    wf.write(wl2);
    wf.close();
  }
}
// Removes project folders that hold no items. Emptiness is checked by
// scanning parentFolder references (FolderItem.numItems can lag moves
// within a session). Repeats because emptying a child can empty its parent.
function __sweepEmptyFolders() {
  var removed = 0, pass = 0, changed = true;
  while (changed && pass < 6) {
    changed = false; pass++;
    for (var pfi = app.project.numItems; pfi >= 1; pfi--) {
      var fitem = null;
      try { fitem = app.project.item(pfi); } catch (e) {}
      if (!fitem) continue;
      var fa = /** @type {any} */ (fitem);
      var isFolder = false;
      try { isFolder = fa.numItems !== undefined && fa.numLayers === undefined; } catch (e) {}
      if (!isFolder) continue;
      var kids = 0;
      for (var qi = 1; qi <= app.project.numItems; qi++) {
        var qit = null;
        try { qit = app.project.item(qi); } catch (e) {}
        if (!qit) continue;
        try { if (/** @type {any} */ (qit).parentFolder === fitem) { kids++; break; } } catch (e) {}
      }
      if (kids === 0) {
        try { fitem.remove(); removed++; changed = true; }
        catch (re) { __prog("folder '" + fitem.name + "' remove failed: " + __estr(re)); }
      }
    }
  }
  return removed;
}

function __finish() {
  __prog("buildProject returned; writing report");
  __writeReport();
  if (__SAVE_PATH) {
    try {
      var sf = new File(__SAVE_PATH);
      __prog("saving AEP: " + __SAVE_PATH);
      app.project.save(sf);
      __prog("AEP saved");
      // Folder bookkeeping can still be settling after in-build moves; a
      // post-save sweep catches husks the first pass could not remove, and
      // re-saves so the file on disk is clean.
      var postSweep = 0;
      try { postSweep = __sweepEmptyFolders(); } catch (x) {}
      if (postSweep > 0) {
        __prog("post-save folder sweep removed=" + postSweep);
        try { app.project.save(sf); __prog("AEP re-saved"); } catch (se2) { __err("re-save failed: " + __estr(se2)); }
      }
      try { if ($.writeln) $.writeln("PV saved: " + __SAVE_PATH); } catch (x) {}
    } catch (se) { __err("project save failed: " + __estr(se)); }
  }
  if (__REPORT_PATH) {
    var d = new File(__REPORT_PATH + ".done");
    d.open("w"); d.write("done"); d.close();
  }
}
`;

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
  try {
    var s = String(e.description || e.message || e);
    // ExtendScript Error carries .line/.source/.fileName -- keep them so a
    // bare "undefined is not an object" can be traced back to the JSX line.
    var extra = "";
    try { if (e.line !== undefined) extra += " @line " + e.line; } catch (x) {}
    try { if (e.fileName) extra += " (" + e.fileName + ")"; } catch (x) {}
    return s + extra;
  }
  catch (x) { return "(unprintable error)"; }
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
function __applyNode(p, node, path) {
  if (!p) { __err("missing property " + path); return; }
  if (node.numProperties && node.properties && node.properties.length) {
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
  if (item) footageByName[spec.name || item.name] = item;
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
      compItems.push(c);
    } catch (ce) { __err("addComp failed " + cs.name + ": " + __estr(ce)); compItems.push(null); }
  }
  __prog("comps created");
  for (i = 0; i < spec.comps.length; i++) {
    var compSpec = spec.comps[i];
    var comp = compItems[i];
    if (!comp) continue;
    var layers = compSpec.layers || [];
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
      // First open of a large material AEP leaves AE asynchronously
      // indexing/conforming for tens of seconds; layers.add() on comp
      // sources throws transiently during that window. Retry with backoff
      // (~50s coverage) -- a persistent failure still lands in the error list.
      var delays = [0, 5000, 15000, 30000];
      for (var att = 0; att < delays.length && !L; att++) {
        if (delays[att] > 0) { try { if ($.sleep) $.sleep(delays[att]); } catch (sx) {} }
        try {
          L = __createLayer(comp, ls, footageByName, compItems);
          if (!L) break; // unresolved source already recorded an error
        }
        catch (ce2) {
          if (att === delays.length - 1) __err("create layer failed " + ls.name + ": " + __estr(ce2));
          else __warn("create layer retry " + ls.name + " (" + __estr(ce2) + ")");
        }
      }
      created[ri] = L;
    }
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
    __prog("comp done " + compSpec.name + " (" + layers.length + " layers, " +
      (new Date().getTime() - compT0) + "ms)");
    try { if ($.writeln) $.writeln("PV comp done: " + compSpec.name + " (" + layers.length + " layers)"); } catch (x) {}
  }
  // drop the scratch comp used to mint solid footage items
  if (__solidHost) {
    try { __solidHost.remove(); } catch (se) { __warn("solid host comp cleanup: " + __estr(se)); }
    __solidHost = null;
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
function __finish() {
  __prog("buildProject returned; writing report");
  __writeReport();
  if (__SAVE_PATH) {
    try {
      var sf = new File(__SAVE_PATH);
      __prog("saving AEP: " + __SAVE_PATH);
      app.project.save(sf);
      __prog("AEP saved");
      try { if ($.writeln) $.writeln("PV saved: " + __SAVE_PATH); } catch (x) {}
    } catch (se) { __err("project save failed: " + __estr(se)); }
  }
  if (__REPORT_PATH) {
    var d = new File(__REPORT_PATH + ".done");
    d.open("w"); d.write("done"); d.close();
  }
}
`;

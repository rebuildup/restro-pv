// ES3 ExtendScript runtime executed inside After Effects.
// buildProject(SPEC) materializes the whole project from the spec literal,
// which mirrors the aep-comp-dump schema. Property trees are applied
// generically: groups recurse by matchName, leaves set value/keys.
// No JSON, no ES5+ builtins, no external files except imported footage.

export const AE_RUNTIME = String.raw`
var __REPO_ROOT = "";
var __SAVE_PATH = "";
var __REPORT_PATH = "";
try { __REPO_ROOT = $.getenv("RESTRO_PV_ROOT") || ""; } catch (e) {}

var __WARN = [];
var __ERR = [];
// ExtendScript throws "Object of type Error" when an Error is concatenated
// with +, so error objects must go through this before string building.
function __estr(e) {
  try { return String(e.description || e.message || e); }
  catch (x) { return "(unprintable error)"; }
}
function __warn(msg) { __WARN.push(String(msg)); $.writeln("PV-WARN " + msg); }
function __err(msg) { __ERR.push(String(msg)); $.writeln("PV-ERR " + msg); }

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
  return __isObj(v) && v.text !== undefined && (v.font !== undefined || v.fontFamily !== undefined);
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
  sh.vertices = vs; sh.inTangents = ti; sh.outTangents = to;
  sh.closed = !!v.closed;
  return sh;
}
function __toTextDoc(p, v) {
  var d = p.value; // current TextDocument as base
  if (!d) return null;
  // dumped TextDocument exposes fontSize/boxTextPos/boxTextSize; the writable
  // TextDocument attributes are size/boxPosition/boxSize.
  var map = {
    text: "text", font: "font", size: "size", fontSize: "size",
    fillColor: "fillColor", strokeColor: "strokeColor", strokeWidth: "strokeWidth",
    tracking: "tracking", leading: "leading", baselineShift: "baselineShift",
    horizontalScale: "horizontalScale", verticalScale: "verticalScale",
    applyFill: "applyFill", applyStroke: "applyStroke",
    boxText: "boxText", boxPosition: "boxPosition", boxTextPos: "boxPosition",
    boxSize: "boxSize", boxTextSize: "boxSize",
    allCaps: "allCaps", fauxBold: "fauxBold", fauxItalic: "fauxItalic",
    smallCaps: "smallCaps", tsume: "tsume",
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
      else if (dk === "fillColor" || dk === "strokeColor" || dk === "boxPosition" || dk === "boxSize") {
        if (v[k] !== null) d[dk] = __scalar(v[k]);
      } else if (typeof v[k] === "boolean") d[dk] = !!v[k];
      else if (typeof v[k] === "number") d[dk] = v[k];
      else if (typeof v[k] === "string") d[dk] = v[k];
    } catch (ae) { __warn("textdoc field " + k + ": " + __estr(ae)); }
  }
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
      if (k.inT !== undefined || k.outT !== undefined) {
        var it = k.inT !== undefined ? __num(k.inT) : __num(k.outT);
        var ot = k.outT !== undefined ? __num(k.outT) : __num(k.inT);
        prop.setInterpolationTypeAtKey(idx, it, ot);
      }
      if (k.inEase || k.outEase) {
        var ie = null, oe = null;
        if (k.inEase && k.inEase.length) {
          ie = [];
          for (var a = 0; a < k.inEase.length; a++) ie.push(new KeyframeEase(__num(k.inEase[a][0]), __num(k.inEase[a][1])));
        }
        if (k.outEase && k.outEase.length) {
          oe = [];
          for (var b = 0; b < k.outEase.length; b++) oe.push(new KeyframeEase(__num(k.outEase[b][0]), __num(k.outEase[b][1])));
        }
        // setTemporalEaseAtKey requires arrays on both sides.
        if (!ie) ie = oe;
        if (!oe) oe = ie;
        prop.setTemporalEaseAtKey(idx, ie, oe);
      }
      if (k.spIn || k.spOut) {
        var si = k.spIn ? [__num(k.spIn[0]), __num(k.spIn[1])] : [0, 0];
        var so = k.spOut ? [__num(k.spOut[0]), __num(k.spOut[1])] : [0, 0];
        prop.setSpatialTangentsAtKey(idx, si, so);
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
    // group-level attrs (mask mode / enabled live on the atom, not children)
    if (node.maskMode !== undefined) {
      try { p.maskMode = node.maskMode; }
      catch (me) { __warn("maskMode failed on " + path + ": " + __estr(me)); }
    }
    if (node.enabled === false) {
      try { p.enabled = false; } catch (ee2) { __warn("enabled=false failed on " + path); }
    }
    if (node.active === false) {
      try { p.active = false; } catch (ae2) { __warn("active=false failed on " + path); }
    }
    return;
  }
  // leaf
  if (node.keys && node.keys.length) {
    __applyKeys(p, node.keys);
  } else if (node.value !== undefined && node.value !== null) {
    var v = node.value;
    try {
      if (__isShapeVal(v)) { p.setValue(__toShape(v)); }
      else if (p.matchName === "ADBE Text Document" || __isTextDocVal(v)) {
        var d = __toTextDoc(p, v);
        if (d) p.setValue(d);
      } else {
        p.setValue(__scalar(v));
      }
    } catch (ve) { __err("setValue failed " + path + " (" + p.matchName + "): " + __estr(ve)); }
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
var __TRACK_MATTE = { 0: "NO_TRACK_MATTE", 1: "ALPHA", 2: "ALPHA_INVERTED", 3: "LUMA", 4: "LUMA_INVERTED" };
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
  if ((!f || !f.exists) && __REPO_ROOT) {
    try { f = new File(__REPO_ROOT + "/" + rel.split("/").join("\\")); } catch (e) {}
  }
  if (!f || !f.exists) { try { f = new File(rel); } catch (e) {} }
  if (!f || !f.exists) { __err("missing footage file: " + rel); return null; }
  var item = app.project.importFile(new ImportOptions(f));
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
function __applyLayer(L, ls, compLayers) {
  try {
    if (ls.enabled === false) L.enabled = false;
    if (ls.shy) L.shy = true;
    if (ls.guideLayer) L.guideLayer = true;
    if (ls.inPoint !== undefined) L.inPoint = __num(ls.inPoint);
    if (ls.outPoint !== undefined) L.outPoint = __num(ls.outPoint);
    if (ls.startTime !== undefined) L.startTime = __num(ls.startTime);
    if (ls.stretch !== undefined) L.stretch = __num(ls.stretch);
    if (ls.audioEnabled === false) L.audioEnabled = false;
    if (ls.threeDLayer) { try { L.threeDLayer = true; } catch (e) {} }
    if (ls.motionBlur) { try { L.motionBlur = true; } catch (e) {} }
    if (ls.collapseTransformations) { try { L.collapseTransformations = true; } catch (e) {} }
    if (ls.adjustmentLayer) { try { L.adjustmentLayer = true; } catch (e) {} }
    if (ls.timeRemapEnabled) { try { L.timeRemapEnabled = true; } catch (e) {} }
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
  } catch (e) { __err("layer setup failed on " + ls.name + ": " + __estr(e)); }
}

// ---- project ---------------------------------------------------------------
function buildProject(spec) {
  var footageByName = {};
  if (spec.footage) {
    for (var fi = 0; fi < spec.footage.length; fi++) {
      __importFootage(spec.footage[fi], footageByName);
    }
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
      compItems.push(c);
    } catch (ce) { __err("addComp failed " + cs.name + ": " + __estr(ce)); compItems.push(null); }
  }
  for (i = 0; i < spec.comps.length; i++) {
    var compSpec = spec.comps[i];
    var comp = compItems[i];
    if (!comp) continue;
    var layers = compSpec.layers || [];
    var created = [];
    for (var k = 0; k < layers.length; k++) created.push(null);
    // layers.add* inserts at the TOP of the stack, so iterate the spec
    // (AE order, [0] = top) in reverse to reproduce the original stacking.
    for (var ri = layers.length - 1; ri >= 0; ri--) {
      var ls = layers[ri];
      var L = null;
      try { L = __createLayer(comp, ls, footageByName, compItems); }
      catch (ce2) { __err("create layer failed " + ls.name + ": " + __estr(ce2)); }
      created[ri] = L;
    }
    for (var li = 0; li < layers.length; li++) {
      if (created[li]) __applyLayer(created[li], layers[li], created);
    }
    $.writeln("PV comp done: " + compSpec.name + " (" + layers.length + " layers)");
  }
  // drop the scratch comp used to mint solid footage items
  if (__solidHost) {
    try { __solidHost.remove(); } catch (se) { __warn("solid host comp cleanup: " + __estr(se)); }
    __solidHost = null;
  }
}

function __jsonStr(s) {
  return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + '"';
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
}
function __finish() {
  __writeReport();
  if (__SAVE_PATH) {
    try {
      var sf = new File(__SAVE_PATH);
      app.project.save(sf);
      $.writeln("PV saved: " + __SAVE_PATH);
    } catch (se) { __err("project save failed: " + __estr(se)); }
  }
  if (__REPORT_PATH) {
    var d = new File(__REPORT_PATH + ".done");
    d.open("w"); d.write("done"); d.close();
  }
}
`;

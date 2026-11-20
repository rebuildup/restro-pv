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
  var map = {
    text: "text", font: "font", size: "size", fillColor: "fillColor",
    strokeColor: "strokeColor", strokeWidth: "strokeWidth", tracking: "tracking",
    leading: "leading", baselineShift: "baselineShift",
    horizontalScale: "horizontalScale", verticalScale: "verticalScale",
    applyFill: "applyFill", applyStroke: "applyStroke", boxPosition: "boxPosition",
    boxSize: "boxSize", boxText: "boxText"
  };
  for (var k in v) {
    if (!v.hasOwnProperty(k)) continue;
    var dk = map[k];
    if (!dk) continue;
    try {
      if (k === "font") d.font = String(v[k]);
      else if (k === "fillColor" || k === "strokeColor" || k === "boxPosition" || k === "boxSize") {
        if (v[k] !== null) d[dk] = __scalar(v[k]);
      } else if (typeof v[k] === "boolean") d[dk] = !!v[k];
      else if (typeof v[k] === "number") d[dk] = v[k];
      else if (typeof v[k] === "string") {
        if (dk === "justification") {
          try { d.justification = ParagraphJustification[v[k].toUpperCase()]; }
          catch (je) { try { d.justification = eval("ParagraphJustification." + v[k]); } catch (je2) {} }
        } else d[dk] = v[k];
      }
    } catch (ae) { __warn("textdoc field " + k + ": " + ae); }
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
      __err("setValueAtTime failed on " + prop.name + " @" + k.t + ": " + ke);
      continue;
    }
    var idx = i + 1;
    try {
      if (k.inT !== undefined || k.outT !== undefined) {
        prop.setInterpolationTypeAtKey(idx, __num(k.inT), __num(k.outT));
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
        prop.setTemporalEaseAtKey(idx, ie, oe);
      }
      if (k.spIn || k.spOut) {
        var si = k.spIn ? [__num(k.spIn[0]), __num(k.spIn[1])] : [0, 0];
        var so = k.spOut ? [__num(k.spOut[0]), __num(k.spOut[1])] : [0, 0];
        prop.setSpatialTangentsAtKey(idx, si, so);
      }
    } catch (ee) { __warn("key meta failed on " + prop.name + " #" + idx + ": " + ee); }
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
        catch (ae) { __err("addProperty " + ch.matchName + " under " + path + ": " + ae); continue; }
      } else {
        cp = __childProp(p, ch);
      }
      __applyNode(cp, ch, path + "/" + (ch.matchName || ch.name));
    }
    // group-level attrs (e.g. mask mode lives on the mask atom, not children)
    if (node.maskMode !== undefined) {
      try {
        var mm = { "MaskMode.ADD": 1 };
        p.maskMode = node.maskMode;
      } catch (me) {}
    }
    return;
  }
  // leaf
  if (node.keys && node.keys.length) {
    __applyKeys(p, node.keys);
    return;
  }
  if (node.value === undefined || node.value === null) return;
  var v = node.value;
  try {
    if (__isShapeVal(v)) { p.setValue(__toShape(v)); return; }
    if (p.matchName === "ADBE Text Document" || __isTextDocVal(v)) {
      var d = __toTextDoc(p, v);
      if (d) { p.setValue(d); return; }
    }
    p.setValue(__scalar(v));
  } catch (ve) { __err("setValue failed " + path + " (" + p.matchName + "): " + ve); }
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
      catch (ae) { __err("addProperty " + ch.matchName + " under " + path + ": " + ae); continue; }
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
function __importFootage(rel, footageByName) {
  var f = null;
  try { f = new File(__REPO_ROOT + "/" + rel); } catch (e) {}
  if ((!f || !f.exists) && __REPO_ROOT) {
    try { f = new File(__REPO_ROOT + "/" + rel.replace(/\//g, "\\")); } catch (e) {}
  }
  if (!f || !f.exists) { try { f = new File(rel); } catch (e) {} }
  if (!f || !f.exists) { __err("missing footage file: " + rel); return null; }
  var item = app.project.importFile(new ImportOptions(f));
  if (item) footageByName[item.name] = item;
  return item;
}
function __createLayer(comp, ls, footageByName) {
  var name = ls.name || ("layer" + ls.index);
  var L = null;
  if (ls.kind === "shape") { L = comp.layers.addShape(); }
  else if (ls.kind === "text") { L = comp.layers.addText(""); }
  else if (ls.kind === "null") { L = comp.layers.addNull(); }
  else if (ls.kind === "comp" || ls.kind === "footage") {
    var src = null;
    if (ls.kind === "comp") src = __findComp(ls.source);
    else src = footageByName[ls.source] || __findFootage(ls.source);
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
      } catch (te) { __warn("trackMatteType " + ls.trackMatteType + " on " + ls.name + ": " + te); }
    }
    if (ls.parentIndex) {
      var pi = __num(ls.parentIndex);
      if (pi >= 1 && pi <= compLayers.length) {
        try { L.parent = compLayers[pi - 1]; }
        catch (pe) { __err("parent failed on " + ls.name + " -> index " + pi + ": " + pe); }
      } else { __err("parentIndex out of range on " + ls.name + ": " + ls.parentIndex); }
    }
    if (ls.transform) __applyGroup(L.property("ADBE Transform Group"), ls.transform, "transform");
    if (ls.masks) __applyGroup(L.property("ADBE Mask Parade"), ls.masks, "masks");
    if (ls.effects) __applyGroup(L.property("ADBE Effect Parade"), ls.effects, "effects");
    if (ls.shapes) __applyGroup(L.property("ADBE Root Vectors Group"), ls.shapes, "shapes");
    if (ls.text) __applyGroup(L.property("ADBE Text Properties"), ls.text, "text");
    if (ls.timeRemap) {
      try { __applyGroup(L.property("ADBE Time Remapping"), ls.timeRemap, "timeRemap"); }
      catch (tre) { __warn("timeRemap apply failed on " + ls.name + ": " + tre); }
    }
    if (ls.markers) { /* markers are informational; not yet materialized */ }
  } catch (e) { __err("layer setup failed on " + ls.name + ": " + e); }
}

// ---- project ---------------------------------------------------------------
function buildProject(spec) {
  var footageByName = {};
  if (spec.footage) {
    for (var fi = 0; fi < spec.footage.length; fi++) {
      __importFootage(spec.footage[fi].file, footageByName);
    }
  }
  var compByName = {};
  for (var i = 0; i < spec.comps.length; i++) {
    var cs = spec.comps[i];
    var c = null;
    try {
      c = app.project.items.addComp(cs.name, __num(cs.width), __num(cs.height),
        __num(cs.pixelAspect || 1), __num(cs.duration), __num(cs.frameRate));
      compByName[cs.name] = c;
    } catch (ce) { __err("addComp failed " + cs.name + ": " + ce); }
  }
  for (i = 0; i < spec.comps.length; i++) {
    var compSpec = spec.comps[i];
    var comp = compByName[compSpec.name];
    if (!comp) continue;
    var layers = compSpec.layers || [];
    var created = [];
    // AE addition order = stacking order: first added ends up on top.
    for (var li = 0; li < layers.length; li++) {
      var ls = layers[li];
      var L = null;
      try { L = __createLayer(comp, ls, footageByName); }
      catch (ce2) { __err("create layer failed " + ls.name + ": " + ce2); }
      created.push(L);
    }
    for (li = 0; li < layers.length; li++) {
      if (created[li]) __applyLayer(created[li], layers[li], created);
    }
    $.writeln("PV comp done: " + compSpec.name + " (" + layers.length + " layers)");
  }
}

function __writeReport() {
  if (!__REPORT_PATH) return;
  var f = new File(__REPORT_PATH);
  f.encoding = "UTF-8";
  f.open("w");
  f.write('{"warnings":' + __WARN.length + ',"errors":' + __ERR.length +
    ',"warnList":[' + __WARN.slice(0, 200).map(function (s) {
      return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + '"';
    }).join(",") + '],"errList":[' + __ERR.slice(0, 200).map(function (s) {
      return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + '"';
    }).join(",") + ']}');
  f.close();
}
function __finish() {
  __writeReport();
  if (__SAVE_PATH) {
    try {
      var sf = new File(__SAVE_PATH);
      app.project.save(sf);
      $.writeln("PV saved: " + __SAVE_PATH);
    } catch (se) { __err("project save failed: " + se); }
  }
  if (__REPORT_PATH) {
    var d = new File(__REPORT_PATH + ".done");
    d.open("w"); d.write("done"); d.close();
  }
}
`;

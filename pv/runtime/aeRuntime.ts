// ES3 ExtendScript runtime executed inside After Effects.
// buildProject(SPEC) materializes the whole project from the spec literal.
// No JSON, no ES5+ builtins, no external files except imported footage.

export const AE_RUNTIME = String.raw`
var __REPO_ROOT = "";
try { __REPO_ROOT = $.getenv("RESTRO_PV_ROOT") || ""; } catch (e) { __REPO_ROOT = ""; }

function __isArr(v) { return Object.prototype.toString.call(v) === "[object Array]"; }
function __num(n) { return (typeof n === "number" && isFinite(n)) ? n : 0; }
function __v2(v) {
  if (__isArr(v)) return [__num(v[0]), __num(v[1])];
  if (v && typeof v === "object") return [__num(v.x), __num(v.y)];
  return [0, 0];
}
function __v3(v) {
  if (__isArr(v)) {
    if (v.length === 4) return [__num(v[0]), __num(v[1]), __num(v[2]), __num(v[3])];
    return [__num(v[0]), __num(v[1]), __num(v[2])];
  }
  if (v && typeof v === "object") return [__num(v.x), __num(v.y), __num(v.z !== undefined ? v.z : 0)];
  return 0;
}
function __propByMatch(root, match) {
  if (!root) return null;
  try { return root.property(match); } catch (e) {}
  // fall back to walking by name for non-localized safety
  return null;
}
function __findItem(name) {
  var items = app.project.items;
  for (var i = 1; i <= items.length; i++) {
    if (items[i].name === name) return items[i];
  }
  return null;
}
function __resolveSource(spec, footageByName) {
  if (!spec) return null;
  var c = __findItem(spec.name);
  if (c) return c;
  var f = footageByName[spec.name];
  if (f === undefined) f = footageByName[spec.source] || footageByName[spec.name];
  return f || null;
}
function __importFootage(rel, footageByName) {
  var f = null;
  try { f = new File(__REPO_ROOT + "/" + rel); } catch (e) {}
  if ((!f || !f.exists) && __REPO_ROOT) {
    try { f = new File(__REPO_ROOT + "/" + rel.replace(/\//g, "\\")); } catch (e) {}
  }
  if (!f || !f.exists) { try { f = new File(rel); } catch (e) {} }
  if (!f || !f.exists) { $.writeln("PV: missing footage " + rel); return null; }
  var item = app.project.importFile(new ImportOptions(f));
  if (item) footageByName[item.name] = item;
  return item;
}

// ---- keyframes -------------------------------------------------------------
function __scalar(v) {
  if (__isArr(v)) {
    var out = [];
    for (var i = 0; i < v.length; i++) out.push(__scalar(v[i]));
    return out;
  }
  if (v && typeof v === "object") {
    if (v.x !== undefined) return [__num(v.x), __num(v.y), __num(v.z !== undefined ? v.z : 0)];
  }
  return v;
}
function __applyKeys(prop, keys) {
  if (!prop || !keys || keys.length === 0) return;
  var first = keys[0];
  prop.setValueAtTime(__num(first.t), __scalar(first.v));
  for (var i = 1; i < keys.length; i++) {
    var k = keys[i];
    prop.setValueAtTime(__num(k.t), __scalar(k.v));
    var idx = i + 1;
    try {
      if (k.inEase || k.outEase) {
        var ie = [], oe = [];
        if (k.inEase) { for (var a = 0; a < k.inEase.length; a++) ie.push(new KeyframeEase(__num(k.inEase[a][0]), __num(k.inEase[a][1]))); }
        if (k.outEase) { for (var b = 0; b < k.outEase.length; b++) oe.push(new KeyframeEase(__num(k.outEase[b][0]), __num(k.outEase[b][1]))); }
        prop.setTemporalEaseAtKey(idx, ie.length ? ie : null, oe.length ? oe : null);
      }
      if (k.spIn || k.spOut) {
        prop.setSpatialTangentsAtKey(idx, k.spIn ? __v2(k.spIn) : [0, 0], k.spOut ? __v2(k.spOut) : [0, 0]);
      }
    } catch (e) { $.writeln("PV: ease/tangent failed on " + prop.name + " key " + idx + ": " + e); }
  }
}

// ---- transform / masks / shapes -------------------------------------------
var __TRANSFORM_MATCH = {
  anchorPoint: "ADBE Anchor Point",
  position: "ADBE Position",
  scale: "ADBE Scale",
  rotation: "ADBE Rotate Z",
  rotationX: "ADBE Rotate X",
  rotationY: "ADBE Rotate Y",
  opacity: "ADBE Opacity",
  skew: "ADBE Skew",
  skewAxis: "ADBE Skew Axis"
};
function __applyProps(layer, specs) {
  if (!specs) return;
  var tg = layer.property("ADBE Transform Group");
  for (var i = 0; i < specs.length; i++) {
    var s = specs[i];
    var match = __TRANSFORM_MATCH[s.name] || s.matchName;
    var p = match ? tg.property(match) : null;
    if (!p) { $.writeln("PV: no transform prop " + s.name + " on " + layer.name); continue; }
    if (s.keys && s.keys.length) {
      __applyKeys(p, s.keys);
    } else if (s.value !== undefined && s.value !== null) {
      try { p.setValue(__scalar(s.value)); } catch (e) { $.writeln("PV: setValue failed " + s.name + ": " + e); }
    }
  }
}
var __MASK_MODES = {
  add: MaskMode.ADD, subtract: MaskMode.SUBTRACT, intersect: MaskMode.INTERSECT,
  none: MaskMode.NONE, difference: MaskMode.DIFFERENCE, lighten: MaskMode.LIGHTEN,
  darken: MaskMode.DARKEN
};
function __applyMasks(layer, masks) {
  if (!masks) return;
  var parade = layer.property("ADBE Mask Parade");
  for (var i = 0; i < masks.length; i++) {
    var m = masks[i];
    var mask = parade.addProperty("ADBE Mask Atom");
    if (m.mode !== undefined && __MASK_MODES[m.mode] !== undefined) mask.maskMode = __MASK_MODES[m.mode];
    if (m.inverted !== undefined) mask.maskFeatherMode = m.inverted ? MaskFeatherMode.INVERTED : MaskFeatherMode.NORMAL;
    var p = m.path;
    var sh = new Shape();
    var vs = [], ti = [], to = [];
    for (var v = 0; v < p.vertices.length; v++) {
      var vv = __v2(p.vertices[v]); vs.push(vv);
      ti.push(__v2(p.inTangents[v]));
      to.push(__v2(p.outTangents[v]));
    }
    sh.vertices = vs; sh.inTangents = ti; sh.outTangents = to; sh.closed = !!p.closed;
    mask.property("ADBE Mask Shape").setValue(sh);
    if (m.opacity !== undefined) mask.property("ADBE Mask Opacity").setValue(__num(m.opacity));
    if (m.expansion !== undefined) mask.property("ADBE Mask Offset").setValue(__num(m.expansion));
    if (m.name) mask.name = m.name;
  }
}
function __newShape(vs, ti, to, closed) {
  var sh = new Shape();
  var v = [], a = [], b = [];
  for (var i = 0; i < vs.length; i++) {
    v.push(__v2(vs[i])); a.push(__v2(ti[i])); b.push(__v2(to[i]));
  }
  sh.vertices = v; sh.inTangents = a; sh.outTangents = b; sh.closed = !!closed;
  return sh;
}
function __addPathTo(container, p) {
  var pg = container.addProperty("ADBE Vector Shape - Group");
  var sp = pg.property("ADBE Vector Shape");
  sp.setValue(__newShape(p.vertices, p.inTangents, p.outTangents, p.closed));
  return pg;
}
function __shapeItems(container, items) {
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    try {
      if (it.type === "path") { __addPathTo(container, it.path); }
      else if (it.type === "rect") {
        var r = container.addProperty("ADBE Vector Shape - Rect");
        if (it.rect) {
          r.property("ADBE Vector Rect Size").setValue(__v2(it.rect.size));
          r.property("ADBE Vector Rect Position").setValue(__v2(it.rect.position));
        }
      } else if (it.type === "ellipse") {
        var e = container.addProperty("ADBE Vector Shape - Ellipse");
        if (it.ellipse) {
          e.property("ADBE Vector Ellipse Size").setValue(__v2(it.ellipse.size));
          e.property("ADBE Vector Ellipse Position").setValue(__v2(it.ellipse.position));
        }
      } else if (it.type === "fill") {
        var f = container.addProperty("ADBE Vector Graphic - Fill");
        f.property("ADBE Vector Fill Color").setValue(__v3(it.fill.color));
        if (it.fill.opacity !== undefined) f.property("ADBE Vector Fill Opacity").setValue(__num(it.fill.opacity));
      } else if (it.type === "stroke") {
        var s = container.addProperty("ADBE Vector Graphic - Stroke");
        s.property("ADBE Vector Stroke Color").setValue(__v3(it.stroke.color));
        s.property("ADBE Vector Stroke Width").setValue(__num(it.stroke.width));
        if (it.stroke.opacity !== undefined) s.property("ADBE Vector Stroke Opacity").setValue(__num(it.stroke.opacity));
      } else if (it.type === "group") {
        var g = container.addProperty("ADBE Vector Group");
        if (it.name) g.name = it.name;
        __shapeItems(g.property("ADBE Vectors Group"), it.items);
      } else if (it.type === "transform") {
        // group transform lives on the group's own transform group; handled by caller
      }
    } catch (e2) { $.writeln("PV: shape item failed " + it.type + ": " + e2); }
  }
}
function __applyShape(layer, spec) {
  var root = layer.property("ADBE Root Vectors Group");
  __shapeItems(root, spec.groups);
}
function __applyText(layer, spec) {
  if (!spec || !spec.text) return;
  var tp = layer.property("ADBE Text Properties");
  var docProp = tp.property("ADBE Text Document");
  var doc = docProp.value;
  doc.text = spec.text;
  if (spec.fontName) doc.font = spec.fontName;
  if (spec.fontSize) doc.size = spec.fontSize * 72 / 25.4 * 25.4; // size is in points; keep as given
  if (spec.fontSize) doc.size = spec.fontSize;
  if (spec.fillColor) doc.fillColor = __v3(spec.fillColor);
  if (spec.strokeColor) { doc.strokeColor = __v3(spec.strokeColor); doc.applyStroke = true; }
  if (spec.strokeWidth) doc.strokeWidth = spec.strokeWidth;
  if (spec.justification) {
    doc.justification = ParagraphJustification[spec.justification.toUpperCase()] || doc.justification;
  }
  docProp.setValue(doc);
}

// ---- project ---------------------------------------------------------------
function buildProject(spec) {
  var footageByName = {};
  // footage first so comp layers can resolve them
  if (spec.footage) {
    for (var fi = 0; fi < spec.footage.length; fi++) {
      var fr = spec.footage[fi];
      __importFootage(fr.file, footageByName);
    }
  }
  var compByName = {};
  var order = [];
  for (var i = 0; i < spec.comps.length; i++) {
    var cs = spec.comps[i];
    var c = app.project.items.addComp(cs.name, cs.width, cs.height, cs.pixelAspect || 1, cs.duration, cs.frameRate);
    compByName[cs.name] = c;
    order.push(c);
  }
  // second pass: layers
  for (i = 0; i < spec.comps.length; i++) {
    var compSpec = spec.comps[i];
    var comp = compByName[compSpec.name];
    var added = {};
    for (var li = 0; li < compSpec.layers.length; li++) {
      var ls = compSpec.layers[li];
      var L = null;
      try {
        if (ls.kind === "shape") { L = comp.layers.addShape(); L.name = ls.name; __applyShape(L, ls.shape || { groups: [] }); }
        else if (ls.kind === "text") { L = comp.layers.addText(ls.text && ls.text.text ? ls.text.text : ls.name); L.name = ls.name; __applyText(L, ls.text); }
        else if (ls.kind === "null") { L = comp.layers.addNull(); L.name = ls.name; }
        else {
          var src = __resolveSource({ name: ls.source || ls.name }, footageByName);
          src = src || __findItem(ls.source || "");
          if (src instanceof CompItem || src instanceof FootageItem) L = comp.layers.add(src);
          else { $.writeln("PV: unresolved source for " + ls.name + " (" + (ls.source || "") + ")"); continue; }
          L.name = ls.name;
        }
      } catch (le) { $.writeln("PV: layer create failed " + ls.name + ": " + le); continue; }
      added[ls.name] = L;
      try {
        if (ls.startTime !== undefined) L.startTime = __num(ls.startTime);
        if (ls.inPoint !== undefined) L.inPoint = __num(ls.inPoint);
        if (ls.outPoint !== undefined) L.outPoint = __num(ls.outPoint);
        if (ls.stretch !== undefined) L.stretch = __num(ls.stretch);
        if (ls.enabled === false) L.enabled = false;
        __applyProps(L, ls.transform);
        __applyMasks(L, ls.masks);
      } catch (te) { $.writeln("PV: layer setup failed " + ls.name + ": " + te); }
    }
    // parenting second pass within comp
    for (li = 0; li < compSpec.layers.length; li++) {
      var ls2 = compSpec.layers[li];
      if (ls2.parent && added[ls2.name] && added[ls2.parent]) {
        try { added[ls2.name].parent = added[ls2.parent]; } catch (pe) { $.writeln("PV: parent failed " + ls2.name + ": " + pe); }
      }
    }
  }
  return compByName;
}
`;

// Probe: what does a Restro STROKE_* layer actually contain, and which
// render output templates does this AE accept?
(function () {
  var ROOT = "C:/Users/rebui/Desktop/restro-pv-23";
  var OUT = ROOT + "/.tmp/rec-newmat/stroke-probe.txt";
  var lines = [];
  function log(s) { lines.push(String(s)); }
  function serr(e) { try { return String(e && e.message ? e.message : e); } catch (x) { return "?"; } }

  function walk(node, depth, path) {
    if (!node || depth > 6) return;
    var n = 0;
    try { n = node.numProperties; } catch (e) { return; }
    for (var i = 1; i <= n; i++) {
      var p;
      try { p = node.property(i); } catch (e) { continue; }
      if (!p) continue;
      var mn = "", nm = "", ty = "";
      try { mn = p.matchName || ""; } catch (e) {}
      try { nm = p.name || ""; } catch (e) {}
      try { ty = String(p.propertyType); } catch (e) {}
      var extra = "";
      try {
        if (p.propertyType === PropertyType.PROPERTY_SHAPE) {
          var sh = p.value;
          extra = " verts=" + (sh && sh.vertices ? sh.vertices.length : "-") +
                  " closed=" + (sh ? sh.closed : "-");
        }
      } catch (e) { extra = " shapeERR"; }
      log(new Array(depth + 1).join("  ") + "- " + mn + " [" + nm + "] type=" + ty + extra);
      try { if (p.numProperties > 0) walk(p, depth + 1, path + "/" + mn); } catch (e) {}
    }
  }

  try {
    var proj = app.project;
    for (var ci = 1; ci <= proj.numItems; ci++) {
      var it = proj.item(ci);
      if (!(it instanceof CompItem)) continue;
      log("COMP [" + it.name + "] numLayers=" + it.numLayers + " dur=" + it.duration);
    }
    var target = null;
    for (var cj = 1; cj <= proj.numItems; cj++) {
      var it2 = proj.item(cj);
      if (it2 instanceof CompItem && it2.name === "NEWMAT 無") target = it2;
    }
    if (target) {
      log("--- layer 1 tree of " + target.name + " ---");
      walk(target.layer(1), 0, "layer");
      log("--- layer 2 tree ---");
      if (target.numLayers > 1) walk(target.layer(2), 0, "layer");
    }
  } catch (e) {
    log("ERR " + serr(e));
  }

  // render template probe
  try {
    var comp = app.project.items.addComp("RENDERPROBE", 320, 180, 1.0, 1.0, 24);
    var solid = comp.layers.addSolid([0.5, 0.5, 0.5], "S", 320, 180, 1.0, 1.0);
    var rq = app.project.renderQueue;
    var item = rq.items.add(comp);
    item.timeSpanStart = 0;
    item.timeSpanDuration = 1 / 24;
    var om = item.outputModule(1);
    var tpls = ["PNG Sequence", "PNG Sequence with Alpha", "QuickTime MOV", "Lossless",
                "TIFF Sequence", "JPEG Sequence", "H.264 - Match Render Settings - 15 Mbps"];
    for (var i = 0; i < tpls.length; i++) {
      try { om.applyTemplate(tpls[i]); log("TPL OK " + tpls[i]); }
      catch (e) { log("TPL NO " + tpls[i] + " :: " + serr(e)); }
    }
    try {
      var folder = new Folder(ROOT + "/.tmp/rec-newmat/renderprobe");
      if (!folder.exists) folder.create();
      om.file = new File(ROOT + "/.tmp/rec-newmat/renderprobe/probe_[#####].png");
      rq.render();
      log("RENDER ok");
    } catch (e) { log("RENDER FAIL " + serr(e)); }
    try { comp.remove(); } catch (e) {}
  } catch (e) {
    log("RENDERPROBE ERR " + serr(e));
  }

  var f = new File(OUT);
  f.encoding = "UTF-8";
  f.open("w");
  f.write(lines.join("\n"));
  f.close();
  var d = new File(OUT + ".done");
  d.open("w");
  d.write("done");
  d.close();
})();

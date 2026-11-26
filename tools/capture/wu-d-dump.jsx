// WU-D geometry dump v2 — build comp, decompose, dump REAL stroke shape
// data (vertices/tangents/fill) to JSON. No renderQueue (avoids stall).
(function () {
  var ROOT = "C:/Users/rebui/Desktop/restro-pv-23";
  var f = new File(ROOT + "/.tmp/wu-d-strokes.json");
  f.encoding = "UTF-8";
  var report = new File(ROOT + "/.tmp/wu-d-dump.txt");
  report.encoding = "UTF-8";
  var lines = [];
  function log(s) { lines.push(s); try { report.open("w"); report.write(lines.join("\n")); report.close(); } catch (e) {} }
  function serr(e) { try { return String(e && e.message ? e.message : e); } catch (x) { return "?"; } }

  // find first descendant property whose matchName contains `match`
  function walk(prop, match, depth) {
    if (depth > 8 || !prop) return null;
    var n = 0;
    try { n = prop.numProperties; } catch (e) { return null; }
    for (var i = 1; i <= n; i++) {
      var p = null;
      try { p = prop.property(i); } catch (e) { continue; }
      if (!p) continue;
      try {
        if (p.matchName && p.matchName.indexOf(match) >= 0) return p;
      } catch (e) {}
      var r = walk(p, match, depth + 1);
      if (r) return r;
    }
    return null;
  }
  function jnum(v) { return (typeof v === "number" && isFinite(v)) ? String(v) : "null"; }
  function jarr(a) {
    var p = [];
    for (var i = 0; i < a.length; i++) {
      var v = a[i];
      p.push(v instanceof Array ? "[" + jarr(v) + "]" : jnum(v));
    }
    return p.join(",");
  }
  function jpts(a) {
    var p = [];
    for (var i = 0; i < a.length; i++) p.push("[" + jarr(a[i]) + "]");
    return "[" + p.join(",") + "]";
  }

  try {
    var proj = app.project;
    var W = 1280, H = 720;
    var comp = proj.items.addComp("RestroProofD", W, H, 1.0, 6.0, 24);
    var bg = comp.layers.addSolid([0.93, 0.92, 0.9], "BG", W, H, 1.0, 6.0);
    bg.moveToEnd();

    var tl = comp.layers.addText("筆");
    tl.name = "TL_WORK";
    var std = tl.property("ADBE Text Properties").property("ADBE Text Document");
    var doc = std.value;
    doc.text = "筆"; doc.fontSize = 520; doc.fillColor = [0.10, 0.10, 0.10];
    doc.justification = ParagraphJustification.CENTER_JUSTIFY;
    var fonts = ["Noto Sans JP", "MS Gothic", "MS ゴシック", "Yu Gothic", "Meiryo", "メイリオ"];
    for (var fi = 0; fi < fonts.length; fi++) {
      try { doc.font = fonts[fi]; std.setValue(doc); if (std.value.font === fonts[fi]) break; } catch (e) {}
    }
    std.setValue(doc);
    tl.property("ADBE Transform Group").property("ADBE Position").setValue([W / 2, H / 2 + 40, 0]);
    tl.selected = true;
    try { comp.openInViewer(); } catch (e) {}

    var env = $;
    env.setenv("RESTRO_REPLY", ""); env.setenv("RESTRO_CALL", "");
    var cmdId = app.findMenuCommandId("Restro: Decompose");
    if (!cmdId) throw new Error("menu not found");
    app.executeCommand(cmdId);
    log("REPLY " + String(env.getenv("RESTRO_REPLY") || "").substring(0, 200));

    var strokes = [];
    for (var j = 1; j <= comp.numLayers; j++) {
      var L = comp.layer(j);
      try { if (L instanceof ShapeLayer && /^STROKE_/.test(L.name)) strokes.push(L); } catch (e) {}
    }
    log("STROKES n=" + strokes.length);

    var parts = [];
    for (var k = 0; k < strokes.length; k++) {
      var s = strokes[k];
      var g = { name: s.name, index: k };
      try {
        var tp = s.property("ADBE Transform Group").property("ADBE Position");
        var pv = tp.value; g.pos = [pv[0], pv[1]];
      } catch (e) {}
      // explicit path: layer -> ADBE Root Vectors Group -> ... -> Vector Shape
      var shapeProp = null, fillCol = null;
      try {
        var root = s.property("ADBE Root Vectors Group");
        if (root) {
          shapeProp = walk(root, "ADBE Vector Shape", 0);
          // fill: search for a property whose value has .color under a Fill group
          var fillGrp = walk(root, "ADBE Vector Fill", 0);
          if (!fillGrp) fillGrp = walk(root, "Fill", 0);
          if (fillGrp) {
            try {
              var cp = fillGrp.property("ADBE Vector Fill Color") || fillGrp.property("Color");
              if (cp && cp.value instanceof Array) fillCol = cp.value;
            } catch (e) {}
            if (!fillCol) {
              try {
                for (var fp = 1; fp <= fillGrp.numProperties; fp++) {
                  var fp2 = fillGrp.property(fp);
                  try { if (fp2.value instanceof Array && fp2.value.length >= 3) { fillCol = fp2.value; break; } } catch (e2) {}
                }
              } catch (e3) {}
            }
          }
        }
      } catch (e) { g.navErr = serr(e); }
      if (shapeProp) {
        try {
          var sh = shapeProp.value;
          g.vertices = sh.vertices;
          g.inTangents = sh.inTangents;
          g.outTangents = sh.outTangents;
          g.closed = sh.closed;
        } catch (e) { g.shapeErr = serr(e); }
      } else {
        g.noShape = true;
      }
      if (fillCol) {
        var fc = [];
        for (var ci = 0; ci < fillCol.length; ci++) fc.push(jnum(fillCol[ci]));
        g.fill = "[" + fc.join(",") + "]";
      }
      parts.push(g);
    }
    var withVerts = 0;
    for (var vi = 0; vi < parts.length; vi++) if (parts[vi].vertices) withVerts++;
    log("VERTS " + withVerts + "/" + parts.length);

    var json = '{"comp":{"w":' + W + ',"h":' + H + '},"strokes":[';
    var segs = [];
    for (var si = 0; si < parts.length; si++) {
      var g2 = parts[si];
      var gs = '"name":"' + g2.name + '","index":' + g2.index +
        (g2.pos ? ',"pos":[' + jarr(g2.pos) + "]" : "") +
        (g2.vertices ? ',"vertices":' + jpts(g2.vertices) +
          ',"inTangents":' + jpts(g2.inTangents) +
          ',"outTangents":' + jpts(g2.outTangents) +
          ',"closed":' + (g2.closed ? "true" : "false") : "") +
        (g2.fill ? ',"fill":' + g2.fill : "");
      segs.push("{" + gs + "}");
    }
    json += segs.join(",") + "]}";
    f.open("w"); f.write(json); f.close();
    log("JSON bytes=" + json.length);
    log("DONE");
  } catch (e) {
    log("ERROR " + serr(e));
  }
  try { report.open("w"); report.write(lines.join("\n")); report.close(); } catch (e2) {}
  var d = new File(ROOT + "/.tmp/wu-d-dump.txt.done"); d.open("w"); d.write("done"); d.close();
})();

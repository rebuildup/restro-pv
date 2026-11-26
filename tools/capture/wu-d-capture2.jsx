// WU-D decisive-footage capture v2 — build + render + geometry dump.
// Comp: solid "before" text twin -> trigger cut -> 13 real Restro
// STROKE_* layers fade/settle in staggered -> hold. Export via renderQueue
// (template names probed defensively; falls back to default OM .mov).
// Also dumps stroke geometry JSON as a Remotion fallback.
(function () {
  var ROOT = "C:/Users/rebui/Desktop/restro-pv-23";
  var OUTDIR = ROOT + "/.tmp/wu-d-capture";
  var reportFile = new File(ROOT + "/.tmp/wu-d-capture2.txt");
  reportFile.encoding = "UTF-8";
  var lines = [];
  function flush() {
    try { reportFile.open("w"); reportFile.write(lines.join("\n")); reportFile.close(); } catch (e) {}
  }
  function log(s) { lines.push(s); flush(); }
  function serr(e) { try { return String(e && e.message ? e.message : e); } catch (x) { return "?"; } }

  // recursive search for first property matching matchName substring
  function findProp(container, match) {
    if (!container) return null;
    var n = container.numProperties;
    for (var i = 1; i <= n; i++) {
      var p = container.property(i);
      try {
        if (p.matchName && p.matchName.indexOf(match) >= 0) return p;
      } catch (e) {}
      try {
        if (p.numProperties > 0) {
          var r = findProp(p, match);
          if (r) return r;
        }
      } catch (e) {}
    }
    return null;
  }

  try {
    var proj = app.project;
    var FPS = 24, DUR = 6.0, W = 1280, H = 720;
    var TRIG = 1.6;
    var comp = proj.items.addComp("RestroProofD", W, H, 1.0, DUR, FPS);
    log("COMP " + W + "x" + H + "@" + FPS);

    var bg = comp.layers.addSolid([0.93, 0.92, 0.9], "BG", W, H, 1.0, DUR);
    bg.moveToEnd();

    function makeText(name) {
      var tl = comp.layers.addText("筆");
      tl.name = name;
      var std = tl.property("ADBE Text Properties").property("ADBE Text Document");
      var doc = std.value;
      doc.text = "筆";
      doc.fontSize = 520;
      doc.fillColor = [0.10, 0.10, 0.10];
      doc.justification = ParagraphJustification.CENTER_JUSTIFY;
      var fonts = ["Noto Sans JP", "MS Gothic", "MS ゴシック", "Yu Gothic", "Meiryo", "メイリオ"];
      for (var fi = 0; fi < fonts.length; fi++) {
        try { doc.font = fonts[fi]; std.setValue(doc); if (std.value.font === fonts[fi]) break; } catch (e) {}
      }
      std.setValue(doc);
      // Empirical: posY=400 put ink at y~-40..432 (top clipped). +160 shifts
      // the glyph to ~y120..592, centered in the 720-tall comp.
      tl.property("ADBE Transform Group").property("ADBE Position").setValue([W / 2, H / 2 + 200, 0]);
      return tl;
    }
    var before = makeText("TL_BEFORE");
    var work = makeText("TL_WORK");

    var bop = before.property("ADBE Transform Group").property("ADBE Opacity");
    bop.setValueAtTime(0, 100);
    bop.setValueAtTime(TRIG, 100);
    bop.setValueAtTime(TRIG + 4 / FPS, 0);
    bop.setValueAtTime(DUR, 0);

    for (var i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
    work.selected = true;
    try { comp.openInViewer(); } catch (e) {}
    var env = $;
    env.setenv("RESTRO_REPLY", "");
    env.setenv("RESTRO_CALL", "");
    var cmdId = 0;
    try { cmdId = app.findMenuCommandId("Restro: Decompose"); } catch (e) {}
    if (!cmdId) throw new Error("menu not found");
    app.executeCommand(cmdId);
    var reply = String(env.getenv("RESTRO_REPLY") || "");
    log("REPLY " + reply.substring(0, 200));

    var strokes = [];
    for (var j = 1; j <= comp.numLayers; j++) {
      var L = comp.layer(j);
      try { if (L instanceof ShapeLayer && /^STROKE_/.test(L.name)) strokes.push(L); } catch (e) {}
    }
    log("STROKES n=" + strokes.length);
    if (!strokes.length) throw new Error("no strokes");

    var cx = W / 2, cy = H / 2 + 16;
    var geom = [];
    for (var k = 0; k < strokes.length; k++) {
      var s = strokes[k];
      s.moveBefore(before);
      var tp = s.property("ADBE Transform Group").property("ADBE Position");
      var base = tp.value;
      var bx = base[0], by = base[1];
      var dx = bx - cx, dy = by - cy;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var ux = dx / len, uy = dy / len;
      var off = 55;
      var t0 = TRIG + 0.08 + k * 0.055;
      var t1 = t0 + 0.28;
      tp.setValueAtTime(0, [bx + ux * off, by + uy * off, 0]);
      tp.setValueAtTime(t0, [bx + ux * off, by + uy * off, 0]);
      tp.setValueAtTime(t1, [bx, by, 0]);
      var op = s.property("ADBE Transform Group").property("ADBE Opacity");
      op.setValueAtTime(0, 0);
      op.setValueAtTime(t0, 0);
      op.setValueAtTime(t1, 100);
      op.setValueAtTime(DUR, 100);

      // geometry dump for Remotion fallback
      var g = { name: s.name, index: k, pos: [bx, by] };
      try {
        var shapeProp = findProp(s, "ADBE Vector Shape");
        if (shapeProp) {
          var sh = shapeProp.value;
          g.vertices = sh.vertices;
          g.inTangents = sh.inTangents;
          g.outTangents = sh.outTangents;
          g.closed = sh.closed;
        }
      } catch (e) { g.geomErr = serr(e); }
      try {
        var fillProp = findProp(s, "ADBE Vector Fill");
        if (fillProp) {
          var fv = fillProp.property("ADBE Vector Fill Color");
          if (fv) g.fill = fv.value;
        }
      } catch (e) {}
      geom.push(g);
    }
    log("GEOM dumped n=" + geom.length);

    // ExtendScript has no JSON global — serialize manually.
    function jnum(v) { return (typeof v === "number" && isFinite(v)) ? String(v) : "null"; }
    function jarr(a) {
      var p = [];
      for (var i = 0; i < a.length; i++) {
        var v = a[i];
        p.push(v instanceof Array ? "[" + jarr(v) + "]" : jnum(v));
      }
      return p.join(",");
    }
    function jcolor(c) {
      if (!c) return "null";
      var p = [];
      for (var i = 0; i < c.length; i++) p.push(jnum(c[i]));
      return "[" + p.join(",") + "]";
    }
    function jpts(a) {
      var p = [];
      for (var i = 0; i < a.length; i++) p.push("[" + jarr(a[i]) + "]");
      return "[" + p.join(",") + "]";
    }
    var parts = [];
    for (var gi = 0; gi < geom.length; gi++) {
      var g = geom[gi];
      var gs = '{"name":"' + g.name + '","index":' + g.index +
        ',"pos":' + jarr(g.pos) +
        (g.vertices ? ',"vertices":' + jpts(g.vertices) +
          ',"inTangents":' + jpts(g.inTangents) +
          ',"outTangents":' + jpts(g.outTangents) +
          ',"closed":' + (g.closed ? "true" : "false") : "") +
        (g.fill ? ',"fill":' + jcolor(g.fill) : "") + "}";
      parts.push(gs);
    }
    var json = '{"comp":{"w":' + W + ',"h":' + H + ',"fps":' + FPS + ',"dur":' + DUR +
      ',"trig":' + TRIG + ',"cx":' + cx + ',"cy":' + cy + '},"strokes":[' + parts.join(",") + "]}";
    var gf = new File(ROOT + "/.tmp/wu-d-strokes.json");
    gf.encoding = "UTF-8";
    gf.open("w");
    gf.write(json);
    gf.close();
    log("JSON written");

    // renderQueue export
    var folder = new Folder(OUTDIR);
    if (!folder.exists) folder.create();
    var rq = proj.renderQueue;
    var item = rq.items.add(comp);
    item.timeSpanStart = 0;
    item.timeSpanDuration = DUR;
    var om = item.outputModule(1);
    var cands = [
      "H.264 - Match Render Settings - 15 Mbps",
      "H.264 - Match Render Settings - 10 Mbps",
      "H.264 - Match Render Settings - 5 Mbps",
      "PNG Sequence", "Lossless", "JPEG Sequence", "TIFF Sequence"
    ];
    var applied = "";
    for (var ti = 0; ti < cands.length; ti++) {
      try { om.applyTemplate(cands[ti]); applied = cands[ti]; log("TEMPLATE OK " + cands[ti]); break; }
      catch (e) { log("tpl NO " + cands[ti] + " :: " + serr(e)); }
    }
    var isSeq = /Sequence/i.test(applied);
    var outFile = isSeq
      ? new File(OUTDIR + "/frame_[#####].png")
      : new File(ROOT + "/assets/rec/ae-decompose-auto" + (applied.indexOf("H.264") >= 0 ? ".mp4" : ".mov"));
    om.file = outFile;
    log("RENDER file=" + outFile.fsName + " tpl=" + (applied || "default"));
    try { rq.render(); log("RENDER done"); }
    catch (e) { log("RENDER fail " + serr(e)); }
    log("DONE");
  } catch (e) {
    lines.push("ERROR " + serr(e));
    log("CAUGHT");
  }
  flush();
  var done = new File(ROOT + "/.tmp/wu-d-capture2.txt.done");
  done.open("w"); done.write("done"); done.close();
})();

// WU-D decisive-footage capture v1 — fully scripted.
// Builds one comp: [0..TRIG] solid "before" text -> trigger -> 13 real
// Restro-decomposed stroke layers materialize staggered (opacity + radial
// settle), hold to end. Renders via renderQueue to PNG sequence, then we
// ffmpeg it into assets/rec/ae-decompose-auto.mp4.
//
// Honesty note: the "before" copy is a duplicate text layer kept visible;
// decompose consumes the selected twin. Both states are real AE content —
// the cut at TRIG is authored, the stroke geometry is genuine Restro output.
(function () {
  var ROOT = "C:/Users/rebui/Desktop/restro-pv-23";
  var OUTDIR = ROOT + "/.tmp/wu-d-capture";
  var reportFile = new File(ROOT + "/.tmp/wu-d-capture.txt");
  reportFile.encoding = "UTF-8";
  var lines = [];
  function flush() {
    try { reportFile.open("w"); reportFile.write(lines.join("\n")); reportFile.close(); } catch (e) {}
  }
  function log(s) { lines.push(s); flush(); }
  try {
    var proj = app.project;
    var FPS = 24, DUR = 6.0, W = 1280, H = 720;
    var TRIG = 1.6;               // seconds: before->after cut
    var comp = proj.items.addComp("RestroProofD", W, H, 1.0, DUR, FPS);
    log("COMP " + W + "x" + H + "@" + FPS + " dur=" + DUR);

    var bg = comp.layers.addSolid([0.93, 0.92, 0.9], "BG", W, H, 1.0, DUR);
    bg.moveToEnd();

    // Twin text layers: TL_BEFORE stays as the "before" visual; TL_WORK is
    // the one Restro decomposes (plugin removes it).
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
      tl.property("ADBE Transform Group").property("ADBE Position").setValue([W / 2, H / 2 + 40, 0]);
      return tl;
    }
    var before = makeText("TL_BEFORE");
    var work = makeText("TL_WORK");
    log("TEXT twins font=" + work.property("ADBE Text Properties").property("ADBE Text Document").value.font);

    // BEFORE layer: full opacity until TRIG, 4-frame dip to 0.
    var bop = before.property("ADBE Transform Group").property("ADBE Opacity");
    bop.setValueAtTime(0, 100);
    bop.setValueAtTime(TRIG, 100);
    bop.setValueAtTime(TRIG + 4 / FPS, 0);
    bop.setValueAtTime(DUR, 0);

    // Select ONLY the work twin, then invoke Restro decompose.
    for (var i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
    work.selected = true;
    try { comp.openInViewer(); } catch (e) {}
    var env = $;
    env.setenv("RESTRO_REPLY", "");
    env.setenv("RESTRO_CALL", "");
    var cmdId = 0;
    try { cmdId = app.findMenuCommandId("Restro: Decompose"); } catch (e) {}
    log("CMDID=" + cmdId);
    if (!cmdId) throw new Error("Restro: Decompose menu command not found");
    app.executeCommand(cmdId);
    var reply = String(env.getenv("RESTRO_REPLY") || "");
    log("REPLY " + reply.substring(0, 400));

    // Collect created stroke layers (ShapeLayer, name STROKE_*).
    var strokes = [];
    for (var j = 1; j <= comp.numLayers; j++) {
      var L = comp.layer(j);
      try {
        if (L instanceof ShapeLayer && /^STROKE_/.test(L.name)) strokes.push(L);
      } catch (e) {}
    }
    log("STROKES n=" + strokes.length);
    if (!strokes.length) throw new Error("decompose produced no stroke layers");

    // Move strokes ABOVE the before-copy so they can cover it, then animate:
    // staggered fade-in + radial settle from an exploded offset.
    var cx = W / 2, cy = H / 2 + 40;
    for (var k = 0; k < strokes.length; k++) {
      var s = strokes[k];
      s.moveBefore(before);           // just above the before-copy
      var tp = s.property("ADBE Transform Group").property("ADBE Position");
      var base = tp.value;
      var bx = base[0], by = base[1];
      var dx = bx - cx, dy = by - cy;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var ux = dx / len, uy = dy / len;
      var off = 55;                    // px outward at t0
      var t0 = TRIG + 0.08 + k * 0.055; // stagger ~1.3 frames apart
      var t1 = t0 + 0.28;
      tp.setValueAtTime(0, [bx + ux * off, by + uy * off, 0]);
      tp.setValueAtTime(t0, [bx + ux * off, by + uy * off, 0]);
      tp.setValueAtTime(t1, [bx, by, 0]);
      var op = s.property("ADBE Transform Group").property("ADBE Opacity");
      op.setValueAtTime(0, 0);
      op.setValueAtTime(t0, 0);
      op.setValueAtTime(t1, 100);
      op.setValueAtTime(DUR, 100);
    }
    log("ANIM keyed");

    // Ensure everything above BG, below nothing else: strokes already moved.
    comp.openInViewer();

    // Export PNG sequence via CompItem.saveFrameToPng — no renderQueue
    // template dependency (template names are locale-dependent).
    var folder = new Folder(OUTDIR);
    if (!folder.exists) folder.create();
    var NF = Math.round(DUR * FPS);
    log("EXPORT start frames=" + NF);
    for (var fr = 0; fr < NF; fr++) {
      var t = fr / FPS;
      var idx = ("00000" + fr).slice(-5);
      var out = new File(OUTDIR + "/frame_" + idx + ".png");
      try {
        comp.saveFrameToPng(t, out);
      } catch (e) {
        log("frame " + fr + " fail: " + e.message);
      }
      if (fr % 24 === 0) log("frame " + fr + "/" + NF);
    }
    log("DONE");
  } catch (e) {
    lines.push("ERROR " + String(e) + " @ " + (e.line || "?"));
    log("CAUGHT");
  }
  flush();
  var done = new File(ROOT + "/.tmp/wu-d-capture.txt.done");
  done.open("w"); done.write("done"); done.close();
})();

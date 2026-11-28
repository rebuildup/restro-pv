// REC-NEWMAT mincho variant: add comp "NEWMAT 無 mincho" to the existing
// verification/rec-newmat/NEWMAT.aep and decompose 無 with a mincho face,
// so the Scene C gallery's third work does not share the gothic texture
// of the 筆/解 material.
//
// Opens the saved AEP, adds ONE comp (1280x720 @24fps, 8s, #f7f7f7 solid),
// one centred text layer (fontSize 460, fill #111111), opens it in the
// viewer, selects the layer and runs the real "Restro: Decompose" menu
// command, logs the reply JSON and the generated STROKE_* inventory, then
// saves the project back to the same AEP.
(function () {
  var ROOT = "C:/Users/rebui/Desktop/restro-pv-23";
  var AEP = ROOT + "/verification/rec-newmat/NEWMAT.aep";
  var LOG = ROOT + "/.tmp/rec-newmat/rec-newmat-mincho.txt";
  var W = 1280, H = 720, FPS = 24, DUR = 8.0;
  var COMP_NAME = "NEWMAT 無 mincho";
  var CH = "無";
  var FONTS = ["MSMincho", "BIZUDMincho", "IPAexMincho", "MS-Mincho"];

  var lines = [];
  function log(s) { lines.push(String(s)); flush(); }
  function serr(e) { try { return String(e && e.message ? e.message : e); } catch (x) { return "?"; } }
  function flush() {
    try {
      var f = new File(LOG); f.encoding = "UTF-8"; f.open("w");
      f.write(lines.join("\n")); f.close();
    } catch (e) {}
  }

  try {
    log("START " + new Date().toString());
    var aepFile = new File(AEP);
    if (!aepFile.exists) throw new Error("AEP not found: " + AEP);
    app.open(aepFile);
    log("OPEN ok items=" + app.project.numItems);

    // Skip if the comp already exists (idempotent re-run).
    var existing = null;
    for (var q = 1; q <= app.project.numItems; q++) {
      var it = app.project.item(q);
      try { if (it instanceof CompItem && it.name === COMP_NAME) existing = it; } catch (e) {}
    }
    var comp;
    if (existing) {
      comp = existing;
      log("COMP exists " + COMP_NAME);
    } else {
      comp = app.project.items.addComp(COMP_NAME, W, H, 1.0, DUR, FPS);
      log("COMP new " + COMP_NAME);
    }

    var bg = null;
    for (var b = 1; b <= comp.numLayers; b++) {
      try { if (comp.layer(b).name === "BG") bg = comp.layer(b); } catch (e) {}
    }
    if (!bg) {
      bg = comp.layers.addSolid([0.968627, 0.968627, 0.968627], "BG", W, H, 1.0, DUR);
      bg.moveToEnd();
    }

    var tl = null;
    for (var t = 1; t <= comp.numLayers; t++) {
      try { if (comp.layer(t).name === "SOURCE " + CH) tl = comp.layer(t); } catch (e) {}
    }
    if (!tl) {
      tl = comp.layers.addText(CH);
      tl.name = "SOURCE " + CH;
      var std = tl.property("ADBE Text Properties").property("ADBE Text Document");
      var doc = std.value;
      doc.text = CH;
      doc.fontSize = 460;
      doc.fillColor = [0.066667, 0.066667, 0.066667];
      doc.justification = ParagraphJustification.CENTER_JUSTIFY;
      doc.applyFill = true;
      var appliedFont = "", tried = [];
      for (var fi = 0; fi < FONTS.length; fi++) {
        try {
          doc.font = FONTS[fi];
          std.setValue(doc);
          if (String(std.value.font) === FONTS[fi]) { appliedFont = FONTS[fi]; break; }
          tried.push(FONTS[fi] + "(no)");
        } catch (e) { tried.push(FONTS[fi] + "(err)"); }
      }
      try { doc.font = appliedFont; std.setValue(doc); } catch (e) {}
      var finalFont = "";
      try { finalFont = String(std.value.font); } catch (e) {}
      log("FONT tried=[" + tried.join(" ") + "] applied=" + finalFont);
      tl.property("ADBE Transform Group").property("ADBE Position").setValue([W / 2, H / 2 + 200, 0]);
    } else {
      log("TEXT exists");
    }

    // If strokes already exist, skip decompose (idempotent).
    var strokeCount = 0;
    for (var j = 1; j <= comp.numLayers; j++) {
      var L = comp.layer(j);
      try { if (L instanceof ShapeLayer && /^STROKE_/.test(L.name)) strokeCount++; } catch (e) {}
    }

    if (strokeCount === 0) {
      try { comp.openInViewer(); log("OPEN_IN_VIEWER ok"); } catch (e) { log("OPEN_IN_VIEWER fail " + serr(e)); }
      try { app.project.activeItem = comp; } catch (e) {}
      $.sleep(1200);
      try { app.updateUI(); } catch (e) {}
      for (var s = 1; s <= comp.numLayers; s++) comp.layer(s).selected = false;
      tl.selected = true;
      try { app.updateUI(); } catch (e) {}
      var env = $;
      env.setenv("RESTRO_REPLY", "");
      env.setenv("RESTRO_CALL", "");
      var cmdId = 0;
      try { cmdId = app.findMenuCommandId("Restro: Decompose"); } catch (e) { cmdId = 0; }
      if (!cmdId) throw new Error("Restro: Decompose menu command not found");
      app.executeCommand(cmdId);
      var reply = String(env.getenv("RESTRO_REPLY") || "");
      log("REPLY " + reply);
      strokeCount = 0;
      var names = [];
      for (var j2 = 1; j2 <= comp.numLayers; j2++) {
        var L2 = comp.layer(j2);
        names.push(j2 + ":" + L2.name);
        try { if (L2 instanceof ShapeLayer && /^STROKE_/.test(L2.name)) strokeCount++; } catch (e) {}
      }
      log("LAYERS total=" + comp.numLayers + " strokes=" + strokeCount);
      log("LAYER_NAMES " + names.join(" , "));
    } else {
      log("STROKES already present n=" + strokeCount);
    }

    app.project.save();
    log("SAVED " + AEP);
    log("DONE");
  } catch (e) {
    log("ERROR " + serr(e));
  }
  flush();
  var d = new File(LOG + ".done");
  d.open("w"); d.write("done"); d.close();
})();

// Self-contained: build comp, decompose, dump first STROKE layer's
// property tree (names + matchNames) to locate the vector path.
(function () {
  var ROOT = "C:/Users/rebui/Desktop/restro-pv-23";
  var f = new File(ROOT + "/.tmp/wu-d-tree.txt");
  f.encoding = "UTF-8";
  var lines = [];
  function log(s) { lines.push(s); try { f.open("w"); f.write(lines.join("\n")); f.close(); } catch (e) {} }
  function serr(e) { try { return String(e && e.message ? e.message : e); } catch (x) { return "?"; } }
  try {
    var proj = app.project;
    var W = 1280, H = 720;
    var comp = proj.items.addComp("RestroProofD", W, H, 1.0, 6.0, 24);
    var bg = comp.layers.addSolid([0.93, 0.92, 0.9], "BG", W, H, 1.0, 6.0);
    bg.moveToEnd();
    var tl = comp.layers.addText("筆");
    var std = tl.property("ADBE Text Properties").property("ADBE Text Document");
    var doc = std.value;
    doc.text = "筆"; doc.fontSize = 520; doc.fillColor = [0.1, 0.1, 0.1];
    doc.justification = ParagraphJustification.CENTER_JUSTIFY;
    var fonts = ["Noto Sans JP", "MS Gothic", "Yu Gothic", "Meiryo"];
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
    app.executeCommand(cmdId);
    log("REPLY " + String(env.getenv("RESTRO_REPLY") || "").substring(0, 150));

    var stroke = null;
    for (var j = 1; j <= comp.numLayers; j++) {
      var L = comp.layer(j);
      try { if (L instanceof ShapeLayer && /^STROKE_/.test(L.name)) { stroke = L; break; } } catch (e) {}
    }
    if (!stroke) throw new Error("no stroke layer");
    log("LAYER " + stroke.name + " mn=" + stroke.matchName);
    function dump(container, depth) {
      if (depth > 7) return;
      var n = 0;
      try { n = container.numProperties; } catch (e) { log("  ".repeat(depth) + "ERR " + serr(e)); return; }
      for (var i = 1; i <= n; i++) {
        var p = null;
        try { p = container.property(i); } catch (e) { continue; }
        if (!p) continue;
        var mn = "", nm = "", isG = false;
        try { mn = p.matchName; } catch (e) {}
        try { nm = p.name; } catch (e) {}
        try { isG = p.numProperties > 0; } catch (e) {}
        log("  ".repeat(depth) + "[" + i + "] " + nm + " | mn=" + mn + (isG ? " (grp)" : ""));
        if (isG) dump(p, depth + 1);
      }
    }
    dump(stroke, 0);
    log("DONE");
  } catch (e) { log("ERROR " + serr(e)); }
  try { f.open("w"); f.write(lines.join("\n")); f.close(); } catch (e2) {}
  var d = new File(ROOT + "/.tmp/wu-d-tree.txt.done"); d.open("w"); d.write("done"); d.close();
})();

// WU-D LIVE capture: real Restro Decompose executed while the comp viewer
// is on screen; ffmpeg gdigrab records the desktop. Timeline:
//   build comp+text -> openInViewer -> log READY -> sleep 9s (recording
//   starts here) -> executeCommand(decompose) [REAL plugin run, visible
//   layer swap in viewer] -> sleep 4s hold -> DONE.
(function () {
  var ROOT = "C:/Users/rebui/Desktop/restro-pv-23";
  var f = new File(ROOT + "/.tmp/wu-d-live.txt");
  f.encoding = "UTF-8";
  var lines = [];
  function log(s) { lines.push(s); try { f.open("w"); f.write(lines.join("\n")); f.close(); } catch (e) {} }
  try {
    var proj = app.project;
    var W = 1280, H = 720;
    var comp = proj.items.addComp("RestroLiveD", W, H, 1.0, 8.0, 24);
    // Unique BG color for deterministic canvas detection in the screen
    // recording (keyed out / verified by color distance post-capture).
    var bg = comp.layers.addSolid([0.45, 0.68, 0.95], "BG", W, H, 1.0, 8.0);
    bg.moveToEnd();
    var tl = comp.layers.addText("筆");
    var std = tl.property("ADBE Text Properties").property("ADBE Text Document");
    var doc = std.value;
    doc.text = "筆"; doc.fontSize = 480; doc.fillColor = [0.10, 0.10, 0.10];
    doc.justification = ParagraphJustification.CENTER_JUSTIFY;
    var fonts = ["Noto Sans JP", "MS Gothic", "MS ゴシック", "Yu Gothic", "Meiryo", "メイリオ"];
    for (var fi = 0; fi < fonts.length; fi++) {
      try { doc.font = fonts[fi]; std.setValue(doc); if (std.value.font === fonts[fi]) break; } catch (e) {}
    }
    std.setValue(doc);
    // posY=560: measured ink lands ~y120-592, centered in 720 comp.
    tl.property("ADBE Transform Group").property("ADBE Position").setValue([W / 2, H / 2 + 200, 0]);
    try { comp.openInViewer(); } catch (e) {}
    log("VIEWER_READY");
    // Gate: wait for .tmp/wu-d-go flag file so the orchestrator can bring
    // the comp workspace window to the front before Decompose runs.
    // Falls through after ~180s so unattended runs still complete.
    var goFile = new File(ROOT + "/.tmp/wu-d-go");
    var waited = 0;
    while (!goFile.exists && waited < 180000) { $.sleep(500); waited += 500; }
    log("GO waitedMs=" + waited);
    for (var i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
    tl.selected = true;
    var env = $;
    env.setenv("RESTRO_REPLY", ""); env.setenv("RESTRO_CALL", "");
    var cmdId = app.findMenuCommandId("Restro: Decompose");
    if (!cmdId) throw new Error("menu not found");
    app.executeCommand(cmdId);
    log("DECOMPOSED " + String(env.getenv("RESTRO_REPLY") || "").substring(0, 200));
    var n = 0;
    for (var j = 1; j <= comp.numLayers; j++) {
      try { if (comp.layer(j) instanceof ShapeLayer) n++; } catch (e) {}
    }
    log("SHAPE_LAYERS=" + n);
    $.sleep(4000);
    log("DONE");
  } catch (e) {
    log("ERROR " + String(e && e.message ? e.message : e));
  }
  try { f.open("w"); f.write(lines.join("\n")); f.close(); } catch (e2) {}
  var d = new File(ROOT + "/.tmp/wu-d-live.txt.done"); d.open("w"); d.write("done"); d.close();
})();

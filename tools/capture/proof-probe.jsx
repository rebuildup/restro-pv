// WU-D decisive-footage probe v3: ExtendScript has no JSON — write a
// line-based report instead. Step-wise flush so failures leave evidence.
(function () {
  var ROOT = "C:/Users/rebui/Desktop/restro-pv-23";
  var reportFile = new File(ROOT + "/.tmp/proof-probe.txt");
  reportFile.encoding = "UTF-8";
  var lines = [];
  function flush() {
    try {
      reportFile.open("w");
      reportFile.write(lines.join("\n"));
      reportFile.close();
    } catch (e) {}
  }
  function log(s) { lines.push(s); flush(); }
  try {
    var proj = app.project;
    log("START project=" + (proj.file ? proj.file.fsName : "untitled"));
    var comp = proj.items.addComp("RestroProof", 1920, 1080, 1.0, 7.0, 24);
    log("COMP created");
    var bg = comp.layers.addSolid([0.93, 0.92, 0.9], "BG", 1920, 1080, 1.0, 7.0);
    bg.moveToEnd();
    log("BG added");
    var tl = comp.layers.addText("筆");
    log("TEXT added name=" + tl.name);
    var std = tl.property("ADBE Text Properties").property("ADBE Text Document");
    var doc = std.value;
    doc.text = "筆";
    doc.fontSize = 620;
    doc.fillColor = [0.12, 0.12, 0.12];
    doc.justification = ParagraphJustification.CENTER_JUSTIFY;
    var fonts = ["Noto Sans JP", "Noto Sans CJK JP", "MS Gothic", "MS ゴシック", "Yu Gothic", "Meiryo", "メイリオ", "BIZ UDPGothic"];
    var fontOk = "";
    for (var fi = 0; fi < fonts.length; fi++) {
      try {
        doc.font = fonts[fi];
        std.setValue(doc);
        var back = std.value.font;
        if (back === fonts[fi] || back.indexOf(fonts[fi].substring(0, 4)) === 0) { fontOk = fonts[fi]; break; }
      } catch (e) { /* try next */ }
    }
    log("FONT picked=" + fontOk + " readback=" + (fontOk ? std.value.font : "?"));
    std.setValue(doc);
    tl.property("ADBE Transform Group").property("ADBE Position").setValue([960, 555, 0]);
    log("TEXT styled");
    try { comp.openInViewer(); log("VIEWER opened"); } catch (e) { log("openInViewer threw " + e); }
    for (var i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
    tl.selected = true;
    log("SELECTED numLayers=" + comp.numLayers);

    var env = $;
    env.setenv("RESTRO_REPLY", "");
    env.setenv("RESTRO_CALL", "");
    var cmdId = 0;
    try { cmdId = app.findMenuCommandId("Restro: Decompose"); } catch (e) { log("FINDMENU threw " + e); }
    log("CMDID=" + cmdId);
    if (cmdId) {
      app.executeCommand(cmdId);
      var reply = String(env.getenv("RESTRO_REPLY") || "");
      log("REPLY len=" + reply.length + " :: " + reply.substring(0, 2000));
    }

    for (var j = 1; j <= comp.numLayers; j++) {
      var L = comp.layer(j);
      var s = "LAYER idx=" + j + " name=" + L.name + " mn=" + L.matchName + " enabled=" + L.enabled;
      try { s += " shape=" + (L instanceof ShapeLayer); } catch (e) { s += " shape=?"; }
      try {
        var posP = L.property("ADBE Transform Group").property("ADBE Position");
        var pv = posP ? posP.value : null;
        if (pv instanceof Array) s += " pos=[" + pv[0] + "," + pv[1] + "," + (pv[2] || 0) + "]";
      } catch (e) { s += " posErr=" + e; }
      try {
        var opP = L.property("ADBE Transform Group").property("ADBE Opacity");
        s += " opKeys=" + (opP ? opP.numKeys : -1);
      } catch (e) {}
      lines.push(s);
    }
    log("DONE");
  } catch (e) {
    lines.push("ERROR " + String(e));
    log("CAUGHT");
  }
  flush();
  var done = new File(ROOT + "/.tmp/proof-probe.txt.done");
  done.open("w"); done.write("done"); done.close();
})();

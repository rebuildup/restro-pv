// REC-D prep: build verification/rec-d/REC-D.aep — a clean scratch
// project for the Scene D real-operation recording (runbook 09 §3.5).
//   comp REC-D 1280x720 @24fps 20s, BG solid #f7f7f7, one text layer 筆.
(function () {
  var ROOT = "C:/Users/rebui/Desktop/restro-pv-23";
  var OUT = ROOT + "/verification/rec-d/REC-D.aep";
  var LOG = ROOT + "/.tmp/rec-newmat/rec-d-prep.txt";
  var W = 1280, H = 720, FPS = 24, DUR = 20.0;
  var FONTS = ["Noto Sans JP", "NotoSansJP-Medium", "MSGothic", "MS Gothic", "Yu Gothic", "Meiryo"];

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
    // close whatever -ro restored, then a fresh project
    try {
      if (app.project.numItems > 0) {
        app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
        log("CLOSE old project ok");
      }
    } catch (e) { log("CLOSE fail " + serr(e)); }
    try { app.newProject(); log("NEWPROJECT ok"); } catch (e) { log("NEWPROJECT fail " + serr(e)); }

    var od = new Folder(ROOT + "/verification/rec-d");
    if (!od.exists) od.create();

    var comp = app.project.items.addComp("REC-D", W, H, 1.0, DUR, FPS);
    comp.bgColor = [0.9686, 0.9686, 0.9686];
    log("COMP REC-D " + W + "x" + H + "@" + FPS);

    var bg = comp.layers.addSolid([0.968627, 0.968627, 0.968627], "BG", W, H, 1.0, DUR);
    bg.moveToEnd();

    var tl = comp.layers.addText("筆");
    tl.name = "SOURCE 筆";
    var std = tl.property("ADBE Text Properties").property("ADBE Text Document");
    var doc = std.value;
    doc.text = "筆";
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

    app.project.save(new File(OUT));
    log("SAVED " + OUT);
    log("DONE");
  } catch (e) {
    log("ERROR " + serr(e));
  }
  flush();
  var d = new File(LOG + ".done");
  d.open("w"); d.write("done"); d.close();
})();

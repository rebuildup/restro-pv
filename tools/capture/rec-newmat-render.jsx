// Render the acquired NEWMAT material to PNG so the raster acceptance
// numbers can be measured:
//
//   00-source.png        the MSMincho text layer alone (the original ink)
//   01-decomposed.png    the 12 STROKE_* layers together (the union of ink)
//
// Output dir: D:/pv-tmp/rec-newmat/png
(function () {
  var ROOT = "C:/Users/rebui/Desktop/restro-pv-23";
  var AEP = ROOT + "/verification/rec-newmat/NEWMAT.aep";
  var OUTDIR = "D:/pv-tmp/rec-newmat/png";
  var LOG = ROOT + "/.tmp/rec-newmat/rec-newmat-render.log";
  var W = 1280, H = 720, FPS = 24, DUR = 8.0;
  var CH = "無";

  var lines = [];
  function log(s) { lines.push(String(s)); flush(); }
  function serr(e) { try { return String(e && e.message ? e.message : e); } catch (x) { return "?"; } }
  function flush() {
    try { var f = new File(LOG); f.encoding = "UTF-8"; f.open("w"); f.write(lines.join("\n")); f.close(); } catch (e) {}
  }

  function renderOne(comp, base) {
    var folder = new Folder(OUTDIR);
    if (!folder.exists) folder.create();
    var ok = false;
    try {
      var rq = app.project.renderQueue;
      log("  rq items before=" + rq.numItems);
      var item = rq.items.add(comp);
      log("  rq items after add=" + rq.numItems);
      item.timeSpanStart = 0;
      item.timeSpanDuration = 1 / FPS;
      var om = item.outputModule(1);
      var tpls = ["PNG Sequence", "PNG Sequence 8 bpc", "PNG Sequence 16 bpc", "PNG", "Lossless"];
      for (var t = 0; t < tpls.length; t++) {
        try { om.applyTemplate(tpls[t]); log("template " + tpls[t] + " applied"); break; }
        catch (e) { log("template " + tpls[t] + " fail " + serr(e)); }
      }
      om.file = new File(OUTDIR + "/" + base + ".png");
      log("  om.file=" + om.file.fsName);
      rq.render();
      $.sleep(3000);
      ok = true;
      log("renderQueue rendered " + base);
    } catch (e) {
      log("renderQueue " + base + " FAIL " + serr(e));
    }
    try { for (var q = app.project.renderQueue.numItems; q >= 1; q--) app.project.renderQueue.item(q).remove(); } catch (e) { log("rq cleanup " + serr(e)); }
    var f2 = new Folder(OUTDIR);
    var names = [];
    try { for (var i = 1; i <= f2.files.length; i++) names.push(f2.files[i].name); } catch (e) {}
    log("OUTDIR now: " + names.join(" , "));
    return ok;
  }

  try {
    log("START " + new Date().toString());
    app.open(new File(AEP));
    log("OPEN " + AEP);
    var comp = null, src = null;
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      try { if (it instanceof CompItem && it.name === "NEWMAT 無 mincho") comp = it; } catch (e) {}
    }
    if (!comp) throw new Error("comp not found");

    // 01 : the decomposed union
    renderOne(comp, "01-decomposed");

    // 00 : a scratch comp holding only the MSMincho source text layer
    var scratch = app.project.items.addComp("NEWMAT 無 mincho SOURCE", W, H, 1.0, DUR, FPS);
    var bg = scratch.layers.addSolid([0.968627, 0.968627, 0.968627], "BG", W, H, 1.0, DUR);
    bg.moveToEnd();
    var tl = scratch.layers.addText(CH);
    tl.name = "SOURCE " + CH;
    var std = tl.property("ADBE Text Properties").property("ADBE Text Document");
    var doc = std.value;
    doc.text = CH;
    doc.fontSize = 460;
    doc.fillColor = [0.066667, 0.066667, 0.066667];
    doc.justification = ParagraphJustification.CENTER_JUSTIFY;
    doc.applyFill = true;
    var applied = "", tried = [];
    var FONTS = ["MSMincho", "BIZUDMincho", "IPAexMincho", "MS-Mincho"];
    for (var fi = 0; fi < FONTS.length; fi++) {
      try {
        doc.font = FONTS[fi]; std.setValue(doc);
        if (String(std.value.font) === FONTS[fi]) { applied = FONTS[fi]; break; }
        tried.push(FONTS[fi] + "(no)");
      } catch (e) { tried.push(FONTS[fi] + "(err)"); }
    }
    try { doc.font = applied; std.setValue(doc); } catch (e) {}
    log("SCRATCH font tried=[" + tried.join(" ") + "] applied=" + String(std.value.font));
    tl.property("ADBE Transform Group").property("ADBE Position").setValue([W / 2, H / 2 + 200, 0]);
    renderOne(scratch, "00-source");
    scratch.remove();
    log("SCRATCH removed");

    app.project.save(new File(AEP));
    log("SAVED " + AEP);
    log("DONE");
  } catch (e) {
    log("ERROR " + serr(e));
  }
  flush();
  var d = new File(LOG + ".done"); d.open("w"); d.write("done"); d.close();
})();

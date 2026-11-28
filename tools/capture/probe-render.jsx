// Which output templates does this (Japanese-locale) AE accept, and can a
// PNG sequence be produced at all?
(function () {
  var ROOT = "C:/Users/rebui/Desktop/restro-pv-23";
  var OUT = ROOT + "/.tmp/rec-newmat/render-probe.txt";
  var lines = [];
  function log(s) { lines.push(String(s)); }
  function serr(e) { try { return String(e && e.message ? e.message : e); } catch (x) { return "?"; } }

  var TPLS = [
    "PNG シーケンス", "PNGシーケンス", "PNG シーケンス（アルファ付き）",
    "PNG Sequence with Alpha", "PNG Sequence",
    "TIFF シーケンス", "TIFF Sequence",
    "JPEG シーケンス", "JPEG Sequence",
    "PSD シーケンス", "PSD Sequence",
    "AI シーケンス", "AI Sequence",
    "QuickTime MOV", "OpenEXR Sequence", "EXR Sequence",
    "Lossless", "H.264 - Match Render Settings - 15 Mbps"
  ];

  try {
    var comp = app.project.items.addComp("RENDERPROBE", 320, 180, 1.0, 1.0, 24);
    comp.layers.addSolid([0.2, 0.2, 0.2], "S", 320, 180, 1.0, 1.0);
    var dir = new Folder(ROOT + "/.tmp/rec-newmat/renderprobe");
    if (!dir.exists) dir.create();

    for (var i = 0; i < TPLS.length; i++) {
      var rq = app.project.renderQueue;
      var item = rq.items.add(comp);
      item.timeSpanStart = 0;
      item.timeSpanDuration = 1 / 24;
      var om = item.outputModule(1);
      try {
        om.applyTemplate(TPLS[i]);
        var ext = TPLS[i].indexOf("PNG") >= 0 ? "png" : (TPLS[i].indexOf("TIFF") >= 0 ? "tif" : (TPLS[i].indexOf("JPEG") >= 0 ? "jpg" : "avi"));
        om.file = new File(dir + "/t" + i + "_[#####]." + ext);
        rq.render();
        log("TPL OK " + TPLS[i] + " -> t" + i + "_[#####]." + ext);
      } catch (e) {
        log("TPL NO " + TPLS[i] + " :: " + serr(e));
      }
      try { rq.item(rq.numItems).remove(); } catch (e2) {}
    }
    try { comp.remove(); } catch (e) {}
  } catch (e) {
    log("ERR " + serr(e));
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

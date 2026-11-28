// Minimal font acceptance probe (writes a plain text report).
(function () {
  var ROOT = "C:/Users/rebui/Desktop/restro-pv-23";
  var OUT = ROOT + "/.tmp/rec-newmat/fonts3.txt";
  var CANDS = ["NotoSansJP-Medium", "NotoSansJP-Regular", "NotoSansJP-Bold",
               "NotoSansJP-Light", "NotoSansJP", "MSMincho", "MSGothic", "Meiryo"];
  var out = [];
  try {
    var comp = app.project.items.addComp("FONTTEST2", 320, 320, 1.0, 1.0, 24);
    var tl = comp.layers.addText("無");
    var std = tl.property("ADBE Text Properties").property("ADBE Text Document");
    for (var i = 0; i < CANDS.length; i++) {
      var applied = "", err = "";
      try {
        var doc = std.value;
        doc.font = CANDS[i];
        std.setValue(doc);
        applied = String(std.value.font);
      } catch (e) {
        err = String(e && e.message ? e.message : e);
        try { applied = String(std.value.font); } catch (x) {}
      }
      out.push((applied === CANDS[i] ? "OK   " : "FAIL ") + CANDS[i] + " -> " + applied + (err ? " | " + err : ""));
    }
    try { comp.remove(); } catch (e) {}
  } catch (e) {
    out.push("FATAL " + String(e));
  }
  var f = new File(OUT);
  f.encoding = "UTF-8";
  f.open("w");
  f.write(out.join("\n"));
  f.close();
  var d = new File(OUT + ".done");
  d.open("w");
  d.write("done");
  d.close();
})();

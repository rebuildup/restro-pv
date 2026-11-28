// isolate the failing step of rec-d-probe.jsx
(function () {
  var ROOT = "C:/Users/rebui/Desktop/restro-pv-23";
  var LOG = ROOT + "/.tmp/rec-newmat/rec-d-isolate.log";
  var lines = [];
  function log(s) { lines.push(String(s)); flush(); }
  function flush() {
    try { var f = new File(LOG); f.encoding = "UTF-8"; f.open("w"); f.write(lines.join("\n")); f.close(); } catch (e) {}
  }
  function serr(e) { try { return String(e && e.message ? e.message : e); } catch (x) { return "?"; } }
  try {
    log("A");
    var comp = null;
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      try { if (it instanceof CompItem && it.name === "REC-D") comp = it; } catch (e) {}
    }
    log("B comp=" + (comp ? "yes" : "no"));
    try { comp.openInViewer(); log("B2 openInViewer ok"); } catch (e) { log("B2 err " + serr(e)); }
    try { app.project.activeItem = comp; } catch (e) {}
    try { app.updateUI(); log("B3 updateUI ok"); } catch (e) { log("B3 err " + serr(e)); }
    for (var t = 1; t <= comp.numLayers; t++) {
      log("C layer " + t + " name=[" + comp.layer(t).name + "] type=" + (comp.layer(t) instanceof TextLayer ? "text" : "other"));
    }
    var tl = null;
    for (var t2 = 1; t2 <= comp.numLayers; t2++) {
      try { if (comp.layer(t2).name === "SOURCE 筆") tl = comp.layer(t2); } catch (e) { log("D err " + serr(e)); }
    }
    log("E tl=" + (tl ? "found" : "null"));
    if (tl) {
      try { log("F type=" + (tl instanceof TextLayer)); } catch (e) { log("F err " + serr(e)); }
      try { var tp = tl.property("ADBE Text Properties"); log("G textProps=" + (tp ? "ok" : "null")); } catch (e) { log("G err " + serr(e)); }
      try { var std = tp.property("ADBE Text Document"); log("H std=" + (std ? "ok" : "null")); } catch (e) { log("H err " + serr(e)); }
      try { log("I font=[" + std.value.font + "]"); } catch (e) { log("I err " + serr(e)); }
      try { log("J size=" + std.value.fontSize); } catch (e) { log("J err " + serr(e)); }
      try { log("K fill=" + std.value.fillColor); } catch (e) { log("K err " + serr(e)); }
      try { log("L text=" + std.value.text); } catch (e) { log("L err " + serr(e)); }
      try { var tg = tl.property("ADBE Transform Group"); log("M tg=" + (tg ? "ok" : "null")); } catch (e) { log("M err " + serr(e)); }
      try { log("N pos=" + tg.property("ADBE Position").value); } catch (e) { log("N err " + serr(e)); }
    }
    log("Z");
  } catch (e) { log("ERROR " + serr(e)); }
  flush();
  var d = new File(LOG + ".done"); d.open("w"); d.write("done"); d.close();
})();

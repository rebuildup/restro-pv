// Runs in the PERSISTENT AE instance via -r delegation, before Merge:
// selects ALL STROKE_* layers so the Merge click acts on the full set.
(function () {
  var ROOT = "C:/Users/rebui/Desktop/restro-pv-23";
  var LOG = ROOT + "/.tmp/rec-newmat/rec-d-merge-select.log";
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
    var comp = null;
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      try { if (it instanceof CompItem && it.name === "REC-D") comp = it; } catch (e) {}
    }
    if (!comp) throw new Error("REC-D not found");
    var n = 0;
    for (var d = 1; d <= comp.numLayers; d++) comp.layer(d).selected = false;
    for (var s = 1; s <= comp.numLayers; s++) {
      var L = comp.layer(s);
      var nm = "";
      try { nm = L.name; } catch (e) {}
      if (/^STROKE_/.test(nm)) { L.selected = true; n++; }
    }
    try { app.updateUI(); } catch (e) {}
    log("selected all strokes n=" + n);
  } catch (e) {
    log("ERROR " + serr(e));
  }
  flush();
})();

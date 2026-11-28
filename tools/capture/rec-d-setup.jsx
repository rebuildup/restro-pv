// REC-D setup (runs in the PERSISTENT AE instance via -r delegation):
// verify the project, open the REC-D comp viewer, select SOURCE 筆.
(function () {
  var LOG = "C:/Users/rebui/Desktop/restro-pv-23/.tmp/rec-newmat/rec-d-setup.log";
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
    var pf = "";
    try { pf = app.project.file ? String(app.project.file.fsName) : ""; } catch (e) {}
    log("project.file=" + pf + " items=" + app.project.numItems);
    var comp = null;
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      try { if (it instanceof CompItem) log("comp: " + it.name + " " + it.width + "x" + it.height); } catch (e) {}
      try { if (it instanceof CompItem && it.name === "REC-D") comp = it; } catch (e) {}
    }
    if (!comp) throw new Error("REC-D comp not found");
    comp.openInViewer();
    log("openInViewer ok");
    try { app.project.activeItem = comp; } catch (e) {}
    // deselect everything, then select the source text layer only
    for (var s = 1; s <= comp.numLayers; s++) comp.layer(s).selected = false;
    var tl = null;
    for (var t = 1; t <= comp.numLayers; t++) {
      try { if (comp.layer(t).name === "SOURCE 筆") tl = comp.layer(t); } catch (e) {}
    }
    if (tl) { tl.selected = true; log("selected SOURCE 筆 index=" + tl.index); }
    else log("SOURCE 筆 NOT FOUND; layers:");
    for (var n = 1; n <= comp.numLayers; n++) { try { log("  layer " + n + " " + comp.layer(n).name); } catch (e) {} }
    try { app.updateUI(); } catch (e) {}
    log("DONE");
  } catch (e) {
    log("ERROR " + serr(e));
  }
  flush();
})();

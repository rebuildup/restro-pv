// Save the current REC-D project to verification/rec-d/REC-D.aep and report
// the layer inventory that goes into the sidecar log.
(function () {
  var ROOT = "C:/Users/rebui/Desktop/restro-pv-23";
  var AEP = ROOT + "/verification/rec-d/REC-D.aep";
  var LOG = ROOT + "/.tmp/rec-newmat/rec-d-save.log";
  var lines = [];
  function log(s) { lines.push(String(s)); flush(); }
  function flush() {
    try { var f = new File(LOG); f.encoding = "UTF-8"; f.open("w"); f.write(lines.join("\n")); f.close(); } catch (e) {}
  }
  try {
    log("START " + new Date().toString());
    var comp = null;
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      try { if (it instanceof CompItem && it.name === "REC-D") comp = it; } catch (e) {}
    }
    if (!comp) throw new Error("REC-D not found");
    log("COMP " + comp.name + " " + comp.width + "x" + comp.height + " par=" + comp.pixelAspect +
        " fps=" + comp.frameRate + " dur=" + comp.duration);
    var names = [], sel = [];
    for (var j = 1; j <= comp.numLayers; j++) {
      var L = comp.layer(j);
      names.push(j + ":" + L.name);
      var s = false; try { s = L.selected; } catch (e) {}
      if (s) sel.push(L.name);
    }
    log("LAYERS total=" + comp.numLayers);
    log("LAYER_NAMES " + names.join(" , "));
    log("SELECTED " + sel.join(" , "));
    var f = new File(AEP);
    app.project.save(f);
    log("SAVED " + f.fsName);
    log("DONE");
  } catch (e) {
    log("ERROR " + String(e && e.message ? e.message : e));
  }
  flush();
  var d = new File(LOG + ".done"); d.open("w"); d.write("done"); d.close();
})();

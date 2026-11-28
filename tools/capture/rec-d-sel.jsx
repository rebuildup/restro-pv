// report the currently selected layers of comp REC-D
(function () {
  var ROOT = "C:/Users/rebui/Desktop/restro-pv-23";
  var LOG = ROOT + "/.tmp/rec-newmat/rec-d-sel.log";
  var lines = [];
  function log(s) { lines.push(String(s)); flush(); }
  function flush() {
    try { var f = new File(LOG); f.encoding = "UTF-8"; f.open("w"); f.write(lines.join("\n")); f.close(); } catch (e) {}
  }
  try {
    var comp = null;
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      try { if (it instanceof CompItem && it.name === "REC-D") comp = it; } catch (e) {}
    }
    var sel = [];
    for (var j = 1; j <= comp.numLayers; j++) {
      var L = comp.layer(j);
      var s = false;
      try { s = L.selected; } catch (e) {}
      if (s) sel.push(j + ":" + L.name);
    }
    log("SELECTED n=" + sel.length + " " + sel.join(" , "));
  } catch (e) { log("ERROR " + String(e && e.message ? e.message : e)); }
  flush();
  var d = new File(LOG + ".done"); d.open("w"); d.write("done"); d.close();
})();

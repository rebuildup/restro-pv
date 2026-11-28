// final verification of verification/rec-newmat/NEWMAT.aep as saved on disk
(function () {
  var ROOT = "C:/Users/rebui/Desktop/restro-pv-23";
  var AEP = ROOT + "/verification/rec-newmat/NEWMAT.aep";
  var LOG = ROOT + "/.tmp/rec-newmat/rec-newmat-verify.log";
  var lines = [];
  function log(s) { lines.push(String(s)); flush(); }
  function flush() {
    try { var f = new File(LOG); f.encoding = "UTF-8"; f.open("w"); f.write(lines.join("\n")); f.close(); } catch (e) {}
  }
  try {
    log("VERIFY " + new Date().toString());
    app.open(new File(AEP));
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      var isComp = false;
      try { isComp = (it instanceof CompItem); } catch (e) {}
      if (!isComp) continue;
      var a = [];
      for (var j = 1; j <= it.numLayers; j++) a.push(j + ":" + it.layer(j).name + "(en=" + it.layer(j).enabled + ")");
      log("COMP " + it.name + " " + it.width + "x" + it.height + " par=" + it.pixelAspect +
          " fps=" + it.frameRate + " dur=" + it.duration + " layers=" + it.numLayers + " : " + a.join(" , "));
    }
    log("DONE");
  } catch (e) {
    log("ERROR " + String(e && e.message ? e.message : e));
  }
  flush();
  var d = new File(LOG + ".done"); d.open("w"); d.write("done"); d.close();
})();

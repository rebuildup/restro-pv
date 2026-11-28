// dump each STROKE layer's comp-space path bbox + the comp's pixel aspect
(function () {
  var ROOT = "C:/Users/rebui/Desktop/restro-pv-23";
  var LOG = ROOT + "/.tmp/rec-newmat/rec-d-bbox.log";
  var lines = [];
  function log(s) { lines.push(String(s)); flush(); }
  function flush() {
    try { var f = new File(LOG); f.encoding = "UTF-8"; f.open("w"); f.write(lines.join("\n")); f.close(); } catch (e) {}
  }
  function serr(e) { try { return String(e && e.message ? e.message : e); } catch (x) { return "?"; } }
  function collectPaths(container, out) {
    if (!container) return out;
    var n = 0; try { n = container.numProperties; } catch (e) { return out; }
    for (var i = 1; i <= n; i++) {
      var p = container.property(i);
      if (!p) continue;
      var mn = ""; try { mn = p.matchName || ""; } catch (e) {}
      if (mn === "ADBE Vector Shape") {
        try { var sh = p.value; if (sh && sh.vertices) out.push(sh.vertices); } catch (e) {}
      }
      try { if (p.numProperties > 0) collectPaths(p, out); } catch (e) {}
    }
    return out;
  }
  function propValue(layer, match) {
    try {
      var tg = layer.property("ADBE Transform Group");
      for (var i = 1; i <= tg.numProperties; i++) {
        var p = tg.property(i); var mn = ""; try { mn = p.matchName || ""; } catch (e) {}
        if (mn === match) { try { return p.value; } catch (e) { return null; } }
      }
    } catch (e) {}
    return null;
  }
  try {
    var comp = null;
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      try { if (it instanceof CompItem && it.name === "REC-D") comp = it; } catch (e) {}
    }
    log("comp w=" + comp.width + " h=" + comp.height + " par=" + comp.pixelAspect + " fps=" + comp.frameRate + " dur=" + comp.duration);
    log("viewer zoom via app: n/a");
    for (var j = 1; j <= comp.numLayers; j++) {
      var L = comp.layer(j);
      if (!/^STROKE_/.test(L.name)) continue;
      var paths = collectPaths(L, []);
      var pos = propValue(L, "ADBE Position");
      var anc = propValue(L, "ADBE Anchor Point");
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (var q = 0; q < paths.length; q++) {
        var v = paths[q];
        for (var k = 0; k < v.length; k++) {
          if (v[k][0] < minX) minX = v[k][0];
          if (v[k][0] > maxX) maxX = v[k][0];
          if (v[k][1] < minY) minY = v[k][1];
          if (v[k][1] > maxY) maxY = v[k][1];
        }
      }
      log(L.name + " compbbox=[" + (pos[0]+minX-anc[0]).toFixed(1) + "," + (pos[1]+minY-anc[1]).toFixed(1) +
          "," + (pos[0]+maxX-anc[0]).toFixed(1) + "," + (pos[1]+maxY-anc[1]).toFixed(1) + "]");
    }
  } catch (e) { log("ERROR " + serr(e)); }
  flush();
  var d = new File(LOG + ".done"); d.open("w"); d.write("done"); d.close();
})();

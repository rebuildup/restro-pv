// Runs in the PERSISTENT AE instance via -r delegation, AFTER Decompose.
// Selects a spread subset of STROKE_* layers for the drag proof and writes
// their comp-space positions to .tmp/rec-d-pick.json for the driver.
// ExtendScript ES3: no Array.map/forEach.
(function () {
  var ROOT = "C:/Users/rebui/Desktop/restro-pv-23";
  var OUTJ = ROOT + "/.tmp/rec-d-pick.json";
  var LOG = ROOT + "/.tmp/rec-newmat/rec-d-pick.log";
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
    var comp = null;
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      try { if (it instanceof CompItem && it.name === "REC-D") comp = it; } catch (e) {}
    }
    if (!comp) throw new Error("REC-D not found");
    var strokes = [];
    for (var s = 1; s <= comp.numLayers; s++) {
      var L = comp.layer(s);
      var nm = "";
      try { nm = L.name; } catch (e) {}
      if (/^STROKE_/.test(nm)) strokes.push(L);
    }
    log("stroke count=" + strokes.length);
    // deselect all
    for (var d = 1; d <= comp.numLayers; d++) comp.layer(d).selected = false;
    var info = [];
    for (var k = 0; k < strokes.length; k++) {
      var p = null;
      try {
        var tg = strokes[k].property("ADBE Transform Group");
        for (var pi = 1; pi <= tg.numProperties; pi++) {
          var pr = tg.property(pi);
          if (pr && pr.matchName === "ADBE Position") { p = pr.value; break; }
        }
      } catch (e) {}
      var pos = null;
      if (p) { pos = [p[0], p[1]]; }
      info.push({ idx: strokes[k].index, name: strokes[k].name, pos: pos });
      log("stroke " + strokes[k].index + " " + strokes[k].name + " pos=" + (pos ? pos[0].toFixed(0) + "," + pos[1].toFixed(0) : "?"));
    }
    var sorted = info.slice().sort(function (a, b) {
      return (a.pos ? a.pos[1] : 0) - (b.pos ? b.pos[1] : 0);
    });
    var picks = [];
    if (sorted.length >= 4) {
      picks.push(sorted[0]);
      picks.push(sorted[Math.floor(sorted.length / 3)]);
      picks.push(sorted[Math.floor((2 * sorted.length) / 3)]);
      picks.push(sorted[sorted.length - 1]);
    } else {
      for (var q = 0; q < sorted.length && q < 4; q++) picks.push(sorted[q]);
    }
    var selIdx = [];
    for (var q2 = 0; q2 < picks.length; q2++) {
      try { comp.layer(picks[q2].idx).selected = true; selIdx.push(picks[q2].idx); } catch (e) {}
    }
    // ExtendScript has no JSON object — serialize manually
    var parts = [];
    for (var j = 0; j < info.length; j++) {
      var it2 = info[j];
      var ps = it2.pos ? ("[" + it2.pos[0] + "," + it2.pos[1] + "]") : "null";
      parts.push("{\"idx\":" + it2.idx + ",\"name\":\"" + it2.name + "\",\"pos\":" + ps + "}");
    }
    var selParts = [];
    for (var j2 = 0; j2 < selIdx.length; j2++) selParts.push(String(selIdx[j2]));
    var jf = new File(OUTJ); jf.encoding = "UTF-8"; jf.open("w");
    jf.write("{\"selected\":[" + selParts.join(",") + "],\"strokes\":[" + parts.join(",") + "]}"); jf.close();
    try { app.updateUI(); } catch (e) {}
    log("DONE selected=" + selParts.join(","));
  } catch (e) {
    log("ERROR " + serr(e));
  }
  flush();
})();

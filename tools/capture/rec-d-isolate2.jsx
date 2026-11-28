// second isolation pass: what exactly blows up on the SOURCE text layer
(function () {
  var ROOT = "C:/Users/rebui/Desktop/restro-pv-23";
  var LOG = ROOT + "/.tmp/rec-newmat/rec-d-isolate2.log";
  var lines = [];
  function log(s) { lines.push(String(s)); flush(); }
  function flush() {
    try { var f = new File(LOG); f.encoding = "UTF-8"; f.open("w"); f.write(lines.join("\n")); f.close(); } catch (e) {}
  }
  function serr(e) { try { return String(e && e.message ? e.message : e); } catch (x) { return "?"; } }
  try {
    var comp = null;
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      try { if (it instanceof CompItem && it.name === "REC-D") comp = it; } catch (e) {}
    }
    var tl = comp.layer(1), bg = comp.layer(2);
    log("tl=" + tl.name + " bg=" + bg.name);
    // BG solid position
    try { log("bg.pos=" + bg.property("ADBE Transform Group").property("ADBE Position").value); } catch (e) { log("bg.pos ERR " + serr(e)); }
    // text layer: scan the transform group
    var tg = tl.property("ADBE Transform Group");
    log("tg.numProperties=" + tg.numProperties);
    for (var p = 1; p <= tg.numProperties; p++) {
      var pr = tg.property(p);
      var mn = "", nm = "";
      try { mn = pr.matchName; } catch (e) {}
      try { nm = pr.name; } catch (e) {}
      var val = "";
      try { var v = pr.value; val = (v && v.length !== undefined) ? "[" + v[0] + "," + v[1] + "]" : String(v); } catch (e) { val = "ERR " + serr(e); }
      log("  prop " + p + " name=[" + nm + "] match=" + mn + " value=" + val);
    }
    // text document
    var std = tl.property("ADBE Text Properties").property("ADBE Text Document");
    var d = std.value;
    try { log("doc.applyFill=" + d.applyFill); } catch (e) { log("applyFill ERR " + serr(e)); }
    try { log("doc.fillColor=" + d.fillColor); } catch (e) { log("fillColor ERR " + serr(e)); }
    try { log("doc.fontSize=" + d.fontSize); } catch (e) { log("fontSize ERR " + serr(e)); }
    try { log("doc.font=" + d.font); } catch (e) { log("font ERR " + serr(e)); }
    try { log("doc.justification=" + d.justification); } catch (e) { log("just ERR " + serr(e)); }
    try { log("doc.text=" + d.text); } catch (e) { log("text ERR " + serr(e)); }
  } catch (e) { log("ERROR " + serr(e)); }
  flush();
  var dd = new File(LOG + ".done"); dd.open("w"); dd.write("done"); dd.close();
})();

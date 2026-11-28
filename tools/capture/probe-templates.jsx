// Probe available renderQueue output-module template names on AE 2027.
(function () {
  var ROOT = "C:/Users/rebui/Desktop/restro-pv-23";
  var f = new File(ROOT + "/.tmp/probe-templates.txt");
  f.encoding = "UTF-8";
  var lines = [];
  function log(s) { lines.push(s); try { f.open("w"); f.write(lines.join("\n")); f.close(); } catch (e) {} }
  try {
    var proj = app.project;
    var comp = null;
    for (var i = 1; i <= proj.numItems; i++) {
      var it = proj.item(i);
      if (it instanceof CompItem && it.name === "RestroProofD") comp = it;
    }
    if (!comp) {
      for (var j = 1; j <= proj.numItems; j++) {
        var it2 = proj.item(j);
        if (it2 instanceof CompItem) { comp = it2; break; }
      }
    }
    log("COMP=" + (comp ? comp.name : "none"));
    if (comp) {
      var rq = proj.renderQueue;
      var item = rq.items.add(comp);
      var om = item.outputModule(1);
      var cands = [
        "PNG Sequence", "PNG", "Lossless", "JPEG Sequence", "H.264 - Match Render Settings - 15 Mbps",
        "H.264 - Match Render Settings - 10 Mbps", "H.264", "MPEG-4", "Animation",
        "PNGシーケンス", "ロスレス", "H.264 - レンダリング設定に一致 - 15 Mbps"
      ];
      for (var k = 0; k < cands.length; k++) {
        try { om.applyTemplate(cands[k]); log("OK " + cands[k]); }
        catch (e) { log("NO " + cands[k]); }
      }
      rq.items.remove(item.index);
    }
    log("DONE");
  } catch (e) { log("ERROR " + String(e)); }
  try { f.open("w"); f.write(lines.join("\n")); f.close(); } catch (e2) {}
  var d = new File(ROOT + "/.tmp/probe-templates.txt.done"); d.open("w"); d.write("done"); d.close();
})();

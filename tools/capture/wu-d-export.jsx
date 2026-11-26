// Export-only: find RestroProofD comp in the open project, render via RQ.
(function () {
  var ROOT = "C:/Users/rebui/Desktop/restro-pv-23";
  var OUTDIR = ROOT + "/.tmp/wu-d-capture";
  var f = new File(ROOT + "/.tmp/wu-d-export.txt");
  f.encoding = "UTF-8";
  var lines = [];
  function log(s) { lines.push(s); try { f.open("w"); f.write(lines.join("\n")); f.close(); } catch (e) {} }
  function serr(e) { try { return String(e && e.message ? e.message : e); } catch (x) { return "?"; } }
  try {
    var proj = app.project, comp = null;
    for (var i = 1; i <= proj.numItems; i++) {
      var it = proj.item(i);
      if (it instanceof CompItem && it.name === "RestroProofD") comp = it;
    }
    log("COMP=" + (comp ? comp.name + " dur=" + comp.duration : "none"));
    if (!comp) throw new Error("comp missing");
    var folder = new Folder(OUTDIR); if (!folder.exists) folder.create();
    var rq = proj.renderQueue;
    var item = rq.items.add(comp);
    item.timeSpanStart = 0;
    item.timeSpanDuration = comp.duration;
    var om = item.outputModule(1);
    var cands = [
      "H.264 - Match Render Settings - 15 Mbps",
      "H.264 - Match Render Settings - 10 Mbps",
      "H.264 - Match Render Settings - 5 Mbps",
      "PNG Sequence", "Lossless", "JPEG Sequence", "TIFF Sequence", "MPEG-4", "H.264"
    ];
    var applied = "";
    for (var ti = 0; ti < cands.length; ti++) {
      try { om.applyTemplate(cands[ti]); applied = cands[ti]; log("TPL OK " + cands[ti]); break; }
      catch (e) { log("tpl NO " + cands[ti]); }
    }
    var isSeq = /Sequence/i.test(applied);
    var outFile = isSeq
      ? new File(OUTDIR + "/frame_[#####].png")
      : new File(ROOT + "/assets/rec/ae-decompose-auto" + (applied.indexOf("H.264") >= 0 ? ".mp4" : ".mov"));
    om.file = outFile;
    log("RENDER " + outFile.fsName + " tpl=" + (applied || "default"));
    rq.render();
    log("DONE");
  } catch (e) { log("ERROR " + serr(e)); }
  try { f.open("w"); f.write(lines.join("\n")); f.close(); } catch (e2) {}
  var d = new File(ROOT + "/.tmp/wu-d-export.txt.done"); d.open("w"); d.write("done"); d.close();
})();

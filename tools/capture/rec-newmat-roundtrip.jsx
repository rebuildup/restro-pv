// REC-NEWMAT round trip: run the real "Restro: Merge" and "Restro: Refine"
// on a DUPLICATE of the acquired comp and record the plugin replies.
//
// The plugin reads the source layers from the comp that is OPEN IN THE
// VIEWER, so the duplicate has to be the one in the viewer while the
// commands run (running them on a duplicate that is not in the viewer
// answers CAPTURE_FAILED / "Select one or more layers first.").
//
// Outputs: .tmp/rec-newmat/roundtrip.json (+ .done)
(function () {
  var ROOT = "C:/Users/rebui/Desktop/restro-pv-23";
  var AEP = ROOT + "/verification/rec-newmat/NEWMAT.aep";
  var OUT = ROOT + "/.tmp/rec-newmat/roundtrip.json";
  var LOG = ROOT + "/.tmp/rec-newmat/rec-newmat-roundtrip.log";
  var COMP_NAME = "NEWMAT 無 mincho";

  var lines = [];
  function log(s) { lines.push(String(s)); flush(); }
  function serr(e) { try { return String(e && e.message ? e.message : e); } catch (x) { return "?"; } }
  function flush() {
    try { var f = new File(LOG); f.encoding = "UTF-8"; f.open("w"); f.write(lines.join("\n")); f.close(); } catch (e) {}
  }
  function jstr(s) {
    s = String(s); var out = '"';
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i), code = s.charCodeAt(i);
      if (c === '"') out += '\\"';
      else if (c === "\\") out += "\\\\";
      else if (code < 32) out += "\\u" + ("000" + code.toString(16)).slice(-4);
      else out += c;
    }
    return out + '"';
  }
  function inventory(comp, tag) {
    var a = [];
    for (var i = 1; i <= comp.numLayers; i++) {
      var L = comp.layer(i);
      var s = false; try { s = L.selected; } catch (e) {}
      a.push(i + ":" + L.name + "(en=" + L.enabled + ",sel=" + s + ")");
    }
    log(tag + " n=" + comp.numLayers + " : " + a.join(" , "));
    return a.join(" , ");
  }

  var replies = {};
  try {
    log("START " + new Date().toString());
    app.open(new File(AEP));
    log("OPEN " + AEP);
    var comp = null;
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      try { if (it instanceof CompItem && it.name === COMP_NAME) comp = it; } catch (e) {}
    }
    if (!comp) throw new Error(COMP_NAME + " not found");
    inventory(comp, "ACQUIRED");

    var dup = comp.duplicate();
    log("DUPLICATE " + dup.name + " layers=" + dup.numLayers);
    // the duplicate must be the comp in the viewer for the plugin to see it
    try { dup.openInViewer(); log("DUP openInViewer ok"); } catch (e) { log("DUP openInViewer " + serr(e)); }
    try { app.project.activeItem = dup; } catch (e) {}
    $.sleep(1200);
    for (var d = 1; d <= dup.numLayers; d++) dup.layer(d).selected = false;
    var n = 0;
    for (var d2 = 1; d2 <= dup.numLayers; d2++) {
      if (/^STROKE_/.test(dup.layer(d2).name)) { dup.layer(d2).selected = true; n++; }
    }
    log("DUP selected strokes=" + n);
    inventory(dup, "DUP-BEFORE-MERGE");

    var env = $;
    env.setenv("RESTRO_REPLY", "");
    env.setenv("RESTRO_CALL", "");
    var mergeCmd = app.findMenuCommandId("Restro: Merge");
    log("mergeCmdId=" + mergeCmd);
    app.executeCommand(mergeCmd);
    replies.merge = String(env.getenv("RESTRO_REPLY") || "");
    log("REPLY merge " + replies.merge);
    var afterMerge = inventory(dup, "DUP-AFTER-MERGE");

    var merged = null;
    for (var m = 1; m <= dup.numLayers; m++) {
      if (/merged/i.test(dup.layer(m).name)) merged = dup.layer(m);
    }
    log("MERGED_LAYER_NAME " + (merged ? merged.name : "(none)"));
    var mergedNameStr = merged ? merged.name : "";
    var mergedLayerInfo = "null";
    if (merged) {
      mergedLayerInfo = '{"name":' + jstr(merged.name) + ',"index":' + merged.index +
        ',"type":"' + (merged instanceof ShapeLayer ? "shape" : "other") + '","enabled":' + merged.enabled +
        ',"vertexCount":' + (function () {
          var c = 0;
          (function walk(x) {
            if (!x) return;
            var k = 0; try { k = x.numProperties; } catch (e) { return; }
            for (var q = 1; q <= k; q++) {
              var p = x.property(q); var mn = ""; try { mn = p.matchName || ""; } catch (e) {}
              if (mn === "ADBE Vector Shape") { try { c += p.value.vertices.length; } catch (e) {} }
              try { if (p.numProperties > 0) walk(p); } catch (e) {}
            }
          })(merged);
          return c;
        })() + '}';
      log("MERGED_INFO " + mergedLayerInfo);
    }

    // refine on the merged layer
    for (var r = 1; r <= dup.numLayers; r++) dup.layer(r).selected = false;
    if (merged) merged.selected = true;
    env.setenv("RESTRO_REPLY", "");
    env.setenv("RESTRO_CALL", "");
    var refineCmd = app.findMenuCommandId("Restro: Refine");
    log("refineCmdId=" + refineCmd);
    app.executeCommand(refineCmd);
    replies.refine = String(env.getenv("RESTRO_REPLY") || "");
    log("REPLY refine " + replies.refine);
    var afterRefine = inventory(dup, "DUP-AFTER-REFINE");

    // put the acquired comp back in the viewer and drop the duplicate
    try { comp.openInViewer(); log("ACQUIRED openInViewer ok"); } catch (e) { log("ACQUIRED openInViewer " + serr(e)); }
    try { app.project.activeItem = comp; } catch (e) {}
    dup.remove();
    log("DUPLICATE removed");
    app.project.save(new File(AEP));
    log("SAVED " + AEP);

    var of = new File(OUT); of.encoding = "UTF-8"; of.open("w");
    of.write('{"runStarted":' + jstr(String(new Date().toString())) +
      ',"merge":' + jstr(replies.merge) + ',"refine":' + jstr(replies.refine) + ',' +
      '"mergedLayerName":' + jstr(mergedNameStr) + ',' +
      '"mergedLayerInfo":' + mergedLayerInfo + ',' +
      '"inventoryAfterMerge":' + jstr(afterMerge) + ',' +
      '"inventoryAfterRefine":' + jstr(afterRefine) + '}');
    of.close();
    log("WROTE " + OUT);
    log("DONE");
  } catch (e) {
    log("ERROR " + serr(e));
  }
  flush();
  var d = new File(OUT + ".done"); d.open("w"); d.write("done"); d.close();
})();

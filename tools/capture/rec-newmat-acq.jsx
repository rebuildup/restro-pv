// REC-NEWMAT acquisition: re-run the real Restro Decompose on 無 with the
// MSMincho face and record, verbatim, everything the plugin returned.
//
//   1. open verification/rec-newmat/NEWMAT.aep and report its current state
//   2. rebuild the comp "NEWMAT 無 mincho" from scratch
//      (BG #f7f7f7 + one MSMincho text layer "SOURCE 無")
//   3. reply #1 : the plugin's settings while the text layer is selected
//      (RESTRO_CALL {"op":"get_settings"} + the Restro panel command)
//   4. reply #2 : the Decompose reply
//   5. reply #3 : the Merge reply, and reply #4 : the Refine reply,
//      both taken in a DUPLICATE of the comp so the acquired comp keeps its
//      12 STROKE_* layers untouched
//   6. per-stroke geometry (name, bbox, vertex count, area, ...) and the
//      per-layer inventory of every comp
//
// Outputs: .tmp/rec-newmat/acq.json  (all of the above, verbatim)
//          .tmp/rec-newmat/acq.json.done
(function () {
  var ROOT = "C:/Users/rebui/Desktop/restro-pv-23";
  var AEP = ROOT + "/verification/rec-newmat/NEWMAT.aep";
  var OUT = ROOT + "/.tmp/rec-newmat/acq.json";
  var LOG = ROOT + "/.tmp/rec-newmat/rec-newmat-acq.log";
  var W = 1280, H = 720, FPS = 24, DUR = 8.0;
  var COMP_NAME = "NEWMAT 無 mincho";
  var CH = "無";
  var FONTS = ["MSMincho", "BIZUDMincho", "IPAexMincho", "MS-Mincho"];

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
  function jnum(v) { return (typeof v === "number" && isFinite(v)) ? (Math.round(v * 1000) / 1000) : "null"; }
  // ExtendScript ES3 has no Array.map
  function jarr(a) {
    if (!a) return "null";
    var p = [];
    for (var i = 0; i < a.length; i++) p.push(jnum(a[i]));
    return "[" + p.join(",") + "]";
  }

  // ---- geometry ------------------------------------------------------------
  function collectPaths(container, out) {
    if (!container) return out;
    var n = 0; try { n = container.numProperties; } catch (e) { return out; }
    for (var i = 1; i <= n; i++) {
      var p = container.property(i);
      if (!p) continue;
      var mn = ""; try { mn = p.matchName || ""; } catch (e) {}
      if (mn === "ADBE Vector Shape") {
        try { var sh = p.value; if (sh && sh.vertices && sh.vertices.length) out.push(sh.vertices); } catch (e) {}
      }
      try { if (p.numProperties > 0) collectPaths(p, out); } catch (e) {}
    }
    return out;
  }
  function hasFill(layer) {
    var found = false;
    (function walk(c) {
      if (!c || found) return;
      var n = 0; try { n = c.numProperties; } catch (e) { return; }
      for (var i = 1; i <= n; i++) {
        var p = c.property(i);
        if (!p) continue;
        var mn = ""; try { mn = p.matchName || ""; } catch (e) {}
        if (mn.indexOf("Vector Fill") >= 0) { try { if (p.enabled) { found = true; return; } } catch (e) {} }
        try { if (p.numProperties > 0) walk(p); } catch (e) {}
      }
    })(layer);
    return found;
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
  function polyAreaCentroid(v) {
    var n = v.length; if (n < 3) return null;
    var a = 0, cx = 0, cy = 0;
    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n;
      var cr = v[i][0] * v[j][1] - v[j][0] * v[i][1];
      a += cr; cx += (v[i][0] + v[j][0]) * cr; cy += (v[i][1] + v[j][1]) * cr;
    }
    a = a / 2;
    if (!(Math.abs(a) > 1e-6)) return null;
    return { area: Math.abs(a), cx: cx / (6 * a), cy: cy / (6 * a) };
  }

  function layerInfo(L) {
    var paths = collectPaths(L, []);
    var pos = propValue(L, "ADBE Position");
    var anc = propValue(L, "ADBE Anchor Point");
    var scl = propValue(L, "ADBE Scale");
    var rot = propValue(L, "ADBE Rotate Z");
    var fill = hasFill(L);
    var verts = 0, closedAll = true, area = 0, ccx = 0, ccy = 0, wsum = 0;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    var vjson = [];
    for (var q = 0; q < paths.length; q++) {
      var vv = paths[q];
      verts += vv.length;
      var ac = polyAreaCentroid(vv);
      if (ac) { area += ac.area; ccx += ac.cx * ac.area; ccy += ac.cy * ac.area; wsum += ac.area; }
      var pv = [];
      for (var k = 0; k < vv.length; k++) {
        if (vv[k][0] < minX) minX = vv[k][0];
        if (vv[k][0] > maxX) maxX = vv[k][0];
        if (vv[k][1] < minY) minY = vv[k][1];
        if (vv[k][1] > maxY) maxY = vv[k][1];
        pv.push("[" + jnum(vv[k][0]) + "," + jnum(vv[k][1]) + "]");
      }
      vjson.push("{\"vertices\":[" + pv.join(",") + "]}");
    }
    var cx = wsum ? ccx / wsum : 0, cy = wsum ? ccy / wsum : 0;
    var out = {
      index: L.index, name: L.name, type: (L instanceof ShapeLayer ? "shape" : (L instanceof TextLayer ? "text" : "other")),
      enabled: L.enabled,
      pos: pos ? [pos[0], pos[1]] : null,
      anchor: anc ? [anc[0], anc[1]] : null,
      scale: scl ? [scl[0], scl[1]] : null,
      rotation: rot,
      pathCount: paths.length, vertexCount: verts, closed: closedAll, fill: fill,
      area: area,
      bboxLayerSpace: isFinite(minX) ? [minX, minY, maxX, maxY] : null,
      bboxCompSpace: (isFinite(minX) && pos && anc) ?
        [minX + pos[0] - anc[0], minY + pos[1] - anc[1], maxX + pos[0] - anc[0], maxY + pos[1] - anc[1]] : null,
      centroidComp: (pos && anc) ? [pos[0] + (cx - anc[0]), pos[1] + (cy - anc[1])] : null,
      paths: vjson
    };
    return out;
  }
  function layerInfoJson(L) {
    var i = layerInfo(L);
    return '{"index":' + i.index + ',"name":' + jstr(i.name) + ',"type":' + jstr(i.type) +
      ',"enabled":' + i.enabled + ',"pos":' + (i.pos ? "[" + jnum(i.pos[0]) + "," + jnum(i.pos[1]) + "]" : "null") +
      ',"anchor":' + (i.anchor ? "[" + jnum(i.anchor[0]) + "," + jnum(i.anchor[1]) + "]" : "null") +
      ',"scale":' + (i.scale ? "[" + jnum(i.scale[0]) + "," + jnum(i.scale[1]) + "]" : "null") +
      ',"rotation":' + jnum(i.rotation) +
      ',"pathCount":' + i.pathCount + ',"vertexCount":' + i.vertexCount +
      ',"closed":' + i.closed + ',"fill":' + i.fill + ',"area":' + jnum(i.area) +
      ',"bboxLayerSpace":' + jarr(i.bboxLayerSpace) +
      ',"bboxCompSpace":' + jarr(i.bboxCompSpace) +
      ',"centroidComp":' + (i.centroidComp ? "[" + jnum(i.centroidComp[0]) + "," + jnum(i.centroidComp[1]) + "]" : "null") +
      ',"paths":[' + i.paths.join(",") + "]}";
  }

  var replies = {};
  var compsJson = [];

  try {
    log("START " + new Date().toString());
    app.open(new File(AEP));
    log("OPEN " + AEP);

    // --- inventory of every comp in the project BEFORE the rebuild ----------
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      var isComp = false;
      try { isComp = (it instanceof CompItem); } catch (e) {}
      if (!isComp) continue;
      var li = [];
      for (var j = 1; j <= it.numLayers; j++) li.push(layerInfoJson(it.layer(j)));
      compsJson.push('{"name":' + jstr(it.name) + ',"width":' + it.width + ',"height":' + it.height +
        ',"pixelAspect":' + it.pixelAspect + ',"frameRate":' + it.frameRate + ',"duration":' + jnum(it.duration) +
        ',"layerCount":' + it.numLayers + ',"layers":[' + li.join(",") + "]}");
      log("COMP-BEFORE " + it.name + " layers=" + it.numLayers + " : " +
        (function () { var a = []; for (var q = 1; q <= it.numLayers; q++) a.push(it.layer(q).name + "(en=" + it.layer(q).enabled + ")"); return a.join(" , "); })());
    }

    // --- rebuild the mincho comp -------------------------------------------
    var old = null;
    for (var k = 1; k <= app.project.numItems; k++) {
      var it2 = app.project.item(k);
      try { if (it2 instanceof CompItem && it2.name === COMP_NAME) old = it2; } catch (e) {}
    }
    if (old) { old.remove(); log("REMOVED old " + COMP_NAME); }
    var comp = app.project.items.addComp(COMP_NAME, W, H, 1.0, DUR, FPS);
    log("COMP new " + COMP_NAME + " " + W + "x" + H + "@" + FPS + " dur=" + DUR);
    var bg = comp.layers.addSolid([0.968627, 0.968627, 0.968627], "BG", W, H, 1.0, DUR);
    bg.moveToEnd();
    var tl = comp.layers.addText(CH);
    tl.name = "SOURCE " + CH;
    var std = tl.property("ADBE Text Properties").property("ADBE Text Document");
    var doc = std.value;
    doc.text = CH;
    doc.fontSize = 460;
    doc.fillColor = [0.066667, 0.066667, 0.066667];
    doc.justification = ParagraphJustification.CENTER_JUSTIFY;
    doc.applyFill = true;
    var applied = "", tried = [];
    for (var fi = 0; fi < FONTS.length; fi++) {
      try {
        doc.font = FONTS[fi]; std.setValue(doc);
        if (String(std.value.font) === FONTS[fi]) { applied = FONTS[fi]; break; }
        tried.push(FONTS[fi] + "(no)");
      } catch (e) { tried.push(FONTS[fi] + "(err)"); }
    }
    try { doc.font = applied; std.setValue(doc); } catch (e) {}
    var finalFont = ""; try { finalFont = String(std.value.font); } catch (e) {}
    log("FONT tried=[" + tried.join(" ") + "] applied=" + finalFont);
    tl.property("ADBE Transform Group").property("ADBE Position").setValue([W / 2, H / 2 + 200, 0]);

    try { comp.openInViewer(); log("OPEN_IN_VIEWER ok"); } catch (e) { log("openInViewer " + serr(e)); }
    try { app.project.activeItem = comp; } catch (e) {}
    $.sleep(1200);
    for (var s = 1; s <= comp.numLayers; s++) comp.layer(s).selected = false;
    tl.selected = true;

    var env = $;
    // --- reply #1 : settings in force, with the text layer selected ---------
    env.setenv("RESTRO_REPLY", "");
    env.setenv("RESTRO_CALL", '{"op":"get_settings"}');
    var panelCmd = app.findMenuCommandId("Restro");
    log("panelCmdId=" + panelCmd);
    if (!panelCmd) throw new Error("Restro panel command not found");
    app.executeCommand(panelCmd);
    replies.settings_before_decompose = String(env.getenv("RESTRO_REPLY") || "");
    log("REPLY#1 settings_before_decompose " + replies.settings_before_decompose);

    // --- reply #2 : decompose ----------------------------------------------
    env.setenv("RESTRO_REPLY", "");
    env.setenv("RESTRO_CALL", "");
    var cmdId = app.findMenuCommandId("Restro: Decompose");
    log("decomposeCmdId=" + cmdId);
    if (!cmdId) throw new Error("Restro: Decompose not found");
    app.executeCommand(cmdId);
    replies.decompose = String(env.getenv("RESTRO_REPLY") || "");
    log("REPLY#2 decompose " + replies.decompose);

    var strokeNames = [];
    for (var v = 1; v <= comp.numLayers; v++) {
      var L = comp.layer(v);
      if (/^STROKE_/.test(L.name)) strokeNames.push(L.name);
      log("LAYER " + v + " " + L.name + " type=" + (L instanceof ShapeLayer ? "shape" : (L instanceof TextLayer ? "text" : "other")) + " enabled=" + L.enabled);
    }
    log("STROKES n=" + strokeNames.length + " " + strokeNames.join(" , "));

    // --- reply #3/#4 : merge + refine, in a DUPLICATE so the acquired comp
    //     keeps its 12 STROKE_* layers ---------------------------------------
    var dup = comp.duplicate();
    log("DUPLICATE " + dup.name + " layers=" + dup.numLayers);
    for (var d = 1; d <= dup.numLayers; d++) dup.layer(d).selected = false;
    var nSel = 0;
    for (var d2 = 1; d2 <= dup.numLayers; d2++) {
      if (/^STROKE_/.test(dup.layer(d2).name)) { dup.layer(d2).selected = true; nSel++; }
    }
    log("DUP selected strokes=" + nSel);
    env.setenv("RESTRO_REPLY", "");
    env.setenv("RESTRO_CALL", "");
    var mergeCmd = app.findMenuCommandId("Restro: Merge");
    log("mergeCmdId=" + mergeCmd);
    if (mergeCmd) {
      app.executeCommand(mergeCmd);
      replies.merge = String(env.getenv("RESTRO_REPLY") || "");
      log("REPLY#3 merge " + replies.merge);
    }
    var dupLayers = [];
    for (var m = 1; m <= dup.numLayers; m++) dupLayers.push(m + ":" + dup.layer(m).name + "(en=" + dup.layer(m).enabled + ")");
    log("DUP LAYERS after merge n=" + dup.numLayers + " : " + dupLayers.join(" , "));
    var mergedName = "";
    for (var m2 = 1; m2 <= dup.numLayers; m2++) {
      if (/merged/i.test(dup.layer(m2).name)) mergedName = dup.layer(m2).name;
    }
    log("MERGED_LAYER_NAME " + mergedName);

    // refine on the merged layer
    for (var r = 1; r <= dup.numLayers; r++) dup.layer(r).selected = false;
    var mergedLayer = null;
    for (var r2 = 1; r2 <= dup.numLayers; r2++) {
      if (/merged/i.test(dup.layer(r2).name)) mergedLayer = dup.layer(r2);
    }
    if (mergedLayer) mergedLayer.selected = true;
    env.setenv("RESTRO_REPLY", "");
    env.setenv("RESTRO_CALL", "");
    var refineCmd = app.findMenuCommandId("Restro: Refine");
    log("refineCmdId=" + refineCmd);
    if (refineCmd) {
      app.executeCommand(refineCmd);
      replies.refine = String(env.getenv("RESTRO_REPLY") || "");
      log("REPLY#4 refine " + replies.refine);
    }
    var dupLayers2 = [];
    for (var m3 = 1; m3 <= dup.numLayers; m3++) dupLayers2.push(m3 + ":" + dup.layer(m3).name + "(en=" + dup.layer(m3).enabled + ")");
    log("DUP LAYERS after refine n=" + dup.numLayers + " : " + dupLayers2.join(" , "));

    // geometry of the merged layer (does a merged shape layer exist?)
    var mergedInfo = "null";
    for (var m4 = 1; m4 <= dup.numLayers; m4++) {
      if (/merged/i.test(dup.layer(m4).name)) { mergedInfo = layerInfoJson(dup.layer(m4)); break; }
    }
    log("MERGED_INFO " + mergedInfo);
    dup.remove();
    log("DUPLICATE removed");

    // --- inventory AFTER ----------------------------------------------------
    var afterJson = [];
    for (var a = 1; a <= app.project.numItems; a++) {
      var it3 = app.project.item(a);
      var ic = false; try { ic = (it3 instanceof CompItem); } catch (e) {}
      if (!ic) continue;
      var lj = [];
      for (var b = 1; b <= it3.numLayers; b++) lj.push(layerInfoJson(it3.layer(b)));
      afterJson.push('{"name":' + jstr(it3.name) + ',"width":' + it3.width + ',"height":' + it3.height +
        ',"pixelAspect":' + it3.pixelAspect + ',"frameRate":' + it3.frameRate + ',"duration":' + jnum(it3.duration) +
        ',"layerCount":' + it3.numLayers + ',"layers":[' + lj.join(",") + "]}");
    }

    app.project.save(new File(AEP));
    log("SAVED " + AEP);

    var of = new File(OUT); of.encoding = "UTF-8"; of.open("w");
    of.write('{"runStarted":' + jstr(String(new Date().toString())) +
      ',"aeVersion":' + jstr(String(app.version)) +
      ',"comp":' + jstr(COMP_NAME) +
      ',"font":' + jstr(finalFont) +
      ',"replies":{' +
      '"settings_before_decompose":' + jstr(replies.settings_before_decompose) + ',' +
      '"decompose":' + jstr(replies.decompose) + ',' +
      '"merge":' + jstr(replies.merge) + ',' +
      '"refine":' + jstr(replies.refine) + '},' +
      '"mergedLayerName":' + jstr(mergedName) + ',' +
      '"mergedLayerInfo":' + mergedInfo + ',' +
      '"compsBefore":[' + compsJson.join(",") + '],' +
      '"compsAfter":[' + afterJson.join(",") + ']}');
    of.close();
    log("WROTE " + OUT);
    log("DONE");
  } catch (e) {
    log("ERROR " + serr(e));
  }
  flush();
  var d = new File(OUT + ".done"); d.open("w"); d.write("done"); d.close();
})();

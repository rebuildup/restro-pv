// REC-D probe: reset REC-D.aep, decompose the SOURCE 筆 layer with the real
// "Restro: Decompose" command, and dump the per-stroke geometry that the
// recording driver needs (comp-space ink centroid of every STROKE_* layer)
// plus the plugin's own reply / settings.
//
// AE 2027 note: the transform group uses SEPARATED DIMENSIONS, so
// group.property("ADBE Position") resolves ambiguously and raises
// "invalid numeric result (divide by zero?)". Every transform read below
// therefore scans the group for an exact matchName.
//
// The project is NOT saved: the driver resets it again before the real take.
//
// Output: .tmp/rec-d-probe.json
(function () {
  var ROOT = "C:/Users/rebui/Desktop/restro-pv-23";
  var AEP = ROOT + "/verification/rec-d/REC-D.aep";
  var OUT = ROOT + "/.tmp/rec-d-probe.json";
  var LOG = ROOT + "/.tmp/rec-newmat/rec-d-probe.log";
  var lines = [];
  function log(s) { lines.push(String(s)); flush(); }
  function serr(e) { try { return String(e && e.message ? e.message : e); } catch (x) { return "?"; } }
  function flush() {
    try {
      var f = new File(LOG); f.encoding = "UTF-8"; f.open("w");
      f.write(lines.join("\n")); f.close();
    } catch (e) {}
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
  function nameJson(arr) {
    var p = [];
    for (var i = 0; i < arr.length; i++) p.push(jstr(arr[i]));
    return p.join(",");
  }
  function jnum(v) { return (typeof v === "number" && isFinite(v)) ? (Math.round(v * 1000) / 1000) : "null"; }

  // ---- geometry helpers ---------------------------------------------------
  function collectPaths(container, out) {
    if (!container) return out;
    var n = 0;
    try { n = container.numProperties; } catch (e) { return out; }
    for (var i = 1; i <= n; i++) {
      var p = container.property(i);
      if (!p) continue;
      var mn = "";
      try { mn = p.matchName || ""; } catch (e) {}
      if (mn === "ADBE Vector Shape") {
        try {
          var sh = p.value;
          if (sh && sh.vertices && sh.vertices.length) out.push({ verts: sh.vertices, closed: !!sh.closed });
          else log("    shape prop " + mn + " name=" + p.name + " value=" + (sh ? "empty" : "null"));
        } catch (e) { log("    shape prop ERR " + serr(e) + " name=" + p.name); }
      }
      try { if (p.numProperties > 0) collectPaths(p, out); } catch (e) {}
    }
    return out;
  }
  function hasFill(layer) {
    var found = false;
    (function walk(c) {
      if (!c || found) return;
      var n = 0;
      try { n = c.numProperties; } catch (e) { return; }
      for (var i = 1; i <= n; i++) {
        var p = c.property(i);
        if (!p) continue;
        var mn = "";
        try { mn = p.matchName || ""; } catch (e) {}
        if (mn.indexOf("Vector Fill") >= 0 || mn.indexOf("Vector Graphic - Fill") >= 0) {
          try { if (p.enabled) { found = true; return; } } catch (e) {}
        }
        try { if (p.numProperties > 0) walk(p); } catch (e) {}
      }
    })(layer);
    return found;
  }
  // exact-matchName scan (AE 2027 separated dimensions break name lookup)
  function propValue(layer, match) {
    try {
      var tg = layer.property("ADBE Transform Group");
      if (!tg) return null;
      for (var i = 1; i <= tg.numProperties; i++) {
        var p = tg.property(i);
        var mn = "";
        try { mn = p.matchName || ""; } catch (e) {}
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
      a += cr;
      cx += (v[i][0] + v[j][0]) * cr;
      cy += (v[i][1] + v[j][1]) * cr;
    }
    a = a / 2;
    if (!(Math.abs(a) > 1e-6)) return null;
    return { area: Math.abs(a), cx: cx / (6 * a), cy: cy / (6 * a) };
  }
  function pathBBox(paths) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var s = 0; s < paths.length; s++) {
      var v = paths[s].verts;
      for (var i = 0; i < v.length; i++) {
        if (v[i][0] < minX) minX = v[i][0];
        if (v[i][0] > maxX) maxX = v[i][0];
        if (v[i][1] < minY) minY = v[i][1];
        if (v[i][1] > maxY) maxY = v[i][1];
      }
    }
    if (!isFinite(minX)) return null;
    return [minX, minY, maxX, maxY];
  }

  try {
    log("START " + new Date().toString());
    try { app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES); } catch (e) { log("CLOSE " + serr(e)); }
    app.open(new File(AEP));
    log("OPEN " + AEP);
    var comp = null;
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      try { if (it instanceof CompItem && it.name === "REC-D") comp = it; } catch (e) {}
    }
    if (!comp) throw new Error("REC-D comp not found");
    log("COMP " + comp.name + " " + comp.width + "x" + comp.height + " fps=" + comp.frameRate + " dur=" + comp.duration);

    var tl = null;
    for (var t = 1; t <= comp.numLayers; t++) {
      try { if (comp.layer(t).name === "SOURCE 筆") tl = comp.layer(t); } catch (e) {}
    }
    if (!tl) throw new Error("SOURCE 筆 not found");
    var std = tl.property("ADBE Text Properties").property("ADBE Text Document");
    log("SOURCE font=" + std.value.font + " size=" + std.value.fontSize +
        " applyFill=" + std.value.applyFill + " justification=" + std.value.justification +
        " text=" + std.value.text);
    try { comp.openInViewer(); log("openInViewer ok"); } catch (e) { log("openInViewer ERR " + serr(e)); }
    try { log("SOURCE pos=" + propValue(tl, "ADBE Position")); } catch (e) { log("SOURCE pos ERR " + serr(e)); }
    try { log("SOURCE anchor=" + propValue(tl, "ADBE Anchor Point")); } catch (e) { log("SOURCE anchor ERR " + serr(e)); }

    try { comp.openInViewer(); } catch (e) { log("openInViewer " + serr(e)); }
    try { app.project.activeItem = comp; } catch (e) {}
    $.sleep(1200);
    for (var s = 1; s <= comp.numLayers; s++) comp.layer(s).selected = false;
    tl.selected = true;

    var env = $;
    // (1) settings in force, read from the plugin itself
    env.setenv("RESTRO_REPLY", "");
    env.setenv("RESTRO_CALL", '{"op":"get_settings"}');
    var panelCmd = app.findMenuCommandId("Restro");
    log("panelCmdId=" + panelCmd);
    if (panelCmd) {
      app.executeCommand(panelCmd);
      log("SETTINGS_REPLY " + String(env.getenv("RESTRO_REPLY") || ""));
    }
    // (2) decompose
    env.setenv("RESTRO_REPLY", "");
    env.setenv("RESTRO_CALL", "");
    var cmdId = app.findMenuCommandId("Restro: Decompose");
    log("decomposeCmdId=" + cmdId);
    if (!cmdId) throw new Error("Restro: Decompose not found");
    app.executeCommand(cmdId);
    var reply = String(env.getenv("RESTRO_REPLY") || "");
    log("DECOMPOSE_REPLY " + reply);

    // (3) per-stroke geometry
    var strokes = [], names = [];
    for (var j = 1; j <= comp.numLayers; j++) {
      var L = comp.layer(j);
      names.push(j + ":" + L.name);
      if (!/^STROKE_/.test(L.name)) continue;
      var paths = collectPaths(L, []);
      var pos = propValue(L, "ADBE Position");
      var anc = propValue(L, "ADBE Anchor Point");
      var scl = propValue(L, "ADBE Scale");
      var rot = propValue(L, "ADBE Rotate Z");
      var fill = hasFill(L);
      var verts = 0, closedAll = true, area = 0, ccx = 0, ccy = 0, wsum = 0;
      for (var q = 0; q < paths.length; q++) {
        verts += paths[q].verts.length;
        if (!paths[q].closed) closedAll = false;
        var ac = polyAreaCentroid(paths[q].verts);
        if (ac) { area += ac.area; ccx += ac.cx * ac.area; ccy += ac.cy * ac.area; wsum += ac.area; }
      }
      var bb = pathBBox(paths);
      var cx = wsum ? ccx / wsum : 0, cy = wsum ? ccy / wsum : 0;
      var compCx = (pos && anc) ? pos[0] + (cx - anc[0]) : cx;
      var compCy = (pos && anc) ? pos[1] + (cy - anc[1]) : cy;
      strokes.push({
        idx: L.index, name: L.name,
        pos: pos ? [pos[0], pos[1]] : null,
        anc: anc ? [anc[0], anc[1]] : null,
        scl: scl ? [scl[0], scl[1]] : null,
        rot: rot,
        paths: paths.length, verts: verts, closed: closedAll, fill: fill,
        area: area, bbox: bb,
        centroidLayer: [cx, cy], centroidComp: [compCx, compCy]
      });
      log("STROKE " + L.name + " idx=" + L.index + " paths=" + paths.length + " verts=" + verts +
          " closed=" + closedAll + " fill=" + fill + " area=" + area.toFixed(1) +
          " centroidComp=" + compCx.toFixed(1) + "," + compCy.toFixed(1) +
          " pos=" + (pos ? pos[0].toFixed(1) + "," + pos[1].toFixed(1) : "-"));
    }
    log("LAYERS total=" + comp.numLayers + " strokes=" + strokes.length);
    log("LAYER_NAMES " + names.join(" , "));

    var sp = [];
    for (var k = 0; k < strokes.length; k++) {
      var s2 = strokes[k];
      sp.push('{"idx":' + s2.idx + ',"name":' + jstr(s2.name) +
        ',"pos":' + (s2.pos ? "[" + jnum(s2.pos[0]) + "," + jnum(s2.pos[1]) + "]" : "null") +
        ',"centroidComp":' + "[" + jnum(s2.centroidComp[0]) + "," + jnum(s2.centroidComp[1]) + "]" +
        ',"area":' + jnum(s2.area) + ',"verts":' + s2.verts + ',"paths":' + s2.paths +
        ',"closed":' + s2.closed + ',"fill":' + s2.fill +
        ',"compBBox":' + (s2.bbox ? "[" + jnum(s2.bbox[0] + s2.pos[0] - s2.anc[0]) + "," +
            jnum(s2.bbox[1] + s2.pos[1] - s2.anc[1]) + "," +
            jnum(s2.bbox[2] + s2.pos[0] - s2.anc[0]) + "," +
            jnum(s2.bbox[3] + s2.pos[1] - s2.anc[1]) + "]" : "null") + '}');
    }
    var of = new File(OUT); of.encoding = "UTF-8"; of.open("w");
    of.write('{"comp":{"name":' + jstr(comp.name) + ',"w":' + comp.width + ',"h":' + comp.height +
      ',"fps":' + comp.frameRate + ',"dur":' + jnum(comp.duration) + '},' +
      '"layerNames":[' + nameJson(names) + '],' +
      '"strokes":[' + sp.join(",") + ']}');
    of.close();
    log("WROTE " + OUT);
    log("DONE");
  } catch (e) {
    log("ERROR " + serr(e));
  }
  flush();
  var d = new File(OUT + ".done"); d.open("w"); d.write("done"); d.close();
})();

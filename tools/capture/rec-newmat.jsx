// REC-NEWMAT: procure real Restro decomposition material for a third
// gallery character.
//
// For each target character (in the order the owner asked for):
//   - creates a fresh project (app.newProject())
//   - creates comp "NEWMAT <char>" 1280x720 @24fps, 8s, solid #f7f7f7
//   - creates ONE text layer with the character, centred, fontSize 460,
//     fill #111111, trying a list of Japanese fonts and recording which
//     one actually applied
//   - opens the comp in the viewer (the plug-in needs an open, active
//     composition — otherwise it answers CAPTURE_FAILED / "no composition
//     is available"), selects the text layer and runs the REAL plug-in
//     command "Restro: Decompose", logging the reply JSON
//   - logs the shape-layer count, every generated layer name and, for each
//     generated STROKE_* layer, the path geometry (closed?, sub-path count,
//     area, outline bbox)
//   - renders the source glyph, the decomposed result and every single
//     piece to PNG so the raster acceptance metrics can be measured
//
// Finally it saves the project as verification/rec-newmat/NEWMAT.aep.
//
// ExtendScript has no JSON object, so the report is written by hand.
(function () {
  var ROOT = "C:/Users/rebui/Desktop/restro-pv-23";
  var OUTDIR = ROOT + "/verification/rec-newmat";
  var LOG = ROOT + "/.tmp/rec-newmat/rec-newmat2.txt";
  var REPORT = ROOT + "/.tmp/rec-newmat/rec-newmat2.json";
  var W = 1280, H = 720, FPS = 24, DUR = 8.0;
  var CHARS = ["無", "龍"];
  // PostScript names this AE really accepts (probed with tools/capture/
  // probe-fonts.jsx): the display names with spaces are rejected by AE.
  var FONTS = [
    "NotoSansJP-Medium",
    "NotoSansJP-Regular",
    "NotoSansJP-Bold",
    "MSMincho",
    "MS-Mincho",
    "BIZUDMincho",
    "MSGothic",
    "MS-Gothic",
    "Meiryo",
    "YuGothic",
    "IPAexMincho",
    "IPAGothic"
  ];

  var lines = [];
  function jstr(s) {
    s = String(s);
    var out = '"';
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i), code = s.charCodeAt(i);
      if (c === '"') out += '\\"';
      else if (c === "\\") out += "\\\\";
      else if (code < 32) out += "\\u" + ("000" + code.toString(16)).slice(-4);
      else out += c;
    }
    return out + '"';
  }
  function jarr(a) {
    var p = [];
    for (var i = 0; i < a.length; i++) p.push(jstr(a[i]));
    return "[" + p.join(",") + "]";
  }
  function flush() {
    try {
      var f = new File(LOG); f.encoding = "UTF-8"; f.open("w");
      f.write(lines.join("\n")); f.close();
    } catch (e) {}
    try {
      var r = new File(REPORT); r.encoding = "UTF-8"; r.open("w");
      r.write('{"lines":' + jarr(lines) + "}"); r.close();
    } catch (e) {}
  }
  function log(s) { lines.push(String(s)); flush(); }
  function serr(e) { try { return String(e && e.message ? e.message : e); } catch (x) { return "?"; } }

  // ---- geometry ------------------------------------------------------------
  // Every "ADBE Vector Shape" below a container, with its closed flag.
  function collectShapeProps(container, out) {
    if (!container) return out;
    var n = container.numProperties;
    for (var i = 1; i <= n; i++) {
      var p = container.property(i);
      if (!p) continue;
      var mn = "";
      try { mn = p.matchName || ""; } catch (e) {}
      if (mn === "ADBE Vector Shape") {
        try {
          var sh = p.value;
          if (sh && sh.vertices && sh.vertices.length) {
            out.push({ verts: sh.vertices, inT: sh.inTangents, outT: sh.outTangents, closed: !!sh.closed });
          }
        } catch (e) {}
      }
      try { if (p.numProperties > 0) collectShapeProps(p, out); } catch (e) {}
    }
    return out;
  }

  function pathBBox(shapes) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var s = 0; s < shapes.length; s++) {
      var sh = shapes[s], v = sh.verts, it = sh.inT, ot = sh.outT;
      for (var i = 0; i < v.length; i++) {
        var pts = [[v[i][0], v[i][1]]];
        if (ot && ot[i]) pts.push([v[i][0] + ot[i][0], v[i][1] + ot[i][1]]);
        var j = (i + 1) % v.length;
        if (it && it[j]) pts.push([v[j][0] + it[j][0], v[j][1] + it[j][1]]);
        for (var p = 0; p < pts.length; p++) {
          var x = pts[p][0], y = pts[p][1];
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (!isFinite(minX)) return null;
    return { x0: minX, y0: minY, x1: maxX, y1: maxY, w: maxX - minX, h: maxY - minY };
  }

  // Shoelace area of a closed path (layer space).
  function pathArea(sh) {
    var v = sh.verts, n = v.length;
    if (n < 3) return 0;
    var a = 0;
    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n;
      a += v[i][0] * v[j][1] - v[j][0] * v[i][1];
    }
    return Math.abs(a / 2);
  }

  function propValue(layer, match) {
    try {
      var tg = layer.property("ADBE Transform Group");
      if (!tg) return null;
      for (var i = 1; i <= tg.numProperties; i++) {
        var p = tg.property(i);
        if (p && p.matchName === match) return p.value;
      }
    } catch (e) {}
    return null;
  }
  function num(v, d) { return (typeof v === "number" && isFinite(v)) ? v : d; }

  // Does the layer paint a FILL on its path (as opposed to only an outline)?
  function hasFill(layer) {
    var found = false;
    (function walk(c) {
      if (!c || found) return;
      var n = c.numProperties;
      for (var i = 1; i <= n; i++) {
        var p = c.property(i);
        if (!p) continue;
        var mn = "";
        try { mn = p.matchName || ""; } catch (e) {}
        if (mn === "ADBE Vector Fill" || mn.indexOf("ADBE Vector Fill") === 0) {
          try { if (p.enabled) { found = true; return; } } catch (e) {}
        }
        try { if (p.numProperties > 0) walk(p); } catch (e) {}
      }
    })(layer.property("ADBE Vector Group"));
    return found;
  }

  // ---- rendering -----------------------------------------------------------
  // Renders one frame of a comp into `dir` with base name `base`.
  function renderOneFrame(comp, dir, base) {
    var folder = new Folder(dir);
    if (!folder.exists) folder.create();
    var origDur = comp.duration;
    try { comp.duration = 1 / FPS; } catch (e) {}
    var ok = false;
    try {
      comp.saveAsPicture(new File(dir + "/" + base + ".png"), CompItem.CREATE_PNG_SEQUENCE);
      ok = true;
    } catch (e) {
      log("    saveAsPicture FAIL " + serr(e));
    }
    try { comp.duration = origDur; } catch (e) {}
    if (!ok) {
      // Fallback: render queue, one frame, any template; the caller decodes it.
      try {
        var rq = comp.project.renderQueue;
        var item = rq.items.add(comp);
        item.timeSpanStart = 0;
        item.timeSpanDuration = 1 / FPS;
        var om = item.outputModule(1);
        var tpls = ["PNG Sequence", "Lossless", "TIFF Sequence", "H.264 - Match Render Settings - 15 Mbps"];
        for (var i = 0; i < tpls.length; i++) {
          try { om.applyTemplate(tpls[i]); log("    tpl " + tpls[i]); break; } catch (e) {}
        }
        om.file = new File(dir + "/" + base + ".avi");
        rq.render();
        ok = true;
      } catch (e) { log("    renderQueue FAIL " + serr(e)); }
    }
    return ok;
  }

  // Saves the project so a crash in a later step cannot lose a finished
  // decomposition.
  function saveAep() {
    try {
      var od = new Folder(OUTDIR);
      if (!od.exists) od.create();
      var aep = new File(OUTDIR + "/NEWMAT.aep");
      app.project.save(aep);
      log("SAVED " + aep.fsName);
      return true;
    } catch (e) { log("SAVE_FAIL " + serr(e)); return false; }
  }

  // ---- main ----------------------------------------------------------------
  try {
    log("START " + new Date().toString());
    // A fresh, empty project. app.newProject() on a project that already
    // holds items crashes AE 2027, so the old project is closed first.
    try {
      if (app.project.numItems > 0) {
        app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
        log("CLOSE old project ok");
      }
    } catch (e) { log("CLOSE fail " + serr(e)); }
    try { app.newProject(); log("NEWPROJECT ok"); } catch (e) { log("NEWPROJECT fail " + serr(e)); }
    var proj = app.project;

    for (var ci = 0; ci < CHARS.length; ci++) {
      var ch = CHARS[ci];
      var compName = "NEWMAT " + ch;
      var pngDir = OUTDIR + "/png/" + ci + "-" + ch;
      log("=== CHAR " + ch + " ===");

      var comp = proj.items.addComp(compName, W, H, 1.0, DUR, FPS);
      log("COMP " + compName + " " + W + "x" + H + "@" + FPS + " dur=" + DUR);

      var bg = comp.layers.addSolid([0.968627, 0.968627, 0.968627], "BG", W, H, 1.0, DUR);
      bg.moveToEnd();

      // --- text layer -------------------------------------------------------
      var tl = comp.layers.addText(ch);
      tl.name = "SOURCE " + ch;
      var std = tl.property("ADBE Text Properties").property("ADBE Text Document");
      var doc = std.value;
      doc.text = ch;
      doc.fontSize = 460;
      doc.fillColor = [0.066667, 0.066667, 0.066667];
      doc.justification = ParagraphJustification.CENTER_JUSTIFY;
      doc.applyFill = true;

      var appliedFont = "", tried = [];
      for (var fi = 0; fi < FONTS.length; fi++) {
        try {
          doc.font = FONTS[fi];
          std.setValue(doc);
          if (String(std.value.font) === FONTS[fi]) { appliedFont = FONTS[fi]; break; }
          tried.push(FONTS[fi] + "(no)");
        } catch (e) {
          tried.push(FONTS[fi] + "(err)");
        }
      }
      try { doc.font = appliedFont; std.setValue(doc); } catch (e) {}
      var finalFont = "";
      try { finalFont = String(std.value.font); } catch (e) {}
      log("FONT tried=[" + tried.join(" ") + "] applied=" + finalFont);

      tl.property("ADBE Transform Group").property("ADBE Position").setValue([W / 2, H / 2 + 200, 0]);

      // --- open the comp so the plug-in can find it -------------------------
      try { comp.openInViewer(); log("OPEN_IN_VIEWER ok"); } catch (e) { log("OPEN_IN_VIEWER fail " + serr(e)); }
      try { app.project.activeItem = comp; } catch (e) {}
      $.sleep(1200);
      try { app.updateUI(); } catch (e) {}

      // --- render the SOURCE glyph (before decompose) ------------------------
      try {
        renderOneFrame(comp, pngDir, "00-source");
        log("RENDER source ok");
      } catch (e) { log("RENDER source fail " + serr(e)); }

      // --- run the real plug-in ---------------------------------------------
      for (var s = 1; s <= comp.numLayers; s++) comp.layer(s).selected = false;
      tl.selected = true;
      try { app.updateUI(); } catch (e) {}

      var env = $;
      env.setenv("RESTRO_REPLY", "");
      env.setenv("RESTRO_CALL", "");
      var cmdId = 0;
      try { cmdId = app.findMenuCommandId("Restro: Decompose"); } catch (e) { cmdId = 0; }
      if (!cmdId) throw new Error("Restro: Decompose menu command not found");
      app.executeCommand(cmdId);
      var reply = String(env.getenv("RESTRO_REPLY") || "");
      log("REPLY " + reply);

      // --- inventory --------------------------------------------------------
      var shapeCount = 0, strokeLayers = [], names = [], merged = 0;
      for (var j = 1; j <= comp.numLayers; j++) {
        var L = comp.layer(j);
        names.push(j + ":" + L.name);
        var isShape = false;
        try { isShape = (L instanceof ShapeLayer); } catch (e) {}
        if (isShape) {
          shapeCount++;
          if (/^STROKE_/.test(L.name)) strokeLayers.push(L);
          if (/merged/i.test(L.name)) merged++;
        }
      }
      log("LAYERS total=" + comp.numLayers + " shape=" + shapeCount +
          " strokes=" + strokeLayers.length + " merged_like=" + merged);
      log("LAYER_NAMES " + names.join(" , "));

      // --- per stroke geometry ----------------------------------------------
      for (var k = 0; k < strokeLayers.length; k++) {
        var sl = strokeLayers[k];
        var shapes = collectShapeProps(sl.property("ADBE Vector Group"), []);
        var bb = pathBBox(shapes);
        var area = 0;
        for (var q = 0; q < shapes.length; q++) area += pathArea(shapes[q]);
        var closedAll = true, singlePath = (shapes.length === 1);
        for (var q2 = 0; q2 < shapes.length; q2++) if (!shapes[q2].closed) closedAll = false;
        var pos = propValue(sl, "ADBE Position");
        var anc = propValue(sl, "ADBE Anchor Point");
        var scl = propValue(sl, "ADBE Scale");
        var rot = propValue(sl, "ADBE Rotation");
        var fill = hasFill(sl);
        log("STROKE " + sl.name +
            " paths=" + shapes.length +
            " singlePath=" + singlePath +
            " allClosed=" + closedAll +
            " fill=" + fill +
            " area=" + area.toFixed(1) +
            " pathbbox=" + (bb ? ([bb.x0, bb.y0, bb.x1, bb.y1].map(function (n) { return n.toFixed(1); }).join(",")) : "none") +
            " pathwh=" + (bb ? (bb.w.toFixed(1) + "x" + bb.h.toFixed(1)) : "-") +
            " pos=" + (pos ? (num(pos[0], 0).toFixed(1) + "," + num(pos[1], 0)) : "-") +
            " anchor=" + (anc ? (num(anc[0], 0).toFixed(1) + "," + num(anc[1], 0)) : "-") +
            " scale=" + (scl ? (num(scl[0], 0).toFixed(1) + "," + num(scl[1], 0)) : "-") +
            " rot=" + (rot ? num(rot, 0).toFixed(2) : "-"));
      }

      // --- the decomposition is done: bank it before any rendering ---------
      saveAep();

      // --- render the decomposed comp ---------------------------------------
      try {
        renderOneFrame(comp, pngDir, "01-decomp");
        log("RENDER decomp ok");
      } catch (e) { log("RENDER decomp fail " + serr(e)); }

      // --- render every single piece ----------------------------------------
      var visible = [];
      for (var v = 1; v <= comp.numLayers; v++) visible.push(comp.layer(v).enabled);
      for (var v2 = 1; v2 <= comp.numLayers; v2++) comp.layer(v2).enabled = false;
      for (var k2 = 0; k2 < strokeLayers.length; k2++) {
        var sl2 = strokeLayers[k2];
        sl2.enabled = true;
        try {
          renderOneFrame(comp, pngDir, "10-piece-" + (k2 < 9 ? "0" : "") + (k2 + 1));
          log("RENDER piece " + (k2 + 1) + " " + sl2.name);
        } catch (e) { log("RENDER piece " + (k2 + 1) + " fail " + serr(e)); }
        sl2.enabled = false;
      }
      for (var v3 = 1; v3 <= comp.numLayers; v3++) comp.layer(v3).enabled = visible[v3 - 1];
      log("VISIBILITY restored");
    }

    // --- save ----------------------------------------------------------------
    saveAep();
    log("DONE");
  } catch (e) {
    log("ERROR " + serr(e));
  }
  flush();
  var d = new File(REPORT + ".done");
  d.open("w");
  d.write("done");
  d.close();
})();

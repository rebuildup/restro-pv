// Dump one AEP to per-comp JSON files for resumable, incremental analysis.
//
// Template: __AEP_PATH__ and __OUT_DIR__ are substituted by
// tools/dump-aep-tree.ts.
//
// For every CompItem in the project this writes
//   <OUT_DIR>/<NN>-<sanitized-name>.json
// plus a <...>.done marker when the comp finished cleanly. Comps whose .done
// marker already exists are skipped, so re-running resumes where it stopped.
// Per-comp failures produce <...>.error instead of .done and are recorded in
// the final _manifest.json. ExtendScript (ES3) only — no let/const/arrow/JSON.
//
// Output schema per file: restro-pv.aep-comp-dump.v1
(() => {
  var AEP_PATH = "__AEP_PATH__";
  var OUT_DIR = "__OUT_DIR__";

  var out = null;
  function w(s) {
    out.write(s);
  }
  function ws(s) {
    out.write(s);
    out.write("\n");
  }

  function esc(s) {
    return String(s)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/[\x00-\x1f]/g, (c) => {
        var h = c.charCodeAt(0).toString(16);
        return "\\u" + ("0000" + h).slice(-4);
      });
  }
  function q(s) {
    return '"' + esc(s) + '"';
  }
  function num(n) {
    return typeof n === "number" && isFinite(n) ? String(n) : "null";
  }

  // ---- value serialization -------------------------------------------------
  function isShape(v) {
    try {
      return (
        v !== null &&
        typeof v === "object" &&
        typeof v.vertices !== "undefined" &&
        typeof v.inTangents !== "undefined"
      );
    } catch (e) {
      return false;
    }
  }
  function shapeJson(s) {
    var parts = ['{"vertices":' + "["];
    for (var i = 0; i < s.vertices.length; i++) {
      if (i) parts.push(",");
      parts.push("[" + num(s.vertices[i][0]) + "," + num(s.vertices[i][1]) + "]");
    }
    parts.push('],"inTangents":' + "[");
    for (i = 0; i < s.inTangents.length; i++) {
      if (i) parts.push(",");
      parts.push("[" + num(s.inTangents[i][0]) + "," + num(s.inTangents[i][1]) + "]");
    }
    parts.push('],"outTangents":' + "[");
    for (i = 0; i < s.outTangents.length; i++) {
      if (i) parts.push(",");
      parts.push("[" + num(s.outTangents[i][0]) + "," + num(s.outTangents[i][1]) + "]");
    }
    parts.push('],"closed":' + (s.closed ? "true" : "false") + "}");
    return parts.join("");
  }
  function isTextDoc(v) {
    try {
      return (
        v !== null &&
        typeof v === "object" &&
        typeof v.text !== "undefined" &&
        typeof v.size !== "undefined"
      );
    } catch (e) {
      return false;
    }
  }
  function textDocJson(d) {
    function col(c) {
      return c === null || typeof c === "undefined"
        ? "null"
        : "[" + num(c[0]) + "," + num(c[1]) + "," + num(c[2]) + "]";
    }
    function arr2(a) {
      return a === null || typeof a === "undefined"
        ? "null"
        : "[" + num(a[0]) + "," + num(a[1]) + "]";
    }
    var just = "";
    try {
      just = d.justification !== undefined ? String(d.justification) : "";
    } catch (e) {}
    return (
      '{"text":' +
      q(safe(() => d.text) || "") +
      ',"font":' +
      q(safe(() => d.font) || "") +
      ',"fontFamily":' +
      q(safe(() => d.fontFamily) || "") +
      ',"fontStyle":' +
      q(safe(() => d.fontStyle) || "") +
      ',"size":' +
      num(safe(() => d.size)) +
      ',"fillColor":' +
      col(safe(() => d.fillColor)) +
      ',"strokeColor":' +
      col(safe(() => d.strokeColor)) +
      ',"strokeWidth":' +
      num(safe(() => d.strokeWidth)) +
      ',"tracking":' +
      num(safe(() => d.tracking)) +
      ',"leading":' +
      num(safe(() => d.leading)) +
      ',"baselineShift":' +
      num(safe(() => d.baselineShift)) +
      ',"horizontalScale":' +
      num(safe(() => d.horizontalScale)) +
      ',"verticalScale":' +
      num(safe(() => d.verticalScale)) +
      ',"applyFill":' +
      (safe(() => d.applyFill) ? "true" : "false") +
      ',"applyStroke":' +
      (safe(() => d.applyStroke) ? "true" : "false") +
      ',"boxText":' +
      (safe(() => d.boxText) ? "true" : "false") +
      ',"boxPosition":' +
      arr2(safe(() => d.boxPosition)) +
      ',"boxSize":' +
      arr2(safe(() => d.boxSize)) +
      ',"justification":' +
      q(just) +
      "}"
    );
  }
  function valueJson(v, depth) {
    depth = depth || 0;
    try {
      return valueJsonUnsafe(v, depth);
    } catch (e) {
      return '"<value-error>"';
    }
  }
  function valueJsonUnsafe(v, depth) {
    if (depth > 6) return "null";
    if (v === null || v === undefined) return "null";
    var t = typeof v;
    if (t === "number") return num(v);
    if (t === "boolean") return v ? "true" : "false";
    if (t === "string") return q(v);
    if (isShape(v)) return shapeJson(v);
    if (isTextDoc(v)) return textDocJson(v);
    if (v instanceof Array) {
      var parts = ["["];
      for (var i = 0; i < v.length; i++) {
        if (i) parts.push(",");
        parts.push(valueJson(v[i], depth + 1));
      }
      parts.push("]");
      return parts.join("");
    }
    // Plain object: copy enumerable own props shallowly.
    var keys = [];
    for (var k in v) {
      try {
        if (Object.hasOwn(v, k)) keys.push(k);
      } catch (e) {}
    }
    if (keys.length === 0) return q(String(v));
    var out = ["{"];
    for (i = 0; i < keys.length; i++) {
      if (i) out.push(",");
      var val;
      try {
        val = v[keys[i]];
      } catch (e) {
        val = undefined;
      }
      out.push(q(keys[i]) + ":" + valueJson(val, depth + 1));
    }
    out.push("}");
    return out.join("");
  }

  // ---- keyframes -----------------------------------------------------------
  function safe(fn) {
    try {
      return fn();
    } catch (e) {
      return undefined;
    }
  }
  function keysJson(prop) {
    var n = safe(() => prop.numKeys) || 0;
    if (!n) return null;
    var parts = ["["];
    for (var i = 1; i <= n; i++) {
      if (i > 1) parts.push(",");
      var entry =
        '{"t":' +
        num(safe(() => prop.keyTime(i))) +
        ',"v":' +
        valueJson(safe(() => prop.keyValue(i))) +
        ',"inT":' +
        valueJson(safe(() => prop.keyInInterpolationType(i))) +
        ',"outT":' +
        valueJson(safe(() => prop.keyOutInterpolationType(i)));
      var easeIn = safe(() => prop.keyInTemporalEase(i));
      var easeOut = safe(() => prop.keyOutTemporalEase(i));
      if (easeIn) entry += ',"inEase":' + valueJson(easeIn);
      if (easeOut) entry += ',"outEase":' + valueJson(easeOut);
      var spIn = safe(() => prop.keyInSpatialTangent(i));
      var spOut = safe(() => prop.keyOutSpatialTangent(i));
      if (spIn) entry += ',"spIn":' + valueJson(spIn);
      if (spOut) entry += ',"spOut":' + valueJson(spOut);
      entry += "}";
      parts.push(entry);
    }
    parts.push("]");
    return parts.join("");
  }

  // ---- property tree -------------------------------------------------------
  var PROP_TYPE = { PROPERTY: 1, INDEXED_PROPERTY: 2, PROPERTY_GROUP: 3 };

  function propJson(p, depth) {
    depth = depth || 0;
    var name = safe(() => p.name) || "";
    var matchName = safe(() => p.matchName) || "";
    var type = safe(() => p.propertyType) || 0;
    var node = '{"name":' + q(name) + ',"matchName":' + q(matchName) + ',"type":' + num(type);

    // AE reports group propertyType values inconsistently across versions
    // (observed 3, 6213, 6214), so decide leaf vs group by numProperties.
    var npEarly = safe(() => p.numProperties) || 0;
    // AE2027 reports leaf propertyType as 6212 and groups as 6213/6214;
    // numProperties===0 is the reliable leaf signal across versions.
    var isLeaf = npEarly === 0;
    if (isLeaf) {
      node +=
        ',"numKeys":' + num(safe(() => p.numKeys)) + ',"value":' + valueJson(safe(() => p.value));
      var keys = keysJson(p);
      if (keys) node += ',"keys":' + keys;
      var ex = safe(() => p.expression);
      if (ex) node += ',"expression":' + q(ex);
      node += "}";
      return node;
    }
    var np = npEarly;
    var attrs = "";
    var attrNames = ["maskMode", "active", "enabled", "propertyIndex", "matchName"];
    for (var a = 0; a < attrNames.length; a++) {
      var av = safe(() => p[attrNames[a]]);
      if (av !== undefined && typeof av !== "object" && typeof av !== "function") {
        attrs += "," + q(attrNames[a]) + ":" + valueJson(av);
      }
    }
    node += attrs + ',"numProperties":' + num(np) + ',"properties":' + "[";
    for (var i = 1; i <= np; i++) {
      if (i > 1) node += ",";
      try {
        node += propJson(
          safe(() => p.property(i)),
          depth + 1,
        );
      } catch (pe) {
        node += errJson(pe);
      }
    }
    node += "]}";
    return node;
    node += "}";
    return node;
  }

  function layerJson(L, index) {
    var name = safe(() => L.name) || "";
    var matchName = safe(() => L.matchName) || "";
    var node =
      '{"index":' +
      num(index) +
      ',"name":' +
      q(name) +
      ',"matchName":' +
      q(matchName) +
      ',"enabled":' +
      (safe(() => L.enabled) ? "true" : "false") +
      ',"shy":' +
      (safe(() => L.shy) ? "true" : "false") +
      ',"guideLayer":' +
      (safe(() => L.guideLayer) ? "true" : "false") +
      ',"nullLayer":' +
      (safe(() => L.nullLayer) ? "true" : "false") +
      ',"inPoint":' +
      num(safe(() => L.inPoint)) +
      ',"outPoint":' +
      num(safe(() => L.outPoint)) +
      ',"startTime":' +
      num(safe(() => L.startTime)) +
      ',"stretch":' +
      num(safe(() => L.stretch)) +
      ',"timeRemapEnabled":' +
      (safe(() => L.timeRemapEnabled) ? "true" : "false") +
      ',"canTimeRemap":' +
      (safe(() => L.canSetTimeRemapEnabled) ? "true" : "false") +
      ',"trackMatteType":' +
      num(safe(() => L.trackMatteType)) +
      ',"isTrackMatte":' +
      (safe(() => L.isTrackMatte) ? "true" : "false") +
      ',"motionBlur":' +
      (safe(() => L.motionBlur) ? "true" : "false") +
      ',"collapseTransformations":' +
      (safe(() => L.collapseTransformations) ? "true" : "false") +
      ',"adjustmentLayer":' +
      (safe(() => L.adjustmentLayer) ? "true" : "false") +
      ',"threeDLayer":' +
      (safe(() => L.threeDLayer) ? "true" : "false") +
      ',"audioEnabled":' +
      (safe(() => L.audioEnabled) ? "true" : "false") +
      ',"hasVideo":' +
      (safe(() => L.hasVideo) ? "true" : "false") +
      ',"hasAudio":' +
      (safe(() => L.hasAudio) ? "true" : "false");

    // source kind
    var srcName = "",
      srcType = "";
    try {
      var src = L.source;
      if (src !== null && src !== undefined) {
        srcName = src.name || "";
        if (src instanceof CompItem) srcType = "comp";
        else if (src instanceof FootageItem) srcType = "footage";
        else srcType = "other";
        if (srcType === "footage") {
          node +=
            ',"src":{"type":"footage","name":' +
            q(srcName) +
            ',"id":' +
            num(safe(() => src.id)) +
            ',"hasVideo":' +
            (src.hasVideo ? "true" : "false") +
            ',"hasAudio":' +
            (src.hasAudio ? "true" : "false") +
            ',"duration":' +
            num(src.duration) +
            ',"frameRate":' +
            num(src.frameRate) +
            ',"fullpath":' +
            q(src.file ? String(src.file.fsName) : "") +
            "}";
        } else if (srcType === "comp") {
          node +=
            ',"src":{"type":"comp","name":' + q(srcName) + ',"id":' + num(safe(() => src.id)) + "}";
        } else {
          node += ',"src":{"type":"other","name":' + q(srcName) + "}";
        }
      }
    } catch (e) {}
    if (srcType === "") node += ',"src":null';

    // parent
    try {
      var par = L.parent;
      if (par) node += ',"parent":' + q(par.name) + ',"parentIndex":' + num(safe(() => par.index));
    } catch (e) {}

    // property groups we care about
    var groups = [
      ["ADBE Transform Group", "transform"],
      ["ADBE Mask Parade", "masks"],
      ["ADBE Effect Parade", "effects"],
      ["ADBE Root Vectors Group", "shapes"],
      ["ADBE Text Properties", "text"],
      ["ADBE Time Remapping", "timeRemap"],
    ];
    for (var g = 0; g < groups.length; g++) {
      try {
        var gp = safe(() => L.property(groups[g][0]));
        if (gp) {
          node += "," + q(groups[g][1]) + ":" + propJson(gp, 1);
        }
      } catch (ge) {
        node += "," + q(groups[g][1]) + ":" + errJson(ge);
      }
    }
    node += "}";
    return node;
  }

  function errJson(e) {
    var parts = '{"__error__":' + q(String(e));
    try {
      if (e.line) parts += ',"__line__":' + num(e.line);
    } catch (e2) {}
    try {
      if (e.description) parts += ',"__desc__":' + q(String(e.description));
    } catch (e3) {}
    return parts + "}";
  }

  function compJson(c) {
    var node =
      '{"name":' +
      q(safe(() => c.name) || "") +
      ',"id":' +
      num(safe(() => c.id)) +
      ',"width":' +
      num(safe(() => c.width)) +
      ',"height":' +
      num(safe(() => c.height)) +
      ',"duration":' +
      num(safe(() => c.duration)) +
      ',"frameRate":' +
      num(safe(() => c.frameRate)) +
      ',"pixelAspect":' +
      num(safe(() => c.pixelAspect)) +
      ',"bgColor":' +
      valueJson(safe(() => c.bgColor)) +
      ',"layers":' +
      "[";
    for (var i = 1; i <= c.numLayers; i++) {
      if (i > 1) node += ",";
      var lj;
      try {
        lj = layerJson(
          safe(() => c.layer(i)),
          i,
        );
      } catch (le) {
        lj = errJson(le);
      }
      node += lj;
    }
    node += "]}";
    return node;
  }

  // ---- items ---------------------------------------------------------------
  function itemJson(it) {
    var type = "unknown";
    if (it instanceof FolderItem) type = "folder";
    else if (it instanceof FootageItem) type = "footage";
    else if (it instanceof CompItem) type = "comp";
    var node =
      '{"type":' +
      q(type) +
      ',"name":' +
      q(safe(() => it.name) || "") +
      ',"id":' +
      num(safe(() => it.id));
    if (type === "folder") {
      node += ',"numItems":' + num(safe(() => it.numItems)) + "}";
    } else if (type === "footage") {
      node +=
        ',"hasVideo":' +
        (it.hasVideo ? "true" : "false") +
        ',"hasAudio":' +
        (it.hasAudio ? "true" : "false") +
        ',"duration":' +
        num(it.duration) +
        ',"frameRate":' +
        num(it.frameRate) +
        ',"width":' +
        num(safe(() => it.width)) +
        ',"height":' +
        num(safe(() => it.height)) +
        ',"fullpath":' +
        q(it.file ? String(it.file.fsName) : "");
      if (!it.file) {
        try {
          var ms = it.mainSource;
          var scol = safe(() => ms.color);
          if (scol !== undefined && scol !== null) {
            node +=
              ',"solid":true,"solidColor":' +
              valueJson(scol) +
              ',"solidWidth":' +
              num(it.width) +
              ',"solidHeight":' +
              num(it.height);
          }
        } catch (se) {}
      }
      node += "}";
    } else if (type === "comp") {
      node +=
        ',"width":' +
        num(it.width) +
        ',"height":' +
        num(it.height) +
        ',"duration":' +
        num(it.duration) +
        ',"frameRate":' +
        num(it.frameRate) +
        "}";
    } else {
      node += "}";
    }
    return node;
  }

  // ---- helpers -------------------------------------------------------------
  function sanitize(name) {
    var bad = '\\/:*?"<>|';
    var s = String(name);
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      out += bad.indexOf(ch) >= 0 || (i === 0 && ch === ".") ? "_" : ch;
    }
    return out;
  }
  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }
  function stamp() {
    var d = new Date();
    return (
      d.getFullYear() +
      "-" +
      pad2(d.getMonth() + 1) +
      "-" +
      pad2(d.getDate()) +
      "T" +
      pad2(d.getHours()) +
      ":" +
      pad2(d.getMinutes()) +
      ":" +
      pad2(d.getSeconds())
    );
  }
  function writeSmall(path, content) {
    var f = new File(path);
    f.encoding = "UTF-8";
    f.open("w");
    f.write(content);
    f.close();
  }

  // ---- main ----------------------------------------------------------------
  var dir = new Folder(OUT_DIR);
  if (!dir.exists) dir.create();

  var opened = false;
  var compCount = 0,
    doneCount = 0,
    skipCount = 0,
    errorCount = 0;
  var manifest = [];
  var progress = new File(OUT_DIR + "/_progress.log");
  progress.encoding = "UTF-8";
  progress.open("a");

  try {
    // app.open() defers the actual project switch until after the script
    // finishes on AE2027, so the caller must open the AEP beforehand and
    // this script verifies it is the active project before dumping.
    var cur = "";
    try {
      cur = app.project.file ? String(app.project.file.fsName) : "";
    } catch (pe) {}
    cur = cur.replace(/\\/g, "/");
    var want = String(AEP_PATH).replace(/\\/g, "/");
    if (cur.toLowerCase() !== want.toLowerCase()) {
      var mf0 = new File(OUT_DIR + "/_fatal.log");
      mf0.open("w");
      mf0.write("wrong project open: " + cur + " (expected " + want + ")");
      mf0.close();
      throw new Error("wrong project open: " + cur);
    }
    opened = true;

    // project items snapshot (small, always rewritten)
    var itemsJson =
      '{"schema":"restro-pv.aep-items.v1","aep":' +
      q(AEP_PATH) +
      ',"dumpedAt":"' +
      stamp() +
      '","project":{"name":' +
      q(app.project.file ? String(app.project.file.fsName) : "") +
      ',"numItems":' +
      num(app.project.numItems) +
      '},"items":[';
    var first = true;
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      if (!first) itemsJson += ",";
      first = false;
      itemsJson += itemJson(it);
    }
    itemsJson += "]}";
    writeSmall(OUT_DIR + "/_items.json", itemsJson);

    // comps, one file each
    for (i = 1; i <= app.project.numItems; i++) {
      it = app.project.item(i);
      if (!(it instanceof CompItem)) continue;
      compCount++;
      var cname = safe(() => it.name) || "comp" + i;
      var base = OUT_DIR + "/" + pad2(compCount) + "-" + sanitize(cname);
      var doneMark = new File(base + ".json.done");
      if (doneMark.exists) {
        skipCount++;
        manifest.push('{"name":' + q(cname) + ',"status":"skipped"}');
        continue;
      }

      var t0 = new Date().getTime();
      var outPath = base + ".json";
      var f = new File(outPath);
      f.encoding = "UTF-8";
      f.open("w");
      out = f;
      var status = "done";
      try {
        w('{"schema":"restro-pv.aep-comp-dump.v1"');
        w(',"aep":' + q(AEP_PATH));
        w(',"compIndex":' + num(compCount));
        var cj;
        try {
          cj = compJson(it);
        } catch (ce) {
          status = "error";
          cj =
            '{"name":' +
            q(cname) +
            ',"__fatal__":' +
            q(String(ce)) +
            ',"__line__":' +
            num(ce.line) +
            "}";
        }
        w(',"comp":' + cj + "}");
        f.close();
        out = null;
        if (status === "done") {
          writeSmall(base + ".json.done", "done");
          doneCount++;
        } else {
          writeSmall(base + ".error", String(new Date().getTime() - t0) + "ms");
          errorCount++;
        }
      } catch (we) {
        try {
          f.close();
        } catch (e2) {}
        out = null;
        status = "error";
        errorCount++;
        writeSmall(base + ".error", "write-failed: " + String(we));
      }
      manifest.push(
        '{"name":' +
          q(cname) +
          ',"status":"' +
          status +
          '","ms":' +
          num(new Date().getTime() - t0) +
          "}",
      );
      progress.write(
        pad2(compCount) +
          " " +
          cname +
          " " +
          status +
          " " +
          num(new Date().getTime() - t0) +
          "ms\n",
      );
    }
    progress.close();

    var m =
      '{"schema":"restro-pv.aep-dump-manifest.v1","aep":' +
      q(AEP_PATH) +
      ',"finishedAt":"' +
      stamp() +
      '","comps":' +
      num(compCount) +
      ',"done":' +
      num(doneCount) +
      ',"skipped":' +
      num(skipCount) +
      ',"errors":' +
      num(errorCount) +
      ',"results":[' +
      manifest.join(",") +
      "]}";
    writeSmall(OUT_DIR + "/_manifest.json", m);
    writeSmall(OUT_DIR + "/_manifest.done", "done");
  } catch (e) {
    try {
      var mf = new File(OUT_DIR + "/_fatal.log");
      mf.open("w");
      mf.write(String(e) + " line=" + e.line);
      mf.close();
    } catch (e2) {}
  }
  // leave the project open: reopening an 85MB AEP costs minutes and
  // app.open() defers the switch until after the calling script ends.
})();

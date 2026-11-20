// Dump the full structure of an AEP to JSON for offline analysis.
//
// Template: __AEP_PATH__ and __OUT_PATH__ are substituted by tools/dump-aep.ts.
// ExtendScript (ES3) only — no let/const/arrow/JSON.
//
// Output schema: restro-pv.aep-dump.v1
(() => {
  var AEP_PATH = "__AEP_PATH__";
  var OUT_PATH = "__OUT_PATH__";

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
        typeof v.font !== "undefined"
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
    var just = "";
    try {
      just = d.justification !== undefined ? String(d.justification) : "";
    } catch (e) {}
    return (
      '{"text":' +
      q(d.text === undefined ? "" : d.text) +
      ',"font":' +
      q(d.font === undefined ? "" : d.font) +
      ',"fontFamily":' +
      q(d.fontFamily === undefined ? "" : d.fontFamily) +
      ',"fontStyle":' +
      q(d.fontStyle === undefined ? "" : d.fontStyle) +
      ',"size":' +
      num(d.size) +
      ',"fillColor":' +
      col(d.fillColor) +
      ',"strokeColor":' +
      col(d.strokeColor) +
      ',"strokeWidth":' +
      num(d.strokeWidth) +
      ',"tracking":' +
      num(d.tracking) +
      ',"leading":' +
      num(d.leading) +
      ',"baselineShift":' +
      num(d.baselineShift) +
      ',"horizontalScale":' +
      num(d.horizontalScale) +
      ',"verticalScale":' +
      num(d.verticalScale) +
      ',"applyFill":' +
      (d.applyFill ? "true" : "false") +
      ',"applyStroke":' +
      (d.applyStroke ? "true" : "false") +
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
    var isLeaf =
      (type === PROP_TYPE.PROPERTY || type === PROP_TYPE.INDEXED_PROPERTY) && npEarly === 0;
    if (isLeaf) {
      node +=
        ',"numKeys":' + num(safe(() => p.numKeys)) + ',"value":' + valueJson(safe(() => p.value));
      var keys = keysJson(p);
      if (keys) node += ',"keys":' + keys;
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
      (safe(() => L.canSetTimeRemapEnabled) ? "true" : "false");

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
          node += ',"src":{"type":"comp","name":' + q(srcName) + "}";
        } else {
          node += ',"src":{"type":"other","name":' + q(srcName) + "}";
        }
      }
    } catch (e) {}
    if (srcType === "") node += ',"src":null';

    // parent
    try {
      var par = L.parent;
      if (par) node += ',"parent":' + q(par.name);
    } catch (e) {}

    // property groups we care about
    var groups = [
      ["ADBE Transform Group", "transform"],
      ["ADBE Mask Parade", "masks"],
      ["ADBE Effect Parade", "effects"],
      ["ADBE Root Vectors Group", "shapes"],
      ["ADBE Text Properties", "text"],
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
      if (i % 10 === 0) {
        w(node);
        node = "";
      }
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
        ',"fullpath":' +
        q(it.file ? String(it.file.fsName) : "") +
        "}";
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

  // ---- main ----------------------------------------------------------------
  var f = new File(OUT_PATH);
  f.encoding = "UTF-8";
  f.open("w");
  out = f;
  var opened = false;
  try {
    ws('{"schema":"restro-pv.aep-dump.v1"');
    ws(',"aep":' + q(AEP_PATH));
    var now = new Date();
    function pad(n) {
      return (n < 10 ? "0" : "") + n;
    }
    ws(
      ',"dumpedAt":"' +
        now.getFullYear() +
        "-" +
        pad(now.getMonth() + 1) +
        "-" +
        pad(now.getDate()) +
        "T" +
        pad(now.getHours()) +
        ":" +
        pad(now.getMinutes()) +
        ":" +
        pad(now.getSeconds()) +
        '"',
    );
    try {
      ws(',"appVersion":' + q(app.version));
    } catch (e) {}

    var target = new File(AEP_PATH);
    app.open(target);
    opened = true;

    ws(
      ',"project":{"name":' +
        q(app.project.file ? String(app.project.file.fsName) : "") +
        ',"numItems":' +
        num(app.project.numItems) +
        "}",
    );

    // items list
    w(',"items":' + "[");
    var first = true;
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      if (!first) w(",");
      first = false;
      w(itemJson(it));
    }
    w('],"comps":' + "[");

    // comps
    first = true;
    for (i = 1; i <= app.project.numItems; i++) {
      it = app.project.item(i);
      if (!(it instanceof CompItem)) continue;
      if (!first) w(",");
      first = false;
      var cj;
      try {
        cj = compJson(it);
      } catch (ce) {
        cj = '{"name":' + q(safe(() => it.name) || "") + "," + errJson(ce).slice(1);
      }
      w(cj);
    }
    w("]}");
  } catch (e) {
    try {
      w(',"__fatal__":' + q(String(e)) + ',"__line__":' + num(e.line));
    } catch (e2) {}
  }
  try {
    if (opened) app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
  } catch (e) {}
  f.close();
  // marker file so the runner knows the script finished (even on error above,
  // the JSON contains __error__)
  var d = new File(OUT_PATH + ".done");
  d.open("w");
  d.write("done");
  d.close();
})();

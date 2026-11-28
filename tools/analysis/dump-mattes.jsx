// Dump track-matte pairings for every comp in an AEP (AE 23+ selectable
// mattes). Template: __AEP_PATH__ / __OUT_PATH__ substituted by caller.
// ExtendScript (ES3) only.
(() => {
  var AEP_PATH = "__AEP_PATH__";
  var OUT_PATH = "__OUT_PATH__";
  var out = null;
  function esc(s) {
    return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }
  function q(s) { return '"' + esc(s) + '"'; }

  app.open(new File(AEP_PATH));
  var proj = app.project;
  out = new File(OUT_PATH);
  out.open("w");
  out.write('{"schema":"restro-pv.aep-mattes.v1","comps":[\n');
  var first = true;
  for (var ci = 1; ci <= proj.numItems; ci++) {
    var item = proj.item(ci);
    if (!(item instanceof CompItem)) continue;
    if (!first) out.write(",\n");
    first = false;
    out.write('{"name":' + q(item.name) + ',"layers":[');
    var lf = true;
    for (var li = 1; li <= item.numLayers; li++) {
      var L = item.layer(li);
      var tm = null;
      try { tm = L.trackMatteType; } catch (e) {}
      var isTM = false;
      try { isTM = !!L.isTrackMatte; } catch (e2) {}
      if ((tm === null || tm === 5012) && !isTM) continue;
      var matteName = null, matteIndex = null;
      try {
        var ml = L.trackMatteLayer;
        if (ml) { matteName = ml.name; matteIndex = ml.index; }
      } catch (e3) {}
      if (!lf) out.write(",");
      lf = false;
      out.write(
        '{"index":' + li + ',"name":' + q(L.name) +
        ',"trackMatteType":' + (tm === null ? "null" : String(tm)) +
        ',"isTrackMatte":' + (isTM ? "true" : "false") +
        ',"matteIndex":' + (matteIndex === null ? "null" : String(matteIndex)) +
        ',"matteName":' + (matteName === null ? "null" : q(matteName)) + "}"
      );
    }
    out.write("]}");
  }
  out.write("]}\n");
  out.close();
  var done = new File(OUT_PATH + ".done");
  done.open("w");
  done.write("ok");
  done.close();
})();

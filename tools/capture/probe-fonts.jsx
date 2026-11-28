// FONT PROBE v2 — enumerate the fonts AE actually has and test which
// spellings it accepts.
//
//   app.fonts is a Fonts collection; each Font has .name (display name),
//   .postScriptName, .family and .style. This script logs every family
//   whose display name looks Japanese (Kyokasho / Mincho / Gothic / kanji)
//   plus a test of a list of candidate spellings.
//
// ExtendScript has no JSON object, so the report is written by hand.
(function () {
  var ROOT = "C:/Users/rebui/Desktop/restro-pv-23";
  var REPORT = ROOT + "/.tmp/rec-newmat/fonts.json";
  var CANDIDATES = [
    "UD Digi Kyokasho N", "UD Digi Kyokasho NK-R", "UD Digi Kyokasho N-R",
    "UD Digi Kyokasho N-B", "UD Digi Kyokasho NK-B",
    "UD デジタル 教科書体 N", "UD デジタル教科書体 N", "UD デジタル 教科書体 N-B",
    "MS Mincho", "MSMincho", "MS-Mincho", "MS Mincho Regular", "MS 明朝", "ＭＳ 明朝",
    "BIZ UDMincho", "BIZUDMincho", "BIZ-UDMincho", "BIZ UDMincho M",
    "BIZ UDMincho Medium", "BIZ UD明朝", "BIZ 明朝",
    "MS Gothic", "MSGothic", "MS-Gothic", "MS Gothic Regular", "MS ゴシック", "ＭＳ ゴシック",
    "Meiryo", "Meiryo UI", "メイリオ",
    "Yu Gothic", "YuGothic", "Yu Gothic Regular", "Yu Gothic Medium", "Yu Gothic UI", "游ゴシック",
    "Noto Sans JP", "NotoSansJP", "Hiragino Mincho ProN",
    "Source Han Serif", "IPAexMincho", "IPAGothic", "Arial Unicode MS",
    // Noto Sans JP faces (the existing 筆/解 gallery material uses the Medium face)
    "NotoSansJP-Medium", "NotoSansJP-Regular", "NotoSansJP-Bold",
    "NotoSansJP-Thin", "NotoSansJP-Light", "NotoSansJP-SemiBold",
    "NotoSansJP-Black", "NotoSansJP-ExtraLight", "NotoSansJP-MediumItalic",
    // UD Digi Kyokasho (教科書体) spellings
    "UD Digi Kyokasho NK-R", "UD Digi Kyokasho NK-B",
    "UD デジタル 教科書体 NK-R", "UD デジタル 教科書体 NK-B",
    "UD デジタル 教科書体 N-R", "UD デジタル 教科書体 N-B",
    "UD Digi Kyokasho", "UD Digi Kyokasho NK",
    // calligraphy-ish faces that might be installed
    "HGS行書体", "HGP行書体", "HGS教科書体", "HGP教科書体", "Klee One", "KleeOne"
  ];

  function jstr(s) {
    s = String(s);
    var out = '"';
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      var code = s.charCodeAt(i);
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

  var fonts = [];
  var tests = [];
  try {
    var all = app.fonts;
    for (var i = 1; i <= all.length; i++) {
      var f = all[i];
      var nm = "", ps = "", fam = "", sty = "";
      try { nm = String(f.name); } catch (e) {}
      try { ps = String(f.postScriptName); } catch (e) {}
      try { fam = String(f.family); } catch (e) {}
      try { sty = String(f.style); } catch (e) {}
      fonts.push(nm + " | ps=" + ps + " | family=" + fam + " | style=" + sty);
    }
  } catch (e) {
    fonts.push("ENUM_FAIL " + String(e));
  }

  try {
    var comp = app.project.items.addComp("FONTTEST", 320, 320, 1.0, 1.0, 24);
    var tl = comp.layers.addText("龍無");
    var std = tl.property("ADBE Text Properties").property("ADBE Text Document");
    for (var c = 0; c < CANDIDATES.length; c++) {
      var name = CANDIDATES[c];
      var applied = "", err = "";
      try {
        var doc = std.value;
        doc.font = name;
        std.setValue(doc);
        applied = String(std.value.font);
      } catch (e) {
        err = String(e && e.message ? e.message : e);
        try { applied = String(std.value.font); } catch (x) {}
      }
      tests.push(name + " => applied=" + applied + (err ? (" ERR=" + err) : ""));
    }
    try { comp.remove(); } catch (e) {}
  } catch (e) {
    tests.push("FATAL " + String(e));
  }

  var body = '{"fonts":' + jarr(fonts) + ',"tests":' + jarr(tests) + "}";
  var f = new File(REPORT);
  f.encoding = "UTF-8";
  f.open("w");
  f.write(body);
  f.close();
  var d = new File(REPORT + ".done");
  d.open("w");
  d.write("done");
  d.close();
})();

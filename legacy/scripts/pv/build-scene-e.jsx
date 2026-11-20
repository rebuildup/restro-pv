// Scene E build: PV end — a recap of the three scenes, the restored 筆, then
// the product card. Run through run_jsx scriptPath. Idempotent.
//
// E occupies master frames [371,480) = 15.46..20.00 s.
//   0.00..0.90 s : three small recap panels in the right zone (B / C / D)
//   0.90..2.40 s : the restored 筆 (the project's own real Restro output)
//   2.40..4.54 s : product card — Restro / 筆画復元 / After Effects プラグイン
//                  / BOOTHで販売中 / the BOOTH URL
(function () {
  var DUR = 4.54;
  var FONT = 'KozGoPr6N-Regular';
  var FONTB = 'KozGoPr6N-Bold';
  var INK = [0.10, 0.10, 0.12];
  var GREY = [0.42, 0.42, 0.45];
  var CX = 780;             // product card centre, right zone

  function byName(name) {
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      if (it instanceof CompItem && it.name === name) return it;
    }
    return null;
  }
  function prop(L, m) { return L.property('ADBE Transform Group').property(m); }
  function clearKeys(p) { while (p.numKeys > 0) p.removeKey(1); }
  function text(comp, str, size, font, pos, color, t0, t1) {
    var L = comp.layers.addText(str);
    var td = L.property('ADBE Text Properties').property('ADBE Text Document').value;
    td.fontSize = size;
    td.font = font;
    if (color) td.fillColor = color;
    L.property('ADBE Text Properties').property('ADBE Text Document').setValue(td);
    prop(L, 'ADBE Position').setValue([pos[0], pos[1], 0]);
    L.startTime = t0; L.inPoint = t0; L.outPoint = t1;
    // Centre-justify through the tool path: writing justification into the
    // TextDocument lands as RIGHT on this host, so it is applied separately.
    OPS.set_text({ compId: comp.id, layerId: L.id, justification: 'center' });
    return L;
  }

  var comp = getOrMake('PV end', 1080, 1080, DUR);

  // ---- the restored 筆 --------------------------------------------------
  // `PV glyph` is the project's own real Restro output (see build-glyph.jsx):
  // the character sits at (946,645) inside its 1400x1080 comp. A nested layer
  // with AE's default anchor (700,540) maps that centre to
  // position + (246,105) * scale.
  var glyph = byName('PV glyph');
  if (!glyph) throw 'missing PV glyph';
  var GS = 0.78;
  var CHAR_C = [CX, 450];
  var GPOS = [CHAR_C[0] - 246 * GS, CHAR_C[1] - 105 * GS];

  var gl = comp.layers.add(glyph);
  gl.name = 'restored character';
  prop(gl, 'ADBE Scale').setValue([GS * 100, GS * 100, 100]);
  prop(gl, 'ADBE Position').setValue([GPOS[0], GPOS[1], 0]);
  gl.startTime = 0; gl.inPoint = 0; gl.outPoint = DUR;
  var gop = prop(gl, 'ADBE Opacity'); clearKeys(gop);
  gop.setValueAtTime(0, 0);
  gop.setValueAtTime(0.90, 0);
  gop.setValueAtTime(1.25, 100);
  gop.setValueAtTime(2.15, 100);
  gop.setValueAtTime(2.40, 0);
  gop.setValueAtTime(DUR, 0);
  var gpos = prop(gl, 'ADBE Position'); clearKeys(gpos);
  gpos.setValueAtTime(0, [GPOS[0], GPOS[1] + 40, 0]);
  gpos.setValueAtTime(0.90, [GPOS[0], GPOS[1] + 40, 0]);
  gpos.setValueAtTime(1.45, [GPOS[0], GPOS[1], 0]);
  gpos.setValueAtTime(2.15, [GPOS[0], GPOS[1], 0]);
  gpos.setValueAtTime(DUR, [GPOS[0], GPOS[1], 0]);

  // ---- recap panels (0.00..0.90 s) -------------------------------------
  var tiles = [
    { comp: byName('STEP3 draft'), x: 560, y: 300 },
    { comp: byName('PV reel C'), x: 780, y: 300 },
    { comp: byName('PV ops'), x: 990, y: 300 }
  ];
  for (var t = 0; t < tiles.length; t++) {
    var c = tiles[t].comp;
    if (!c) continue;
    var card = comp.layers.addShape();
    card.name = 'recap card ' + (t + 1);
    var g = card.property('ADBE Root Vectors Group').addProperty('ADBE Vector Group');
    var gv = g.property('ADBE Vectors Group');
    var rr = gv.addProperty('ADBE Vector Shape - Rect');
    rr.property('ADBE Vector Rect Size').setValue([170, 180]);
    rr.property('ADBE Vector Rect Position').setValue([85, 90]);
    var ff = gv.addProperty('ADBE Vector Graphic - Fill');
    ff.property('ADBE Vector Fill Color').setValue([1, 1, 1]);
    var st2 = gv.addProperty('ADBE Vector Graphic - Stroke');
    st2.property('ADBE Vector Stroke Color').setValue(INK);
    st2.property('ADBE Vector Stroke Width').setValue(2);
    prop(card, 'ADBE Position').setValue([tiles[t].x - 85, tiles[t].y - 90, 0]);
    var vl = comp.layers.add(c);
    vl.name = 'recap ' + c.name;
    var s = (170 / c.width) * 100;
    prop(vl, 'ADBE Scale').setValue([s, s, 100]);
    prop(vl, 'ADBE Position').setValue([tiles[t].x, tiles[t].y, 0]);
    vl.startTime = -1.0;           // show the middle of each scene
    vl.inPoint = 0; vl.outPoint = 0.95;
    var cop = prop(vl, 'ADBE Opacity'); clearKeys(cop);
    cop.setValueAtTime(0, 0); cop.setValueAtTime(0.05 + t * 0.06, 100);
    cop.setValueAtTime(0.72, 100); cop.setValueAtTime(0.95, 0);
    var cpop = prop(card, 'ADBE Opacity'); clearKeys(cpop);
    cpop.setValueAtTime(0, 0); cpop.setValueAtTime(0.05 + t * 0.06, 100);
    cpop.setValueAtTime(0.72, 100); cpop.setValueAtTime(0.95, 0);
    card.startTime = 0; card.inPoint = 0; card.outPoint = 1.0;
  }

  // ---- product card (2.40..4.54 s) -------------------------------------
  var cardBg = comp.layers.addShape();
  cardBg.name = 'product card';
  var cg = cardBg.property('ADBE Root Vectors Group').addProperty('ADBE Vector Group');
  var cgv = cg.property('ADBE Vectors Group');
  var cr = cgv.addProperty('ADBE Vector Shape - Rect');
  cr.property('ADBE Vector Rect Size').setValue([560, 500]);
  cr.property('ADBE Vector Rect Position').setValue([280, 250]);
  var cst = cgv.addProperty('ADBE Vector Graphic - Stroke');
  cst.property('ADBE Vector Stroke Color').setValue(INK);
  cst.property('ADBE Vector Stroke Width').setValue(3);
  prop(cardBg, 'ADBE Position').setValue([CX - 280, 200, 0]);
  cardBg.startTime = 2.40; cardBg.inPoint = 2.40; cardBg.outPoint = DUR;
  var cbgop = prop(cardBg, 'ADBE Opacity'); clearKeys(cbgop);
  cbgop.setValueAtTime(2.40, 0); cbgop.setValueAtTime(2.70, 100); cbgop.setValueAtTime(DUR, 100);

  text(comp, 'Restro', 82, FONTB, [CX, 310], INK, 2.50, DUR);
  text(comp, '筆画復元', 36, FONTB, [CX, 388], INK, 2.58, DUR);
  text(comp, 'After Effects プラグイン', 20, FONT, [CX, 442], GREY, 2.66, DUR);
  text(comp, 'BOOTHで販売中', 32, FONTB, [CX, 578], INK, 2.76, DUR);
  text(comp, '361do.booth.pm/items/9029239', 23, FONT, [CX, 630], GREY, 2.84, DUR);

  // divider line
  var div = comp.layers.addShape();
  div.name = 'divider';
  var dg2 = div.property('ADBE Root Vectors Group').addProperty('ADBE Vector Group');
  var dgv = dg2.property('ADBE Vectors Group');
  var dr = dgv.addProperty('ADBE Vector Shape - Rect');
  dr.property('ADBE Vector Rect Size').setValue([440, 2]);
  dr.property('ADBE Vector Rect Position').setValue([210, 1]);
  var df = dgv.addProperty('ADBE Vector Graphic - Fill');
  df.property('ADBE Vector Fill Color').setValue([0.72, 0.72, 0.74]);
  prop(div, 'ADBE Position').setValue([CX - 210, 500, 0]);
  div.startTime = 2.70; div.inPoint = 2.70; div.outPoint = DUR;
  var dgop = prop(div, 'ADBE Opacity'); clearKeys(dgop);
  dgop.setValueAtTime(2.70, 0); dgop.setValueAtTime(3.00, 100); dgop.setValueAtTime(DUR, 100);

  // the labels fade in with the card rather than popping
  for (var i = 1; i <= comp.numLayers; i++) {
    var L = comp.layer(i);
    if (L.matchName !== 'ADBE Text Layer') continue;
    var op = prop(L, 'ADBE Opacity');
    var tStart = L.inPoint;
    clearKeys(op);
    op.setValueAtTime(tStart, 0);
    op.setValueAtTime(tStart + 0.18, 100);
    op.setValueAtTime(DUR, 100);
  }

  var f = new File('C:/Users/rebui/Desktop/Ae_Restro/.tmp/rec-eval/scene-e.txt');
  f.encoding = 'UTF-8';
  f.open('w');
  f.write('layers=' + comp.numLayers + ' dur=' + comp.duration);
  f.close();
})();

function getOrMake(name, w, h, dur) {
  var c = null;
  for (var i = 1; i <= app.project.numItems; i++) {
    var it = app.project.item(i);
    if (it instanceof CompItem && it.name === name) { c = it; break; }
  }
  if (!c) return app.project.items.addComp(name, w, h, 1, dur, 24);
  for (var i = c.numLayers; i >= 1; i--) c.layer(i).remove();
  try { c.width = w; c.height = h; c.duration = dur; } catch (e) {}
  return c;
}

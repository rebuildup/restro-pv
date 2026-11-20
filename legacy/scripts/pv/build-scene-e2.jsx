// Scene E rebuild: ending that continues the stroke motion instead of a
// recap-tile + product-card grid.
//
// `PV end` (1080x1080, 4.54 s): the restored 筆 (own `PV glyph EE` duplicate)
// drifts gently on the right — the same ink language as C — while the product
// name, function line and BOOTH call-to-action assemble as plain typography
// on the left. No cards, no tiles, no recap thumbnails.
//
// Run through run_jsx scriptPath. Idempotent.
(function () {
  var DUR = 4.54;
  var FONT = 'KozGoPr6N-Regular';
  var FONTB = 'KozGoPr6N-Bold';
  var INK = [0.10, 0.10, 0.12];
  var GREY = [0.40, 0.40, 0.44];

  function byName(name) {
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      if (it instanceof CompItem && it.name === name) return it;
    }
    return null;
  }
  function prop(L, m) { return L.property('ADBE Transform Group').property(m); }
  function clearKeys(p) { while (p.numKeys > 0) p.removeKey(1); }
  function strokeNum(name) {
    var m = name.match(/FUDE S(\d+)/);
    return m ? parseInt(m[1], 10) : -1;
  }
  function addText(comp, str, size, font, pos, color, t0) {
    var tl = comp.layers.addText(str);
    var td = tl.property('ADBE Text Properties').property('ADBE Text Document').value;
    td.fontSize = size; td.font = font; td.fillColor = color;
    tl.property('ADBE Text Properties').property('ADBE Text Document').setValue(td);
    var j = tl.property('ADBE Text Properties').property('ADBE Text Document');
    try {
      var td2 = j.value; td2.justification = ParagraphJustification.CENTER_JUSTIFY;
      j.setValue(td2);
    } catch (e) {}
    prop(tl, 'ADBE Position').setValue([pos[0], pos[1], 0]);
    tl.startTime = t0; tl.inPoint = t0; tl.outPoint = DUR;
    var op = prop(tl, 'ADBE Opacity'); clearKeys(op);
    op.setValueAtTime(t0, 0); op.setValueAtTime(t0 + 0.35, 100); op.setValueAtTime(DUR, 100);
    return tl;
  }

  // ---- PV glyph EE: gentle final drift ------------------------------------
  var src = byName('PV glyph');
  if (!src) throw 'missing PV glyph';
  var g = byName('PV glyph EE');
  if (g) g.remove();
  g = src.duplicate();
  g.name = 'PV glyph EE';
  try { g.duration = DUR; } catch (e) {}
  var strokes = [];
  for (var i = 1; i <= g.numLayers; i++) {
    var L = g.layer(i);
    if (strokeNum(L.name) > 0) strokes.push(L);
  }
  strokes.sort(function (a, b) { return strokeNum(a.name) - strokeNum(b.name); });
  for (var i = 0; i < strokes.length; i++) {
    var L = strokes[i];
    var op = prop(L, 'ADBE Opacity'); clearKeys(op);
    op.setValueAtTime(0, 100); op.setValueAtTime(DUR, 100);
    var ps = prop(L, 'ADBE Position'); clearKeys(ps);
    var base = ps.value.slice(0, 2);
    var ang = i * 2.39996 + 1.1;
    var amp = 10 + (i % 3) * 5;
    var dx = Math.cos(ang) * amp, dy = Math.sin(ang) * amp * 0.6;
    ps.setValueAtTime(0, [base[0], base[1], 0]);
    ps.setValueAtTime(1.4, [base[0] + dx, base[1] + dy, 0]);
    ps.setValueAtTime(2.8, [base[0] - dx * 0.5, base[1] - dy * 0.5, 0]);
    ps.setValueAtTime(DUR, [base[0], base[1], 0]);
  }

  // ---- PV end --------------------------------------------------------------
  var e = byName('PV end');
  if (e) { for (var i = e.numLayers; i >= 1; i--) e.layer(i).remove(); }
  else e = app.project.items.addComp('PV end', 1080, 1080, 1, DUR, 24);
  try { e.duration = DUR; } catch (err) {}

  // glyph: enters from below like the scroll releasing, settles right side
  var gl = e.layers.add(g);
  gl.name = 'restored character';
  var gs = 1.05;
  prop(gl, 'ADBE Scale').setValue([gs * 100, gs * 100, 100]);
  var gpos = [800 - 246 * gs, 560 - 105 * gs];
  prop(gl, 'ADBE Position').setValue([gpos[0], gpos[1], 0]);
  var gp = prop(gl, 'ADBE Position'); clearKeys(gp);
  gp.setValueAtTime(0, [gpos[0], gpos[1] + 160, 0]);
  gp.setValueAtTime(0.9, [gpos[0], gpos[1] + 160, 0]);
  gp.setValueAtTime(1.7, [gpos[0], gpos[1], 0]);
  gp.setValueAtTime(DUR, [gpos[0], gpos[1], 0]);
  var gop = prop(gl, 'ADBE Opacity'); clearKeys(gop);
  gop.setValueAtTime(0, 0); gop.setValueAtTime(0.25, 100); gop.setValueAtTime(DUR, 100);
  gl.startTime = 0; gl.inPoint = 0; gl.outPoint = DUR;

  // thin accent rule that draws left->right as the title lands
  var rule = e.layers.addShape();
  rule.name = 'accent rule';
  var rg = rule.property('ADBE Root Vectors Group').addProperty('ADBE Vector Group');
  var rv = rg.property('ADBE Vectors Group');
  var rr = rv.addProperty('ADBE Vector Shape - Rect');
  rr.property('ADBE Vector Rect Size').setValue([120, 6]);
  rr.property('ADBE Vector Rect Position').setValue([60, 3]);
  var rf = rv.addProperty('ADBE Vector Graphic - Fill');
  rf.property('ADBE Vector Fill Color').setValue(INK);
  prop(rule, 'ADBE Position').setValue([120, 300, 0]);
  rule.startTime = 0.55; rule.inPoint = 0.55; rule.outPoint = DUR;
  var rop = prop(rule, 'ADBE Opacity'); clearKeys(rop);
  rop.setValueAtTime(0.55, 0); rop.setValueAtTime(0.85, 100); rop.setValueAtTime(DUR, 100);
  var rs = prop(rule, 'ADBE Scale'); clearKeys(rs);
  rs.setValueAtTime(0.55, [0, 100, 100]); rs.setValueAtTime(1.1, [100, 100, 100]); rs.setValueAtTime(DUR, [100, 100, 100]);

  // typography: name -> function -> store, staggered, left column
  addText(e, 'Restro', 96, FONTB, [120, 420], INK, 0.70);
  addText(e, '筆画復元', 40, FONTB, [124, 486], INK, 0.95);
  addText(e, 'After Effects プラグイン', 24, FONT, [124, 532], GREY, 1.15);
  addText(e, 'BOOTHで販売中', 34, FONTB, [124, 640], INK, 1.55);
  addText(e, '361do.booth.pm/items/9029239', 22, FONT, [124, 690], GREY, 1.80);
  addText(e, 'Stroke Reconstruction for After Effects', 20, FONT, [124, 736], GREY, 2.00);

  var f = new File('C:/Users/rebui/Desktop/Ae_Restro/.tmp/rec-eval/scene-e2.txt');
  f.encoding = 'UTF-8'; f.open('w'); f.write('PV end rebuilt dur=' + DUR); f.close();
})();

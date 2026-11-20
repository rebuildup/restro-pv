// A2 rebuild: Restro stroke reconstruction as actual shape + motion.
//
// `PV A2` (1080x1080, 2.3 s) shows the restored 筆 being rebuilt from its
// connected outline: the fused contour reads first, then the thirteen FUDE
// strokes settle into place one by one in writing order while the outline
// analysis layers fade out. Stroke animation lives inside a dedicated
// `PV glyph A2` comp duplicate (comp duplication preserves paths; copyToComp
// does not). Placed on master over [1.50,3.80] above kai-zoom.
//
// Run through run_jsx scriptPath. Idempotent.
(function () {
  var DUR = 2.30;
  var INK = [0.10, 0.10, 0.12];

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

  // ---- PV glyph A2: fused outline -> strokes assemble ----------------------
  var src = byName('PV glyph');
  if (!src) throw 'missing PV glyph';
  var g = byName('PV glyph A2');
  if (g) g.remove();
  g = src.duplicate();
  g.name = 'PV glyph A2';
  try { g.duration = DUR; } catch (e) {}

  // collect strokes in writing order
  var strokes = [];
  for (var i = 1; i <= g.numLayers; i++) {
    var L = g.layer(i);
    if (strokeNum(L.name) > 0) strokes.push(L);
  }
  strokes.sort(function (a, b) { return strokeNum(a.name) - strokeNum(b.name); });

  // fused outline: visible at start, dissolves as strokes take over
  for (var i = 1; i <= g.numLayers; i++) {
    var L = g.layer(i);
    if (L.name.indexOf('FUDE outline') !== 0) continue;
    var op = prop(L, 'ADBE Opacity'); clearKeys(op);
    op.setValueAtTime(0, 100);
    op.setValueAtTime(0.55, 100);
    op.setValueAtTime(1.45, 0);
    op.setValueAtTime(DUR, 0);
  }

  // strokes: hidden until their turn, then fade in while drifting from a
  // shared offset toward their true position (the "reconstruction" gather)
  for (var i = 0; i < strokes.length; i++) {
    var L = strokes[i];
    var t0 = 0.30 + i * 0.085;
    var op = prop(L, 'ADBE Opacity'); clearKeys(op);
    op.setValueAtTime(0, 0);
    op.setValueAtTime(t0, 0);
    op.setValueAtTime(t0 + 0.30, 100);
    op.setValueAtTime(DUR, 100);
    var ps = prop(L, 'ADBE Position'); clearKeys(ps);
    var base = ps.value.slice(0, 2);
    // drift in from upper-left-ish, direction varies per stroke index
    var ang = i * 2.39996 + 2.0;
    var amp = 60 + (i % 4) * 18;
    var dx = Math.cos(ang) * amp * 0.4, dy = Math.sin(ang) * amp * 0.4 - 30;
    ps.setValueAtTime(0, [base[0] + dx, base[1] + dy, 0]);
    ps.setValueAtTime(t0, [base[0] + dx, base[1] + dy, 0]);
    ps.setValueAtTime(t0 + 0.42, [base[0], base[1], 0]);
    ps.setValueAtTime(DUR, [base[0], base[1], 0]);
  }

  // ---- PV A2 scene comp ----------------------------------------------------
  var a2 = byName('PV A2');
  if (a2) { for (var i = a2.numLayers; i >= 1; i--) a2.layer(i).remove(); }
  else a2 = app.project.items.addComp('PV A2', 1080, 1080, 1, DUR, 24);
  try { a2.duration = DUR; } catch (e) {}

  var gl = a2.layers.add(g);
  gl.name = 'reconstruction';
  // char centre (946,645), anchor (700,540): scale ~1.02 so the glyph fills
  // the right two-thirds like the neighbouring scenes
  var gs = 1.02;
  prop(gl, 'ADBE Scale').setValue([gs * 100, gs * 100, 100]);
  var gpos = [760 - 246 * gs, 560 - 105 * gs];
  prop(gl, 'ADBE Position').setValue([gpos[0], gpos[1], 0]);
  // slow settle: slight zoom-out + drift for life
  var gsc = prop(gl, 'ADBE Scale'); clearKeys(gsc);
  gsc.setValueAtTime(0, [gs * 106, gs * 106, 100]);
  gsc.setValueAtTime(DUR, [gs * 100, gs * 100, 100]);
  var gposP = prop(gl, 'ADBE Position'); clearKeys(gposP);
  gposP.setValueAtTime(0, [gpos[0] + 30, gpos[1] - 14, 0]);
  gposP.setValueAtTime(DUR, [gpos[0], gpos[1], 0]);
  gl.startTime = 0; gl.inPoint = 0; gl.outPoint = DUR;

  // ---- wire into master over [1.50, 3.80] ----------------------------------
  var master = byName('master');
  for (var i = master.numLayers; i >= 1; i--) {
    if (master.layer(i).name === 'PV A2') master.layer(i).remove();
  }
  var L = master.layers.add(a2);
  L.name = 'PV A2';
  L.startTime = 1.50; L.inPoint = 1.50; L.outPoint = 3.80;
  prop(L, 'ADBE Position').setValue([540, 540, 0]);
  prop(L, 'ADBE Scale').setValue([100, 100, 100]);
  // above kai-zoom/bunkai but below description/brand column
  var anchorLayer = null;
  for (var i = 1; i <= master.numLayers; i++) {
    if (master.layer(i).name === 'description') { anchorLayer = master.layer(i); break; }
  }
  if (anchorLayer) L.moveAfter(anchorLayer);

  var f = new File('C:/Users/rebui/Desktop/Ae_Restro/.tmp/rec-eval/a2.txt');
  f.encoding = 'UTF-8'; f.open('w');
  f.write('PV A2 built dur=' + DUR);
  f.close();
})();

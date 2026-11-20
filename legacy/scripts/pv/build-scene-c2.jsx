// Scene C rebuild v2: three genuinely different works inside the vertical
// scroll window, each animated at the individual Restro stroke level.
//
// copyToComp destroys stroke paths, but duplicating the `PV glyph` comp keeps
// the whole 16-layer rig intact, and each `FUDE S*` layer inside is an
// independent shape layer we can keyframe directly (opacity / position /
// scale). Verified: Trim Paths can be added to a stroke's Contents group, but
// draw-on is not relied on — staggered opacity + settle reads as writing order
// and cannot break on closed filled paths.
//
// Works (arrive times match the existing scroll):
//   A [0.00] 書き順に一画ずつ — strokes fade in S01->S13 with a small settle.
//   B [1.35] 筆画ごとに異なる動き — every stroke drifts on its own vector.
//   C [2.70] 一画の形を変えて変形 — hero strokes scale non-uniformly.
//
// Run through run_jsx scriptPath. Idempotent.
(function () {
  var DUR = 3.75;
  var WORK = 1080;
  var WIN = { x: 480, y: 60, w: 600, h: 960 };
  var FONT = 'KozGoPr6N-Regular';
  var INK = [0.10, 0.10, 0.12];
  var GREY = [0.42, 0.42, 0.45];
  var ORDER = ['S01','S02','S03','S04','S05','S06','S07','S08','S09','S10','S11','S12','S13'];

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
  function fudeLayers(c) {
    var a = [];
    for (var i = 1; i <= c.numLayers; i++) {
      var L = c.layer(i);
      if (strokeNum(L.name) > 0) a.push(L);
    }
    a.sort(function (x, y) { return strokeNum(x.name) - strokeNum(y.name); });
    return a;
  }

  // ---- per-work glyph rigs -------------------------------------------------
  // Each work gets its own duplicate of `PV glyph` so stroke animation in one
  // never leaks into the others. Animation is baked on the comp-local timeline
  // and offset by the work's `arrive` time.
  var SPECS = [
    { glyph: 'PV glyph WA', work: 'PV work A', arrive: 0.00, mode: 'order' },
    { glyph: 'PV glyph WB', work: 'PV work B', arrive: 1.35, mode: 'drift' },
    { glyph: 'PV glyph WC', work: 'PV work C', arrive: 2.70, mode: 'deform' }
  ];

  var src = byName('PV glyph');
  if (!src) throw 'missing PV glyph';

  for (var s = 0; s < SPECS.length; s++) {
    var S = SPECS[s];
    var g = byName(S.glyph);
    if (g) g.remove();
    g = src.duplicate();
    g.name = S.glyph;
    try { g.duration = DUR; } catch (e) {}

    var strokes = fudeLayers(g);
    var n = strokes.length;
    for (var i = 0; i < n; i++) {
      var L = strokes[i];
      var sn = strokeNum(L.name);
      var op = prop(L, 'ADBE Opacity'); clearKeys(op);
      var ps = prop(L, 'ADBE Position'); clearKeys(ps);
      var sc = prop(L, 'ADBE Scale'); clearKeys(sc);
      var base = ps.value.slice(0, 2);

      if (S.mode === 'order') {
        // writing order: each stroke fades in and settles downward->place
        var t0 = S.arrive + 0.15 + i * 0.11;
        op.setValueAtTime(0, 0);
        op.setValueAtTime(t0, 0);
        op.setValueAtTime(t0 + 0.28, 100);
        op.setValueAtTime(DUR, 100);
        ps.setValueAtTime(0, [base[0], base[1] + 26, 0]);
        ps.setValueAtTime(t0, [base[0], base[1] + 26, 0]);
        ps.setValueAtTime(t0 + 0.30, [base[0], base[1], 0]);
        ps.setValueAtTime(DUR, [base[0], base[1], 0]);
      } else if (S.mode === 'drift') {
        // every stroke is present; each drifts on its own vector, out and back
        var t0 = S.arrive + 0.20;
        var ang = i * 2.39996 + 0.7;                 // golden-angle spread
        var amp = 16 + (i % 3) * 9;
        var dx = Math.cos(ang) * amp, dy = Math.sin(ang) * amp * 0.7;
        op.setValueAtTime(0, 100); op.setValueAtTime(DUR, 100);
        ps.setValueAtTime(0, [base[0], base[1], 0]);
        ps.setValueAtTime(t0, [base[0], base[1], 0]);
        ps.setValueAtTime(t0 + 0.55 + (i % 4) * 0.12, [base[0] + dx, base[1] + dy, 0]);
        ps.setValueAtTime(t0 + 1.55, [base[0], base[1], 0]);
        ps.setValueAtTime(DUR, [base[0], base[1], 0]);
        // a few strokes also tilt slightly
        if (i % 3 === 0) {
          var rt = prop(L, 'ADBE Rotate Z'); clearKeys(rt);
          rt.setValueAtTime(0, 0);
          rt.setValueAtTime(t0 + 0.55, (i % 2 ? 1 : -1) * (2 + (i % 3)));
          rt.setValueAtTime(t0 + 1.55, 0);
          rt.setValueAtTime(DUR, 0);
        }
      } else { // deform
        op.setValueAtTime(0, 100); op.setValueAtTime(DUR, 100);
        var t0 = S.arrive + 0.55;
        // hero strokes: S04, S08, S12 deform non-uniformly then release
        if (sn === 4 || sn === 8 || sn === 12) {
          var sx = sn === 4 ? 150 : (sn === 8 ? 70 : 135);
          var sy = sn === 4 ? 55 : (sn === 8 ? 160 : 60);
          var rot = sn === 8 ? 18 : (sn === 12 ? -14 : 8);
          sc.setValueAtTime(0, [100, 100, 100]);
          sc.setValueAtTime(t0, [100, 100, 100]);
          sc.setValueAtTime(t0 + 0.45, [sx, sy, 100]);
          sc.setValueAtTime(t0 + 1.30, [sx, sy, 100]);
          sc.setValueAtTime(t0 + 1.85, [100, 100, 100]);
          sc.setValueAtTime(DUR, [100, 100, 100]);
          var rt = prop(L, 'ADBE Rotate Z'); clearKeys(rt);
          rt.setValueAtTime(0, 0);
          rt.setValueAtTime(t0 + 0.45, rot);
          rt.setValueAtTime(t0 + 1.30, rot);
          rt.setValueAtTime(t0 + 1.85, 0);
          rt.setValueAtTime(DUR, 0);
          // hero stroke also drifts toward the deformation
          ps.setValueAtTime(0, [base[0], base[1], 0]);
          ps.setValueAtTime(t0, [base[0], base[1], 0]);
          ps.setValueAtTime(t0 + 0.45, [base[0] + (sn === 8 ? -60 : 50), base[1] + (sn === 12 ? 40 : -30), 0]);
          ps.setValueAtTime(t0 + 1.85, [base[0], base[1], 0]);
          ps.setValueAtTime(DUR, [base[0], base[1], 0]);
        } else {
          // other strokes hold, then a subtle counter-drift while hero moves
          ps.setValueAtTime(0, [base[0], base[1], 0]);
          ps.setValueAtTime(t0, [base[0], base[1], 0]);
          ps.setValueAtTime(t0 + 0.45, [base[0], base[1], 0]);
          ps.setValueAtTime(t0 + 1.85, [base[0], base[1], 0]);
          ps.setValueAtTime(DUR, [base[0], base[1], 0]);
          sc.setValueAtTime(0, [100, 100, 100]); sc.setValueAtTime(DUR, [100, 100, 100]);
        }
      }
    }
    // hide analysis helpers so only the ink strokes read
    for (var i = 1; i <= g.numLayers; i++) {
      var L2 = g.layer(i);
      if (L2.name.indexOf('FUDE outline') === 0) { L2.enabled = false; }
    }
  }

  // ---- work comps ----------------------------------------------------------
  var GL_DX = 246, GL_DY = 105;
  for (var s = 0; s < SPECS.length; s++) {
    var S = SPECS[s];
    var c = byName(S.work);
    if (c) { for (var i = c.numLayers; i >= 1; i--) c.layer(i).remove(); }
    else c = app.project.items.addComp(S.work, WORK, WORK, 1, DUR, 24);
    try { c.width = WORK; c.height = WORK; c.duration = DUR; } catch (e) {}

    var g = byName(S.glyph);
    var gl = c.layers.add(g);
    gl.name = 'restored character';
    // fill the 1080 work with the glyph: scale so char height ~860px
    var gs = 860 / 698;
    prop(gl, 'ADBE Scale').setValue([gs * 100, gs * 100, 100]);
    // character centre (946,645) in glyph comp -> position on work comp
    var gpos = [540 - (946 - 700) * gs, 540 - (645 - 540) * gs];
    prop(gl, 'ADBE Position').setValue([gpos[0], gpos[1], 0]);
    gl.startTime = 0; gl.inPoint = 0; gl.outPoint = DUR;

    var tl = c.layers.addText('作品 0' + (s + 1));
    var td = tl.property('ADBE Text Properties').property('ADBE Text Document').value;
    td.fontSize = 40; td.font = FONT; td.fillColor = GREY;
    tl.property('ADBE Text Properties').property('ADBE Text Document').setValue(td);
    prop(tl, 'ADBE Position').setValue([60, 1012, 0]);
    tl.startTime = 0; tl.inPoint = 0; tl.outPoint = DUR;
    var top = prop(tl, 'ADBE Opacity'); clearKeys(top);
    top.setValueAtTime(0, 0); top.setValueAtTime(S.arrive + 0.1, 0);
    top.setValueAtTime(S.arrive + 0.4, 100); top.setValueAtTime(DUR, 100);
  }

  // ---- reel window (unchanged scroll mechanic) -----------------------------
  var win = byName('PV reel window');
  if (win) { for (var i = win.numLayers; i >= 1; i--) win.layer(i).remove(); }
  else win = app.project.items.addComp('PV reel window', WIN.w, WIN.h, 1, DUR, 24);
  try { win.duration = DUR; } catch (e) {}

  var workScale = WIN.w / WORK;
  var winCx = WIN.w / 2, winCy = WIN.h / 2;
  var step = WIN.h;
  var bg = win.layers.addSolid([1, 1, 1], 'window bg', WIN.w, WIN.h, 1, 24);
  bg.startTime = 0; bg.inPoint = 0; bg.outPoint = DUR;
  bg.moveToBeginning();
  for (var w = 0; w < SPECS.length; w++) {
    var S = SPECS[w];
    var L = win.layers.add(byName(S.work));
    L.name = S.work;
    prop(L, 'ADBE Scale').setValue([workScale * 100, workScale * 100, 100]);
    var lp = prop(L, 'ADBE Position'); clearKeys(lp);
    var arrive = S.arrive;
    if (w === 0) {
      lp.setValueAtTime(0.0, [winCx, winCy, 0]);
      lp.setValueAtTime(1.05, [winCx, winCy, 0]);
      lp.setValueAtTime(1.35, [winCx, winCy - step, 0]);
      lp.setValueAtTime(DUR, [winCx, winCy - step, 0]);
    } else {
      lp.setValueAtTime(0.0, [winCx, winCy + step, 0]);
      lp.setValueAtTime(arrive, [winCx, winCy + step, 0]);
      lp.setValueAtTime(arrive + 0.30, [winCx, winCy, 0]);
      if (w < SPECS.length - 1) {
        lp.setValueAtTime(arrive + 1.35, [winCx, winCy, 0]);
        lp.setValueAtTime(arrive + 1.65, [winCx, winCy - step, 0]);
        lp.setValueAtTime(DUR, [winCx, winCy - step, 0]);
      } else {
        lp.setValueAtTime(DUR, [winCx, winCy, 0]);
      }
    }
    L.startTime = 0; L.inPoint = 0; L.outPoint = DUR;
  }

  // PV reel C frame + border (unchanged)
  var reel = byName('PV reel C');
  if (reel) { for (var i = reel.numLayers; i >= 1; i--) reel.layer(i).remove(); }
  else reel = app.project.items.addComp('PV reel C', WORK, WORK, 1, DUR, 24);
  try { reel.duration = DUR; } catch (e) {}
  var wl = reel.layers.add(win);
  wl.name = 'reel window';
  prop(wl, 'ADBE Position').setValue([WIN.x + WIN.w / 2, WIN.y + WIN.h / 2, 0]);
  wl.startTime = 0; wl.inPoint = 0; wl.outPoint = DUR;
  var sh = reel.layers.addShape();
  sh.name = 'window border';
  var g2 = sh.property('ADBE Root Vectors Group').addProperty('ADBE Vector Group');
  var gv = g2.property('ADBE Vectors Group');
  var r = gv.addProperty('ADBE Vector Shape - Rect');
  r.property('ADBE Vector Rect Size').setValue([WIN.w, WIN.h]);
  r.property('ADBE Vector Rect Position').setValue([WIN.w / 2, WIN.h / 2]);
  var st = gv.addProperty('ADBE Vector Graphic - Stroke');
  st.property('ADBE Vector Stroke Color').setValue(INK);
  st.property('ADBE Vector Stroke Width').setValue(3);
  prop(sh, 'ADBE Position').setValue([WIN.x, WIN.y, 0]);
  sh.startTime = 0; sh.inPoint = 0; sh.outPoint = DUR;

  var f = new File('C:/Users/rebui/Desktop/Ae_Restro/.tmp/rec-eval/scene-c2.txt');
  f.encoding = 'UTF-8'; f.open('w');
  f.write('works rebuilt; glyphs=' + SPECS.map(function (x) { return x.glyph; }).join(','));
  f.close();
})();

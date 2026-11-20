// Scene C build: PV reel C — a vertical scrolling window of three completed
// works, each built from the project's own real Restro output (see
// build-glyph.jsx for how `PV glyph A/B/C` are derived from `Baseline`).
//
// Run through run_jsx scriptPath. Idempotent.
//
// Scene C occupies master frames [191,281) = 7.96..11.71 s. The window is the
// right zone of the 1080 master (x480..1080, y60..1020): a 600x960 comp whose
// own bounds clip the works, so no track matte is needed. The three works
// scroll upward through it one after another.
(function () {
  var DUR = 3.75;        // scene C length
  var WORK = 1080;       // work comp size
  var WIN = { x: 480, y: 60, w: 600, h: 960 };
  var FONT = 'KozGoPr6N-Regular';
  var INK = [0.10, 0.10, 0.12];
  var GREY = [0.42, 0.42, 0.45];

  function byName(name) {
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      if (it instanceof CompItem && it.name === name) return it;
    }
    return null;
  }
  function prop(L, m) { return L.property('ADBE Transform Group').property(m); }
  function clearKeys(p) { while (p.numKeys > 0) p.removeKey(1); }

  // The glyph comp is 1400x1080 and holds the character at x 356..1044,
  // y 296..994 (centre 700,645). Scale it so the character is ~760 px tall in
  // the 1080 work comp and centred on it. The nested layer's anchor is put on
  // the character centre, so work C can turn the character in place.
  // The nested glyph layer keeps AE's default anchor (the glyph comp's centre,
  // 700,540) and the character sits at (946,645) inside that comp, so a work's
  // character centre (cx,cy) maps to layer position (cx-246*s, cy-105*s).
  var GL_DX = 246, GL_DY = 105;

  // Each work: which glyph comp, when it enters the window, and how it is
  // treated. `arrive` is the time the reel brings it into the window.
  var WORKS = [
    // 01: the restored character, whole and centred.
    { comp: 'PV work A', label: '作品 01', arrive: 0.00, scale: 1.09, pos: [540, 540] },
    // 02: the same character as a cropped detail.
    { comp: 'PV work B', label: '作品 02', arrive: 1.35, scale: 1.35, pos: [640, 470] },
    // 03: the same character, small and airy.
    { comp: 'PV work C', label: '作品 03', arrive: 2.70, scale: 0.80, pos: [540, 500] }
  ];

  for (var w = 0; w < WORKS.length; w++) {
    var W = WORKS[w];
    var c = byName(W.comp);
    if (c) { for (var i = c.numLayers; i >= 1; i--) c.layer(i).remove(); }
    else c = app.project.items.addComp(W.comp, WORK, WORK, 1, DUR, 24);
    try { c.width = WORK; c.height = WORK; c.duration = DUR; } catch (e) {}

    var g = byName('PV glyph');
    if (!g) throw 'missing PV glyph';

    var gl = c.layers.add(g);
    gl.name = 'restored character';
    prop(gl, 'ADBE Scale').setValue([W.scale * 100, W.scale * 100, 100]);
    var gpos = [W.pos[0] - GL_DX * W.scale, W.pos[1] - GL_DY * W.scale];
    prop(gl, 'ADBE Position').setValue([gpos[0], gpos[1], 0]);
    gl.startTime = 0; gl.inPoint = 0; gl.outPoint = DUR;

    // the character settles into the window: it rises slightly and fades in,
    // and for work C it also turns on its side.
    var t0 = W.arrive;
    var op = prop(gl, 'ADBE Opacity'); clearKeys(op);
    op.setValueAtTime(0, 0);
    op.setValueAtTime(t0, 0);
    op.setValueAtTime(t0 + 0.30, 100);
    op.setValueAtTime(DUR, 100);
    var pos = prop(gl, 'ADBE Position'); clearKeys(pos);
    pos.setValueAtTime(0, [gpos[0], gpos[1] + 46, 0]);
    pos.setValueAtTime(t0, [gpos[0], gpos[1] + 46, 0]);
    pos.setValueAtTime(t0 + 0.45, [gpos[0], gpos[1], 0]);
    pos.setValueAtTime(DUR, [gpos[0], gpos[1], 0]);

    // caption
    var tl = c.layers.addText(W.label);
    var td = tl.property('ADBE Text Properties').property('ADBE Text Document').value;
    td.fontSize = 44;
    td.font = FONT;
    td.fillColor = GREY;
    tl.property('ADBE Text Properties').property('ADBE Text Document').setValue(td);
    prop(tl, 'ADBE Position').setValue([60, 1012, 0]);
    tl.startTime = 0; tl.inPoint = 0; tl.outPoint = DUR;
    var top = prop(tl, 'ADBE Opacity'); clearKeys(top);
    top.setValueAtTime(0, 0);
    top.setValueAtTime(t0, 0);
    top.setValueAtTime(t0 + 0.30, 100);
    top.setValueAtTime(DUR, 100);
  }

  // PV reel window: the scrolling stack of works.
  var win = byName('PV reel window');
  if (win) { for (var i = win.numLayers; i >= 1; i--) win.layer(i).remove(); }
  else win = app.project.items.addComp('PV reel window', WIN.w, WIN.h, 1, DUR, 24);
  try { win.duration = DUR; } catch (e) {}

  var workScale = WIN.w / WORK;            // 600 / 1080
  var winCx = WIN.w / 2, winCy = WIN.h / 2;
  var step = WIN.h;                        // one window height of travel
  // The window is an opaque panel: the master's grid paper and the tail of
  // the giant character must not show through the works.
  var bg = win.layers.addSolid([1, 1, 1], 'window bg', WIN.w, WIN.h, 1, 24);
  bg.startTime = 0; bg.inPoint = 0; bg.outPoint = DUR;
  bg.moveToBeginning();
  for (var w = 0; w < WORKS.length; w++) {
    var W = WORKS[w];
    var L = win.layers.add(byName(W.comp));
    L.name = W.comp;
    prop(L, 'ADBE Scale').setValue([workScale * 100, workScale * 100, 100]);
    var lp = prop(L, 'ADBE Position'); clearKeys(lp);
    var arrive = W.arrive;
    if (w === 0) {
      // first work: already centred, scrolls up and out
      lp.setValueAtTime(0.0, [winCx, winCy, 0]);
      lp.setValueAtTime(1.05, [winCx, winCy, 0]);
      lp.setValueAtTime(1.35, [winCx, winCy - step, 0]);
      lp.setValueAtTime(DUR, [winCx, winCy - step, 0]);
    } else {
      // later works: rise from below into the window, then continue up
      lp.setValueAtTime(0.0, [winCx, winCy + step, 0]);
      lp.setValueAtTime(arrive, [winCx, winCy + step, 0]);
      lp.setValueAtTime(arrive + 0.30, [winCx, winCy, 0]);
      if (w < WORKS.length - 1) {
        lp.setValueAtTime(arrive + 1.35, [winCx, winCy, 0]);
        lp.setValueAtTime(arrive + 1.65, [winCx, winCy - step, 0]);
        lp.setValueAtTime(DUR, [winCx, winCy - step, 0]);
      } else {
        lp.setValueAtTime(DUR, [winCx, winCy, 0]);
      }
    }
    L.startTime = 0; L.inPoint = 0; L.outPoint = DUR;
  }

  // The reel places the window comp in the right zone and draws its border.
  // A comp layer's Position is its anchor (the comp centre), so the window's
  // top-left corner (WIN.x, WIN.y) means position = top-left + half the size.
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
})();

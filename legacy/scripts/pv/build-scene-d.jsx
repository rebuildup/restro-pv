// Scene D build: PV ops — asynchronous windows of real AE operation recordings.
// Run through run_jsx scriptPath. Idempotent.
//
// Real-host layout of the recordings (1920x1080):
//  - Decompose canvas occupies roughly x110..1010, y60..820.
//  - The Restro panel sits at x1480..1920.
//  - ae-decompose-ops: the white shape turns into separate strokes at ~13.5..14.5s.
// Windows are placed in the right zone (x480..1080), entry times staggered so they
// do not move in sync. Each window gets a matte directly above the footage and a
// border above that; AE's track matte consumes the layer directly above, so the
// border is a separate layer above the matte, not the matte itself.
(function () {
  var rep = { created: [], errors: [] };
  var DUR = 3.75;

  function byName(name) {
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      if (it instanceof CompItem && it.name === name) return it;
    }
    return null;
  }
  function footage(match) {
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      if (it instanceof FootageItem && it.name.indexOf(match) >= 0) return it;
    }
    return null;
  }
  function clearComp(c) { for (var i = c.numLayers; i >= 1; i--) c.layer(i).remove(); }
  function getOrMake(name, w, h, dur) {
    var c = byName(name);
    if (c) {
      clearComp(c);
      if (c.width !== w || c.height !== h) { try { c.width = w; c.height = h; } catch (e) { rep.errors.push('size:' + e); } }
      try { c.duration = dur; } catch (e) { rep.errors.push('dur:' + e); }
      return c;
    }
    c = app.project.items.addComp(name, w, h, 1, dur, 24);
    rep.created.push(name);
    return c;
  }
  function prop(L, m) { return L.property('ADBE Transform Group').property(m); }
  function clearKeys(p) { while (p.numKeys > 0) p.removeKey(1); }

  var comp = getOrMake('PV ops', 1080, 1080, DUR);

  var dop = footage('ae-decompose-ops');
  var stk = footage('ae-stroke-animate');
  var rpr = footage('ae-reprocess');
  if (!dop || !stk || !rpr) throw 'recordings missing';
  rep.sources = { dop: dop.id, stk: stk.id, rpr: rpr.id };

  // Measured layout, read off AE's own renders of the 1920x1080 captures
  // (ffmpeg's seek and AE's decode diverge on these files, so the source times
  // and regions below were taken from AE's rendering, not a second decoder):
  //  - composition canvas: x 520..1040, y 110..530; the artwork fills it
  //  - Restro plugin panel: x 35..235, y 120..460
  //  - decompose-ops shows the character with the plugin's inferred anchor
  //    handles (green = inferred, red = on-curve) from 6s to 13s
  //  - stroke-animate shows the generated strokes being moved, 30s..70s
  //  - reprocess shows the strokes deforming, 25s..55s
  // rect [x,y,w,h], cropC = centre of the crop in the source, crop = [w,h],
  // srcIn = source time at which this window starts playing, delay = when it appears.
  var WINDOWS = [
    // W1 main: the character with Restro's inferred anchor points — the operation
    { name: 'W1', rect: [480, 60, 600, 400], item: dop, cropC: [890, 340], crop: [640, 460], srcIn: 6.5, delay: 0.00 },
    // W2: the Restro panel (Decompose control and its options)
    { name: 'W2', rect: [480, 476, 292, 268], item: dop, cropC: [135, 290], crop: [200, 340], srcIn: 7.0, delay: 0.35 },
    // W3: the generated strokes being moved and keyframed
    { name: 'W3', rect: [788, 476, 292, 268], item: stk, cropC: [890, 340], crop: [640, 460], srcIn: 40.0, delay: 0.70 },
    // W4: the strokes deforming after the second Decompose
    { name: 'W4', rect: [480, 760, 600, 260], item: rpr, cropC: [890, 340], crop: [640, 460], srcIn: 28.0, delay: 1.05 }
  ];

  function shapeRect(name, rect, kind) {
    var sh = comp.layers.addShape();
    sh.name = name;
    var g = sh.property('ADBE Root Vectors Group').addProperty('ADBE Vector Group');
    var gv = g.property('ADBE Vectors Group');
    var r = gv.addProperty('ADBE Vector Shape - Rect');
    r.property('ADBE Vector Rect Size').setValue([rect[2], rect[3]]);
    r.property('ADBE Vector Rect Position').setValue([rect[2] / 2, rect[3] / 2]);
    if (kind === 'border') {
      var st = gv.addProperty('ADBE Vector Graphic - Stroke');
      st.property('ADBE Vector Stroke Color').setValue([0.92, 0.92, 0.94]);
      st.property('ADBE Vector Stroke Width').setValue(2);
    } else {
      var f = gv.addProperty('ADBE Vector Graphic - Fill');
      f.property('ADBE Vector Fill Color').setValue([1, 1, 1]);
    }
    sh.property('ADBE Transform Group').property('ADBE Position').setValue([rect[0], rect[1], 0]);
    sh.inPoint = 0; sh.outPoint = DUR; sh.startTime = 0;
    return sh;
  }

  var made = [];
  // Build back to front. Each new layer lands at index 1 (top), so add in reverse:
  // matte first (ends lowest), then footage, then border (ends highest).
  for (var w = WINDOWS.length - 1; w >= 0; w--) {
    var W = WINDOWS[w];
    var rect = W.rect;
    var matte = shapeRect(W.name + ' matte', rect, 'matte');
    var L = comp.layers.add(W.item);
    L.name = W.name + ' rec';
    var border = shapeRect(W.name + ' border', rect, 'border');
    // The matte must sit DIRECTLY above the footage; AE consumes that layer and
    // hides it. Move it there after adding the border on top, so the stack reads
    // [border, matte, footage] and the border keeps its own visibility.
    matte.moveBefore(L);

    var s = Math.max(rect[2] / W.crop[0], rect[3] / W.crop[1]);
    prop(L, 'ADBE Scale').setValue([s * 100, s * 100, 100]);
    var winCx = rect[0] + rect[2] / 2, winCy = rect[1] + rect[3] / 2;
    var dx = (W.cropC[0] - W.item.width / 2) * s, dy = (W.cropC[1] - W.item.height / 2) * s;
    prop(L, 'ADBE Position').setValue([winCx - dx, winCy - dy, 0]);
    L.startTime = W.delay - W.srcIn;
    L.inPoint = 0; L.outPoint = DUR;
    var op = prop(L, 'ADBE Opacity'); clearKeys(op);
    op.setValueAtTime(0, 0); op.setValueAtTime(W.delay, 0);
    op.setValueAtTime(W.delay + 0.16, 100); op.setValueAtTime(DUR, 100);
    var mop = prop(matte, 'ADBE Opacity'); clearKeys(mop);
    mop.setValueAtTime(0, 0); mop.setValueAtTime(W.delay, 0);
    mop.setValueAtTime(W.delay + 0.16, 100); mop.setValueAtTime(DUR, 100);
    L.trackMatteType = TrackMatteType.ALPHA;
    var bop = prop(border, 'ADBE Opacity'); clearKeys(bop);
    bop.setValueAtTime(0, 0); bop.setValueAtTime(W.delay + 0.16, 100); bop.setValueAtTime(DUR, 100);
    border.enabled = true;
    made.push(W.name + ' ' + rect.join(',') + ' s=' + (Math.round(s * 1000) / 10));
  }

  return { windows: made, sources: rep.sources, errors: rep.errors };
})();
// A2 rebuild v2 — per spec §5 A2: the restored stroke is the crossing
// vertical/horizontal pair inside 解 (bunkai runs4 group), not the 筆 set.
//
// `PV A2 rig` = duplicate of `bunkai` trimmed to the runs4 stroke group plus
// the disabled `解` layer kept as a faint ghost. `PV A2` (1080x1080, 1.875 s)
// frames the crossing region large; inside the rig the vertical stroke
// separates first, then the horizontal strokes pull away and the vertical
// stroke is highlighted. Master layer retimed to [1.875, 3.75) = frames
// 45-89 so A1 frames 0-44 stay untouched.
//
// Run through run_jsx scriptPath. Idempotent.
(function () {
  var DUR = 1.875;
  var ACCENT = [0.82, 0.16, 0.10];

  function find(n) {
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      if (it instanceof CompItem && it.name === n) return it;
    }
    return null;
  }
  function prop(L, m) { return L.property('ADBE Transform Group').property(m); }
  function clearKeys(p) { while (p.numKeys > 0) p.removeKey(1); }
  function tr(L, name) { return L.property('ADBE Transform Group').property(name); }

  // ---- PV A2 rig: bunkai duplicate, runs4 group only ------------------------
  var rig = find('PV A2 rig');
  if (rig) rig.remove();
  var src = find('bunkai');
  if (!src) throw 'missing bunkai';
  rig = src.duplicate();
  rig.name = 'PV A2 rig';
  try { rig.duration = DUR; } catch (e) {}

  // delete indices 1..18 (audio + whole runs5 group); keep Null, runs4, 解
  for (var i = rig.numLayers; i >= 1; i--) {
    var DL = rig.layer(i);
    try { DL.locked = false; } catch (e) {}
    if (i <= 18) DL.remove();
  }
  // normalize timing on survivors
  for (var i = 1; i <= rig.numLayers; i++) {
    var L = rig.layer(i);
    L.inPoint = 0; L.outPoint = DUR;
    try { L.startTime = 0; } catch (e) {}
  }
  // ghost: the original 解 outline, faint
  var ghost = null;
  for (var i = 1; i <= rig.numLayers; i++) {
    var L = rig.layer(i);
    if (L.name === '解') {
      ghost = L; L.enabled = true;
      var gop = prop(L, 'ADBE Opacity'); clearKeys(gop);
      gop.setValueAtTime(0, 0); gop.setValueAtTime(0.3, 16); gop.setValueAtTime(DUR, 16);
    }
  }

  function layerByName(n) {
    for (var i = 1; i <= rig.numLayers; i++) if (rig.layer(i).name === n) return rig.layer(i);
    return null;
  }
  function findFill(L) {
    // depth-first search for a vector fill color property
    var found = null;
    function rec(p, d) {
      if (found || d > 8) return;
      var mn = '';
      try { mn = p.matchName; } catch (e) {}
      if (mn === 'ADBE Vector Fill Color') { found = p; return; }
      var n = 0;
      try { n = p.numProperties; } catch (e) {}
      for (var i = 1; i <= n; i++) { try { rec(p.property(i), d + 1); } catch (e) {} }
    }
    try { rec(L.property('ADBE Root Vectors Group'), 0); } catch (e) {}
    return found;
  }
  function keyPos(L, t0, t1, off) {
    var p = prop(L, 'ADBE Position'); clearKeys(p);
    var base = p.value.slice(0, 2);
    p.setValueAtTime(0, [base[0], base[1], 0]);
    p.setValueAtTime(t0, [base[0], base[1], 0]);
    p.setValueAtTime(t1, [base[0] + off[0], base[1] + off[1], 0]);
    p.setValueAtTime(DUR, [base[0] + off[0], base[1] + off[1], 0]);
  }
  function dimOthers(L) {
    var op = prop(L, 'ADBE Opacity'); clearKeys(op);
    op.setValueAtTime(0, 100); op.setValueAtTime(0.4, 100);
    op.setValueAtTime(0.85, 62); op.setValueAtTime(DUR, 62);
  }

  var vert = layerByName('STROKE_016_runs4');
  var h1 = layerByName('STROKE_015_runs4');
  var h2 = layerByName('STROKE_017_runs4');

  // every runs4 stroke except the trio dims so the crossing reads first
  for (var i = 1; i <= rig.numLayers; i++) {
    var L = rig.layer(i);
    if (L === vert || L === h1 || L === h2 || L === ghost) continue;
    if (L.name.indexOf('STROKE_') === 0 || L.name.indexOf('Ae_Restro merged') === 0) dimOthers(L);
  }

  // vertical stroke: separates down-left during f56-66 (comp 0.46-0.88)
  if (vert) {
    keyPos(vert, 0.46, 0.88, [-120, 70]);
    // accent highlight from f67 onward
    var fill = findFill(vert);
    if (fill) {
      try {
        fill.setValueAtTime(0, [0.10, 0.10, 0.12]);
        fill.setValueAtTime(1.25, [0.10, 0.10, 0.12]);
        fill.setValueAtTime(1.45, ACCENT);
        fill.setValueAtTime(DUR, ACCENT);
      } catch (e) {}
    }
  }
  // horizontal strokes pull away during f67-78 (comp 0.92-1.30)
  if (h1) keyPos(h1, 0.92, 1.30, [80, -50]);
  if (h2) keyPos(h2, 0.92, 1.30, [-80, -50]);

  // Null 3 push-in during the opening beat
  var nul = layerByName('Null 3 (stroke)');
  if (nul) {
    var ns = prop(nul, 'ADBE Scale'); clearKeys(ns);
    ns.setValueAtTime(0, [100, 100, 100]); ns.setValueAtTime(0.45, [100, 100, 100]);
    ns.setValueAtTime(0.9, [114, 114, 100]); ns.setValueAtTime(DUR, [114, 114, 100]);
  }

  // ---- PV A2 scene comp -----------------------------------------------------
  var a2 = find('PV A2');
  if (a2) { for (var i = a2.numLayers; i >= 1; i--) a2.layer(i).remove(); }
  else a2 = app.project.items.addComp('PV A2', 1080, 1080, 1, DUR, 24);
  try { a2.duration = DUR; } catch (e) {}

  var rl = a2.layers.add(rig);
  rl.name = 'crossing strokes';
  // frame so the right-side crossing sits centre-right; iterate on renders
  prop(rl, 'ADBE Scale').setValue([165, 165, 100]);
  prop(rl, 'ADBE Position').setValue([400, 430, 0]);
  var rop = prop(rl, 'ADBE Opacity'); clearKeys(rop);
  rop.setValueAtTime(0, 100); rop.setValueAtTime(DUR, 100);
  rl.startTime = 0; rl.inPoint = 0; rl.outPoint = DUR;

  // ---- master wiring: frames 45-89 only ------------------------------------
  var master = find('master');
  for (var i = master.numLayers; i >= 1; i--) {
    if (master.layer(i).name === 'PV A2') {
      var ML = master.layer(i);
      ML.startTime = 1.875; ML.inPoint = 1.875; ML.outPoint = 3.75;
    }
  }

  var f = new File('C:/Users/rebui/Desktop/Ae_Restro/.tmp/rec-eval/a2b.txt');
  f.encoding = 'UTF-8'; f.open('w'); f.write('PV A2 rig built'); f.close();
})();

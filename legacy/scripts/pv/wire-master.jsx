// Wire the rebuilt scenes into master. Run through run_jsx scriptPath. Idempotent.
// A1/A2/A3/B are left untouched: they already render the introduced design.
// C [191,281) -> PV reel C, D [281,371) -> PV ops, E [371,480) -> PV end.
(function () {
  var rep = { placed: [], removed: [], errors: [] };
  function byName(name) {
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      if (it instanceof CompItem && it.name === name) return it;
    }
    return null;
  }
  var master = compById(1);
  var FPS = 24;
  var scenes = [
    { comp: 'PV reel C', name: 'PV reel C', f0: 191, f1: 281 },
    { comp: 'PV ops',    name: 'PV ops',    f0: 281, f1: 371 },
    { comp: 'PV end',    name: 'PV end',    f0: 371, f1: 480 }
  ];
  for (var s = 0; s < scenes.length; s++) {
    var S = scenes[s];
    var c = byName(S.comp);
    if (!c) { rep.errors.push('missing ' + S.comp); continue; }
    // remove a previous copy of this scene layer
    for (var i = master.numLayers; i >= 1; i--) {
      if (master.layer(i).name === S.name) { master.layer(i).remove(); rep.removed.push(S.name + '@' + i); }
    }
    var L = master.layers.add(c);
    L.name = S.name;
    var t0 = S.f0 / FPS, t1 = S.f1 / FPS;
    L.startTime = t0;
    L.inPoint = t0;
    L.outPoint = t1;
    L.property('ADBE Transform Group').property('ADBE Position').setValue([540, 540, 0]);
    L.property('ADBE Transform Group').property('ADBE Scale').setValue([100, 100, 100]);
    // place just below the description/left-column block so the left column stays on top,
    // and above the painted backdrop.
    var anchorLayer = null;
    for (var i = 1; i <= master.numLayers; i++) {
      var nm = master.layer(i).name;
      if (nm === 'description') { anchorLayer = master.layer(i); break; }
    }
    if (anchorLayer) L.moveAfter(anchorLayer);
    rep.placed.push(S.name + ' ' + t0.toFixed(3) + '..' + t1.toFixed(3) + ' idx=' + L.index);
  }
  return rep;
})();
// Build the reusable "restored 筆" glyph comp from the project's own real
// Restro output (`Baseline`).
//
// Measured facts (see .tmp/rec-eval/ and .tmp/verify-beats/BB*.png, DD*.png):
//   * `Baseline` is 1080x1080 and holds the restored character at x 602..1290,
//     y 296..994 — the glyph overhangs the frame's right edge and is therefore
//     CLIPPED by the comp frame.
//   * The character is drawn by the 13 `FUDE S*` layers (the strokes Restro
//     recovered). The `FUDE outline base` / `FUDE outline inset` pair carries
//     three masks (Q7/Q8/Q9) and renders nothing on its own.
//   * `copyToComp` destroys those strokes: the copies lose their paths (the
//     groups collapse to a 3-vertex triangle), which is why a copied stroke
//     never matched the character. Duplicating the COMP keeps them intact.
//   * Duplicating `Baseline` and widening the copy to 1400 px reveals the
//     whole character (x 602..1290) — the clip was purely the frame size.
//
// The strokes are then translated so the character is centred and recoloured:
// Baseline draws them black/grey, and the glyph must read as one ink form.
//
// Run through run_jsx scriptPath. Idempotent.
(function () {
  var DUR = 3.75;
  var GLYPH_W = 1400, GLYPH_H = 1080;
  var INK = [0.10, 0.10, 0.12];

  function byName(name) {
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      if (it instanceof CompItem && it.name === name) return it;
    }
    return null;
  }
  function prop(L, m) { return L.property('ADBE Transform Group').property(m); }
  function setFills(L, rgb) {
    var root = L.property('ADBE Root Vectors Group');
    for (var k = 1; k <= root.numProperties; k++) {
      var vg = root.property(k).property('ADBE Vectors Group');
      if (!vg) continue;
      for (var q = 1; q <= vg.numProperties; q++) {
        var sp = vg.property(q);
        if (sp.matchName !== 'ADBE Vector Graphic - Fill') continue;
        sp.property('ADBE Vector Fill Color').setValue(rgb);
      }
    }
  }

  var base = byName('Baseline');
  if (!base) throw 'Baseline comp not found';

  var g = byName('PV glyph');
  if (g) g.remove();
  g = base.duplicate();
  g.name = 'PV glyph';
  g.width = GLYPH_W;
  g.height = GLYPH_H;
  try { g.duration = DUR; } catch (e) {}

  // Nothing is removed and nothing is moved: the outline layers only render
  // while every other layer of the comp is present, so the glyph comp keeps
  // the whole rig. The character is placed by the work comp instead, and only
  // the colours are changed (Baseline draws the glyph white, which would be
  // invisible on the PV's light background).
  for (var i = 1; i <= g.numLayers; i++) {
    var L = g.layer(i);
    if (L.name === 'PAGE card') continue;
    setFills(L, INK);
  }

  var f = new File('C:/Users/rebui/Desktop/Ae_Restro/.tmp/rec-eval/glyph.txt');
  f.encoding = 'UTF-8';
  f.open('w');
  f.write('PV glyph ' + g.width + 'x' + g.height + ' layers=' + g.numLayers);
  f.close();
})();

// Description comp copy pass.
//
// - Adds an A-scene pair (0.5-4.15) so A1/A2 are no longer wordless while the
//   reconstruction plays.
// - Fixes the duplicated C caption pair (the second "Reshape individual
//   strokes" becomes the C-scene closing line).
// - Removes the stray unpaired English layer spanning all of C.
// B/D essays and E (disabled, replaced by PV end typography) are untouched.
//
// Run through run_jsx scriptPath. Idempotent.
(function () {
  function find(n) {
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      if (it instanceof CompItem && it.name === n) return it;
    }
    return null;
  }
  var d = find('description');
  if (!d) throw 'missing description comp';

  function setText(L, s) {
    var tp = L.property('ADBE Text Properties').property('ADBE Text Document');
    var td = tp.value; td.text = s; tp.setValue(td);
  }
  function setTime(L, ip, op) {
    L.startTime = ip; L.inPoint = ip; L.outPoint = op;
  }

  // locate the C-scene duplicated reshape pair (second occurrence in time)
  var reshapeJa = [], reshapeEn = [];
  for (var i = 1; i <= d.numLayers; i++) {
    var L = d.layer(i);
    var t = '';
    try { t = L.property('ADBE Text Properties').property('ADBE Text Document').value.text; } catch (e) {}
    if (t === '一画の形を変えて、文字そのものを変形') reshapeJa.push(L);
    if (t === 'Reshape individual strokes') reshapeEn.push(L);
    if (t === 'Animate each stroke independently') { L.remove(); }
  }
  // order by time; the later pair is the duplicate to repurpose
  function byTime(a, b) { return a.startTime - b.startTime; }
  reshapeJa.sort(byTime); reshapeEn.sort(byTime);
  if (reshapeJa.length >= 2) {
    setText(reshapeJa[1], '動きの違う作品が、同じ筆画データから生まれる');
    setTime(reshapeJa[1], 10.83, 11.75);
  }
  if (reshapeEn.length >= 2) {
    setText(reshapeEn[1], 'Different works, from the same stroke data');
    setTime(reshapeEn[1], 10.83, 11.75);
  }

  // A-scene pair: clone the B heading layers (same style/position), retime,
  // retext. Skip if already present (idempotent).
  var hasA = false;
  for (var i = 1; i <= d.numLayers; i++) {
    var L = d.layer(i);
    var t = '';
    try { t = L.property('ADBE Text Properties').property('ADBE Text Document').value.text; } catch (e) {}
    if (t === '交わった線の輪郭から、筆画を復元する') { hasA = true; break; }
  }
  if (!hasA) {
    var jaSrc = null, enSrc = null;
    for (var i = 1; i <= d.numLayers; i++) {
      var L = d.layer(i);
      var t = '';
      try { t = L.property('ADBE Text Properties').property('ADBE Text Document').value.text; } catch (e) {}
      if (t === 'つながった輪郭から、\r一画ずつの形を復元する') jaSrc = L;
      if (t === 'HOW IT WORKS') enSrc = L;
    }
    if (jaSrc) {
      var ja = jaSrc.duplicate();
      setText(ja, '交わった線の輪郭から、\r筆画を復元する');
      setTime(ja, 0.5, 4.15);
    }
    if (enSrc) {
      var en = enSrc.duplicate();
      setText(en, 'Rebuild strokes from a connected outline');
      setTime(en, 0.5, 4.15);
    }
  }

  var f = new File('C:/Users/rebui/Desktop/Ae_Restro/.tmp/rec-eval/desc-pass.txt');
  f.encoding = 'UTF-8'; f.open('w'); f.write('description pass done'); f.close();
})();

// WU-D sleep-unit probe: measure real wall-clock of $.sleep in AE.
// Host polls .tmp/sleep-probe.txt and timestamps each line's first
// appearance; this script only appends markers.
(function () {
  var ROOT = "C:/Users/rebui/Desktop/restro-pv-23";
  var f = new File(ROOT + "/.tmp/sleep-probe.txt");
  f.encoding = "UTF-8";
  var lines = [];
  function log(s) {
    lines.push(s);
    try { f.open("w"); f.write(lines.join("\n")); f.close(); } catch (e) {}
  }
  var t0 = new Date().getTime();
  function mark(name) { log(name + " @" + (new Date().getTime() - t0)); }
  try {
    mark("START");
    $.sleep(100);  mark("S100");
    $.sleep(500);  mark("S500");
    $.sleep(1000); mark("S1000");
    $.sleep(5000); mark("S5000");
    $.sleep(10000); mark("S10000");
    $.sleep(20000); mark("S20000");
    mark("DONE");
  } catch (e) {
    mark("ERROR " + String(e && e.message ? e.message : e));
  }
  var d = new File(ROOT + "/.tmp/sleep-probe.txt.done");
  try { d.open("w"); d.write("done"); d.close(); } catch (e) {}
})();
